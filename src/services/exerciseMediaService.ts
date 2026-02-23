import { supabase } from '../lib/supabase';

export type MediaResult = { url: string; type: 'gif' | 'video' };

const FREE_DB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const FREE_DB_JSON = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Free Exercise DB index (loaded once, cached in memory) ─────────────────────

let freeDbIndex: Map<string, string> | null = null;
let freeDbLoadPromise: Promise<Map<string, string>> | null = null;

async function loadFreeDbIndex(): Promise<Map<string, string>> {
    if (freeDbIndex) return freeDbIndex;
    if (freeDbLoadPromise) return freeDbLoadPromise;

    freeDbLoadPromise = (async () => {
        try {
            const res = await fetch(FREE_DB_JSON);
            if (!res.ok) return new Map();
            const exercises: { name: string; images: string[] }[] = await res.json();
            const map = new Map<string, string>();
            exercises.forEach(ex => {
                if (!ex.images?.length) return;
                const url = `${FREE_DB_BASE}/${ex.images[0]}`;
                // Index by lowercase name
                map.set(ex.name.toLowerCase(), url);
                // Also index by normalized name (no punctuation)
                const norm = ex.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
                if (norm !== ex.name.toLowerCase()) map.set(norm, url);
            });
            freeDbIndex = map;
            return map;
        } catch {
            return new Map();
        } finally {
            freeDbLoadPromise = null;
        }
    })();
    return freeDbLoadPromise;
}

async function getFreeExerciseImage(exerciseName: string): Promise<string | null> {
    const index = await loadFreeDbIndex();
    if (!index.size) return null;

    const query = exerciseName.toLowerCase().trim();
    const queryNorm = query.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

    // 1. Exact match
    if (index.has(query)) return index.get(query)!;
    if (index.has(queryNorm)) return index.get(queryNorm)!;

    // 2. All query words appear in the DB name
    const queryWords = queryNorm.split(/\s+/).filter(w => w.length > 2);
    for (const [name, url] of index) {
        if (queryWords.length >= 1 && queryWords.every(w => name.includes(w))) {
            return url;
        }
    }

    // 3. All DB name words appear in the query (DB name is a subset)
    for (const [name, url] of index) {
        const nameWords = name.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
        if (nameWords.length >= 2 && nameWords.every(w => queryNorm.includes(w))) {
            return url;
        }
    }

    return null;
}

// ── DB cache ───────────────────────────────────────────────────────────────────

async function saveToDb(slug: string, url: string, mediaType: 'gif' | 'video') {
    await supabase.from('exercise_media').upsert({ slug, url, media_type: mediaType });
}

async function getFromDb(slug: string): Promise<MediaResult | null> {
    const { data } = await supabase
        .from('exercise_media')
        .select('url, media_type')
        .eq('slug', slug)
        .maybeSingle();
    if (!data) return null;
    // Ignore clearly invalid cached entries
    if (!data.url || data.url.startsWith('blob:') || data.url.length < 10) return null;
    return { url: data.url, type: data.media_type as 'gif' | 'video' };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const exerciseMediaService = {
    /** Load cached media for many exercises at once (fast DB batch). */
    async getCachedBatch(
        exercises: { id: string; name: string }[]
    ): Promise<Record<string, MediaResult>> {
        const slugMap: Record<string, string> = {};
        exercises.forEach(({ id, name }) => { slugMap[slugify(name)] = id; });
        const slugs = Object.keys(slugMap);

        const { data } = await supabase
            .from('exercise_media')
            .select('slug, url, media_type')
            .in('slug', slugs);

        const result: Record<string, MediaResult> = {};
        data?.forEach((row) => {
            const exerciseId = slugMap[row.slug];
            if (exerciseId && row.url?.length > 10) {
                result[exerciseId] = { url: row.url, type: row.media_type as 'gif' | 'video' };
            }
        });
        return result;
    },

    /** Preload the free-exercise-db index in the background for faster first load. */
    preloadFreeDb() {
        loadFreeDbIndex().catch(() => {/* ignore */});
    },

    /** Full pipeline: DB cache → free-exercise-db → ExerciseDB GIF download. */
    async getMedia(exerciseName: string, _exerciseId?: string): Promise<MediaResult | null> {
        const slug = slugify(exerciseName);

        // 1. Supabase DB cache
        const cached = await getFromDb(slug);
        if (cached) return cached;

        // 2. Free exercise DB (800+ exercises, direct GitHub CDN, no API key)
        const freeUrl = await getFreeExerciseImage(exerciseName);
        if (freeUrl) {
            await saveToDb(slug, freeUrl, 'gif');
            return { url: freeUrl, type: 'gif' };
        }

        // 3. ExerciseDB free API fallback (name search, no API key)
        try {
            const { exerciseService } = await import('./exerciseService');
            const ex = await exerciseService.getByNameFree(exerciseName);
            if (ex?.gifUrl) {
                // Store the gifUrl directly — no download/re-upload (avoids CORS proxy issues)
                await saveToDb(slug, ex.gifUrl, 'gif');
                return { url: ex.gifUrl, type: 'gif' };
            }
        } catch { /* ignore */ }

        return null;
    },
};
