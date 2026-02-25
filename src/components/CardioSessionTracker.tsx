import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Square, ChevronLeft, Plus, Minus, Flame, MapPin, Timer, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalYYYYMMDD } from '../lib/dateUtils';
import type { Profile, WorkoutPlan } from '../types';

// MET values per cardio type
const MET_VALUES: Record<string, number> = {
    corrida: 9.8,
    caminhada: 3.5,
    bike: 7.5,
    natacao: 8.0,
    jump: 10.0,
    eliptico: 5.0,
    remo: 7.0,
    aerobica: 6.5,
    outro: 5.0,
};

function estimateCalories(weightKg: number, durationSeconds: number, cardioType: string): number {
    const met = MET_VALUES[cardioType.toLowerCase()] ?? 5.0;
    const hours = durationSeconds / 3600;
    return Math.round(met * weightKg * hours);
}

function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface Props {
    profile: Profile;
    plan?: WorkoutPlan;
    cardioType?: string;
    onBack: () => void;
    onComplete: (pts: number) => void;
}

export default function CardioSessionTracker({ profile, plan, cardioType: initialType = 'outro', onBack, onComplete }: Props) {
    const [elapsed, setElapsed] = useState(0);
    const [running, setRunning] = useState(false);
    const [distanceKm, setDistanceKm] = useState(0);
    const [resistance, setResistance] = useState(5);
    const [cardioType] = useState(initialType);
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startedRef = useRef(false);

    const calories = estimateCalories(profile.weight, elapsed, cardioType);

    const tick = useCallback(() => setElapsed(e => e + 1), []);

    function toggleRunning() {
        if (done) return;
        if (!startedRef.current) startedRef.current = true;
        setRunning(r => !r);
    }

    useEffect(() => {
        if (running) {
            intervalRef.current = setInterval(tick, 1000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [running, tick]);

    async function handleFinish() {
        if (saving || done) return;
        setRunning(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        setSaving(true);
        try {
            const pts = 50;
            await supabase.from('cardio_sessions').insert({
                user_id: profile.id,
                plan_id: plan?.id ?? null,
                session_date: getLocalYYYYMMDD(),
                cardio_type: cardioType,
                duration_minutes: Math.max(1, Math.round(elapsed / 60)),
                distance_km: distanceKm > 0 ? distanceKm : null,
                calories_burned: calories,
                resistance_level: resistance,
                points_earned: pts,
            });

            // Update gamification
            const rpcRes = await supabase.rpc('add_points', { p_user_id: profile.id, p_points: pts });
            if (rpcRes.error) {
                const { data } = await supabase.from('gamification').select('points').eq('user_id', profile.id).single();
                if (data) {
                    await supabase.from('gamification').update({ points: data.points + pts }).eq('user_id', profile.id);
                }
            }

            setDone(true);
            onComplete(pts);
        } finally {
            setSaving(false);
        }
    }

    const typeLabel = cardioType.charAt(0).toUpperCase() + cardioType.slice(1);
    const circumference = 2 * Math.PI * 54;
    // Ring fills based on target: assume 30min = full ring
    const targetSecs = 30 * 60;
    const progress = Math.min(1, elapsed / targetSecs);

    return (
        <div className="flex flex-col min-h-full px-4">
            {/* Header */}
            <div className="flex items-center gap-3 pt-5 pb-6">
                <button onClick={onBack} className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)' }}>
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-primary">Cardio</p>
                    <h2 className="font-bold text-base text-text-main">{typeLabel}</h2>
                </div>
            </div>

            {done ? (
                /* ── POST-SESSION SUMMARY ── */
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex-1 flex flex-col items-center justify-center gap-6 text-center"
                >
                    <div className="text-5xl">🎉</div>
                    <div>
                        <h3 className="text-2xl font-extrabold text-text-main">Sessão Concluída!</h3>
                        <p className="text-text-muted text-sm mt-1">+50 pontos ganhos</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 w-full">
                        {[
                            { icon: <Timer size={18} className="text-primary" />, label: 'Duração', value: formatTime(elapsed) },
                            { icon: <Flame size={18} className="text-accent" />, label: 'Calorias', value: `${calories} kcal` },
                            { icon: <MapPin size={18} className="text-proteina" />, label: 'Distância', value: distanceKm > 0 ? `${distanceKm.toFixed(2)} km` : '—' },
                            { icon: <Zap size={18} className="text-gordura" />, label: 'Resistência', value: `Nível ${resistance}` },
                        ].map(({ icon, label, value }) => (
                            <div key={label} className="rounded-2xl p-4 text-center bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                <div className="flex justify-center mb-1">{icon}</div>
                                <p className="text-lg font-extrabold text-text-main">{value}</p>
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">{label}</p>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={onBack}
                        className="w-full py-4 rounded-2xl font-bold text-white text-sm"
                        style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}
                    >
                        Voltar
                    </button>
                </motion.div>
            ) : (
                /* ── ACTIVE SESSION ── */
                <>
                    {/* Timer ring */}
                    <div className="flex justify-center mb-6">
                        <div className="relative w-40 h-40">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(var(--text-main-rgb),0.06)" strokeWidth="8" />
                                <circle
                                    cx="60" cy="60" r="54" fill="none"
                                    stroke="var(--primary)" strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={circumference * (1 - progress)}
                                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-extrabold text-text-main tabular-nums">{formatTime(elapsed)}</span>
                                <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-0.5">
                                    {running ? 'Em progresso' : startedRef.current ? 'Pausado' : 'Pronto'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Live stats */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="rounded-2xl p-4 text-center bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                            <div className="flex justify-center mb-1"><Flame size={18} className="text-accent" /></div>
                            <p className="text-xl font-extrabold text-text-main">{calories}</p>
                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Calorias</p>
                        </div>
                        <div className="rounded-2xl p-4 text-center bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                            <div className="flex justify-center mb-1"><MapPin size={18} className="text-proteina" /></div>
                            <p className="text-xl font-extrabold text-text-main">{distanceKm.toFixed(2)}</p>
                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">km</p>
                        </div>
                    </div>

                    {/* Distance input */}
                    <div className="rounded-2xl p-4 mb-4 bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                        <p className="text-xs text-text-muted font-semibold mb-3">Distância percorrida (km)</p>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setDistanceKm(d => Math.max(0, parseFloat((d - 0.1).toFixed(2))))}
                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.08)' }}
                            >
                                <Minus size={18} />
                            </button>
                            <p className="flex-1 text-center text-2xl font-extrabold text-text-main tabular-nums">{distanceKm.toFixed(2)}</p>
                            <button
                                onClick={() => setDistanceKm(d => parseFloat((d + 0.1).toFixed(2)))}
                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.08)' }}
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Resistance slider */}
                    <div className="rounded-2xl p-4 mb-6 bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                        <div className="flex justify-between items-center mb-2">
                            <p className="text-xs text-text-muted font-semibold">Resistência</p>
                            <span className="text-sm font-bold text-primary">Nível {resistance}</span>
                        </div>
                        <input
                            type="range" min={1} max={20} value={resistance}
                            onChange={e => setResistance(+e.target.value)}
                            className="w-full accent-primary h-2 rounded-full"
                        />
                        <div className="flex justify-between text-[9px] text-text-muted font-medium mt-1">
                            <span>Leve</span><span>Moderado</span><span>Intenso</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex gap-3">
                        <button
                            onClick={toggleRunning}
                            className="flex-1 py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2"
                            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}
                        >
                            {running ? <><Pause size={20} /> Pausar</> : <><Play size={20} /> {startedRef.current ? 'Retomar' : 'Iniciar'}</>}
                        </button>
                        {startedRef.current && (
                            <button
                                onClick={handleFinish}
                                disabled={saving}
                                className="w-14 rounded-2xl flex items-center justify-center transition-all disabled:opacity-50"
                                style={{ backgroundColor: 'rgba(var(--gordura-rgb),0.15)', border: '1px solid rgba(var(--gordura-rgb),0.3)' }}
                            >
                                <Square size={20} style={{ color: 'var(--gordura)' }} />
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
