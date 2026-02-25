import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
                    getAnalyzeFoodPhotoPrompt(),
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
                    `Para o alimento "${payload.food}", liste as 4 a 6 unidades de medida mais comuns em português brasileiro. Retorne APENAS um objeto JSON: { "units": ["unid", "gramas"] }`,
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'SUGGEST_FOODS':
                result = await handleAIRequest(
                    `Liste 6 a 8 variações comuns do alimento "${payload.query}" em português brasileiro. Retorne APENAS um objeto JSON: { "foods": ["Variação 1", "Variação 2"] }`,
                    true,
                    GEMINI_API_KEY,
                    OPENAI_API_KEY
                );
                break;
            case 'CHAT':
                result = await handleAIRequest(
                    `Você é o Pers, personal trainer do app niume. Contexto: ${payload.context}. Mensagem: ${payload.message}. Responda em português, motivador e direto. Máximo 200 palavras.`,
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
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Edge Function Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});

// --- HELPER LOGIC ---

async function handleAIRequest(prompt: string, isJson: boolean, geminiKey?: string, openaiKey?: string, base64?: string, mimeType?: string) {
    // Try Gemini First
    if (geminiKey) {
        try {
            const response = await callGemini(prompt, geminiKey, base64, mimeType, isJson);
            return isJson ? parseSafeJSON(response) : response;
        } catch (e) {
            console.warn('Gemini failed, falling back...', e);
        }
    }

    // Fallback to OpenAI
    if (openaiKey) {
        const response = await callOpenAI(prompt, openaiKey, base64, mimeType, isJson);
        return isJson ? JSON.parse(response) : response;
    }

    throw new Error('No AI service available or all providers failed');
}

async function callGemini(prompt: string, key: string, base64?: string, mimeType?: string, isJson = false) {
    const model = base64 ? 'gemini-1.5-flash' : 'gemini-1.5-flash'; // Fixed models for speed
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;

    const content: any = { parts: [{ text: prompt }] };
    if (base64 && mimeType) {
        content.parts.unshift({ inlineData: { data: base64, mimeType } });
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [content],
            generationConfig: {
                temperature: 0.2,
                ...(isJson ? { response_mime_type: "application/json" } : {})
            }
        })
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
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

// --- PROMPT GENERATORS ---

function getAnalyzeFoodTextPrompt(description: string) {
    return `Você é um nutricionista experiente. Analise o alimento: "${description}". 
    Regras estritas:
    1. Forneça os valores nutricionais SEMPRE baseados em exatas 100 gramas do alimento.
    2. No campo "description", retorne apenas o nome simples do alimento (ex: "Bombom", em vez de "1 unidade de bombom").
    3. No campo "unit_weight", estime o peso em gramas de uma unidade comum ou porção padrão desse alimento.
    
    Retorne APENAS um objeto JSON no formato:
    { 
      "items": [{ 
        "description": "Nome do Alimento", 
        "calories": calorias_em_100g, 
        "protein": proteina_em_100g, 
        "carbs": carboidratos_em_100g, 
        "fat": gordura_em_100g,
        "unit_weight": peso_de_UMA_unidade_em_gramas_EX_sushi_25_bombom_20_porcao_prato_300
      }] 
    }`;
}

function getAnalyzeFoodPhotoPrompt() {
    return `Identifique todos alimentos na foto. Retorne JSON: { "items": [{ "description": "nome", "calories": number, "protein": number, "carbs": number, "fat": number }] }`;
}

function getGenerateWorkoutPrompt(data: any) {
    return `Crie plano de treino JSON 4 semanas. Perfil: ${JSON.stringify(data)}. Formato: { "name": "...", "weeks": [{ "week": 1, "days": [{ "day": 1, "name": "...", "type": "strength", "exercises": [{ "exercise_id": "0009", "name": "...", "sets": 3, "reps": "12", "rest_seconds": 60, "instructions": "..." }] }] }] }`;
}

function getGenerateWorkoutSinglePrompt(payload: any) {
    return `Crie treino JSON de 1 dia para ${payload.dayName}. Local: ${payload.location}. Perfil: ${JSON.stringify(payload.profile)}. Retorne objeto JSON: { "day": 1, "name": "...", "exercises": [...] }`;
}

function getGenerateDietPrompt(data: any) {
    return `Crie plano alimentar diário JSON. Objetivo: ${data.goal}, Meta: ${data.daily_calorie_goal} kcal. JSON: { "daily_calories": number, "meals": [{ "type": "Café", "time": "08:00", "calories": 400, "options": ["Opção 1", "Opção 2"] }] }`;
}

function getAnalyzeBodyPrompt() {
    return `Analise a foto corporal como personal profissional. Estime % gordura, pontos fortes e áreas de melhoria. Seja motivador.`;
}

function getGenerateCardioPlanPrompt(data: any) {
    const { profile, cardioType, activeDays, goalMinutes } = data;
    return `Crie plano de cardio JSON 4 semanas. Tipo: ${cardioType}. Dias: ${activeDays?.join(', ')}. Duração por sessão: ${goalMinutes}min. Perfil: ${JSON.stringify(profile ?? {})}. Formato: { "name": "Plano Cardio ...", "description": "...", "estimated_weeks": 4, "weeks": [{ "week": 1, "days": [{ "day": 1, "name": "...", "type": "cardio", "exercises": [{ "exercise_id": "c01", "name": "...", "sets": 1, "reps": "${goalMinutes ?? 30}min", "rest_seconds": 60, "instructions": "..." }] }] }] }`;
}

function getGenerateModalityPlanPrompt(data: any) {
    const { profile, modality } = data;
    return `Crie plano de treino JSON 4 semanas para a modalidade esportiva "${modality?.name}" (${modality?.description ?? ''}). Adapte ao perfil: ${JSON.stringify(profile ?? {})}. Formato: { "name": "Plano ${modality?.name ?? 'Modalidade'}", "description": "...", "estimated_weeks": 4, "weeks": [{ "week": 1, "days": [{ "day": 1, "name": "...", "type": "strength", "exercises": [{ "exercise_id": "m01", "name": "...", "sets": 3, "reps": "12", "rest_seconds": 60, "instructions": "..." }] }] }] }`;
}

function getGenerateModalityExercisesPrompt(data: any) {
    const { modality, count } = data;
    return `Liste ${count ?? 6} exercícios específicos para a modalidade "${modality?.name}" (${modality?.description ?? ''}). Retorne APENAS JSON: { "exercises": [{ "name": "...", "muscle_group": "...", "equipment": "livre", "instructions": "..." }] }`;
}

function getGenerateExerciseInstructionsPrompt(data: any) {
    return `Gere instruções de execução em 2-3 frases para o exercício "${data.exerciseName}" (categoria: ${data.category}${data.modalityName ? ', modalidade: ' + data.modalityName : ''}). Seja objetivo e técnico.`;
}

// Minimal parseSafeJSON for Edge Function
function parseSafeJSON(text: string): any {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch {
        // If simple parse fails, use a basic substring match to try and find the first JSON object
        try {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                return JSON.parse(text.substring(firstBrace, lastBrace + 1));
            }
        } catch { }
        return { items: [], error: 'JSON Parse Failed' };
    }
}
