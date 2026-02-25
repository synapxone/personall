import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, TrendingUp, Flame, Target, BarChart2, ChevronDown, Settings2, CalendarClock, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalYYYYMMDD } from '../lib/dateUtils';
import type { WorkoutPlan, Profile, Modality } from '../types';
import WorkoutDayView from './WorkoutDay';

interface Props {
    plan: WorkoutPlan;
    profile: Profile;
    modality?: Modality;
    onBack: () => void;
    onComplete: (pts: number) => void;
    onEditPlan: () => void;
}

interface WeekStats {
    totalSessions: number;
    totalVolume: number;
    streakDays: number;
    weeklyData: number[]; // sessions per week (last 4)
}

export default function WeeklyPlanView({ plan, profile, modality, onBack, onComplete, onEditPlan }: Props) {
    const [statsCollapsed, setStatsCollapsed] = useState(false);
    const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
    const [showEditSheet, setShowEditSheet] = useState(false);
    const [triggerEditDay, setTriggerEditDay] = useState(false);
    const [triggerEditWeek, setTriggerEditWeek] = useState(false);

    useEffect(() => {
        loadStats();
    }, [plan.id, profile.id]);

    async function loadStats() {
        try {
            const { data: sessions } = await supabase
                .from('workout_sessions')
                .select('created_at, total_load_kg, completed')
                .eq('user_id', profile.id)
                .eq('plan_id', plan.id)
                .order('created_at', { ascending: false })
                .limit(100);

            if (!sessions) return;

            const completedSessions = sessions.filter(s => s.completed);
            const totalVolume = completedSessions.reduce((acc, s) => acc + (s.total_load_kg || 0), 0);

            // Count sessions per week (last 4 weeks)
            const now = new Date();
            const weeklyData = [0, 0, 0, 0];
            completedSessions.forEach(s => {
                const d = new Date(s.created_at);
                const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
                const weekIdx = Math.floor(diffDays / 7);
                if (weekIdx < 4) weeklyData[3 - weekIdx]++;
            });

            // Calculate streak (consecutive days with sessions)
            const sessionDates = new Set(completedSessions.map(s => s.created_at.split('T')[0]));
            let streak = 0;
            const d = new Date();
            while (true) {
                const ymd = getLocalYYYYMMDD(d);
                if (sessionDates.has(ymd)) {
                    streak++;
                    d.setDate(d.getDate() - 1);
                } else break;
            }

            setWeekStats({ totalSessions: completedSessions.length, totalVolume, streakDays: streak, weeklyData });
        } catch {
            // non-critical
        }
    }

    const maxWeekly = weekStats ? Math.max(...weekStats.weeklyData, 1) : 1;

    return (
        <div className="flex flex-col min-h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-5 pb-4">
                <button
                    onClick={onBack}
                    className="p-2 rounded-xl"
                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)' }}
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-primary">
                        {modality ? modality.icon + ' ' + modality.name : plan.category === 'musculacao' ? '💪 Musculação' : '🏃 Cardio'}
                    </p>
                    <h2 className="font-bold text-base text-text-main truncate">{plan.name}</h2>
                </div>
                <button
                    onClick={() => setShowEditSheet(true)}
                    className="text-xs text-primary font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1"
                    style={{ backgroundColor: 'rgba(var(--primary-rgb),0.1)' }}
                >
                    Editar <ChevronDown size={12} />
                </button>
            </div>

            {/* Stats section (collapsible) */}
            <AnimatePresence>
                {!statsCollapsed && weekStats && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 mb-2 overflow-hidden"
                    >
                        <div className="rounded-2xl p-4 flex flex-col gap-3"
                            style={{ backgroundColor: 'rgba(var(--primary-rgb),0.06)', border: '1px solid rgba(var(--primary-rgb),0.12)' }}>

                            {/* Metric chips */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="flex flex-col items-center gap-0.5">
                                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10">
                                        <Target size={16} className="text-primary" />
                                    </div>
                                    <p className="text-base font-extrabold text-text-main">{weekStats.totalSessions}</p>
                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-wide">Sessões</p>
                                </div>
                                <div className="flex flex-col items-center gap-0.5">
                                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-accent/10">
                                        <Flame size={16} className="text-accent" />
                                    </div>
                                    <p className="text-base font-extrabold text-text-main">{weekStats.streakDays}</p>
                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-wide">Sequência</p>
                                </div>
                                <div className="flex flex-col items-center gap-0.5">
                                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-proteina/10">
                                        <TrendingUp size={16} className="text-proteina" />
                                    </div>
                                    <p className="text-base font-extrabold text-text-main">
                                        {weekStats.totalVolume > 1000
                                            ? (weekStats.totalVolume / 1000).toFixed(1) + 'k'
                                            : Math.round(weekStats.totalVolume)}
                                    </p>
                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-wide">Volume kg</p>
                                </div>
                            </div>

                            {/* Weekly sparkline */}
                            <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <BarChart2 size={12} className="text-text-muted" />
                                    <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wide">Treinos por semana</p>
                                </div>
                                <div className="flex items-end gap-1.5 h-10">
                                    {weekStats.weeklyData.map((v, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                            <div
                                                className="w-full rounded-sm transition-all"
                                                style={{
                                                    height: `${Math.max(4, (v / maxWeekly) * 36)}px`,
                                                    backgroundColor: i === 3 ? 'var(--primary)' : 'rgba(var(--primary-rgb),0.3)',
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-1.5 mt-0.5">
                                    {['S-3', 'S-2', 'S-1', 'Ago'].map((l, i) => (
                                        <p key={i} className="flex-1 text-center text-[8px] text-text-muted font-medium">{l}</p>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Collapse button */}
                        <button
                            onClick={() => setStatsCollapsed(true)}
                            className="w-full text-center text-[10px] text-text-muted font-semibold mt-1 py-1"
                        >
                            Ocultar estatísticas ↑
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {statsCollapsed && (
                <button
                    onClick={() => setStatsCollapsed(false)}
                    className="mx-4 mb-2 text-center text-[10px] text-primary font-semibold py-1.5 rounded-xl"
                    style={{ backgroundColor: 'rgba(var(--primary-rgb),0.06)' }}
                >
                    Ver estatísticas ↓
                </button>
            )}

            {/* WorkoutDay handles day selection, week nav, exercise execution */}
            <div className="flex-1">
                <WorkoutDayView
                    plan={plan}
                    profile={profile}
                    onComplete={(pts) => {
                        loadStats();
                        onComplete(pts);
                    }}
                    hideHeader
                    triggerEditDay={triggerEditDay}
                    triggerEditWeek={triggerEditWeek}
                    onTriggerConsumed={() => { setTriggerEditDay(false); setTriggerEditWeek(false); }}
                />
            </div>

            {/* Edit options sheet */}
            <AnimatePresence>
                {showEditSheet && (
                    <>
                        <motion.div
                            className="fixed inset-0 z-[70]"
                            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowEditSheet(false)}
                        />
                        <motion.div
                            className="fixed bottom-0 left-0 right-0 z-[71] rounded-t-3xl p-5 flex flex-col gap-3"
                            style={{ backgroundColor: 'var(--bg-main)', borderTop: '1px solid var(--border-main)' }}
                            initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        >
                            <div className="w-10 h-1 rounded-full bg-text-muted/30 mx-auto mb-1" />
                            <p className="text-xs text-text-muted font-bold uppercase tracking-widest mb-1">O que deseja editar?</p>
                            {[
                                { icon: <Settings2 size={20} />, label: 'Editar treino de hoje', desc: 'Regenera os exercícios do dia atual com IA', color: 'var(--accent)', action: () => { setTriggerEditDay(true); setShowEditSheet(false); } },
                                { icon: <CalendarClock size={20} />, label: 'Editar semana inteira', desc: 'Reorganiza todos os dias da semana', color: 'var(--primary)', action: () => { setTriggerEditWeek(true); setShowEditSheet(false); } },
                                { icon: <RotateCcw size={20} />, label: 'Recriar plano completo', desc: 'Cria um plano novo do zero', color: '#ef4444', action: () => { onEditPlan(); setShowEditSheet(false); } },
                            ].map(({ icon, label, desc, color, action }) => (
                                <button key={label} onClick={action}
                                    className="flex items-center gap-4 p-4 rounded-2xl text-left"
                                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.04)', border: '1px solid var(--border-main)' }}>
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                                        {icon}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm text-text-main">{label}</p>
                                        <p className="text-xs text-text-muted">{desc}</p>
                                    </div>
                                </button>
                            ))}
                            <div className="pb-6" />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
