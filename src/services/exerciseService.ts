import type { ExerciseDBItem } from '../types';

const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY || '';
const BASE_URL = 'https://exercisedb.p.rapidapi.com';
const FREE_API_URL = 'https://exercisedb-api.vercel.app/api/v1';

const headers = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com',
};

// Simple in-memory cache
const cache = new Map<string, ExerciseDBItem>();
const nameCache = new Map<string, ExerciseDBItem | null>();

export const exerciseService = {
    async getById(id: string): Promise<ExerciseDBItem | null> {
        if (cache.has(id)) return cache.get(id)!;
        if (!RAPIDAPI_KEY) return null;
        try {
            const res = await fetch(`${BASE_URL}/exercises/exercise/${id}`, { headers });
            if (!res.ok) return null;
            const data = await res.json();
            cache.set(id, data);
            return data;
        } catch {
            return null;
        }
    },

    async getByName(name: string): Promise<ExerciseDBItem[]> {
        if (!RAPIDAPI_KEY) return [];
        try {
            const encoded = encodeURIComponent(name.toLowerCase());
            const res = await fetch(`${BASE_URL}/exercises/name/${encoded}?limit=3`, { headers });
            if (!res.ok) return [];
            return await res.json();
        } catch {
            return [];
        }
    },

    // Free API lookup by name (no API key required)
    async getByNameFree(name: string): Promise<ExerciseDBItem | null> {
        const key = name.toLowerCase();
        if (nameCache.has(key)) return nameCache.get(key)!;
        try {
            const encoded = encodeURIComponent(key);
            const res = await fetch(`${FREE_API_URL}/exercises?name=${encoded}&limit=1`);
            if (!res.ok) { nameCache.set(key, null); return null; }
            const json = await res.json();

            const list: any[] = Array.isArray(json) ? json : json?.data ?? [];
            if (!list.length) { nameCache.set(key, null); return null; }
            const ex = list[0];
            const mapped: ExerciseDBItem = {
                id: ex.exerciseId ?? ex.id ?? '',
                name: ex.name ?? name,
                gifUrl: ex.gifUrl ?? ex.gif_url ?? '',
                bodyPart: ex.bodyParts?.[0] ?? ex.bodyPart ?? '',
                equipment: ex.equipments?.[0] ?? ex.equipment ?? '',
                target: ex.targetMuscles?.[0] ?? ex.target ?? '',
                instructions: ex.instructions ?? [],
            };
            nameCache.set(key, mapped);
            return mapped;
        } catch {
            nameCache.set(key, null);
            return null;
        }
    },

    // Preload GIF URLs: tries RapidAPI by ID, falls back to free API by name
    async preloadGifsByExercises(exercises: { id: string; name: string }[]): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        await Promise.all(exercises.map(async ({ id, name }) => {
            let ex = await exerciseService.getById(id);
            if (!ex?.gifUrl) {
                ex = await exerciseService.getByNameFree(name);
            }
            if (ex?.gifUrl) result[id] = ex.gifUrl;
        }));
        return result;
    },

    // Legacy: Preload GIF URLs for a list of exercise IDs
    async preloadGifs(ids: string[]): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        await Promise.all(ids.map(async (id) => {
            const ex = await exerciseService.getById(id);
            if (ex?.gifUrl) result[id] = ex.gifUrl;
        }));
        return result;
    },
};
