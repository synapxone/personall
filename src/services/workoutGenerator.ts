import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

export interface ExercisePlan {
    exercise_id: string;
    name: string;
    sets: number;
    reps: string;
    rest_seconds: number;
    instructions?: string;
}

export interface WorkoutDay {
    day: number;
    name: string;
    type: 'strength' | 'cardio' | 'rest' | 'recovery';
    exercises: ExercisePlan[];
}

export interface WorkoutWeek {
    week: number;
    days: WorkoutDay[];
}

export interface WorkoutPlan {
    name: string;
    weeks: WorkoutWeek[];
}

// Map muscle targets to split types
const splitMaps: Record<string, string[][]> = {
    'Full Body': [
        ['chest', 'back', 'legs', 'shoulders', 'arms'],
        ['chest', 'back', 'legs', 'shoulders', 'arms'],
        ['chest', 'back', 'legs', 'shoulders', 'arms']
    ],
    'Push/Pull/Legs': [
        ['chest', 'shoulders', 'triceps'],
        ['back', 'biceps'],
        ['legs', 'core']
    ],
    'Upper/Lower': [
        ['chest', 'back', 'shoulders', 'arms'],
        ['legs', 'core']
    ],
    'Bro Split': [
        ['chest'],
        ['back'],
        ['legs'],
        ['shoulders'],
        ['arms', 'core']
    ]
};

const getTargetMusclesStr = (targets: string[]): string => {
    return targets.join(', ');
};

// Define standard progression based on experience
const getSetsAndReps = (experience: string) => {
    switch (experience) {
        case 'beginner': return { sets: 3, reps: '12-15', rest: 90 };
        case 'advanced': return { sets: 4, reps: '8-12', rest: 60 };
        default: return { sets: 3, reps: '10-12', rest: 60 }; // intermediate
    }
};

export const workoutGenerator = {
    async generateClientSide(profile: Partial<Profile>, splitType: string, activeDays: string[], location: string): Promise<WorkoutPlan> {

        // Default to a 4 week plan
        const weeksCount = 4;
        const weeks: WorkoutWeek[] = [];

        let splitPattern = splitMaps[splitType] || splitMaps['Full Body'];
        // If they chose PPL but only work out 2 days, adapt to Full Body or Upper/Lower
        if (activeDays.length <= 2 && splitType !== 'Full Body') {
            splitPattern = splitMaps['Full Body'];
            splitType = 'Full Body (Adaptado)';
        }

        const expOptions = getSetsAndReps((profile as any).experience_level || 'intermediate');

        // Fetch pool of appropriate exercises once
        const { data: exercisePool, error } = await supabase
            .from('exercises')
            .select('*')
            .limit(100); // In real app, consider caching or smarter filtering

        if (error) console.warn('Supabase fetch error for exercises:', error);

        const pool = (exercisePool || []);

        for (let w = 1; w <= weeksCount; w++) {
            const days: WorkoutDay[] = [];
            let splitIndex = 0;

            for (let d = 1; d <= 7; d++) {
                const dayName = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][(d - 1) % 7];

                // If this day of the week is not in their active days, rest
                if (!activeDays.includes(dayName)) {
                    days.push({
                        day: d,
                        name: 'Descanso',
                        type: 'rest',
                        exercises: []
                    });
                    continue;
                }

                // Active day logic
                const targets = splitPattern[splitIndex % splitPattern.length];
                const exercises: ExercisePlan[] = [];

                // Fallback deterministic selection
                targets.forEach(target => {
                    // Try to find matching exercises in our pool
                    // A real app might have 'target_muscle' column or similar
                    const matches = pool.filter(ex =>
                        (ex.bodyPart?.toLowerCase().includes(target) ||
                            ex.target?.toLowerCase().includes(target) ||
                            ex.name?.toLowerCase().includes(target)) &&
                        (location === 'home' ? (ex.equipment?.toLowerCase() === 'body weight' || ex.equipment?.toLowerCase().includes('band')) : true)
                    );

                    // Pick 2 per target
                    const selected = matches.sort(() => 0.5 - Math.random()).slice(0, 2);

                    selected.forEach(ex => {
                        exercises.push({
                            exercise_id: ex.id,
                            name: ex.name,
                            sets: expOptions.sets,
                            reps: expOptions.reps,
                            rest_seconds: expOptions.rest
                        });
                    });
                });

                // If pool is empty or failed matching, fallback to generic
                if (exercises.length === 0) {
                    exercises.push({
                        exercise_id: "0001", // generic fallback
                        name: `${getTargetMusclesStr(targets)} genérico`,
                        sets: expOptions.sets,
                        reps: expOptions.reps,
                        rest_seconds: expOptions.rest
                    });
                }

                days.push({
                    day: d,
                    name: `Treino: ${getTargetMusclesStr(targets).toUpperCase()}`,
                    type: 'strength',
                    exercises
                });

                splitIndex++;
            }

            weeks.push({ week: w, days });
        }

        return {
            name: `Plano ${splitType} - ${location === 'home' ? 'Casa' : 'Academia'}`,
            weeks
        };
    }
};
