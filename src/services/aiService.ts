import { geminiService } from './geminiService';
import { openaiService } from './openaiService';
import { supabase } from '../lib/supabase';
import type { OnboardingData, FoodAnalysis, Profile } from '../types';

// Helper to check OpenAI dynamically
const hasOpenAI = () => {
    const hasKey = !!import.meta.env.VITE_OPENAI_API_KEY;
    if (!hasKey && import.meta.env.PROD) {
        console.error('AI ERROR: VITE_OPENAI_API_KEY is missing in production build. Check GitHub Secrets.');
    }
    return hasKey;
};
const hasGemini = () => {
    const hasKey = !!import.meta.env.VITE_GEMINI_API_KEY;
    if (!hasKey && import.meta.env.PROD) {
        console.error('AI ERROR: VITE_GEMINI_API_KEY is missing in production build. Check GitHub Secrets.');
    }
    return hasKey;
};

export const aiService = {
    // Utility from GeminiService (pure logic)
    calculateCalorieGoal: geminiService.calculateCalorieGoal,

    async generateWorkoutPlan(data: OnboardingData & { active_days?: string[] }): Promise<any> {
        try {
            if (!hasGemini()) throw new Error('GEMINI_KEY_MISSING');
            return await geminiService.generateWorkoutPlan(data);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.generateWorkoutPlan(data);
            }
            throw e;
        }
    },

    async generateWorkoutSingleDay(profile: Partial<Profile>, dayName: string, availableMinutes: number, location: string, avoidExercises: string[] = []): Promise<any> {
        try {
            return await geminiService.generateWorkoutSingleDay(profile, dayName, availableMinutes, location, avoidExercises);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.generateWorkoutSingleDay(profile, dayName, availableMinutes, location, avoidExercises);
            }
            throw e;
        }
    },

    async generateDietPlan(data: OnboardingData): Promise<any> {
        try {
            return await geminiService.generateDietPlan(data);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.generateDietPlan(data);
            }
            throw e;
        }
    },

    async analyzeBodyPhoto(base64: string, mimeType = 'image/jpeg'): Promise<string> {
        try {
            return await geminiService.analyzeBodyPhoto(base64, mimeType);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.analyzeBodyPhoto(base64, mimeType);
            }
            throw e;
        }
    },

    async suggestUnits(food: string): Promise<string[]> {
        try {
            return await geminiService.suggestUnits(food);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.suggestUnits(food);
            }
            throw e;
        }
    },

    async suggestFoods(query: string): Promise<string[]> {
        try {
            return await geminiService.suggestFoods(query);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.suggestFoods(query);
            }
            throw e;
        }
    },

    async analyzeFoodText(description: string): Promise<FoodAnalysis> {
        try {
            return await geminiService.analyzeFoodText(description);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.analyzeFoodText(description);
            }
            throw e;
        }
    },

    async analyzeFoodPhoto(base64: string, mimeType = 'image/jpeg'): Promise<FoodAnalysis> {
        try {
            return await geminiService.analyzeFoodPhoto(base64, mimeType);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.analyzeFoodPhoto(base64, mimeType);
            }
            throw e;
        }
    },

    async analyzeFoodPhotoItems(base64: string, mimeType = 'image/jpeg'): Promise<FoodAnalysis[]> {
        try {
            return await geminiService.analyzeFoodPhotoItems(base64, mimeType);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, trying OpenAI for multi-item analysis...', e);
                return await openaiService.analyzeFoodPhotoItems(base64, mimeType);
            }
            throw e;
        }
    },

    async getAssistantResponse(userMessage: string, context: string): Promise<string> {
        try {
            return await geminiService.getAssistantResponse(userMessage, context);
        } catch (e: any) {
            if (hasOpenAI()) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.getAssistantResponse(userMessage, context);
            }
            throw e;
        }
    },

    async searchFoodDatabase(query: string): Promise<FoodAnalysis[]> {
        try {
            // Searched by name, which often includes brands like 'Nestlé', 'Sadia', etc.
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
                fat: item.fat
            }));
        } catch (e) {
            console.error('Database search error', e);
            return [];
        }
    },


    async fetchFromOpenFoodFacts(barcode: string): Promise<FoodAnalysis | null> {
        try {
            const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
            const data = await res.json();
            if (data.status === 1 && data.product) {
                const p = data.product;
                const nutrients = p.nutriments;
                return {
                    description: p.product_name || 'Produto desconhecido',
                    calories: Math.round(nutrients['energy-kcal_100g'] || nutrients['energy_100g'] / 4.184 || 0),
                    protein: Math.round(nutrients.proteins_100g || 0),
                    carbs: Math.round(nutrients.carbohydrates_100g || 0),
                    fat: Math.round(nutrients.fat_100g || 0)
                };
            }
            return null;
        } catch (e) {
            console.error('OpenFoodFacts error', e);
            return null;
        }
    }
};
