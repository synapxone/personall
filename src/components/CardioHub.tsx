import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Zap, Clock, Flame, MapPin, TrendingUp, Timer, Plus, Loader2, Check, Activity, Bike, Waves, Gauge, Navigation, Anchor, Music, MoreHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalYYYYMMDD } from '../lib/dateUtils';
import { aiService } from '../services/aiService';
import type { Profile, WorkoutPlan, CardioSession } from '../types';
import CardioSessionTracker from './CardioSessionTracker';

const CARDIO_TYPES = [
    { id: 'corrida', label: 'Corrida', icon: <Activity size={18} /> },
    { id: 'bike', label: 'Bicicleta', icon: <Bike size={18} /> },
    { id: 'natacao', label: 'Natação', icon: <Waves size={18} /> },
    { id: 'jump', label: 'Jump', icon: <Zap size={18} /> },
    { id: 'eliptico', label: 'Elíptico', icon: <Gauge size={18} /> },
    { id: 'caminhada', label: 'Caminhada', icon: <Navigation size={18} /> },
    { id: 'remo', label: 'Remo', icon: <Anchor size={18} /> },
    { id: 'aerobica', label: 'Aeróbica', icon: <Music size={18} /> },
    { id: 'outro', label: 'Outro', icon: <MoreHorizontal size={18} /> },
];

const WEEK_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEK_DAYS_PT = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

type HubView = 'menu' | 'session' | 'create' | 'manual';

interface Props {
    plan: WorkoutPlan | null;
    profile: Profile;
    onBack: () => void;
    onPlanChange: (plan: WorkoutPlan) => void;
    onComplete: (pts: number) => void;
}

