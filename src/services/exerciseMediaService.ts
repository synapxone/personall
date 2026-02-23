import { supabase } from '../lib/supabase';
import { exerciseService } from './exerciseService';

const BUCKET = 'exercise-media';
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const VEO_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type MediaResult = { url: string; type: 'gif' | 'video' };

function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Storage helpers ────────────────────────────────────────────────────────────

async function uploadToStorage(blob: Blob, slug: string, ext: string): Promise<string | null> {
    const path = `exercises/${slug}.${ext}`;
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/gif', upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

async function downloadAndReupload(url: string, slug: string): Promise<string | null> {
    try {
        // Use a CORS proxy since these image APIs often block direct browser fetch
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) return null;
        const blob = await res.blob();
        const ext = url.includes('.mp4') ? 'mp4' : 'gif';
        return await uploadToStorage(blob, slug, ext);
    } catch (e) {
        console.warn('downloadAndReupload failed', e);
        return null;
    }
}

// ── Veo 2 generation ──────────────────────────────────────────────────────────

async function generateWithVeo(exerciseName: string, slug: string): Promise<string | null> {
    if (!GEMINI_KEY) return null;
    try {
        const prompt =
            `Side view silhouette of a person performing "${exerciseName}" exercise. ` +
            `Minimalist style, clean white background, black silhouette figure, smooth fluid looping motion. ` +
            `Fitness demonstration, perfect form, no text, no equipment labels.`;

        const startRes = await fetch(
            `${VEO_BASE}/models/veo-2.0-generate-001:generateVideo?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    generationConfig: {
                        numberOfVideos: 1,
                        durationSeconds: 6,
                        aspectRatio: '16:9',
                    },
                }),
            }
        );
        if (!startRes.ok) return null;

        const operation = await startRes.json();
        const opName: string | undefined = operation.name;
        if (!opName) return null;

        // Poll up to 3 minutes (36 × 5s)
        for (let i = 0; i < 36; i++) {
            await new Promise((r) => setTimeout(r, 5000));
            const pollRes = await fetch(`${VEO_BASE}/${opName}?key=${GEMINI_KEY}`);
            if (!pollRes.ok) continue;
            const status = await pollRes.json();
            if (!status.done) continue;

            // Handle both known response shapes
            const samples =
                status.response?.generateVideoResponse?.generatedSamples ??
                status.response?.videos ??
                status.response?.predictions ??
                [];

            const videoUri: string | undefined =
                samples[0]?.video?.uri ?? samples[0]?.uri;

            if (!videoUri) return null;
            return await downloadAndReupload(videoUri, slug);
        }
        return null;
    } catch {
        return null;
    }
}

// ── DB cache ──────────────────────────────────────────────────────────────────

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
    return { url: data.url, type: data.media_type as 'gif' | 'video' };
}

// ── Public API ────────────────────────────────────────────────────────────────

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
            if (exerciseId) {
                result[exerciseId] = { url: row.url, type: row.media_type as 'gif' | 'video' };
            }
        });
        return result;
    },

    /** Full pipeline: DB cache → ExerciseDB → Veo. */
    async getMedia(exerciseName: string, exerciseId: string): Promise<MediaResult | null> {
        const slug = slugify(exerciseName);

        // 1. Supabase DB cache
        const cached = await getFromDb(slug);
        if (cached) return cached;

        // 2. ExerciseDB (RapidAPI first, then free API)
        let ex = await exerciseService.getById(exerciseId);
        if (!ex?.gifUrl) ex = await exerciseService.getByNameFree(exerciseName);

        if (ex?.gifUrl) {
            const url = await downloadAndReupload(ex.gifUrl, slug);
            if (url) {
                await saveToDb(slug, url, 'gif');
                return { url, type: 'gif' };
            }
        }

        // 3. Veo 2 generation
        const veoUrl = await generateWithVeo(exerciseName, slug);
        if (veoUrl) {
            await saveToDb(slug, veoUrl, 'video');
            return { url: veoUrl, type: 'video' };
        }

        return null;
    },
};
