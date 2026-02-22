import type { ExerciseDBItem } from '../types';

const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY || '';
const BASE_URL = 'https://exercisedb.p.rapidapi.com';

const headers = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com',
};

// Simple in-memory cache
const cache = new Map<string, ExerciseDBItem>();

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

    // Preload GIF URLs for a list of exercise IDs
    async preloadGifs(ids: string[]): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        await Promise.all(ids.map(async (id) => {
            const ex = await exerciseService.getById(id);
            if (ex?.gifUrl) result[id] = ex.gifUrl;
        }));
        return result;
    },
};