export default function CardioHub({ plan, profile, onBack, onPlanChange, onComplete }: Props) {
    const [view, setView] = useState<HubView>('menu');
    const [sessions, setSessions] = useState<CardioSession[]>([]);
    const [, setLoadingSessions] = useState(true);
    const [sessionType, setSessionType] = useState(CARDIO_TYPES[0].id);

    // Create plan state
    const [planType, setPlanType] = useState(CARDIO_TYPES[0].id);
    const [planDays, setPlanDays] = useState<boolean[]>(Array(7).fill(false));
    const [planMinutes, setPlanMinutes] = useState(30);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadSessions();
    }, [profile.id]);

    async function loadSessions() {
        setLoadingSessions(true);
        try {
            const { data } = await supabase
                .from('cardio_sessions')
                .select('*')
                .eq('user_id', profile.id)
                .order('created_at', { ascending: false })
                .limit(20);
            setSessions((data ?? []) as CardioSession[]);
        } finally {
            setLoadingSessions(false);
        }
    }

    // Weekly chart data (last 7 days)
    const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const ymd = getLocalYYYYMMDD(d);
        const day = sessions.filter(s => s.session_date === ymd);
        return day.reduce((acc, s) => acc + (s.calories_burned ?? 0), 0);
    });
    const maxCal = Math.max(...last7, 1);

    const totalCalories = sessions.reduce((acc, s) => acc + (s.calories_burned ?? 0), 0);
    const totalDistance = sessions.reduce((acc, s) => acc + (s.distance_km ?? 0), 0);
    const totalMinutes = sessions.reduce((acc, s) => acc + (s.duration_minutes ?? 0), 0);

    async function handleCreatePlan() {
        const activeDays = WEEK_DAYS_PT.filter((_, i) => planDays[i]);
        if (activeDays.length === 0) { setError('Selecione pelo menos um dia.'); return; }
        setSaving(true); setError('');
        try {
            const planData = await aiService.generateCardioPlan(profile, planType, activeDays, planMinutes);
            if (plan?.id) await supabase.from('workout_plans').update({ is_active: false }).eq('id', plan.id);
            const { data: saved } = await supabase.from('workout_plans').insert({
                user_id: profile.id,
                name: planData?.name ?? `Cardio ${CARDIO_TYPES.find(t => t.id === planType)?.label}`,
                description: planData?.description ?? '',
                estimated_weeks: planData?.estimated_weeks ?? 4,
                plan_data: planData ?? { weeks: [] },
                is_active: true,
                category: 'cardio',
                plan_type: 'ai',
                split_type: planType,
            }).select().single();
            if (saved) { onPlanChange(saved as WorkoutPlan); setView('menu'); }
        } catch { setError('Erro ao gerar o plano. Tente novamente.'); }
        finally { setSaving(false); }
    }

    async function handleCreateManualPlan() {
        const activeDayIndices = planDays.map((on, i) => on ? i : -1).filter(i => i >= 0);
        if (activeDayIndices.length === 0) { setError('Selecione pelo menos um dia.'); return; }
        setSaving(true); setError('');
        try {
            const typeLabel = CARDIO_TYPES.find(t => t.id === planType)?.label ?? planType;
            // Build 4-week structure manually
            const weeks = Array.from({ length: 4 }, (_, w) => ({
                week: w + 1,
                days: Array.from({ length: 7 }, (_, d) => {
                    const isActive = activeDayIndices.includes(d);
                    return {
                        day: d + 1,
                        name: isActive ? typeLabel : 'Descanso',
                        type: isActive ? 'cardio' : 'rest',
                        exercises: isActive ? [{
                            name: typeLabel,
                            duration_minutes: planMinutes,
                            instructions: `Execute ${planMinutes} minutos de ${typeLabel.toLowerCase()} em ritmo moderado.`,
                        }] : [],
                    };
                }),
            }));
            if (plan?.id) await supabase.from('workout_plans').update({ is_active: false }).eq('id', plan.id);
            const { data: saved } = await supabase.from('workout_plans').insert({
                user_id: profile.id,
                name: `${typeLabel} — Manual`,
                plan_data: { weeks },
                estimated_weeks: 4,
                is_active: true,
                category: 'cardio',
                plan_type: 'custom',
                split_type: planType,
            }).select().single();
            if (saved) { onPlanChange(saved as WorkoutPlan); setView('menu'); }
        } catch { setError('Erro ao salvar o plano.'); }
        finally { setSaving(false); }
    }

    // ─── SESSION TRACKER view ───
    if (view === 'session') {
        return (
            <CardioSessionTracker
                profile={profile}
                plan={plan ?? undefined}
                cardioType={sessionType}
                onBack={() => { setView('menu'); loadSessions(); }}
                onComplete={(pts) => { loadSessions(); onComplete(pts); }}
            />
        );
    }

    return (
        <div className="flex flex-col min-h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-5 pb-4">
                <button
                    onClick={() => view === 'menu' ? onBack() : setView('menu')}
                    className="p-2 rounded-xl"
                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)' }}
                >
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-accent flex items-center gap-1"><Activity size={10} /> Cardio</p>
                    <h2 className="font-bold text-base text-text-main">
                        {view === 'menu' ? 'Cardio' : view === 'manual' ? 'Plano Manual' : 'Criar Plano com IA'}
                    </h2>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-32">
                <AnimatePresence mode="wait">

                    {/* ── MENU ── */}
                    {view === 'menu' && (
                        <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">

                            {/* Stats bar */}
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { icon: <Flame size={16} className="text-accent" />, val: totalCalories > 1000 ? (totalCalories / 1000).toFixed(1) + 'k' : totalCalories, label: 'kcal total' },
                                    { icon: <MapPin size={16} className="text-proteina" />, val: totalDistance.toFixed(1), label: 'km total' },
                                    { icon: <Timer size={16} className="text-primary" />, val: `${Math.round(totalMinutes / 60)}h`, label: 'de cardio' },
                                ].map(({ icon, val, label }) => (
                                    <div key={label} className="rounded-2xl p-3 text-center bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                        <div className="flex justify-center mb-1">{icon}</div>
                                        <p className="font-extrabold text-base text-text-main">{val}</p>
                                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-wide">{label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Weekly calorie chart */}
                            <div className="rounded-2xl p-4 bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp size={14} className="text-accent" />
                                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Calorias — últimos 7 dias</p>
                                </div>
                                <div className="flex items-end gap-1.5 h-14">
                                    {last7.map((v, i) => {
                                        const isToday = i === 6;
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                                <div
                                                    className="w-full rounded-sm"
                                                    style={{
                                                        height: `${Math.max(4, (v / maxCal) * 52)}px`,
                                                        backgroundColor: isToday ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)',
                                                    }}
                                                />
                                                <p className="text-[8px] text-text-muted font-medium">{WEEK_SHORT[i]}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Quick session CTA */}
                            <div>
                                <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-2">Iniciar sessão</p>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    {CARDIO_TYPES.slice(0, 6).map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSessionType(t.id)}
                                            className="py-3 px-2 rounded-2xl flex flex-col items-center gap-1 transition-all"
                                            style={{
                                                backgroundColor: sessionType === t.id ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(var(--text-main-rgb),0.04)',
                                                border: `1px solid ${sessionType === t.id ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border-main)'}`,
                                            }}
                                        >
                                            <div
                                                className="w-9 h-9 rounded-xl flex items-center justify-center"
                                                style={{
                                                    background: sessionType === t.id
                                                        ? 'linear-gradient(135deg, rgba(var(--accent-rgb),0.22), rgba(var(--accent-rgb),0.08))'
                                                        : 'rgba(var(--text-main-rgb),0.06)',
                                                    color: sessionType === t.id ? 'var(--accent)' : 'var(--text-muted)',
                                                }}
                                            >
                                                {t.icon}
                                            </div>
                                            <span className="text-[10px] font-semibold" style={{ color: sessionType === t.id ? 'var(--accent)' : 'var(--text-muted)' }}>{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setView('session')}
                                    className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2"
                                    style={{ background: 'linear-gradient(135deg, var(--accent), rgba(var(--accent-rgb),0.7))' }}
                                >
                                    <Zap size={18} /> Iniciar {CARDIO_TYPES.find(t => t.id === sessionType)?.label}
                                </button>
                            </div>

                            {/* Create plan */}
                            <button
                                onClick={() => setView('create')}
                                className="flex items-center gap-3 p-4 rounded-2xl text-left"
                                style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.04)', border: '1px solid var(--border-main)' }}
                            >
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--accent-rgb),0.1)' }}>
                                    <Plus size={20} className="text-accent" />
                                </div>
                                                <div>
                                    <p className="font-semibold text-sm text-text-main">{plan ? 'Recriar plano (IA)' : 'Criar plano com IA'}</p>
                                    <p className="text-xs text-text-muted">IA monta um programa semanal</p>
                                </div>
                                <ChevronRight size={16} className="text-text-muted ml-auto shrink-0" />
                            </button>
                            <button
                                onClick={() => setView('manual')}
                                className="flex items-center gap-3 p-4 rounded-2xl text-left"
                                style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.04)', border: '1px solid var(--border-main)' }}
                            >
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--primary-rgb),0.1)' }}>
                                    <Clock size={20} className="text-primary" />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm text-text-main">Criar plano manual</p>
                                    <p className="text-xs text-text-muted">Escolha tipo, dias e duração sem IA</p>
                                </div>
                                <ChevronRight size={16} className="text-text-muted ml-auto shrink-0" />
                            </button>

                            {/* History */}
                            {sessions.length > 0 && (
                                <div>
                                    <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-2">Histórico recente</p>
                                    <div className="flex flex-col gap-2">
                                        {sessions.slice(0, 5).map(s => (
                                            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                                    style={{ backgroundColor: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
                                                    {CARDIO_TYPES.find(t => t.id === s.cardio_type)?.icon ?? <Activity size={16} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-text-main capitalize">{s.cardio_type ?? 'Cardio'}</p>
                                                    <p className="text-xs text-text-muted">{s.session_date}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-accent">{s.calories_burned ?? 0} kcal</p>
                                                    <p className="text-xs text-text-muted">{s.duration_minutes ?? 0} min</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── MANUAL PLAN ── */}
                    {view === 'manual' && (
                        <motion.div key="manual" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
                            <p className="text-xs text-text-muted">Tipo de cardio:</p>
                            <div className="grid grid-cols-3 gap-2">
                                {CARDIO_TYPES.map(t => (
                                    <button key={t.id} onClick={() => setPlanType(t.id)}
                                        className="py-3 px-2 rounded-2xl flex flex-col items-center gap-1 transition-all"
                                        style={{
                                            backgroundColor: planType === t.id ? 'rgba(var(--primary-rgb),0.12)' : 'rgba(var(--text-main-rgb),0.04)',
                                            border: `1px solid ${planType === t.id ? 'rgba(var(--primary-rgb),0.3)' : 'var(--border-main)'}`,
                                        }}>
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                                            style={{
                                                background: planType === t.id
                                                    ? 'linear-gradient(135deg, rgba(var(--primary-rgb),0.22), rgba(var(--primary-rgb),0.08))'
                                                    : 'rgba(var(--text-main-rgb),0.06)',
                                                color: planType === t.id ? 'var(--primary)' : 'var(--text-muted)',
                                            }}>
                                            {t.icon}
                                        </div>
                                        <span className="text-[10px] font-semibold" style={{ color: planType === t.id ? 'var(--primary)' : 'var(--text-muted)' }}>{t.label}</span>
                                        {planType === t.id && <Check size={12} className="text-primary" />}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Dias por semana:</p>
                                <div className="flex gap-2">
                                    {WEEK_SHORT.map((d, i) => (
                                        <button key={i} onClick={() => setPlanDays(prev => { const n = [...prev]; n[i] = !n[i]; return n; })}
                                            className="w-10 h-10 rounded-xl text-xs font-bold transition-all"
                                            style={{
                                                backgroundColor: planDays[i] ? 'var(--primary)' : 'rgba(var(--text-main-rgb),0.06)',
                                                color: planDays[i] ? '#fff' : 'var(--text-muted)',
                                            }}>
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs text-text-muted font-semibold">Duração por sessão</p>
                                    <span className="text-sm font-bold text-primary flex items-center gap-1"><Clock size={14} /> {planMinutes} min</span>
                                </div>
                                <input type="range" min={10} max={90} step={5} value={planMinutes}
                                    onChange={e => setPlanMinutes(+e.target.value)}
                                    className="w-full accent-blue-500 h-2 rounded-full" />
                            </div>
                            {error && <p className="text-xs text-gordura">{error}</p>}
                        </motion.div>
                    )}

                    {/* ── CREATE PLAN ── */}
                    {view === 'create' && (
                        <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
                            <p className="text-xs text-text-muted">Tipo de cardio:</p>
                            <div className="grid grid-cols-3 gap-2">
                                {CARDIO_TYPES.map(t => (
                                    <button key={t.id} onClick={() => setPlanType(t.id)}
                                        className="py-3 px-2 rounded-2xl flex flex-col items-center gap-1 transition-all"
                                        style={{
                                            backgroundColor: planType === t.id ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(var(--text-main-rgb),0.04)',
                                            border: `1px solid ${planType === t.id ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border-main)'}`,
                                        }}>
                                        <div
                                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                                            style={{
                                                background: planType === t.id
                                                    ? 'linear-gradient(135deg, rgba(var(--accent-rgb),0.22), rgba(var(--accent-rgb),0.08))'
                                                    : 'rgba(var(--text-main-rgb),0.06)',
                                                color: planType === t.id ? 'var(--accent)' : 'var(--text-muted)',
                                            }}
                                        >
                                            {t.icon}
                                        </div>
                                        <span className="text-[10px] font-semibold" style={{ color: planType === t.id ? 'var(--accent)' : 'var(--text-muted)' }}>{t.label}</span>
                                        {planType === t.id && <Check size={12} className="text-accent" />}
                                    </button>
                                ))}
                            </div>

                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Dias por semana:</p>
                                <div className="flex gap-2">
                                    {WEEK_SHORT.map((d, i) => (
                                        <button key={i} onClick={() => setPlanDays(prev => { const n = [...prev]; n[i] = !n[i]; return n; })}
                                            className="w-10 h-10 rounded-xl text-xs font-bold transition-all"
                                            style={{
                                                backgroundColor: planDays[i] ? 'var(--accent)' : 'rgba(var(--text-main-rgb),0.06)',
                                                color: planDays[i] ? '#fff' : 'var(--text-muted)',
                                            }}>
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs text-text-muted font-semibold">Duração por sessão</p>
                                    <span className="text-sm font-bold text-accent flex items-center gap-1"><Clock size={14} /> {planMinutes} min</span>
                                </div>
                                <input type="range" min={10} max={90} step={5} value={planMinutes}
                                    onChange={e => setPlanMinutes(+e.target.value)}
                                    className="w-full accent-yellow-500 h-2 rounded-full" />
                            </div>

                            {error && <p className="text-xs text-gordura">{error}</p>}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom action */}
            {(view === 'create' || view === 'manual') && (
                <div className="fixed bottom-0 left-0 right-0 p-4 z-[60]" style={{ backgroundColor: 'var(--bg-main)', borderTop: '1px solid var(--border-main)' }}>
                    {view === 'create' ? (
                        <button
                            onClick={handleCreatePlan}
                            disabled={saving}
                            className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, var(--accent), rgba(var(--accent-rgb),0.7))' }}
                        >
                            {saving ? <><Loader2 size={18} className="animate-spin" /> Gerando...</> : <><Zap size={18} /> Gerar Plano com IA</>}
                        </button>
                    ) : (
                        <button
                            onClick={handleCreateManualPlan}
                            disabled={saving}
                            className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, var(--primary), rgba(var(--primary-rgb),0.7))' }}
                        >
                            {saving ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : <><Check size={18} /> Salvar Plano</>}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
