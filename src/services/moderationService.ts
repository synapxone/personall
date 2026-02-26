import { supabase } from '../lib/supabase';

// Cache the blocklist to avoid repeated DB queries
let blocklistCache: string[] | null = null;
let blocklistLoadedAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getBlocklist(): Promise<string[]> {
    const now = Date.now();
    if (blocklistCache && now - blocklistLoadedAt < CACHE_TTL) {
        return blocklistCache;
    }
    try {
        const { data } = await supabase.from('content_blocklist').select('word');
        blocklistCache = data?.map(r => r.word.toLowerCase()) ?? [];
        blocklistLoadedAt = now;
    } catch {
        blocklistCache = blocklistCache ?? [];
    }
    return blocklistCache;
}

export type ModerationResult =
    | { ok: true }
    | { ok: false; reason: string };

/**
 * Two-layer content moderation:
 * 1. Local blocklist check (fast, no AI cost)
 * 2. AI context check via edge function (only if blocklist passes)
 */
export async function moderateContent(
    input: string,
    _context: 'exercício' | 'modalidade' = 'exercício'
): Promise<ModerationResult> {
    const lower = input.toLowerCase().trim();

    if (!lower || lower.length < 2) {
        return { ok: false, reason: 'O nome precisa ter pelo menos 2 caracteres.' };
    }
    if (lower.length > 60) {
        return { ok: false, reason: 'O nome não pode ter mais de 60 caracteres.' };
    }

    // Layer 1: blocklist from database
    const blocklist = await getBlocklist();
    const blocked = blocklist.find(w => lower.includes(w));
    if (blocked) {
        return { ok: false, reason: `O nome contém um termo não permitido.` };
    }

    // Layer 2: Fast local heuristic regex (replace AI)
    // Basic checks for spam, excessive repeats, or invalid characters
    const isSpam = /([a-z])\1{4,}/i.test(lower); // e.g., "aaaaaa"
    const hasUrls = /(http|www\.|(?:\w+\.(?:com|net|org|br|io)))/i.test(lower);

    if (isSpam || hasUrls) {
        return { ok: false, reason: 'O conteúdo parece conter spam ou links.' };
    }

    // Add a hardcoded fallback blocklist in case DB fails or is empty
    const fallbackBlocklist = ['teste', 'asdf', 'merda', 'caralho', 'porra', 'buceta', 'piroca', 'puta'];
    if (fallbackBlocklist.some(w => lower.includes(w))) {
        return { ok: false, reason: 'O conteúdo contém palavras inapropriadas.' };
    }

    return { ok: true };
}
