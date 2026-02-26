
import type { OnboardingData } from '../types';
import { aiService } from './aiService';

export interface DietMeal {
    type: string;
    time: string;
    calories: number;
    options: string[];
}

export interface DietPlan {
    daily_calories: number;
    macros: {
        protein: number;
        carbs: number;
        fat: number;
    };
    meals: DietMeal[];
    tips: string[];
}

// Map user goal to macro distribution
const getMacroDistribution = (goal: string) => {
    switch (goal) {
        case 'lose_weight':
            return { protein: 0.40, carbs: 0.35, fat: 0.25 };
        case 'gain_muscle':
            return { protein: 0.30, carbs: 0.45, fat: 0.25 };
        case 'gain_weight':
            return { protein: 0.25, carbs: 0.50, fat: 0.25 };
        default: // maintain
            return { protein: 0.30, carbs: 0.40, fat: 0.30 };
    }
};

const DEFAULT_FOODS: Record<string, string[]> = {
    'Café da Manhã': ['Ovos mexidos com pão integral', 'Aveia com whey protein e banana', 'Tapioca com queijo branco', 'Iogurte natural com frutas e chia'],
    'Almoço': ['Peito de frango grelhado com arroz e feijão', 'Patinho moído com purê de batata', 'Filé de peixe com legumes no vapor', 'Macarrão integral com atum'],
    'Lanche': ['Whey protein com maçã', 'Mix de castanhas', 'Barra de proteína', 'Sanduíche natural de frango desfiado'],
    'Jantar': ['Salada grande com frango desfiado', 'Omelete de claras com espinafre', 'Sopa de legumes com carne magra', 'Filé mignon suíno com salada']
};

export const dietGenerator = {
    async generateClientSide(data: OnboardingData): Promise<DietPlan> {
        const daily_calories = aiService.calculateCalorieGoal(data);
        const distribution = getMacroDistribution(data.goal);

        // Calculate macros in grams (Protein/Carb = 4kcal/g, Fat = 9kcal/g)
        const macros = {
            protein: Math.round((daily_calories * distribution.protein) / 4),
            carbs: Math.round((daily_calories * distribution.carbs) / 4),
            fat: Math.round((daily_calories * distribution.fat) / 9)
        };

        // Use preferences or default fallbacks
        const prefs = data.food_preferences && data.food_preferences.length > 0
            ? data.food_preferences.map(p => p.toLowerCase())
            : [];

        const isVegetarian = prefs.includes('vegetariano') || prefs.includes('vegano');

        // Customize tips based on profile
        const tips = [
            `Beba pelo menos ${Math.round(data.weight * 35)}ml de água por dia.`,
            data.goal === 'lose_weight' ? 'Priorize alimentos com alto volume e baixa caloria (vegetais).' : 'Não pule refeições importantes para bater sua meta.',
            'O descanso adequado é fundamental para seus resultados.'
        ];

        // Distribute calories across 4 meals (25% / 35% / 15% / 25%)
        const meals: DietMeal[] = [
            {
                type: 'Café da Manhã',
                time: '08:00',
                calories: Math.round(daily_calories * 0.25),
                options: isVegetarian
                    ? ['Panqueca de aveia com pasta de amendoim', 'Tofu mexido com pão']
                    : DEFAULT_FOODS['Café da Manhã']
            },
            {
                type: 'Almoço',
                time: '13:00',
                calories: Math.round(daily_calories * 0.35),
                options: isVegetarian
                    ? ['Grão de bico com arroz e salada', 'Lentilha com legumes assados']
                    : DEFAULT_FOODS['Almoço']
            },
            {
                type: 'Lanche',
                time: '16:00',
                calories: Math.round(daily_calories * 0.15),
                options: isVegetarian
                    ? ['Frutas com sementes', 'Shake de proteína vegetal']
                    : DEFAULT_FOODS['Lanche']
            },
            {
                type: 'Jantar',
                time: '20:00',
                calories: Math.round(daily_calories * 0.25),
                options: isVegetarian
                    ? ['Sopa de ervilha', 'Salada quente com proteína de soja']
                    : DEFAULT_FOODS['Jantar']
            }
        ];

        // Embellish the options with the user's specific food preferences if matched loosely
        if (prefs.length > 0) {
            meals.forEach(m => {
                const extra = prefs[Math.floor(Math.random() * prefs.length)];
                // Capitalize first letter
                const suggestion = `Inclua sua preferência: ${extra.charAt(0).toUpperCase() + extra.slice(1)}`;
                if (!m.options.includes(suggestion)) {
                    m.options.push(suggestion);
                }
            });
        }

        return {
            daily_calories,
            macros,
            meals,
            tips
        };
    }
};
