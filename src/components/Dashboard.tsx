import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Dumbbell, Apple, Trophy, User, Flame, Zap, BarChart3, TrendingUp, ChevronRight, CheckCircle2, BedDouble, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalYYYYMMDD } from '../lib/dateUtils';
import type { Profile, WorkoutPlan, Gamification } from '../types';
import WorkoutDayView from './WorkoutDay';
import NutritionLog from './NutritionLog';
import GamificationView from './Gamification';
import ProfileView from './ProfileView';
import AIAssistant from './AIAssistant';
import DailyRewardModal from './DailyRewardModal';

interface Props {
    profile: Profile;
    workoutPlan: WorkoutPlan | null;
    gamification: Gamification | null;
    onSignOut: () => void;
    onRefresh: () => void;
}

type Tab = 'home' | 'workout' | 'nutrition' | 'gamification' | 'profile';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Início', icon: <Home size={22} /> },
    { id: 'workout', label: 'Treino', icon: <Dumbbell size={22} /> },
    { id: 'nutrition', label: 'Dieta', icon: <Apple size={22} /> },
    { id: 'gamification', label: 'Evolução', icon: <Trophy size={22} /> },
    { id: 'profile', label: 'Perfil', icon: <User size={22} /> },
];

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
}

function getTodayWorkout(plan: WorkoutPlan | null) {
    if (!plan) return null;
    const dayOfWeek = new Date().getDay(); // 0=Sun
    const weeks = plan.plan_data?.weeks;
    if (!weeks?.length) return null;
    const currentWeek = weeks[0];
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return currentWeek.days[dayIndex % currentWeek.days.length] || null;
}

