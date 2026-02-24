import type { OnboardingData, FoodAnalysis, Profile } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1/models';
const MODELS = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro-latest'];

async function callGemini(model: string, prompt: string, timeoutMs = 60000, maxOutputTokens = 8192): Promise<string> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${BASE_URL}/${model}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens },
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } finally {
        clearTimeout(id);
    }
}

async function callGeminiVision(model: string, base64Data: string, mimeType: string, prompt: string, timeoutMs = 60000): Promise<string> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${BASE_URL}/${model}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ inlineData: { data: base64Data, mimeType } }, { text: prompt }] }],
                generationConfig: { temperature: 0.4 },
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } finally {
        clearTimeout(id);
    }
}

async function generateWithFallback(prompt: string, maxOutputTokens = 8192): Promise<string> {
    for (const modelName of MODELS) {
        try {
            const text = await callGemini(modelName, prompt, 60000, maxOutputTokens);
            if (text) return text;
        } catch (e) {
            console.warn(`Model ${modelName} failed, trying next...`, e);
        }
    }
    throw new Error('SERVICE_UNAVAILABLE');
}

async function analyzeImageWithGemini(base64Data: string, mimeType: string, prompt: string): Promise<string> {
    for (const modelName of MODELS) {
        try {
            const text = await callGeminiVision(modelName, base64Data, mimeType, prompt);
            if (text) return text;
        } catch (e) {
            console.warn(`Vision model ${modelName} failed, trying next...`, e);
        }
    }
    throw new Error('All vision models failed');
}

// Calculate BMR (Mifflin-St Jeor)
function calculateBMR(data: OnboardingData): number {
    const { weight, height, age, gender } = data;
    const base = 10 * weight + 6.25 * height - 5 * age;
    return gender === 'female' ? base - 161 : base + 5;
}

// Calculate TDEE
function calculateTDEE(data: OnboardingData): number {
    const bmr = calculateBMR(data);
    const multipliers: Record<string, number> = {
        sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
    };
    return Math.round(bmr * (multipliers[data.activity_level] || 1.55));
}

// Calculate daily calorie goal based on objective
function calculateCalorieGoal(data: OnboardingData): number {
    const tdee = calculateTDEE(data);
    if (data.goal === 'lose_weight') return Math.max(1200, tdee - 500);
    if (data.goal === 'gain_weight') return tdee + 500;
    if (data.goal === 'gain_muscle') return tdee + 300;
    return tdee;
}

