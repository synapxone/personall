import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { Profile, OnboardingData, WorkoutPlan, Gamification } from './types';
import LandingPage from './components/LandingPage';
import OnboardingWizard from './components/OnboardingWizard';
import Dashboard from './components/Dashboard';
import { geminiService } from './services/geminiService';

type AppView = 'landing' | 'onboarding' | 'dashboard';

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
    const [gamification, setGamification] = useState<Gamification | null>(null);
    const [view, setView] = useState<AppView>('landing');
    const [loading, setLoading] = useState(true);
    const loadingRef = useRef(false);

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            CapacitorUpdater.notifyAppReady();
        }
    }, []);

    useEffect(() => {
        // onAuthStateChange fires on init too, so we only use it (not getSession)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
                loadUserData(session.user.id);
            } else if (!session) {
                setProfile(null);
                setView('landing');
                setLoading(false);
                loadingRef.current = false;
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    async function loadUserData(userId: string, silent = false) {
        if (loadingRef.current) return;
        loadingRef.current = true;
        if (!silent) setLoading(true);
        try {
            const [profileRes, planRes, gamRes, mealCountRes, workoutCountRes] = await Promise.all([
                supabase.from('profiles').select('*').eq('id', userId).single(),
                supabase.from('workout_plans').select('*').eq('user_id', userId).eq('is_active', true).single(),
                supabase.from('gamification').select('*').eq('user_id', userId).single(),
                supabase.from('meals').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
            ]);
            if (profileRes.data) {
                setProfile(profileRes.data as Profile);
                setWorkoutPlan(planRes.data as WorkoutPlan | null);

                let gamData = gamRes.data as Gamification | null;
                if (gamData) {
                    gamData = {
                        ...gamData,
                        total_meals_logged: mealCountRes.count || 0,
                        total_workouts: workoutCountRes.count || 0,
                    };
                }
                setGamification(gamData);
                if (!silent) setView('dashboard');
            } else {
                setView('onboarding');
            }
        } catch (e) {
            console.error('Failed to load user data:', e);
            if (!silent) setView('landing');
        } finally {
            if (!silent) setLoading(false);
            loadingRef.current = false;
        }
    }

    useEffect(() => {
        if ('Notification' in window) {
            Notification.requestPermission().catch(() => { });
        }

        // Load user theme preference
        const savedTheme = localStorage.getItem('app-theme') || 'dark';
        if (savedTheme === 'light') {
            document.documentElement.classList.add('light');
        } else {
            document.documentElement.classList.remove('light');
        }
    }, []);

    useEffect(() => {
        if (!profile) return;
        const interval = setInterval(async () => {
            const now = new Date();
            const hr = now.getHours();
            const min = now.getMinutes();
            // Check at exactly 14:00 (lunch) or 20:30 (dinner)
            if ((hr === 14 && min === 0) || (hr === 20 && min === 30)) {
                const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const typeToCheck = hr === 14 ? 'lunch' : 'dinner';
                const { data } = await supabase.from('meals')
                    .select('id')
                    .eq('user_id', profile.id)
                    .eq('meal_date', date)
                    .eq('meal_type', typeToCheck);

                if (!data || data.length === 0) {
                    const msg = hr === 14
                        ? 'São 14h! Já almoçou? Não esqueça de registrar seu almoço.'
                        : 'Já são 20h30! Lembre-se de registrar o jantar de hoje.';

                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('Personall', { body: msg });
                    } else {
                        toast(msg, { icon: '🔔', duration: 10000 });
                    }
                }
            }
        }, 60000); // checks every minute
        return () => clearInterval(interval);
    }, [profile]);

    async function handleOnboardingComplete(data: OnboardingData, workoutPlanData: any) {
        if (!session) return;
        setLoading(true);
        const userId = session.user.id;
        const dailyCalorieGoal = geminiService.calculateCalorieGoal(data);

        // 1. Upload body photo if provided
        let photoUrl: string | undefined;
        if (data.photo_file) {
            const ext = data.photo_file.name.split('.').pop() || 'jpg';
            const { data: uploadData } = await supabase.storage
                .from('body-photos')
                .upload(`${userId}/body.${ext}`, data.photo_file, { upsert: true });
            if (uploadData) {
                const { data: urlData } = supabase.storage.from('body-photos').getPublicUrl(uploadData.path);
                photoUrl = urlData.publicUrl;
            }
        }

        // 2. Create profile
        await supabase.from('profiles').upsert({
            id: userId,
            name: data.name,
            age: data.age,
            weight: data.weight,
            height: data.height,
            gender: data.gender,
            activity_level: data.activity_level,
            goal: data.goal,
            training_location: data.training_location,
            available_minutes: data.available_minutes,
            food_preferences: data.food_preferences,
            foods_at_home: data.foods_at_home,
            photo_url: photoUrl,
            body_analysis: data.body_analysis,
            daily_calorie_goal: dailyCalorieGoal,
        });

        // 3. Save workout plan
        await supabase.from('workout_plans').insert({
            user_id: userId,
            name: workoutPlanData.name,
            description: workoutPlanData.description,
            estimated_weeks: workoutPlanData.estimated_weeks,
            plan_data: workoutPlanData,
            is_active: true,
        }).select().single();

        // 4. Initialize gamification
        await supabase.from('gamification').upsert({
            user_id: userId,
            points: 0,
            level: 1,
            xp_to_next: 200,
            streak_days: 0,
            total_workouts: 0,
            total_meals_logged: 0,
            rewards_available: [],
            rewards_earned: [],
        });

        await loadUserData(userId);
    }

    async function handleSignOut() {
        await supabase.auth.signOut();
    }

    if (loading) return (
        <div className="min-h-screen bg-dark flex items-center justify-center" style={{ backgroundColor: '#0F0F1A' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-12 h-12 border-4 border-t-transparent rounded-full"
                style={{ borderColor: '#7C3AED', borderTopColor: 'transparent' }} />
        </div>
    );

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#0F0F1A' }}>
            <Toaster position="top-center" toastOptions={{ style: { background: '#1A1A2E', color: '#fff', border: '1px solid rgba(124,58,237,0.3)' } }} />
            <AnimatePresence mode="wait">
                {view === 'landing' && (
                    <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <LandingPage onAuthSuccess={() => { }} />
                    </motion.div>
                )}
                {view === 'onboarding' && session && (
                    <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <OnboardingWizard onComplete={handleOnboardingComplete} />
                    </motion.div>
                )}
                {view === 'dashboard' && profile && (
                    <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Dashboard
                            profile={profile}
                            workoutPlan={workoutPlan}
                            gamification={gamification}
                            onSignOut={handleSignOut}
                            onRefresh={() => loadUserData(session!.user.id, true)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
