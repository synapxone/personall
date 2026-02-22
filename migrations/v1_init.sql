-- ============================================================
-- Personall — v1 — Schema completo
-- Execute no Supabase SQL Editor
-- ============================================================

-- Extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name                TEXT NOT NULL,
    age                 INTEGER NOT NULL,
    weight              DECIMAL(5,2) NOT NULL,
    height              DECIMAL(5,2) NOT NULL,
    gender              TEXT NOT NULL DEFAULT 'other',
    activity_level      TEXT NOT NULL DEFAULT 'moderate',
    goal                TEXT NOT NULL DEFAULT 'maintain',
    training_location   TEXT NOT NULL DEFAULT 'home',
    available_minutes   INTEGER NOT NULL DEFAULT 45,
    photo_url           TEXT,
    body_analysis       TEXT,
    food_preferences    TEXT[] DEFAULT '{}',
    foods_at_home       TEXT[] DEFAULT '{}',
    daily_calorie_goal  INTEGER DEFAULT 2000,
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles
    USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============================================================
-- 2. WORKOUT PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workout_plans (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    estimated_weeks INTEGER DEFAULT 12,
    plan_data       JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plans" ON public.workout_plans
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 3. WORKOUT SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workout_sessions (
    id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id               UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    plan_id               UUID REFERENCES public.workout_plans(id) ON DELETE SET NULL,
    session_date          DATE DEFAULT CURRENT_DATE NOT NULL,
    day_index             INTEGER DEFAULT 0,
    exercises_completed   JSONB DEFAULT '[]',
    duration_minutes      INTEGER DEFAULT 0,
    points_earned         INTEGER DEFAULT 0,
    completed             BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sessions" ON public.workout_sessions
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 4. MEALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meals (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    meal_date   DATE DEFAULT CURRENT_DATE NOT NULL,
    meal_type   TEXT NOT NULL DEFAULT 'lunch',
    description TEXT NOT NULL,
    photo_url   TEXT,
    calories    INTEGER DEFAULT 0,
    protein     DECIMAL(6,2) DEFAULT 0,
    carbs       DECIMAL(6,2) DEFAULT 0,
    fat         DECIMAL(6,2) DEFAULT 0,
    logged_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own meals" ON public.meals
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 5. DAILY NUTRITION (agregado por dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_nutrition (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    date            DATE DEFAULT CURRENT_DATE NOT NULL,
    total_calories  INTEGER DEFAULT 0,
    total_protein   DECIMAL(6,2) DEFAULT 0,
    total_carbs     DECIMAL(6,2) DEFAULT 0,
    total_fat       DECIMAL(6,2) DEFAULT 0,
    goal_calories   INTEGER DEFAULT 2000,
    UNIQUE(user_id, date)
);

ALTER TABLE public.daily_nutrition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own nutrition" ON public.daily_nutrition
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 6. GAMIFICATION
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gamification (
    id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    points              INTEGER DEFAULT 0,
    level               INTEGER DEFAULT 1,
    xp_to_next          INTEGER DEFAULT 200,
    streak_days         INTEGER DEFAULT 0,
    last_activity_date  DATE,
    total_workouts      INTEGER DEFAULT 0,
    total_meals_logged  INTEGER DEFAULT 0,
    rewards_available   JSONB DEFAULT '[]',
    rewards_earned      JSONB DEFAULT '[]',
    updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.gamification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gamification" ON public.gamification
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 7. AI CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conversations" ON public.ai_conversations
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Index para buscar histórico rapidamente
CREATE INDEX IF NOT EXISTS idx_ai_conv_user_date ON public.ai_conversations(user_id, created_at DESC);

-- ============================================================
-- 8. STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('body-photos', 'body-photos', true, 10485760, ARRAY['image/png','image/jpeg','image/webp','image/heic']),
    ('meal-photos', 'meal-photos', true, 10485760, ARRAY['image/png','image/jpeg','image/webp','image/heic'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- Storage policies
DROP POLICY IF EXISTS "Authenticated upload body-photos" ON storage.objects;
CREATE POLICY "Authenticated upload body-photos" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'body-photos' AND auth.role() = 'authenticated');
CREATE POLICY "Public read body-photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'body-photos');

DROP POLICY IF EXISTS "Authenticated upload meal-photos" ON storage.objects;
CREATE POLICY "Authenticated upload meal-photos" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'meal-photos' AND auth.role() = 'authenticated');
CREATE POLICY "Public read meal-photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'meal-photos');
