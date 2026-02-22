import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Dumbbell, Apple, Trophy, User, Flame, Zap, Calendar } from 'lucide-react';
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
    const [activeTab, setActiveTab] = useState<Tab>('home');
    const [nutritionTotals, setNutritionTotals] = useState<NutritionTotals | null>(null);

    const todayWorkout = getTodayWorkout(workoutPlan);

    return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0F0F1A' }}>
            {/* Top header */}
            <header className="flex items-center justify-between px-5 py-4 safe-top" style={{ backgroundColor: '#0F0F1A', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2">
                    <span className="text-xl">💪</span>
                    <span className="text-white font-bold text-lg">Personall</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">{profile.name.split(' ')[0]}</span>
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
                                    <h1 className="text-2xl font-extrabold text-white">
                                        {getGreeting()}, {profile.name.split(' ')[0]}! 💪
                                    </h1>
                                    <p className="text-gray-400 text-sm mt-1">
                                        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </p>
                                </div>

                                {/* Stats grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Today's workout */}
                                    <StatCard
                                        emoji={todayWorkout?.type === 'rest' ? '😴' : '🏋️'}
                                        label="Treino Hoje"
                                        value={todayWorkout?.name || 'Sem plano'}
                                        sub={todayWorkout?.type === 'rest' ? 'Descanso' : `${todayWorkout?.exercises?.length ?? 0} exercícios`}
                                        color="#7C3AED"
                                    />
                                    {/* Calories */}
                                    <StatCard
                                        emoji="🔥"
                                        label="Meta Calórica"
                                        value={`${profile.daily_calorie_goal}`}
                                        sub="kcal/dia"
                                        color="#F59E0B"
                                    />
                                    {/* Streak */}
                                    <StatCard
                                        emoji="🔥"
                                        label="Sequência"
                                        value={`${gamification?.streak_days ?? 0}`}
                                        sub="dias consecutivos"
                                        color="#EF4444"
                                    />
                                    {/* Points */}
                                    <StatCard
                                        emoji="⭐"
                                        label="Pontos"
                                        value={`${gamification?.points ?? 0}`}
                                        sub={`Nível ${gamification?.level ?? 1}`}
                                        color="#F59E0B"
                                    />
                                </div>

                                {/* Today's workout card */}
                                {todayWorkout && todayWorkout.type !== 'rest' && (
                                    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(124,58,237,0.2)' }}>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Treino de Hoje</p>
                                                <h3 className="text-white font-bold mt-1">{todayWorkout.name}</h3>
                                            </div>
                                            <Calendar size={20} className="text-gray-500 mt-1" />
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-gray-400">
                                            <span className="flex items-center gap-1"><Dumbbell size={14} />{todayWorkout.exercises.length} exercícios</span>
                                            <span className="flex items-center gap-1"><Zap size={14} />{profile.available_minutes} min</span>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('workout')}
                                            className="w-full py-3 rounded-xl font-semibold text-white text-sm"
                                            style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                                        >
                                            Ver Treino de Hoje
                                        </button>
                                    </div>
                                )}

                                {todayWorkout?.type === 'rest' && (
                                    <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <span className="text-4xl">😴</span>
                                        <p className="text-white font-bold mt-2">Dia de Descanso</p>
                                        <p className="text-gray-400 text-sm mt-1">Aproveite para recuperar os músculos. O descanso também faz parte do treino!</p>
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

function StatCard({ emoji, label, value, sub, color }: { emoji: string; label: string; value: string; sub: string; color: string }) {
    return (
        <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-2xl">{emoji}</span>
            <div>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className="text-white font-bold text-base leading-tight mt-0.5 truncate" style={{ color }}>{value}</p>
                <p className="text-gray-500 text-xs">{sub}</p>
            </div>
        </div>
    );
}

