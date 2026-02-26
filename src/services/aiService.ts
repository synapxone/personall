import { supabase } from '../lib/supabase';
import type { OnboardingData, FoodAnalysis, Profile, Modality, CommunityExercise } from '../types';
import { dietGenerator } from './dietGenerator';
import { workoutGenerator } from './workoutGenerator';

// Pure calculation logic ported from former geminiService
function calculateBMR(data: OnboardingData): number {
    const { weight, height, age, gender } = data;
    const base = 10 * weight + 6.25 * height - 5 * age;
    return gender === 'female' ? base - 161 : base + 5;
}

function calculateTDEE(data: OnboardingData): number {
    const bmr = calculateBMR(data);
    const multipliers: Record<string, number> = {
        sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
    };
    return Math.round(bmr * (multipliers[data.activity_level] || 1.55));
}

function calculateCalorieGoal(data: OnboardingData): number {
    const tdee = calculateTDEE(data);
    if (data.goal === 'lose_weight') return Math.max(1200, tdee - 500);
    if (data.goal === 'gain_weight') return tdee + 500;
    if (data.goal === 'gain_muscle') return tdee + 300;
    return tdee;
}

const callAiService = async (action: string, payload: any) => {
    const { data, error } = await supabase.functions.invoke('ai-service', {
        body: { action, payload }
    });
    if (error) throw error;
    return data;
};

