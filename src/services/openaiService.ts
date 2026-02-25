import type { OnboardingData, FoodAnalysis, Profile } from '../types';

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const BASE_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

async function callOpenAI(prompt: string, json = true, timeoutMs = 60000, maxTokens = 4000): Promise<string> {
    if (!API_KEY) throw new Error('OPENAI_KEY_MISSING');

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: maxTokens,
                ...(json ? { response_format: { type: "json_object" } } : {})
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('OpenAI Error Details:', err);
            if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    } finally {
        clearTimeout(id);
    }
}

async function callOpenAIVision(base64Data: string, mimeType: string, prompt: string, timeoutMs = 60000): Promise<string> {
    if (!API_KEY) throw new Error('OPENAI_KEY_MISSING');

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType};base64,${base64Data}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 1000,
                response_format: { type: "json_object" }
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('OpenAI Vision Error Details:', err);
            if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    } finally {
        clearTimeout(id);
    }
}

export const openaiService = {
    async generateWorkoutPlan(data: OnboardingData): Promise<any> {
        const prompt = `Crie um plano de treino JSON para: ${JSON.stringify(data)}. JSON format: { "name": "...", "weeks": [] }`;
        const text = await callOpenAI(prompt, true);
        return JSON.parse(text);
    },

    async generateWorkoutSingleDay(profile: Partial<Profile>, dayName: string, availableMinutes: number, location: string, avoidExercises: string[] = []): Promise<any> {
        const prompt = `Crie um treino JSON para o dia ${dayName}, ${availableMinutes}min em ${location}. Perfil: ${JSON.stringify(profile)}. Evite: ${avoidExercises.join(',')}. JSON format: { "day": 1, "name": "...", "exercises": [] }`;
        const text = await callOpenAI(prompt, true);
        return JSON.parse(text);
    },

    async generateDietPlan(data: OnboardingData): Promise<any> {
        const prompt = `Crie um plano de dieta JSON para: ${JSON.stringify(data)}. JSON format: { "daily_calories": 2000, "meals": [] }`;
        const text = await callOpenAI(prompt, true);
        return JSON.parse(text);
    },

    async analyzeFoodPhoto(base64: string, mimeType: string): Promise<FoodAnalysis> {
        const prompt = `Analise esta foto de comida. Identifique o prato e estime os valores nutricionais (calorias, proteína, carboidrato, gordura). 
Retorne APENAS JSON: { "description": "nome do prato", "calories": número, "protein": número, "carbs": número, "fat": número }
Seja realista nas estimativas e não use zeros se houver comida.`;
        const text = await callOpenAIVision(base64, mimeType, prompt);
        return JSON.parse(text);
    },

    async analyzeFoodPhotoItems(base64: string, mimeType: string): Promise<FoodAnalysis[]> {
        const prompt = `Identifique TODOS os alimentos e acompanhamentos visíveis. Estime os macros de cada um. 
Retorne APENAS um objeto JSON com uma chave "items" contendo o array: { "items": [{ "description": "nome curto", "calories": número, "protein": número, "carbs": número, "fat": número }] }
Os valores nutricionais DEVEM ser estimativas realistas (> 0 se houver comida).`;
        const text = await callOpenAIVision(base64, mimeType, prompt);
        const parsed = JSON.parse(text);
        return parsed.items || [];
    },

    async analyzeBodyPhoto(base64: string, mimeType: string): Promise<string> {
        const prompt = `Descreva o físico nesta foto de forma profissional e motivadora (parágrafo curto). Retorne JSON: { "analysis": "..." }`;
        const text = await callOpenAIVision(base64, mimeType, prompt);
        return JSON.parse(text).analysis;
    },

    async suggestUnits(food: string): Promise<string[]> {
        const prompt = `Unidades de medida para ${food}. JSON: { "units": ["unidade", "gramas"] }`;
        const text = await callOpenAI(prompt, true);
        return JSON.parse(text).units;
    },

    async suggestFoods(query: string): Promise<string[]> {
        const prompt = `Variações de ${query}. JSON: { "foods": ["Item 1", "Item 2"] }`;
        const text = await callOpenAI(prompt, true);
        return JSON.parse(text).foods;
    },

    async analyzeFoodText(description: string): Promise<FoodAnalysis[]> {
        const prompt = `Analise e estime nutrientes para "${description}". Se houver múltiplos itens (ex: arroz com feijão), separe-os. Pratos compostos (ex: strogonoff) ficam em um item só.
        Retorne APENAS um objeto JSON com uma chave "items" contendo o array: { "items": [{ "description": "...", "calories": número, "protein": número, "carbs": número, "fat": número }] }. 
        Seja realista nas estimativas.`;
        const text = await callOpenAI(prompt, true);
        const parsed = JSON.parse(text);
        return Array.isArray(parsed.items) ? parsed.items : [parsed];
    },

    async getAssistantResponse(userMessage: string, context: string): Promise<string> {
        const prompt = `Você é o Pers, personal trainer. Contexto: ${context}. Mensagem: ${userMessage}. Responda de forma curta e motivadora.`;
        // No JSON format for general chat
        return await callOpenAI(prompt, false);
    }
};
