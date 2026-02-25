import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Dumbbell, Activity, Trophy, Target, TrendingUp, ChevronRight, BarChart2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalYYYYMMDD } from '../lib/dateUtils';
import type { Profile, WorkoutPlan } from '../types';
import MusculacaoHub from './MusculacaoHub';
import CardioHub from './CardioHub';
import ModalidadeHub from './ModalidadeHub';

type Category = 'musculacao' | 'cardio' | 'modalidade';

interface Props {
    musculacaoPlan: WorkoutPlan | null;
    cardioPlan: WorkoutPlan | null;
    modalidadePlan: WorkoutPlan | null;
    profile: Profile;
    onPlanChange: (category: Category, plan: WorkoutPlan) => void;
    onComplete: (pts: number) => void;
}

interface WeeklyActivity {
    day: string;
    workouts: number;
    cardio: number;
}

export default function WorkoutHub({ musculacaoPlan, cardioPlan, modalidadePlan, profile, onPlanChange, onComplete }: Props) {
    const [activeCategory, setActiveCategory] = useState<Category | null>(null);
    const [weekActivity, setWeekActivity] = useState<WeeklyActivity[]>([]);
    const [totalWorkouts, setTotalWorkouts] = useState(0);

    useEffect(() => {
        loadActivity();
    }, [profile.id]);

    async function loadActivity() {
        try {
            const now = new Date();
            const startStr = getLocalYYYYMMDD(new Date(new Date().setDate(now.getDate() - 6)));

            const [wRes, cRes] = await Promise.all([
                supabase.from('workout_sessions').select('session_date, completed')
                    .eq('user_id', profile.id)
                    .gte('session_date', startStr),
                supabase.from('cardio_sessions').select('session_date')
                    .eq('user_id', profile.id)
                    .gte('session_date', startStr),
            ]);

            const days: WeeklyActivity[] = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const ymd = getLocalYYYYMMDD(d);

                days.push({
                    day: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][d.getDay()],
                    workouts: wRes.data?.filter(s => s.session_date === ymd && s.completed).length || 0,
                    cardio: cRes.data?.filter(s => s.session_date === ymd).length || 0,
                });
            }

            // Total workouts count for summary
            const { count: totalW } = await supabase.from('workout_sessions')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', profile.id)
                .eq('completed', true);
            const { count: totalC } = await supabase.from('cardio_sessions')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', profile.id);

            setTotalWorkouts((totalW || 0) + (totalC || 0));
            setWeekActivity(days);
        } catch (error) {
            console.error('loadActivity error', error);
        }
    }

    if (activeCategory === 'musculacao') {
        return (
            <MusculacaoHub
                plan={musculacaoPlan}
                profile={profile}
                onBack={() => setActiveCategory(null)}
                onPlanChange={p => onPlanChange('musculacao', p)}
                onComplete={(pts) => { loadActivity(); onComplete(pts); }}
            />
        );
    }
    if (activeCategory === 'cardio') {
        return (
            <CardioHub
                plan={cardioPlan}
                profile={profile}
                onBack={() => setActiveCategory(null)}
                onPlanChange={p => onPlanChange('cardio', p)}
                onComplete={(pts) => { loadActivity(); onComplete(pts); }}
            />
        );
    }
    if (activeCategory === 'modalidade') {
        return (
            <ModalidadeHub
                plan={modalidadePlan}
                profile={profile}
                onBack={() => setActiveCategory(null)}
                onPlanChange={p => onPlanChange('modalidade', p)}
                onComplete={(pts) => { loadActivity(); onComplete(pts); }}
            />
        );
    }

    // ─── MAIN HUB VIEW ───
    const categories = [
        {
            id: 'musculacao' as Category,
            icon: <Dumbbell size={26} />,
            label: 'Musculação',
            desc: 'Força, hipertrofia e definição',
            plan: musculacaoPlan,
            color: 'var(--primary)',
            colorRgb: 'var(--primary-rgb)',
            cta: musculacaoPlan ? 'Continuar' : 'Criar plano',
        },
        {
            id: 'cardio' as Category,
            icon: <Activity size={26} />,
            label: 'Cardio',
            desc: 'Resistência, queima e saúde',
            plan: cardioPlan,
            color: 'var(--accent)',
            colorRgb: 'var(--accent-rgb)',
            cta: cardioPlan ? 'Continuar' : 'Iniciar sessão',
        },
        {
            id: 'modalidade' as Category,
            icon: <Trophy size={26} />,
            label: 'Modalidade',
            desc: 'Esportes, artes e atividades',
            plan: modalidadePlan,
            color: 'var(--modalidade)',
            colorRgb: 'var(--modalidade-rgb)',
            cta: modalidadePlan ? 'Continuar' : 'Escolher modalidade',
        },
    ];

    const maxActivity = Math.max(...weekActivity.map(d => d.workouts + d.cardio), 1);

    return (
        <div className="flex flex-col px-4 pt-5 pb-24 gap-5 max-w-lg mx-auto">
            {/* Title */}
            <div>
                <h1 className="text-xl font-bold text-text-main">Treino</h1>
                <p className="text-xs text-text-muted mt-0.5">{totalWorkouts} sessões realizadas</p>
            </div>

            {/* Weekly activity mini-chart */}
            {weekActivity.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl p-4 bg-card border"
                    style={{ borderColor: 'var(--border-main)' }}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart2 size={14} className="text-primary" />
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Atividade — últimos 7 dias</p>
                    </div>
                    <div className="flex items-end gap-1.5 h-12">
                        {weekActivity.map((d, i) => {
                            const total = d.workouts + d.cardio;
                            const isToday = i === weekActivity.length - 1;
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                    <div className="w-full flex flex-col items-center gap-0.5">
                                        {/* Cardio layer */}
                                        {d.cardio > 0 && (
                                            <div
                                                className="w-full rounded-sm"
                                                style={{
                                                    height: `${(d.cardio / maxActivity) * 40}px`,
                                                    backgroundColor: isToday ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.4)',
                                                }}
                                            />
                                        )}
                                        {/* Workout layer */}
                                        {d.workouts > 0 && (
                                            <div
                                                className="w-full rounded-sm"
                                                style={{
                                                    height: `${(d.workouts / maxActivity) * 40}px`,
                                                    backgroundColor: isToday ? 'var(--primary)' : 'rgba(var(--primary-rgb),0.4)',
                                                }}
                                            />
                                        )}
                                        {total === 0 && (
                                            <div className="w-full rounded-sm h-1" style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)' }} />
                                        )}
                                    </div>
                                    <p className="text-[8px] font-bold" style={{ color: isToday ? 'var(--primary)' : 'var(--text-muted)' }}>{d.day}</p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-3 mt-2">
                        <span className="flex items-center gap-1 text-[9px] text-text-muted font-medium">
                            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'var(--primary)' }} /> Musculação
                        </span>
                        <span className="flex items-center gap-1 text-[9px] text-text-muted font-medium">
                            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'var(--accent)' }} /> Cardio
                        </span>
                    </div>
                </motion.div>
            )}

            {/* Category cards */}
            <div className="flex flex-col gap-3">
                {categories.map(({ id, icon, label, desc, plan, color, colorRgb, cta }, idx) => (
                    <motion.button
                        key={id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setActiveCategory(id)}
                        className="flex items-center gap-4 p-4 rounded-2xl text-left transition-all"
                        style={{
                            backgroundColor: `rgba(${colorRgb}, 0.06)`,
                            border: `1px solid rgba(${colorRgb}, ${plan ? '0.25' : '0.12'})`,
                        }}
                    >
                        {/* Icon */}
                        <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                            style={{
                                background: `linear-gradient(135deg, rgba(${colorRgb}, 0.22), rgba(${colorRgb}, 0.07))`,
                                color,
                            }}
                        >
                            {icon}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-text-main">{label}</p>
                            <p className="text-xs text-text-muted">{desc}</p>
                            {plan ? (
                                <p className="text-xs font-semibold mt-1 truncate" style={{ color }}>
                                    {plan.name}
                                </p>
                            ) : (
                                <p className="text-xs mt-1" style={{ color: `rgba(${colorRgb}, 0.6)` }}>
                                    Sem plano ativo
                                </p>
                            )}
                        </div>

                        {/* CTA chip + arrow */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span
                                className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                                style={{ backgroundColor: `rgba(${colorRgb}, 0.15)`, color }}
                            >
                                {cta}
                            </span>
                            <ChevronRight size={16} style={{ color: `rgba(${colorRgb}, 0.6)` }} />
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-2">
                {[
                    { icon: <Dumbbell size={14} className="text-primary" />, val: musculacaoPlan?.split_type ?? (musculacaoPlan ? '—' : 'Sem plano'), label: 'Split' },
                    { icon: <Target size={14} className="text-modalidade" />, val: modalidadePlan?.name?.split(' ')[0] ?? 'Nenhuma', label: 'Modalidade' },
                    { icon: <TrendingUp size={14} className="text-accent" />, val: totalWorkouts, label: 'Sessões' },
                ].map(({ icon, val, label }) => (
                    <div key={label} className="rounded-xl p-3 text-center bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                        <div className="flex justify-center mb-1">{icon}</div>
                        <p className="text-xs font-bold text-text-main truncate">{val}</p>
                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-wide">{label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
