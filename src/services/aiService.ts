import { geminiService } from './geminiService';
import { openaiService } from './openaiService';
import type { OnboardingData, FoodAnalysis, Profile } from '../types';

// Check if OpenAI is configured
const hasOpenAI = !!import.meta.env.VITE_OPENAI_API_KEY;

export const aiService = {
    // Utility from GeminiService (pure logic)
    calculateCalorieGoal: geminiService.calculateCalorieGoal,

    async generateWorkoutPlan(data: OnboardingData & { active_days?: string[] }): Promise<any> {
        try {
            return await geminiService.generateWorkoutPlan(data);
        } catch (e: any) {
            if (hasOpenAI) {
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
            if (hasOpenAI) {
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
            if (hasOpenAI) {
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
            if (hasOpenAI) {
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
            if (hasOpenAI) {
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
            if (hasOpenAI) {
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
            if (hasOpenAI) {
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
            if (hasOpenAI) {
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
            if (hasOpenAI) {
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
            if (hasOpenAI) {
                console.warn('Gemini failed, falling back to OpenAI...', e);
                return await openaiService.getAssistantResponse(userMessage, context);
            }
            throw e;
        }
    }
};