export const aiService = {
    calculateCalorieGoal,

    async generateWorkoutPlan(data: OnboardingData & { active_days?: string[], split_type?: string, training_location?: string, experience_level?: string }): Promise<any> {
        return await workoutGenerator.generateClientSide(
            { gender: data.gender, experience_level: data.experience_level || 'intermediate' } as Partial<Profile>,
            data.split_type || 'Full Body',
            data.active_days || [],
            data.training_location || 'gym'
        );
    },

    async generateWorkoutSingleDay(profile: Partial<Profile>, dayName: string, availableMinutes: number, location: string, avoidExercises: string[] = []): Promise<any> {
        return await callAiService('GENERATE_WORKOUT_SINGLE', { profile, dayName, availableMinutes, location, avoidExercises });
    },

    async generateDietPlan(data: OnboardingData): Promise<any> {
        return await dietGenerator.generateClientSide(data);
    },

    async analyzeBodyPhoto(base64: string, mimeType = 'image/jpeg'): Promise<string> {
        const result = await callAiService('ANALYZE_BODY', { base64, mimeType });
        return typeof result === 'string' ? result : result.analysis || JSON.stringify(result);
    },

    async moderateProfilePhoto(photoUrl: string): Promise<{ approved: boolean; reason?: string }> {
        const result = await callAiService('MODERATE_PHOTO', { photoUrl });
        const verdict: string = result?.verdict ?? 'APROVADO';
        if (verdict.startsWith('BLOQUEADO')) {
            const reason = verdict.replace(/^BLOQUEADO:\s*/i, '').trim();
            return { approved: false, reason };
        }
        return { approved: true };
    },

    async suggestUnits(_food: string): Promise<string[]> {
        return ['g', 'ml', 'unidade', 'fatia', 'porção', 'xícara', 'colher de sopa'];
    },

    async suggestFoods(query: string): Promise<string[]> {
        if (!query || query.length < 2) return [];
        try {
            const { data, error } = await supabase
                .from('food_database')
                .select('name')
                .ilike('name', `%${query}%`)
                .limit(8);

            if (error || !data) return [];
            // Remove duplicates and extract just the names
            return Array.from(new Set(data.map(item => item.name)));
        } catch (e) {
            console.error('Failed to search foods:', e);
            return [];
        }
    },

    async analyzeFoodText(description: string): Promise<FoodAnalysis[]> {
        let aiResults: FoodAnalysis[] = [];
        try {
            const result = await callAiService('ANALYZE_FOOD_TEXT', { description });
            aiResults = result.items || [];
        } catch (e: any) {
            console.error('AI Service Error:', e);
            throw e;
        }

        const finalResults: FoodAnalysis[] = [];
        for (const item of aiResults) {
            const { data: dbItem, error } = await supabase
                .from('food_database')
                .select('*')
                .ilike('name', item.description)
                .limit(1)
                .maybeSingle();

            if (dbItem && !error) {
                finalResults.push({
                    description: dbItem.name,
                    calories: dbItem.calories,
                    protein: Number(dbItem.protein),
                    carbs: Number(dbItem.carbs),
                    fat: Number(dbItem.fat),
                    unit_weight: Number(dbItem.unit_weight || 100)
                });
            } else {
                if (item.calories > 0 || item.protein > 0 || item.carbs > 0 || item.fat > 0) {
                    try {
                        await supabase.from('food_database').insert({
                            name: item.description,
                            calories: item.calories,
                            protein: item.protein,
                            carbs: item.carbs,
                            fat: item.fat,
                            unit_weight: item.unit_weight || 100,
                            serving_size: '100g',
                            source: 'AI_Crowdsourced_v2'
                        });
                    } catch (dbErr) {
                        console.warn('Failed to crowdsource food item:', dbErr);
                    }
                }
                finalResults.push(item);
            }
        }
        return finalResults;
    },

    async analyzeFoodPhoto(base64: string, mimeType = 'image/jpeg'): Promise<FoodAnalysis> {
        const result = await callAiService('ANALYZE_FOOD_PHOTO', { base64, mimeType });
        return result.items?.[0] || result;
    },

    async analyzeFoodPhotoItems(base64: string, mimeType = 'image/jpeg'): Promise<FoodAnalysis[]> {
        const result = await callAiService('ANALYZE_FOOD_PHOTO', { base64, mimeType });
        return result.items || [];
    },

    async getAssistantResponse(userMessage: string, context: string): Promise<string> {
        const result = await callAiService('CHAT', { message: userMessage, context });
        return result.text || (typeof result === 'string' ? result : JSON.stringify(result));
    },

    async searchFoodDatabase(query: string): Promise<FoodAnalysis[]> {
        try {
            const { data, error } = await supabase
                .from('food_database')
                .select('*')
                .ilike('name', `%${query}%`)
                .limit(10);

            if (error || !data) return [];
            return data.map(item => ({
                description: item.name,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                unit_weight: item.unit_weight
            }));
        } catch (e) {
            console.error('Database search error', e);
            return [];
        }
    },

    async generateWorkoutFromTemplate(
        profile: Partial<Profile>,
        splitType: string,
        activeDays: string[],
        location: string
    ): Promise<any> {
        return await callAiService('GENERATE_WORKOUT', {
            ...profile,
            training_location: location,
            active_days: activeDays,
            split_type: splitType,
        });
    },

    async generateCardioPlan(
        profile: Partial<Profile>,
        cardioType: string,
        activeDays: string[],
        goalMinutes: number
    ): Promise<any> {
        return await callAiService('GENERATE_CARDIO_PLAN', {
            profile,
            cardioType,
            activeDays,
            goalMinutes,
        });
    },

    async generateModalityPlan(
        profile: Partial<Profile>,
        modality: Modality
    ): Promise<any> {
        return await callAiService('GENERATE_MODALITY_PLAN', {
            profile,
            modality,
        });
    },

    async generateModalityExercises(
        modality: Pick<Modality, 'name' | 'description'>,
        count = 6
    ): Promise<CommunityExercise[]> {
        try {
            const result = await callAiService('GENERATE_MODALITY_EXERCISES', {
                modality,
                count,
            });
            return result.exercises ?? [];
        } catch {
            return [];
        }
    },

    async generateExerciseInstructions(
        exerciseName: string,
        category: string,
        modalityName?: string
    ): Promise<string> {
        try {
            const result = await callAiService('GENERATE_EXERCISE_INSTRUCTIONS', {
                exerciseName,
                category,
                modalityName,
            });
            return result.instructions ?? '';
        } catch {
            return '';
        }
    },

    async fetchFromOpenFoodFacts(barcode: string): Promise<FoodAnalysis | null> {
        try {
            const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
            const data = await res.json();
            if (data.status === 1 && data.product) {
                const p = data.product;
                const nutrients = p.nutriments;

                // Tenta extrair o peso de uma unidade/porção
                let unitWeight = 100; // Default
                if (nutrients.serving_quantity) {
                    unitWeight = Number(nutrients.serving_quantity);
                } else if (p.serving_quantity) {
                    unitWeight = Number(p.serving_quantity);
                } else if (p.product_quantity) {
                    // Se não tem porção, mas tem peso total, podemos usar peso total como "unidade" (pacote)
                    // Mas para biscoitos isso pode ser o erro que o usuário citou.
                    // No entanto, é melhor ter o peso do pacote do que fixo 100g se o pacote for diferente.
                    unitWeight = Number(p.product_quantity);
                }

                return {
                    description: p.product_name || 'Produto desconhecido',
                    calories: Math.round(nutrients['energy-kcal_100g'] || nutrients['energy_100g'] / 4.184 || 0),
                    protein: Math.round(nutrients.proteins_100g || 0),
                    carbs: Math.round(nutrients.carbohydrates_100g || 0),
                    fat: Math.round(nutrients.fat_100g || 0),
                    unit_weight: unitWeight
                };
            }
            return null;
        } catch (e) {
            console.error('OpenFoodFacts error', e);
            return null;
        }
    }
};

