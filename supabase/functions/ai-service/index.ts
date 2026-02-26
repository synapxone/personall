const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { action, payload } = await req.json();
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

        let result;

        switch (action) {
            case 'ANALYZE_FOOD_TEXT':
                result = await handleAIRequest(
                    getAnalyzeFoodTextPrompt(payload.description),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'ANALYZE_FOOD_PHOTO':
                result = await handleAIRequest(
                    getAnalyzeFoodPhotoItemsPrompt(),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY,
                    payload.base64,
                    payload.mimeType
                );
                break;
            case 'GENERATE_WORKOUT':
                result = await handleAIRequest(
                    getGenerateWorkoutPrompt(payload),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'GENERATE_WORKOUT_SINGLE':
                result = await handleAIRequest(
                    getGenerateWorkoutSinglePrompt(payload),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'GENERATE_DIET':
                result = await handleAIRequest(
                    getGenerateDietPrompt(payload),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'ANALYZE_BODY':
                result = await handleAIRequest(
                    getAnalyzeBodyPrompt(),
                    false,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY,
                    payload.base64,
                    payload.mimeType
                );
                break;
            case 'SUGGEST_UNITS':
                result = await handleAIRequest(
                    getSuggestUnitsPrompt(payload.food),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'SUGGEST_FOODS':
                result = await handleAIRequest(
                    getSuggestFoodsPrompt(payload.query),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'CHAT':
                result = await handleAIRequest(
                    getChatPrompt(payload.context, payload.message),
                    false,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'GENERATE_CARDIO_PLAN':
                result = await handleAIRequest(
                    getGenerateCardioPlanPrompt(payload),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'GENERATE_MODALITY_PLAN':
                result = await handleAIRequest(
                    getGenerateModalityPlanPrompt(payload),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'GENERATE_MODALITY_EXERCISES':
                result = await handleAIRequest(
                    getGenerateModalityExercisesPrompt(payload),
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'GENERATE_EXERCISE_INSTRUCTIONS':
                result = await handleAIRequest(
                    getGenerateExerciseInstructionsPrompt(payload),
                    false,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                result = { instructions: typeof result === 'string' ? result : result?.instructions ?? '' };
                break;
            case 'MODERATE_CONTENT':
                result = await handleAIRequest(
                    `Avalie se este nome é adequado para um app fitness: "${payload.input}". Contexto: cadastro de ${payload.context ?? 'item'}. Responda APENAS com uma linha: APROVADO ou BLOQUEADO: <motivo curto em português>`,
                    false,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                result = { verdict: typeof result === 'string' ? result.trim() : 'APROVADO' };
                break;
            case 'MODERATE_PHOTO': {
                // Fetch image from Storage URL internally — avoids sending large base64
                // in the request body (which can exceed relay limits and cause 400).
                if (!payload.photoUrl) throw new Error('MODERATE_PHOTO requires photoUrl');
                const imgResp = await fetch(payload.photoUrl);
                if (!imgResp.ok) throw new Error(`Failed to fetch photo for moderation: ${imgResp.status}`);
                const buffer = await imgResp.arrayBuffer();
                const uint8 = new Uint8Array(buffer);
                // Convert to base64 in chunks to avoid call-stack overflow on large arrays
                let binary = '';
                const CHUNK = 8192;
                for (let i = 0; i < uint8.length; i += CHUNK) {
                    binary += String.fromCharCode(...uint8.subarray(i, Math.min(i + CHUNK, uint8.length)));
                }
                const imgBase64 = btoa(binary);
                const imgMime = imgResp.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';

                // BLOCK_NONE required so Gemini doesn't refuse a moderation request due
                // to its own safety filters being triggered by the image content.
                const photoSafetySettings = [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                ];
                result = await handleAIRequest(
                    'This image was submitted as a profile photo for a fitness app. Is it appropriate for public display in a health and wellness context? Reply with exactly one line: APROVADO or BLOQUEADO: <short reason in Portuguese>.',
                    false,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY,
                    imgBase64,
                    imgMime,
                    photoSafetySettings
                );
                result = { verdict: typeof result === 'string' ? result.trim() : 'APROVADO' };
                break;
            }
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Edge Function Error:', msg);
        return new Response(JSON.stringify({ error: msg }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});

// --- HELPER LOGIC ---

async function handleAIRequest(prompt: string, isJson: boolean, geminiKey?: string, openaiKey?: string, base64?: string, mimeType?: string, safetySettings?: any[]) {
    if (geminiKey) {
        try {
            const response = await callGemini(prompt, geminiKey, base64, mimeType, isJson, safetySettings);
            return isJson ? parseSafeJSON(response) : response;
        } catch (e) {
            console.warn('Gemini failed, falling back...', e);
        }
    }

    if (openaiKey) {
        try {
            const response = await callOpenAI(prompt, openaiKey, base64, mimeType, isJson);
            return isJson ? parseSafeJSON(response) : response;
        } catch (e) {
            console.warn('OpenAI failed...', e);
        }
    }

    throw new Error('No AI service available or all providers failed');
}

async function callGemini(prompt: string, key: string, base64?: string, mimeType?: string, isJson = false, safetySettings?: any[]) {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`;

    const content: any = { parts: [{ text: prompt }] };
    if (base64 && mimeType) {
        content.parts.unshift({ inlineData: { data: base64, mimeType } });
    }

    const body: any = {
        contents: [content],
        generationConfig: {
            temperature: 0.2,
            ...(isJson ? { response_mime_type: 'application/json' } : {})
        }
    };
    if (safetySettings) body.safetySettings = safetySettings;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    // When Gemini's own safety blocks the output, treat as a BLOQUEADO verdict
    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        return 'BLOQUEADO: conteúdo não permitido detectado';
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI(prompt: string, key: string, base64?: string, mimeType?: string, isJson = false) {
    const messages: any[] = [{ role: 'user', content: prompt }];
    if (base64 && mimeType) {
        messages[0].content = [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
        ];
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.2,
            ...(isJson ? { response_format: { type: "json_object" } } : {})
        })
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

// --- PROMPT GENERATORS (Better versions ported from frontend) ---

function getAnalyzeFoodTextPrompt(description: string) {
    return `Você é um nutricionista especialista. Analise o texto abaixo e identifique se ele contém um ou mais alimentos.
    ALIMENTO/REFEIÇÃO: "${description}"
    REGRAS:
    1. SEPARAÇÃO: Se o usuário descrever múltiplos itens, separe-os em itens individuais.
    2. PRATOS COMPOSTOS: Se for um prato conhecido (ex: "strogonoff", "feijoada"), trate como UM ÚNICO item.
    3. VALORES: Forneça os valores nutricionais baseados em 100g para cada item.
    4. PESO UNITÁRIO: No campo "unit_weight", estime o peso em gramas de UMA ÚNICA UNIDADE (ex: um biscoito=12, um bombom=20, um ovo=50). Se for um item que o usuário geralmente come o pacote inteiro pequeno (ex: Barra de proteína), coloque o peso dela (ex: 45). Se for um prato de comida, use o peso de uma porção média (ex: 300). NUNCA coloque o peso de um pacote econômico/grande.
    
    Retorne APENAS um objeto JSON:
    { "items": [{ "description": "Nome", "calories": 100, "protein": 5, "carbs": 20, "fat": 2, "unit_weight": 100 }] }`;
}

function getAnalyzeFoodPhotoItemsPrompt() {
    return `Identifique TODOS os alimentos e itens individuais visíveis nesta foto. Para CADA item, estime os valores nutricionais em português brasileiros.
    Retorne APENAS um objeto JSON:
    { "items": [{ "description": "Nome", "calories": 130, "protein": 2, "carbs": 28, "fat": 0, "unit_weight": 100 }] }
    REGRAS: Liste cada componente individualmente. Estime valores realistas por 100g. No campo "unit_weight", estime o peso de uma unidade comum desse alimento em gramas.`;
}

function getGenerateWorkoutPrompt(data: any) {
    return `Crie um plano de treino JSON de 4 semanas. Perfil: ${JSON.stringify(data)}.
    Instruções: 7 dias cada semana. IDs de exercícios de 4 dígitos do ExerciseDB (ex: "0009" para flexão).
    Dias inativos devem ter type: "rest".
    Formato: { "name": "...", "weeks": [{ "week": 1, "days": [{ "day": 1, "name": "...", "type": "strength", "exercises": [{ "exercise_id": "0009", "name": "...", "sets": 3, "reps": "12", "rest_seconds": 60, "instructions": "..." }] }] }] }`;
}

function getGenerateWorkoutSinglePrompt(payload: any) {
    return `Crie treino JSON de 1 dia para ${payload.dayName}. Perfil: ${JSON.stringify(payload.profile)}.
    IDs Exercícios de 4 dígitos. Local: ${payload.location}. Tempo: ${payload.availableMinutes}min.
    Retorne JSON: { "day": 1, "name": "...", "exercises": [...] }`;
}

function getGenerateDietPrompt(data: any) {
    return `Crie plano alimentar diário JSON. Objetivo: ${data.goal}, Meta: ${data.daily_calorie_goal} kcal. 
    Considere alimentos favoritos: ${data.food_preferences?.join(', ')}.
    JSON: { "daily_calories": number, "macros": { "protein": 0, "carbs": 0, "fat": 0 }, "meals": [{ "type": "Café", "time": "08:00", "calories": 400, "options": ["Opção 1", "Opção 2"] }], "tips": ["..."] }`;
}

function getSuggestUnitsPrompt(food: string) {
    return `Para o alimento "${food}", liste as 4 a 6 unidades de medida mais comuns em português brasileiro.
    Retorne APENAS um objeto JSON: { "units": ["unid", "gramas", "xícara", "colher", "ml"] }`;
}

function getSuggestFoodsPrompt(query: string) {
    return `Liste 6 a 8 variações comuns do alimento "${query}" em português (ex: "pão de forma", "pão integral").
    Retorne APENAS um objeto JSON: { "foods": ["Variação 1", "Variação 2"] }`;
}

function getChatPrompt(context: string, message: string) {
    return `Você é o Pers, personal trainer do app niume. Contexto do usuário: ${context}.
    Mensagem do usuário: ${message}.
    Responda em português, amigável, motivador e técnico. Máximo 200 palavras.`;
}

function getAnalyzeBodyPrompt() {
    return `Analise esta foto corporal como personal trainer. Descreva em português: 1. Estimativa de % gordura, 2. Pontos fortes, 3. Melhorias, 4. Foco de treino.
    Seja encorajador. Retorne como texto simples (não JSON).`;
}

function getGenerateCardioPlanPrompt(data: any) {
    const { profile, cardioType, activeDays, goalMinutes } = data;
    return `Crie plano de cardio JSON 4 semanas. Tipo: ${cardioType}. Dias: ${activeDays?.join(', ')}. Duração: ${goalMinutes}min. Perfil: ${JSON.stringify(profile)}. 
    Formato: { "name": "...", "weeks": [{ "week": 1, "days": [{ "day": 1, "type": "cardio", "exercises": [...] }] }] }`;
}

function getGenerateModalityPlanPrompt(data: any) {
    const { profile, modality } = data;
    return `Crie plano de treino JSON 4 semanas para a modalidade "${modality?.name}". Perfil: ${JSON.stringify(profile)}.
    Formato: { "name": "...", "weeks": [{ "week": 1, "days": [...] }] }`;
}

function getGenerateModalityExercisesPrompt(data: any) {
    const { modality, count } = data;
    return `Liste ${count} exercícios para a modalidade "${modality?.name}". Retorne JSON: { "exercises": [{ "name": "...", "muscle_group": "...", "instructions": "..." }] }`;
}

function getGenerateExerciseInstructionsPrompt(data: any) {
    return `Gere instruções de execução (2-3 frases) para o exercício "${data.exerciseName}". Seja técnico em português.`;
}

// --- ROBUST JSON PARSER (Ported from geminiService.ts) ---

function parseSafeJSON(text: string): any {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = cleaned.indexOf('{');
        const firstBracket = cleaned.indexOf('[');
        if (firstBrace === -1 && firstBracket === -1) return null;

        const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
        const jsonStr = cleaned.slice(start);

        let parsed: any = null;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            const stack: ("{" | "[")[] = [];
            let inString = false;
            let escaped = false;
            for (let i = 0; i < jsonStr.length; i++) {
                const ch = jsonStr[i];
                if (escaped) { escaped = false; continue; }
                if (ch === '\\' && inString) { escaped = true; continue; }
                if (ch === '"') { inString = !inString; continue; }
                if (!inString) {
                    if (ch === '{' || ch === '[') stack.push(ch as "{" | "[");
                    else if (ch === '}' || ch === ']') stack.pop();
                }
            }
            let repaired = jsonStr;
            if (inString) repaired += '"';
            repaired = repaired.replace(/,\s*$/, '');
            while (stack.length > 0) {
                const last = stack.pop();
                repaired += (last === '{' ? '}' : ']');
            }
            try {
                parsed = JSON.parse(repaired);
            } catch {
                try {
                    const lastBraceIdx = jsonStr.lastIndexOf('}');
                    const lastBracketIdx = jsonStr.lastIndexOf(']');
                    const boundary = Math.max(lastBraceIdx, lastBracketIdx);
                    if (boundary > 0) parsed = JSON.parse(jsonStr.substring(0, boundary + 1));
                } catch { return null; }
            }
        }

        const ensureNumbers = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(ensureNumbers);
            const numFields = ['calories', 'protein', 'carbs', 'fat'];
            numFields.forEach(f => {
                if (f in obj) {
                    const val = obj[f];
                    if (typeof val === 'string') {
                        const m = val.match(/^[\d.]+/);
                        obj[f] = m ? Math.round(parseFloat(m[0])) : 0;
                    } else if (typeof val !== 'number') obj[f] = 0;
                    else obj[f] = Math.round(val);
                }
            });
            return obj;
        };

        return ensureNumbers(parsed);
    } catch (e) {
        console.warn('parseSafeJSON critical failure', e);
        return null;
    }
}