const pageVariants = {
    enter: { opacity: 0, x: 20 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
};

interface NutritionTotals {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

export default function Dashboard({ profile, workoutPlan, gamification, onSignOut, onRefresh }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        return (sessionStorage.getItem('activeTab') as Tab) || 'home';
    });
    const [nutritionTotals, setNutritionTotals] = useState<NutritionTotals | null>(null);
    const [showDailyReward, setShowDailyReward] = useState(false);

    useEffect(() => {
        const todayStr = getLocalYYYYMMDD();
        const lastCheck = localStorage.getItem('lastDailyRewardCheck');
        if (lastCheck !== todayStr) {
            setShowDailyReward(true);
            localStorage.setItem('lastDailyRewardCheck', todayStr);
        }
    }, []);

    useEffect(() => {
        sessionStorage.setItem('activeTab', activeTab);
        window.scrollTo({ top: 0, behavior: 'auto' });

        if (activeTab === 'home' && !nutritionTotals) {
            const ymd = getLocalYYYYMMDD();
            supabase.from('meals')
                .select('calories, protein, carbs, fat')
                .eq('user_id', profile.id)
                .eq('meal_date', ymd)
                .then(({ data }) => {
                    if (data) {
                        const t = data.reduce((acc, curr) => ({
                            calories: acc.calories + (curr.calories || 0),
                            protein: acc.protein + (curr.protein || 0),
                            carbs: acc.carbs + (curr.carbs || 0),
                            fat: acc.fat + (curr.fat || 0)
                        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
                        setNutritionTotals(t);
                    }
                });
        }
    }, [activeTab, profile.id, nutritionTotals]);

    const todayWorkout = getTodayWorkout(workoutPlan);

    // Calc Dedication Score (min 32.5, max 100)
    const dedication = gamification
        ? Math.min(100, Math.max(32.5, (gamification.streak_days * 5) + (gamification.total_workouts * 3) + (gamification.total_meals_logged * 1)))
        : 32.5;

    // Estimate total weight moved from localStorage
    const totalWeight = Object.keys(localStorage)
        .filter(k => k.startsWith('weight_'))
        .reduce((acc, k) => acc + (parseFloat(localStorage.getItem(k) || '0') || 0), 0) * (gamification?.total_workouts || 1); // rough estimate

    return (
        <div className="min-h-screen flex flex-col font-sans bg-dark text-text-main">
            {/* Top header */}
            <header className="flex items-center justify-between px-5 pt-20 pb-8 safe-top border-b bg-dark" style={{ borderColor: 'var(--border-main)' }}>
                <div className="flex items-center gap-2">
                    <span className="font-['Quicksand'] font-bold text-2xl lowercase text-text-main">niume</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-text-muted text-xs font-medium">{profile.name.split(' ')[0]}</span>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-primary/20"
                        style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
                        {profile.name.charAt(0).toUpperCase()}
                    </div>
                </div>
            </header>

            {showDailyReward && (
                <DailyRewardModal
                    profile={profile}
                    gamification={gamification}
                    onClose={() => setShowDailyReward(false)}
                />
            )}


            {/* Content */}
            <main className="flex-1 overflow-y-auto pb-20 bg-dark">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        variants={pageVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.2 }}
                    >
                        {/* ===== HOME ===== */}
                        {activeTab === 'home' && (
                            <div className="px-4 py-5 flex flex-col gap-5 max-w-lg mx-auto">
                                {/* Greeting */}
                                <div>
                                    <h1 className="text-xl font-semibold text-text-main tracking-tight">
                                        {getGreeting()}, {profile.name.split(' ')[0]}.
                                    </h1>
                                    <p className="text-text-muted text-xs mt-1 font-medium">
                                        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </p>
                                </div>


                                {/* Results Analysis Overview */}
                                <div className="p-5 rounded-2xl bg-card border shadow-2xl backdrop-blur-sm" style={{ borderColor: 'var(--border-main)' }}>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-sm font-semibold text-text-main flex items-center gap-2"><BarChart3 size={16} className="text-primary" /> Análise de Desempenho</h3>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div>
                                            <div className="flex justify-between text-xs text-text-muted mb-1.5 font-medium"><span>Evolução da Dedicação</span><span className="text-primary">{dedication.toFixed(0)}%</span></div>
                                            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.1)' }}>
                                                <motion.div
                                                    initial={{ opacity: 0, width: 0 }}
                                                    animate={{ opacity: 1, width: `${dedication}%` }}
                                                    transition={{ duration: 1 }}
                                                    className="h-full rounded-full"
                                                    style={{ background: 'linear-gradient(to right, var(--primary), rgba(var(--primary-rgb), 0.6))' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats grid */}
                                <div className="flex flex-col gap-3">
                                    {/* 1. Treino Hoje (Full Width + Weekly Graph) */}
                                    <div className="rounded-2xl p-4 relative overflow-hidden bg-card border border-primary/20 backdrop-blur-sm transition-all shadow-[0_4px_20px_-5px_rgba(var(--primary-rgb),0.15)] flex flex-col gap-3">
                                        <div className="flex justify-between items-start relative z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/20 border border-primary/30">
                                                    {todayWorkout?.type === 'rest' ? <BedDouble size={20} className="text-primary" /> : <Dumbbell size={20} className="text-primary" />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <p className="text-[10px] text-primary font-bold uppercase tracking-widest mb-0.5">Treino Hoje</p>
                                                    <h3 className="text-text-main font-bold text-base leading-tight">
                                                        {todayWorkout?.name || 'Sem plano para hoje'}
                                                    </h3>
                                                    <p className="text-text-muted text-xs mt-0.5 font-medium">
                                                        {todayWorkout?.type === 'rest' ? 'Dia de descanso' : `${todayWorkout?.exercises?.length ?? 0} exercícios no total`}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="w-16 h-8 flex items-end gap-1 opacity-70">
                                                {/* Mock Weekly Performance Graph */}
                                                {[30, 80, 50, 100, 60, 40, 90].map((h, i) => (
                                                    <div key={i} className="flex-1 rounded-sm bg-primary" style={{ height: `${h}%` }} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Meta Calórica (Full Width + Consumed/Remaining) */}
                                    <div className="rounded-2xl p-4 relative overflow-hidden bg-card border border-accent/20 backdrop-blur-sm shadow-[0_4px_20px_-5px_rgba(var(--accent-rgb),0.15)] flex flex-col gap-3">
                                        <div className="flex items-center gap-3 relative z-10 w-full">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent/20 border border-accent/30 shrink-0">
                                                <Flame size={20} className="text-accent" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1 cursor-default">
                                                    <p className="text-[10px] text-accent font-bold uppercase tracking-widest">Meta Calórica</p>
                                                    <span className="text-xs text-accent/80 font-bold tabular-nums">{nutritionTotals?.calories || 0} / {profile.daily_calorie_goal} kcal</span>
                                                </div>
                                                <div className="h-2 w-full rounded-full overflow-hidden mb-1.5 relative" style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.1)' }}>
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${Math.min(100, ((nutritionTotals?.calories || 0) / profile.daily_calorie_goal) * 100)}%` }}
                                                        transition={{ duration: 1 }}
                                                        className="absolute left-0 top-0 h-full rounded-full"
                                                        style={{ background: 'linear-gradient(to right, var(--accent), rgba(var(--accent-rgb), 0.6))' }}
                                                    />
                                                </div>
                                                <p className="text-text-muted text-xs font-medium truncate">
                                                    Restam <span className="text-text-main font-bold">{Math.max(0, profile.daily_calorie_goal - (nutritionTotals?.calories || 0))} kcal</span> para o limite hoje.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 w-full">
                                        {/* 3. Carga Total (Half Width + Volume Graph) */}
                                        <div className="rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden bg-card border border-proteina/20 backdrop-blur-sm transition-all shadow-[0_4px_20px_-5px_rgba(var(--proteina-rgb),0.1)]">
                                            <div className="flex justify-between items-start relative z-10">
                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-proteina/10 border border-proteina/20">
                                                    <TrendingUp size={18} className="text-proteina" />
                                                </div>
                                                <div className="w-12 h-6 flex items-end opacity-60">
                                                    <svg viewBox="0 0 100 40" className="w-full h-full" preserveAspectRatio="none">
                                                        <polyline fill="none" stroke="var(--proteina)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points="0,35 25,20 50,25 75,10 100,5" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="relative z-10 mt-1">
                                                <p className="text-[10px] text-proteina font-bold uppercase tracking-widest mb-1 truncate">Volume de Carga</p>
                                                <div className="flex items-baseline gap-1.5">
                                                    <p className="text-text-main font-extrabold text-[1.1rem] leading-none truncate">{totalWeight > 1000 ? (totalWeight / 1000).toFixed(1) + 'k' : totalWeight}</p>
                                                    <span className="text-text-muted text-xs font-medium">kg</span>
                                                </div>
                                                <p className="text-text-muted text-[9px] mt-1.5 font-medium uppercase truncate">SEMANAL</p>
                                            </div>
                                        </div>

                                        {/* 4. Frequência (Half Width + Comparison Trend) */}
                                        <div className="rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden bg-card border border-primary/20 backdrop-blur-sm transition-all shadow-[0_4px_20px_-5px_rgba(var(--primary-rgb),0.1)]">
                                            <div className="flex justify-between items-start relative z-10">
                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20">
                                                    <CheckCircle2 size={18} className="text-primary" />
                                                </div>
                                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border" style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)', borderColor: 'var(--border-main)' }}>
                                                    <ChevronUp size={12} className="text-proteina" />
                                                    <span className="text-[10px] font-bold text-proteina">12%</span>
                                                </div>
                                            </div>
                                            <div className="relative z-10 mt-1">
                                                <p className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1 truncate">Frequência</p>
                                                <div className="flex items-baseline gap-1.5">
                                                    <p className="text-text-main font-extrabold text-[1.1rem] leading-none truncate">{gamification?.total_workouts || 0}</p>
                                                    <span className="text-text-muted text-[10px] font-medium uppercase">Treinos</span>
                                                </div>
                                                <p className="text-text-muted text-[9px] mt-1.5 font-medium uppercase truncate">V.S. SEMANA PASSADA</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {todayWorkout && todayWorkout.type !== 'rest' && (
                                    <div className="rounded-2xl p-5 bg-card border hover:border-primary/30 transition-colors" style={{ borderColor: 'var(--border-main)' }}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-xs text-primary font-semibold uppercase tracking-wider mb-1">PROGRAMA DE HOJE</p>
                                                <h3 className="text-lg font-bold text-text-main tracking-tight">{todayWorkout.name}</h3>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-text-muted mb-4">
                                            <span className="flex items-center gap-1.5"><Dumbbell size={14} />{todayWorkout.exercises.length} exercícios</span>
                                            <span className="flex items-center gap-1.5"><Zap size={14} />{profile.available_minutes} min</span>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('workout')}
                                            className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-primary hover:bg-primary-hover transition-colors flex justify-center items-center gap-2 shadow-lg shadow-primary/20"
                                        >
                                            Iniciar Sessão <ChevronRight size={16} />
                                        </button>
                                    </div>
                                )}

                                {todayWorkout?.type === 'rest' && (
                                    <div className="rounded-2xl p-6 text-center bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                        <BedDouble size={36} className="mx-auto text-primary opacity-80 mb-3" />
                                        <p className="text-text-main font-semibold text-sm">Dia de Descanso</p>
                                        <p className="text-text-muted text-xs mt-1.5 leading-relaxed">Aproveite para recuperar os músculos. O descanso também faz parte do treino!</p>
                                    </div>
                                )}

                                {/* Plan description */}
                                {workoutPlan?.description && (
                                    <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.08)', border: '1px solid rgba(var(--primary-rgb), 0.15)' }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Flame size={16} className="text-primary" />
                                            <span className="text-xs font-semibold uppercase tracking-wide text-primary opacity-80">Dica do Plano</span>
                                        </div>
                                        <p className="text-text-muted text-sm">{workoutPlan.description}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ===== WORKOUT TAB ===== */}
                        {activeTab === 'workout' && (
                            workoutPlan
                                ? <WorkoutDayView
                                    plan={workoutPlan}
                                    profile={profile}
                                    onComplete={(_pts) => { onRefresh(); }}
                                />
                                : <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4">
                                    <span className="text-5xl">😕</span>
                                    <p className="text-text-main font-bold text-lg">Nenhum plano ativo</p>
                                    <p className="text-text-muted text-sm">Você ainda não tem um plano de treino. Complete o onboarding para gerar um.</p>
                                </div>
                        )}

                        {/* ===== NUTRITION TAB ===== */}
                        {activeTab === 'nutrition' && (
                            <NutritionLog
                                profile={profile}
                                onUpdate={onRefresh}
                                onNutritionChange={setNutritionTotals}
                            />
                        )}

                        {/* ===== GAMIFICATION TAB ===== */}
                        {activeTab === 'gamification' && (
                            <GamificationView
                                gamification={gamification}
                                profile={profile}
                                onUpdate={onRefresh}
                            />
                        )}

                        {/* ===== PROFILE TAB ===== */}
                        {activeTab === 'profile' && (
                            <ProfileView
                                profile={profile}
                                onSignOut={onSignOut}
                                onRefresh={onRefresh}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* VERSION INDICATOR */}
                <div className="flex justify-center mt-8 mb-4">
                    <span className="text-[10px] text-text-muted/40 font-semibold tracking-widest uppercase">Versão 1.1.5</span>
                </div>
            </main>

            {/* AI Assistant (floating) */}
            <AIAssistant
                profile={profile}
                nutritionData={nutritionTotals ? (() => {
                    const calGoal = profile.daily_calorie_goal || 2000;
                    return {
                        ...nutritionTotals,
                        calGoal,
                        protGoal: Math.round((calGoal * 0.3) / 4),
                        carbGoal: Math.round((calGoal * 0.4) / 4),
                        fatGoal: Math.round((calGoal * 0.3) / 9),
                    };
                })() : null}
            />

            {/* Bottom nav */}
            <nav
                className="fixed bottom-0 left-0 right-0 safe-bottom z-50 backdrop-blur-md"
                style={{ backgroundColor: 'rgba(var(--bg-main-rgb), 0.95)', borderTop: '1px solid rgba(var(--text-main-rgb), 0.08)' }}
            >
                <div className="flex items-center justify-around px-2 py-2">
                    {tabs.map((t) => {
                        const active = activeTab === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className="flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all min-w-0 relative"
                                style={{ color: active ? 'var(--primary)' : 'var(--text-muted)' }}
                            >
                                <motion.div animate={{ scale: active ? 1.1 : 1 }} transition={{ duration: 0.15 }}>
                                    {t.icon}
                                </motion.div>
                                <span className="text-xs font-medium truncate">{t.label}</span>
                                {active && (
                                    <motion.div
                                        layoutId="nav-indicator"
                                        className="absolute bottom-1 w-1 h-1 rounded-full bg-primary"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div >
    );
}
