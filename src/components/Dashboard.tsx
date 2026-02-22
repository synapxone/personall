import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Dumbbell, Apple, Trophy, User, Flame, Zap, Activity, BarChart3, TrendingUp, ChevronRight, CheckCircle2, BedDouble } from 'lucide-react';
import type { Profile, WorkoutPlan, Gamification } from '../types';
import WorkoutDayView from './WorkoutDay';
import NutritionLog from './NutritionLog';
import GamificationView from './Gamification';
import ProfileView from './ProfileView';
import AIAssistant from './AIAssistant';

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
        return (localStorage.getItem('activeTab') as Tab) || 'home';
    });
    const [nutritionTotals, setNutritionTotals] = useState<NutritionTotals | null>(null);

    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, [activeTab]);

    const todayWorkout = getTodayWorkout(workoutPlan);

    // Calc Dedication Score (min 32.5, max 100)
    const dedication = gamification
        ? Math.min(100, Math.max(32.5, (gamification.streak_days * 5) + (gamification.total_workouts * 3) + (gamification.total_meals_logged * 1)))
        : 32.5;

    // Estimate total weight moved from localStorage
    const totalWeight = Object.keys(localStorage)
        .filter(k => k.startsWith('weight_'))
        .reduce((acc, k) => acc + (parseFloat(localStorage.getItem(k) || '0') || 0), 0) * (gamification?.total_workouts || 1); // rough estimate

    // Total Cals burned roughly
    const calsBurned = (gamification?.total_workouts || 0) * 350;

    return (
        <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: '#09090B' }}>
            {/* Top header */}
            <header className="flex items-center justify-between px-5 py-5 safe-top border-b" style={{ backgroundColor: '#09090B', borderColor: 'rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20">
                        <Activity size={18} className="text-indigo-400" />
                    </div>
                    <span className="text-white font-semibold tracking-wide text-sm">PERSONALL</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs font-medium">{profile.name.split(' ')[0]}</span>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}>
                        {profile.name.charAt(0).toUpperCase()}
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto pb-20">
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
                                    <h1 className="text-xl font-semibold text-white tracking-tight">
                                        {getGreeting()}, {profile.name.split(' ')[0]}.
                                    </h1>
                                    <p className="text-gray-500 text-xs mt-1 font-medium">
                                        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </p>
                                </div>

                                {/* Results Analysis Overview */}
                                <div className="p-5 rounded-2xl bg-white/5 border border-white/5 shadow-2xl backdrop-blur-sm">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><BarChart3 size={16} className="text-indigo-400" /> Análise de Desempenho</h3>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div>
                                            <div className="flex justify-between text-xs text-gray-400 mb-1.5 font-medium"><span>Evolução da Dedicação</span><span className="text-indigo-300">{dedication.toFixed(0)}%</span></div>
                                            <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${dedication}%` }} transition={{ duration: 1 }} className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Today's workout */}
                                    <StatCard
                                        icon={todayWorkout?.type === 'rest' ? <BedDouble size={20} className="text-indigo-400" /> : <Dumbbell size={20} className="text-indigo-400" />}
                                        label="Treino Hoje"
                                        value={todayWorkout?.name || 'Sem plano'}
                                        sub={todayWorkout?.type === 'rest' ? 'Descanso' : `${todayWorkout?.exercises?.length ?? 0} exercícios`}
                                        borderColor="rgba(99,102,241,0.2)"
                                    />
                                    {/* Calories */}
                                    <StatCard
                                        icon={<Flame size={20} className="text-orange-400" />}
                                        label="Meta Calórica"
                                        value={`${profile.daily_calorie_goal}`}
                                        sub="kcal / dia"
                                        borderColor="rgba(249,115,22,0.2)"
                                    />
                                    {/* Total Weight */}
                                    <StatCard
                                        icon={<TrendingUp size={20} className="text-emerald-400" />}
                                        label="Carga Total"
                                        value={`${totalWeight} kg`}
                                        sub="estimativa"
                                        borderColor="rgba(52,211,153,0.2)"
                                    />
                                    {/* Frequencia */}
                                    <StatCard
                                        icon={<CheckCircle2 size={20} className="text-pink-400" />}
                                        label="Frequência"
                                        value={`${gamification?.total_workouts || 0}`}
                                        sub="treinos concluídos"
                                        borderColor="rgba(244,113,181,0.2)"
                                    />
                                    {/* Cals */}
                                    <StatCard
                                        icon={<Flame size={20} className="text-orange-600" />}
                                        label="Cal. Queimadas"
                                        value={`${calsBurned}`}
                                        sub="estimativa"
                                        borderColor="rgba(234,88,12,0.2)"
                                    />
                                </div>
                                {todayWorkout && todayWorkout.type !== 'rest' && (
                                    <div className="rounded-2xl p-5 bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-colors">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-1">PROGRAMA DE HOJE</p>
                                                <h3 className="text-lg font-bold text-white tracking-tight">{todayWorkout.name}</h3>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
                                            <span className="flex items-center gap-1.5"><Dumbbell size={14} />{todayWorkout.exercises.length} exercícios</span>
                                            <span className="flex items-center gap-1.5"><Zap size={14} />{profile.available_minutes} min</span>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('workout')}
                                            className="w-full py-3.5 rounded-xl font-medium text-white text-sm bg-indigo-600 hover:bg-indigo-500 transition-colors flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/20"
                                        >
                                            Iniciar Sessão <ChevronRight size={16} />
                                        </button>
                                    </div>
                                )}

                                {todayWorkout?.type === 'rest' && (
                                    <div className="rounded-2xl p-6 text-center bg-white/5 border border-white/5">
                                        <BedDouble size={36} className="mx-auto text-indigo-400 opacity-80 mb-3" />
                                        <p className="text-white font-semibold text-sm">Dia de Descanso</p>
                                        <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">Aproveite para recuperar os músculos. O descanso também faz parte do treino!</p>
                                    </div>
                                )}

                                {/* Plan description */}
                                {workoutPlan?.description && (
                                    <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Flame size={16} style={{ color: '#7C3AED' }} />
                                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#a78bfa' }}>Dica do Plano</span>
                                        </div>
                                        <p className="text-gray-300 text-sm">{workoutPlan.description}</p>
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
                                    <p className="text-white font-bold text-lg">Nenhum plano ativo</p>
                                    <p className="text-gray-400 text-sm">Você ainda não tem um plano de treino. Complete o onboarding para gerar um.</p>
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
                className="fixed bottom-0 left-0 right-0 safe-bottom"
                style={{ backgroundColor: '#0F0F1A', borderTop: '1px solid rgba(255,255,255,0.08)' }}
            >
                <div className="flex items-center justify-around px-2 py-2">
                    {tabs.map((t) => {
                        const active = activeTab === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className="flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all min-w-0"
                                style={{ color: active ? '#7C3AED' : '#6b7280' }}
                            >
                                <motion.div animate={{ scale: active ? 1.1 : 1 }} transition={{ duration: 0.15 }}>
                                    {t.icon}
                                </motion.div>
                                <span className="text-xs font-medium truncate">{t.label}</span>
                                {active && (
                                    <motion.div
                                        layoutId="nav-indicator"
                                        className="absolute bottom-1 w-1 h-1 rounded-full"
                                        style={{ backgroundColor: '#7C3AED' }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}

function StatCard({ icon, label, value, sub, borderColor }: { icon: React.ReactNode; label: string; value: string; sub: string; borderColor: string }) {
    return (
        <div className="rounded-xl p-3 flex flex-col gap-2.5 bg-white/[0.02] border backdrop-blur-sm transition-colors hover:bg-white/[0.04]" style={{ borderColor }}>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                {icon}
            </div>
            <div>
                <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-white font-semibold text-base leading-tight truncate">{value}</p>
                <p className="text-gray-500 text-[10px] mt-0.5 font-medium">{sub}</p>
            </div>
        </div>
    );
}

