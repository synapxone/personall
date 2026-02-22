// =====================================================
// USER PROFILE
// =====================================================

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose_weight' | 'gain_muscle' | 'maintain' | 'gain_weight';
export type TrainingLocation = 'gym' | 'home';
export type Gender = 'male' | 'female' | 'other';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type Profile = {
  id: string;
  name: string;
  age: number;
  weight: number;        // kg
  height: number;        // cm
  gender: Gender;
  activity_level: ActivityLevel;
  goal: Goal;
  training_location: TrainingLocation;
  available_minutes: number;
  photo_url?: string;
  body_analysis?: string;
  food_preferences: string[];
  foods_at_home: string[];
  daily_calorie_goal: number;
  created_at: string;
  updated_at: string;
};

// =====================================================
// WORKOUT
// =====================================================

export type Exercise = {
  exercise_id: string;   // ExerciseDB id
  name: string;
  sets: number;
  reps: string;          // "8-12" or "30 segundos"
  rest_seconds: number;
  instructions: string;
  tips?: string;
  gif_url?: string;      // filled by exerciseService
};

export type WorkoutDay = {
  day: number;
  name: string;
  type: 'strength' | 'cardio' | 'rest' | 'hiit';
  exercises: Exercise[];
};

export type WorkoutWeek = {
  week: number;
  days: WorkoutDay[];
};

export type WorkoutPlan = {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  estimated_weeks: number;
  plan_data: {
    weeks: WorkoutWeek[];
  };
  is_active: boolean;
  created_at: string;
};

export type WorkoutSession = {
  id: string;
  user_id: string;
  plan_id: string;
  session_date: string;
  day_index: number;
  exercises_completed: string[];  // exercise names completed
  duration_minutes: number;
  points_earned: number;
  completed: boolean;
  created_at: string;
};

// =====================================================
// NUTRITION
// =====================================================

export type Meal = {
  id: string;
  user_id: string;
  meal_date: string;
  meal_type: MealType;
  description: string;
  photo_url?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logged_at: string;
};

export type DailyNutrition = {
  id: string;
  user_id: string;
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  goal_calories: number;
};

// =====================================================
// GAMIFICATION
// =====================================================

export type Reward = {
  id: string;
  emoji: string;
  name: string;
  description: string;
  cost: number;
  earned_at?: string;
  used_at?: string;
};

export type Gamification = {
  id: string;
  user_id: string;
  points: number;
  level: number;
  xp_to_next: number;
  streak_days: number;
  last_activity_date?: string;
  total_workouts: number;
  total_meals_logged: number;
  rewards_available: Reward[];
  rewards_earned: Reward[];
  updated_at: string;
};

// =====================================================
// AI CONVERSATION
// =====================================================

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

// =====================================================
// ONBOARDING
// =====================================================

export type OnboardingData = {
  name: string;
  age: number;
  gender: Gender;
  weight: number;
  height: number;
  activity_level: ActivityLevel;
  goal: Goal;
  training_location: TrainingLocation;
  available_minutes: number;
  food_preferences: string[];
  foods_at_home: string[];
  photo_file?: File;
  photo_url?: string;
  body_analysis?: string;
};

// =====================================================
// FOOD ANALYSIS (Gemini Vision)
// =====================================================

export type FoodAnalysis = {
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

// =====================================================
// PROGRESS TRACKING
// =====================================================

export type ProgressEntry = {
  id: string;
  user_id: string;
  date: string;           // 'YYYY-MM-DD'
  weight: number | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
};

// =====================================================
// EXERCISE (ExerciseDB)
// =====================================================

export type ExerciseDBItem = {
  id: string;
  name: string;
  gifUrl: string;
  bodyPart: string;
  equipment: string;
  target: string;
  instructions: string[];
};

// Available rewards catalog
export const REWARDS_CATALOG: Reward[] = [
  { id: 'choc',    emoji: '🍫', name: 'Barra de Chocolate',  description: 'Coma uma barrinha de chocolate à vontade!',       cost: 500  },
  { id: 'cake',    emoji: '🍰', name: 'Sobremesa Completa',   description: 'Peça aquela sobremesa que você estava evitando.',  cost: 800  },
  { id: 'pizza',   emoji: '🍕', name: 'Fatia de Pizza',       description: 'Uma fatia de pizza sem culpa!',                   cost: 1000 },
  { id: 'burger',  emoji: '🍔', name: 'Hambúrguer',           description: 'Hambúrguer artesanal, você merece!',              cost: 2000 },
  { id: 'freedom', emoji: '🎉', name: 'Dia Livre de Dieta',   description: 'Um dia inteiro sem restrições — coma o que quiser!', cost: 5000 },
];

// Level XP thresholds: level N needs N * 200 XP
export function xpForLevel(level: number): number {
  return level * 200;
}

// Points per action
export const POINTS = {
  WORKOUT_COMPLETE:  150,
  WORKOUT_PARTIAL:   75,
  MEAL_LOGGED:       25,
  STREAK_BONUS:      10,   // per consecutive day
  BODY_PHOTO:        50,
} as const;