export const geminiService = {
    calculateCalorieGoal,

    async generateWorkoutPlan(data: OnboardingData & { active_days?: string[] }): Promise<any> {
        const goalLabels: Record<string, string> = {
            lose_weight: 'Perda de Peso',
            gain_muscle: 'Hipertrofia Muscular',
            maintain: 'Manutenção',
            gain_weight: 'Ganho de Massa',
        };
        const locationLabel = data.training_location === 'gym' ? 'academia (com equipamentos)' : 'em casa (sem equipamentos ou com itens básicos)';

        let activeDaysPrompt = '';
        if (data.active_days && data.active_days.length > 0) {
            activeDaysPrompt = `\n- IMPORTANTE (DIAS DA SEMANA): O usuário informou que só quer/pode malhar nos dias: ${data.active_days.join(', ')}. Os outros dias DEBEM OBRIGATORIAMENTE ser de DESCANSO (type: "rest"). Por favor, distribua os treinos APENAS nestes dias ativos.`;
        } else {
            activeDaysPrompt = `\n- DICA: Planeje os treinos para SEGUNDA a DOMINGO com pelo menos 1 a 2 dias de descanso na semana.`;
        }

        const prompt = `Persona: Personal Trainer. Crie um plano de treino JSON.
Perfil: ${goalLabels[data.goal] || data.goal}, ${locationLabel}, ${data.available_minutes}min/dia, ${data.weight}kg.
Instruções: 4 semanas (7 dias cada). IDs numéricos 4 dígitos (ex: "0009"). Instruções CURTAS.
${activeDaysPrompt}

Formato:
{
  "name": "...",
  "weeks": [
    {
      "week": 1,
      "days": [{ "day": 1, "name": "...", "type": "strength", "exercises": [{ "exercise_id": "0009", "name": "...", "sets": 3, "reps": "12", "rest_seconds": 60, "instructions": "..." }] }]
    }
  ]
}`;

        const text = await generateWithFallback(prompt, 16384);
        return parseSafeJSON(text);
    },

    async generateWorkoutSingleDay(profile: Partial<Profile>, dayName: string, availableMinutes: number, location: string, avoidExercises: string[] = []): Promise<any> {
        const goalLabels: Record<string, string> = {
            lose_weight: 'Perder Peso',
            gain_muscle: 'Ganhar Músculo',
            maintain: 'Manutenção',
            gain_weight: 'Ganhar Peso',
        };

        const locationLabel = location === 'home' ? 'Em Casa (sem equipamentos)' : 'Academia (completa)';
        const avoidList = avoidExercises.length > 0 ? avoidExercises.join(', ') : 'Nenhum';

        const prompt = `Você é um personal trainer especialista. Recalcule APENAS UM DIA de treino em JSON.

PERFIL DO USUÁRIO:
- Objetivo: ${goalLabels[profile.goal || 'maintain'] || profile.goal}
- Local: ${locationLabel}
- Tempo disponível para ESTE DIA: ${availableMinutes} minutos
- Nível de atividade: ${profile.activity_level}
- Peso: ${profile.weight}kg | Altura: ${profile.height}cm | Idade: ${profile.age} anos
- NOME/DIA: Quero um treino para o dia: ${dayName}

INSTRUÇÕES OBRIGATÓRIAS:
- EVITE REPETIR OS SEGUINTES EXERCÍCIOS JA REALIZADOS NA SEMANA: ${avoidList}. Use variações ou exercícios diferentes.
- A chave "exercise_id" DEVE SER OBRIGATORIAMENTE um ID numérico de 4 dígitos do banco ExerciseDB (ex: "0009", "0094", "1347", "3214", "0043"). NUNCA use palavras (como "push-up") no campo "exercise_id"!
- Se for treino em casa, use os IDs numéricos mais próximos do exercício: "0009" (Flexão), "0685" (Agachamento), "0001" (Abdominal), "3214" (Burpee), "1374" (Prancha).
- Máximo de ${Math.floor(availableMinutes / 5)} exercícios.
- Crie um treino único (para apenas 1 dia) considerando o tempo e local acima informados.
Se os minutos forem curtos (ex: 20 min), sugira um HIIT ou Full Body rápido.

Retorne APENAS JSON válido, neste formato exato (sem Markdown):
{
  "day": 1,
  "name": "Treino Exclusiva — [Grupos Musculares ou HIIT]",
  "type": "strength",
  "exercises": [
    {
      "exercise_id": "0009",
      "name": "Nome do Exercício",
      "sets": 3,
      "reps": "10-12",
      "recommended_weight": "10kg",
      "rest_seconds": 60,
      "instructions": "Como executar corretamente",
      "tips": "Dica importante"
    }
  ]
}`;

        const text = await generateWithFallback(prompt);
        return parseSafeJSON(text);
    },

    async generateDietPlan(data: OnboardingData): Promise<any> {
        const calories = calculateCalorieGoal(data);
        const foods = data.food_preferences.length > 0
            ? data.food_preferences.join(', ')
            : 'variado';
        const atHome = data.foods_at_home.length > 0
            ? data.foods_at_home.join(', ')
            : 'alimentos básicos';

        const prompt = `Você é um nutricionista. Crie um plano alimentar diário personalizado.

PERFIL:
- Objetivo: ${data.goal}
- Meta calórica diária: ${calories} kcal
- Alimentos favoritos: ${foods}
- Sempre tem em casa: ${atHome}
- Peso: ${data.weight}kg | Altura: ${data.height}cm

Retorne APENAS JSON válido:
{
  "daily_calories": ${calories},
  "macros": { "protein": 0, "carbs": 0, "fat": 0 },
  "meals": [
    {
      "type": "Café da manhã",
      "time": "07:00",
      "calories": 0,
      "options": ["Opção 1 completa", "Opção 2 completa"]
    },
    {
      "type": "Almoço",
      "time": "12:00",
      "calories": 0,
      "options": ["Opção 1 completa", "Opção 2 completa"]
    },
    {
      "type": "Lanche",
      "time": "15:30",
      "calories": 0,
      "options": ["Opção 1", "Opção 2"]
    },
    {
      "type": "Jantar",
      "time": "19:00",
      "calories": 0,
      "options": ["Opção 1 completa", "Opção 2 completa"]
    }
  ],
  "tips": ["Dica 1", "Dica 2", "Dica 3"]
}`;

        const text = await generateWithFallback(prompt);
        return parseSafeJSON(text);
    },

    async analyzeBodyPhoto(base64: string, mimeType = 'image/jpeg'): Promise<string> {
        const prompt = `Analise esta foto corporal como personal trainer profissional. Descreva em português:
1. Estimativa visual de % de gordura corporal
2. Pontos fortes identificados
3. Áreas com maior potencial de melhoria
4. Recomendação de foco para o treino
Seja encorajador e construtivo. Máximo 3 parágrafos.`;

        return await analyzeImageWithGemini(base64, mimeType, prompt);
    },

    async suggestUnits(food: string): Promise<string[]> {
        const prompt = `Para o alimento "${food}", liste as 4 a 6 unidades de medida mais comuns em português brasileiro.
Exemplos:
- "leite": ["copo", "xícara", "ml", "litro"]
- "pizza": ["fatia", "pedaço", "gramas", "prato"]
- "banana": ["unidade", "gramas"]
- "arroz": ["colher de sopa", "xícara", "gramas", "porção"]
- "ovo": ["unidade", "gramas"]
- "pão francês": ["unidade", "gramas", "metade"]
- "chocolate": ["gramas", "quadrado", "barra inteira"]
Retorne APENAS um array JSON de strings. Sem texto extra, sem markdown.`;
        const text = await generateWithFallback(prompt);
        return parseSafeJSON(text);
    },

    async suggestFoods(query: string): Promise<string[]> {
        const prompt = `Liste 6 a 8 variações comuns do alimento "${query}" em português brasileiro, como aparecem em apps de dieta e tabela TACO.
Exemplo para "pão": ["Pão francês", "Pão francês sem miolo", "Pão francês com manteiga", "Pão de forma", "Pão de queijo", "Pão doce", "Pão integral", "Pão de forma integral"]
Retorne APENAS um array JSON válido. Sem texto extra, sem markdown.`;
        const text = await generateWithFallback(prompt);
        return parseSafeJSON(text);
    },

    async analyzeFoodText(description: string): Promise<FoodAnalysis> {
        const prompt = `Você é um nutricionista especialista. Estime os valores nutricionais (calorias, proteínas, carboidratos e gorduras) para o alimento ou refeição descrito abaixo.

ALIMENTO: "${description}"

Retorne APENAS um objeto JSON no seguinte formato:
{
  "description": "${description}",
  "calories": (valor em kcal),
  "protein": (valor em gramas),
  "carbs": (valor em gramas),
  "fat": (valor em gramas)
}

REGRAS:
- Considere uma porção padrão/média de restaurante ou residencial.
- Seja realista e nunca retorne zero se for um alimento calórico.
- Use apenas números inteiros para os valores nutricionais.
- Retorne APENAS o JSON, sem texto explicativo.`;

        const text = await generateWithFallback(prompt);
        return parseSafeJSON(text);
    },

    async analyzeFoodPhoto(base64: string, mimeType = 'image/jpeg'): Promise<FoodAnalysis> {
        const prompt = `Analise esta foto de comida e identifique o prato principal ou alimento. Estime os valores nutricionais (calorias e macros) para uma porção típica visível.

Retorne APENAS um objeto JSON válido:
{
  "description": "Nome simples do alimento em português",
  "calories": (valor estimado em kcal),
  "protein": (valor estimado em g),
  "carbs": (valor estimado em g),
  "fat": (valor estimado em g)
}

REGRAS:
- "description" deve ser apenas o nome curto do alimento (ex: Arroz com Feijão e Bife).
- Use estimativas realistas fundamentadas em tabelas nutricionais (TACO/USDA).
- Se houver comida na imagem, os valores nutricionais DEVEM SER maiores que zero.
- Retorne apenas números inteiros nos campos numéricos.`;

        const text = await analyzeImageWithGemini(base64, mimeType, prompt);
        return parseSafeJSON(text);
    },

    async analyzeFoodPhotoItems(base64: string, mimeType = 'image/jpeg'): Promise<FoodAnalysis[]> {
        const prompt = `Identifique TODOS os alimentos e itens individuais visíveis nesta foto. Para CADA item, estime os valores nutricionais separadamente.

Retorne APENAS um array JSON:
[
  { "description": "Arroz", "calories": 130, "protein": 2, "carbs": 28, "fat": 0 },
  { "description": "Feijão", "calories": 76, "protein": 5, "carbs": 14, "fat": 1 }
]

REGRAS:
- Liste cada componente individualmente em português.
- Inclua guarnições, saladas e bebidas se visíveis.
- Os valores nutricionais DEVEM ser estimativas realistas e não zeros (exceto se o alimento realmente não tiver aquele macro).
- Retorne apenas o JSON, sem markdown ou explicações.`;

        const text = await analyzeImageWithGemini(base64, mimeType, prompt);
        const parsed = parseSafeJSON(text);
        return Array.isArray(parsed) ? (parsed as FoodAnalysis[]) : [parsed as FoodAnalysis];
    },

    async getAssistantResponse(userMessage: string, context: string): Promise<string> {
        const prompt = `Você é o assistente personal trainer do app niume. Seu nome é "Pers".
Você é motivador, direto e especialista em fitness e nutrição.
Sempre responda em português do Brasil de forma amigável e profissional.

CONTEXTO DO USUÁRIO (últimos 15 dias):
${context}

PERGUNTA/MENSAGEM DO USUÁRIO:
${userMessage}

Responda de forma útil, motivadora e personalizada com base no contexto acima. Máximo de 200 palavras.`;

        return await generateWithFallback(prompt);
    },
};

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
            // Repair truncated JSON: track strings and open brackets/braces
            const stack: ('{' | '[')[] = [];
            let inString = false;
            let escaped = false;

            for (let i = 0; i < jsonStr.length; i++) {
                const ch = jsonStr[i];
                if (escaped) { escaped = false; continue; }
                if (ch === '\\' && inString) { escaped = true; continue; }
                if (ch === '"') { inString = !inString; continue; }
                if (!inString) {
                    if (ch === '{' || ch === '[') stack.push(ch as '{' | '[');
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
            } catch (innerError) {
                // If it still fails, try to just find the last valid object boundary
                try {
                    const lastBraceIdx = jsonStr.lastIndexOf('}');
                    const lastBracketIdx = jsonStr.lastIndexOf(']');
                    const boundary = Math.max(lastBraceIdx, lastBracketIdx);
                    if (boundary > 0) {
                        parsed = JSON.parse(jsonStr.substring(0, boundary + 1));
                    }
                } catch {
                    console.warn('JSON repair failed:', innerError);
                    return null;
                }
            }
        }

        // Post-processing to ensure numeric values for calories/macros
        const ensureNumbers = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(ensureNumbers);

            const numericFields = ['calories', 'protein', 'carbs', 'fat'];
            numericFields.forEach(field => {
                if (field in obj) {
                    const val = obj[field];
                    if (typeof val === 'string') {
                        // Extract leading numbers (handles "120kcal", "120 kcal", "120g")
                        const match = val.match(/^[\d.]+/);
                        obj[field] = match ? Math.round(parseFloat(match[0])) : 0;
                    } else if (typeof val !== 'number') {
                        obj[field] = 0;
                    } else {
                        obj[field] = Math.round(val);
                    }
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
