import type { OnboardingData, FoodAnalysis } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

async function callGemini(model: string, prompt: string, timeoutMs = 60000): Promise<string> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${BASE_URL}/${model}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
            }),
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } finally {
        clearTimeout(id);
    }
}

async function generateWithFallback(prompt: string): Promise<string> {
    for (const modelName of MODELS) {
        try {
            const text = await callGemini(modelName, prompt);
            if (text) return text;
        } catch (e) {
            console.warn(`Model ${modelName} failed, trying next...`, e);
        }
    }
    throw new Error('All Gemini models failed');
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

    async generateWorkoutPlan(data: OnboardingData): Promise<any> {
        const goalLabels: Record<string, string> = {
            lose_weight: 'Perda de Peso',
            gain_muscle: 'Hipertrofia Muscular',
            maintain: 'Manutenção',
            gain_weight: 'Ganho de Massa',
        };
        const locationLabel = data.training_location === 'gym' ? 'academia (com equipamentos)' : 'em casa (sem equipamentos ou com itens básicos)';

        const prompt = `Você é um personal trainer especialista. Crie um plano de treino completo em JSON.

PERFIL DO USUÁRIO:
- Objetivo: ${goalLabels[data.goal] || data.goal}
- Local: ${locationLabel}
- Tempo disponível: ${data.available_minutes} minutos por dia
- Nível de atividade atual: ${data.activity_level}
- Peso: ${data.weight}kg | Altura: ${data.height}cm | Idade: ${data.age} anos

INSTRUÇÕES:
- Use IDs numéricos de exercícios do banco ExerciseDB (ex: "0009", "0094", "1347")
- Para treino em casa sem equipamentos, use: bodyweight exercises (IDs: push-up, squat, lunge, plank, burpee, mountain-climber, jump-jack)
- Crie um plano de 4-8 semanas com progressão
- Máximo de ${Math.floor(data.available_minutes / 5)} exercícios por dia
- Inclua dias de descanso

Retorne APENAS JSON válido:
{
  "name": "Plano [Objetivo] — X semanas",
  "estimated_weeks": 8,
  "description": "Descrição breve do plano e como ele atinge o objetivo",
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "day": 1,
          "name": "Treino A — [Grupos Musculares]",
          "type": "strength",
          "exercises": [
            {
              "exercise_id": "0009",
              "name": "Nome do Exercício",
              "sets": 3,
              "reps": "10-12",
              "rest_seconds": 60,
              "instructions": "Como executar corretamente",
              "tips": "Dica importante"
            }
          ]
        },
        {
          "day": 2,
          "name": "Descanso Ativo",
          "type": "rest",
          "exercises": []
        }
      ]
    }
  ]
}`;

        try {
            const text = await generateWithFallback(prompt);
            const match = text.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e) {
            console.error('Error generating workout plan:', e);
        }
        // Fallback plan
        return {
            name: 'Plano Inicial — 4 semanas',
            estimated_weeks: 4,
            description: 'Plano básico para começar sua jornada fitness.',
            weeks: [{
                week: 1,
                days: [
                    { day: 1, name: 'Treino Full Body A', type: 'strength', exercises: [
                        { exercise_id: '0009', name: 'Flexão de Braço', sets: 3, reps: '10-15', rest_seconds: 60, instructions: 'Mantenha o corpo reto.', tips: 'Respire ao descer.' },
                        { exercise_id: '0685', name: 'Agachamento', sets: 3, reps: '15-20', rest_seconds: 60, instructions: 'Pés na largura dos ombros.', tips: 'Joelhos não passem dos pés.' },
                    ]},
                    { day: 2, name: 'Descanso', type: 'rest', exercises: [] },
                ]
            }],
        };
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

        try {
            const text = await generateWithFallback(prompt);
            const match = text.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e) {
            console.error('Error generating diet plan:', e);
        }
        return { daily_calories: calories, macros: { protein: 150, carbs: 200, fat: 60 }, meals: [], tips: [] };
    },

    async analyzeBodyPhoto(base64: string, mimeType = 'image/jpeg'): Promise<string> {
        const prompt = `Analise esta foto corporal como personal trainer profissional. Descreva em português:
1. Estimativa visual de % de gordura corporal
2. Pontos fortes identificados
3. Áreas com maior potencial de melhoria
4. Recomendação de foco para o treino
Seja encorajador e construtivo. Máximo 3 parágrafos.`;

        try {
            return await analyzeImageWithGemini(base64, mimeType, prompt);
        } catch (e) {
            return 'Análise corporal não disponível. Seu plano foi criado com base nas informações fornecidas.';
        }
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
        try {
            const text = await generateWithFallback(prompt);
            const match = text.match(/\[[\s\S]*?\]/);
            if (match) return JSON.parse(match[0]);
        } catch (e) {
            console.error('Error suggesting units:', e);
        }
        return ['unidade', 'gramas', 'porção'];
    },

    async suggestFoods(query: string): Promise<string[]> {
        const prompt = `Liste 6 a 8 variações comuns do alimento "${query}" em português brasileiro, como aparecem em apps de dieta e tabela TACO.
Exemplo para "pão": ["Pão francês", "Pão francês sem miolo", "Pão francês com manteiga", "Pão de forma", "Pão de queijo", "Pão doce", "Pão integral", "Pão de forma integral"]
Retorne APENAS um array JSON válido. Sem texto extra, sem markdown.`;
        try {
            const text = await generateWithFallback(prompt);
            const match = text.match(/\[[\s\S]*?\]/);
            if (match) return JSON.parse(match[0]);
        } catch (e) {
            console.error('Error suggesting foods:', e);
        }
        return [];
    },

    async analyzeFoodText(description: string): Promise<FoodAnalysis> {
        const prompt = `Você é um nutricionista. Estime os valores nutricionais do alimento/refeição descrito abaixo.

ALIMENTO: "${description}"

Retorne APENAS JSON válido (sem texto extra):
{
  "description": "${description}",
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0
}

Considere uma porção padrão/média. Seja realista e conservador nas estimativas. Retorne apenas números inteiros.`;

        try {
            const text = await generateWithFallback(prompt);
            const match = text.match(/\{[\s\S]*?\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e) {
            console.error('Error analyzing food text:', e);
        }
        return { description, calories: 0, protein: 0, carbs: 0, fat: 0 };
    },

    async analyzeFoodPhoto(base64: string, mimeType = 'image/jpeg'): Promise<FoodAnalysis> {
        const prompt = `Identifique o alimento nesta foto e estime seus valores nutricionais para uma porção típica.

Retorne APENAS JSON válido:
{
  "description": "Nome simples do alimento (ex: Barra de chocolate Snickers, Arroz com frango, Banana)",
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0
}

IMPORTANTE: "description" deve ser APENAS o nome do alimento, sem descrever embalagem, cores ou apresentação visual. Seja conservador nas estimativas. Números inteiros.`;

        try {
            const text = await analyzeImageWithGemini(base64, mimeType, prompt);
            const match = text.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e) {
            console.error('Error analyzing food:', e);
        }
        return { description: 'Refeição não identificada', calories: 0, protein: 0, carbs: 0, fat: 0 };
    },

    async getAssistantResponse(userMessage: string, context: string): Promise<string> {
        const prompt = `Você é o assistente personal trainer do app Personall. Seu nome é "Pers".
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
