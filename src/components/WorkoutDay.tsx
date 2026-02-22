import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Timer, Trophy, Play, Pause, Square, Save, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { exerciseService } from '../services/exerciseService';
import { POINTS } from '../types';
import type { WorkoutPlan, Profile, Exercise, WorkoutDay as WorkoutDayType } from '../types';

interface Props {
    plan: WorkoutPlan;
    profile: Profile;
    onComplete: (pointsEarned: number) => void;
}

function getTodayDayData(plan: WorkoutPlan): WorkoutDayType | null {
    const weeks = plan.plan_data?.weeks;
    if (!weeks?.length) return null;
    const dayOfWeek = new Date().getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentWeek = weeks[0];
    return currentWeek.days[dayIndex % currentWeek.days.length] || null;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

type SetState = {
    weight: string;
    status: 'idle' | 'active' | 'paused' | 'done';
    time: number;
    showWeightInput: boolean;
};

type ActiveSetModal = {
    exerciseIndex: number;
    setIndex: number;
    exerciseName: string;
    isCountingDown: boolean;
    countdown: number;
};

export default function WorkoutDayView({ plan, profile, onComplete }: Props) {
    const todayData = getTodayDayData(plan);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [gifUrls, setGifUrls] = useState<Record<string, string>>({});
    const [restTimer, setRestTimer] = useState<{ active: boolean; seconds: number; exerciseIndex: number; setIndex: number } | null>(null);
    const [sessionDone, setSessionDone] = useState(false);
    const [saving, setSaving] = useState(false);
    const [setsProgress, setSetsProgress] = useState<Record<number, SetState[]>>({});
    const [activeSetModal, setActiveSetModal] = useState<ActiveSetModal | null>(null);

    const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const setsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<Date>(new Date());

    useEffect(() => {
        if (!todayData || todayData.type === 'rest') return;
        const ids = todayData.exercises.map((e) => e.exercise_id);
        exerciseService.preloadGifs(ids).then(setGifUrls);

        const initialProgress: Record<number, SetState[]> = {};
        todayData.exercises.forEach((ex, i) => {
            const savedWeight = localStorage.getItem(`weight_${ex.exercise_id}`) || '';
            initialProgress[i] = Array.from({ length: ex.sets }).map(() => ({
                weight: savedWeight,
                status: 'idle',
                time: 0,
                showWeightInput: !!savedWeight
            }));
        });
        setSetsProgress(initialProgress);
    }, [todayData]);

    // Active sets timer
    useEffect(() => {
        setsIntervalRef.current = setInterval(() => {
            setSetsProgress(prev => {
                const next = { ...prev };
                let changed = false;
                for (const exIndex in next) {
                    const sets = next[exIndex];
                    for (let sIndex = 0; sIndex < sets.length; sIndex++) {
                        if (sets[sIndex].status === 'active') {
                            next[exIndex] = [...sets];
                            next[exIndex][sIndex] = { ...sets[sIndex], time: sets[sIndex].time + 1 };
                            changed = true;
                        }
                    }
                }
                return changed ? next : prev;
            });
        }, 1000);

        return () => {
            if (setsIntervalRef.current) clearInterval(setsIntervalRef.current);
        };
    }, []);

    // Rest timer
    useEffect(() => {
        if (restTimer?.active) {
            restIntervalRef.current = setInterval(() => {
                setRestTimer((prev) => {
                    if (!prev) return null;
                    if (prev.seconds <= 1) {
                        clearInterval(restIntervalRef.current!);
                        return null;
                    }
                    return { ...prev, seconds: prev.seconds - 1 };
                });
            }, 1000);
        }
        return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); };
    }, [restTimer?.active]);

    // Countdown timer for fullscreen active set
    useEffect(() => {
        if (activeSetModal?.isCountingDown) {
            countdownIntervalRef.current = setInterval(() => {
                setActiveSetModal(prev => {
                    if (!prev) return null;
                    if (prev.countdown <= 1) {
                        clearInterval(countdownIntervalRef.current!);

                        // Switch from countdown to active set
                        setSetsProgress(prevProgress => {
                            const next = { ...prevProgress };
                            const sets = [...next[prev.exerciseIndex]];
                            sets[prev.setIndex] = { ...sets[prev.setIndex], status: 'active' };
                            next[prev.exerciseIndex] = sets;
                            return next;
                        });

                        return { ...prev, isCountingDown: false };
                    }
                    return { ...prev, countdown: prev.countdown - 1 };
                });
            }, 1000);
        }
        return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
    }, [activeSetModal?.isCountingDown]);

    const handleSetAction = (exIndex: number, setIndex: number, action: 'start' | 'pause' | 'done', restSeconds: number, exerciseName: string) => {
        if (action === 'start') {
            // Start countdown and open full screen
            setActiveSetModal({
                exerciseIndex: exIndex,
                setIndex,
                exerciseName,
                isCountingDown: true,
                countdown: 5
            });
            // Stop rest timer if any
            if (restIntervalRef.current) clearInterval(restIntervalRef.current);
            setRestTimer(null);
            return;
        }

        setSetsProgress(prev => {
            const next = { ...prev };
            const sets = [...next[exIndex]];

            if (action === 'pause') {
                sets[setIndex] = { ...sets[setIndex], status: 'paused' };
            } else if (action === 'done') {
                sets[setIndex] = { ...sets[setIndex], status: 'done' };
                // Close fullscreen and start rest timer
                setActiveSetModal(null);
                if (restIntervalRef.current) clearInterval(restIntervalRef.current);
                setRestTimer({ active: true, seconds: restSeconds, exerciseIndex: exIndex, setIndex });
            }

            next[exIndex] = sets;
            return next;
        });
    };

    const handleWeightChange = (exIndex: number, setIndex: number, weight: string) => {
        setSetsProgress(prev => {
            const next = { ...prev };
            const sets = [...next[exIndex]];
            sets[setIndex] = { ...sets[setIndex], weight };
            next[exIndex] = sets;
            return next;
        });
    };

    const saveWeight = (exIndex: number, setIndex: number, exerciseId: string) => {
        const weight = setsProgress[exIndex][setIndex].weight;
        localStorage.setItem(`weight_${exerciseId}`, weight);
        // hide input edit if needed, or just keep it there
    };

    const saveAndReplicateWeight = (exIndex: number, setIndex: number, exerciseId: string) => {
        const weight = setsProgress[exIndex][setIndex].weight;
        localStorage.setItem(`weight_${exerciseId}`, weight);

        setSetsProgress(prev => {
            const next = { ...prev };
            const sets = [...next[exIndex]];
            // Replicate for all subsequent sets
            for (let i = setIndex + 1; i < sets.length; i++) {
                sets[i] = { ...sets[i], weight, showWeightInput: true };
            }
            next[exIndex] = sets;
            return next;
        });
    };

    const toggleWeightInput = (exIndex: number, setIndex: number, show: boolean) => {
        setSetsProgress(prev => {
            const next = { ...prev };
            const sets = [...next[exIndex]];
            sets[setIndex] = { ...sets[setIndex], showWeightInput: show };
            next[exIndex] = sets;
            return next;
        });
    };

    const isExerciseCompleted = (exIndex: number) => {
        const sets = setsProgress[exIndex];
        return sets && sets.every(s => s.status === 'done');
    };

    const getCompletedCount = () => {
        if (!todayData) return 0;
        return todayData.exercises.filter((_, i) => isExerciseCompleted(i)).length;
    };

    const getProgressPct = () => {
        if (!todayData) return 0;
        let totalSets = 0;
        let doneSets = 0;
        todayData.exercises.forEach((_, i) => {
            const sets = setsProgress[i];
            if (sets) {
                totalSets += sets.length;
                doneSets += sets.filter(s => s.status === 'done').length;
            }
        });
        return totalSets > 0 ? (doneSets / totalSets) * 100 : 0;
    };

    async function handleFinishWorkout() {
        if (!todayData) return;
        setSaving(true);
        const elapsed = Math.round((new Date().getTime() - startTimeRef.current.getTime()) / 60000);

        const exercisesCompleted = todayData.exercises
            .filter((_, i) => isExerciseCompleted(i))
            .map((e) => e.name);

        const allDone = getCompletedCount() === todayData.exercises.length;
        const pts = allDone ? POINTS.WORKOUT_COMPLETE : POINTS.WORKOUT_PARTIAL;

        try {
            await supabase.from('workout_sessions').insert({
                user_id: profile.id,
                plan_id: plan.id,
                session_date: new Date().toISOString().split('T')[0],
                day_index: new Date().getDay(),
                exercises_completed: exercisesCompleted,
                duration_minutes: elapsed,
                points_earned: pts,
                completed: allDone,
            });

            try {
                await supabase.rpc('add_points', { p_user_id: profile.id, p_points: pts });
            } catch {
                const { data: gam } = await supabase.from('gamification').select('*').eq('user_id', profile.id).single();
                if (gam) {
                    await supabase.from('gamification').update({
                        points: (gam.points || 0) + pts,
                        total_workouts: (gam.total_workouts || 0) + 1,
                        last_activity_date: new Date().toISOString().split('T')[0],
                    }).eq('user_id', profile.id);
                }
            }

            setSessionDone(true);
            onComplete(pts);
        } finally {
            setSaving(false);
        }
    }

    if (!todayData || todayData.type === 'rest') {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-5">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="text-6xl">😴</motion.div>
                <h2 className="text-2xl font-bold text-white">Dia de Descanso</h2>
                <p className="text-gray-400 text-base max-w-xs">Hoje é dia de recuperação! O descanso é tão importante quanto o treino. Aproveite para relaxar e se hidratar bem.</p>
            </div>
        );
    }

    if (sessionDone) {
        const completedCount = getCompletedCount();
        const pts = completedCount === todayData.exercises.length ? POINTS.WORKOUT_COMPLETE : POINTS.WORKOUT_PARTIAL;
        return (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-16 px-6 text-center gap-6">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.2 }} className="text-7xl">🏆</motion.div>
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Treino Concluído!</h2>
                    <p className="text-gray-400">{completedCount} de {todayData.exercises.length} exercícios feitos</p>
                </div>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 150, delay: 0.4 }} className="flex items-center gap-3 px-8 py-5 rounded-2xl" style={{ backgroundColor: 'rgba(245,158,11,0.15)', border: '2px solid rgba(245,158,11,0.3)' }}>
                    <Trophy size={32} style={{ color: '#F59E0B' }} />
                    <div className="text-left">
                        <p className="text-sm text-gray-400">Pontos ganhos</p>
                        <p className="text-3xl font-extrabold" style={{ color: '#F59E0B' }}>+{pts}</p>
                    </div>
                </motion.div>
                <p className="text-gray-400 text-sm max-w-xs">
                    {completedCount === todayData.exercises.length ? 'Parabéns! Você completou todos os exercícios! Continue assim!' : 'Ótimo esforço! Cada treino conta na sua evolução!'}
                </p>
            </motion.div>
        );
    }

    const totalCount = todayData.exercises.length;
    const progressPct = getProgressPct();

    return (
        <div className="flex flex-col px-4 py-5 gap-5 max-w-lg mx-auto pb-24">
            {/* FULLSCREEN ACTIVE SET MODAL */}
            <AnimatePresence>
                {activeSetModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#0F0F1A]"
                    >
                        {activeSetModal.isCountingDown ? (
                            <motion.div
                                key={activeSetModal.countdown}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 1.2, opacity: 0 }}
                                transition={{ duration: 0.4 }}
                                className="flex flex-col items-center gap-4 text-center"
                            >
                                <h3 className="text-2xl font-medium text-gray-400">Preparando...</h3>
                                <div className="text-9xl font-bold text-white drop-shadow-[0_0_15px_rgba(124,58,237,0.5)]">
                                    {activeSetModal.countdown}
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex flex-col items-center gap-10 w-full max-w-md">
                                <h2 className="text-3xl font-bold text-center text-white">{activeSetModal.exerciseName}</h2>
                                <h3 className="text-lg text-gray-400 font-medium tracking-widest uppercase">
                                    Série {activeSetModal.setIndex + 1}
                                </h3>

                                <div className="text-8xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-purple-500 drop-shadow-[0_0_20px_rgba(124,58,237,0.3)] tabular-nums tracking-tighter">
                                    {formatTime(setsProgress[activeSetModal.exerciseIndex]?.[activeSetModal.setIndex]?.time || 0)}
                                </div>

                                <div className="flex items-center gap-6 mt-10">
                                    {setsProgress[activeSetModal.exerciseIndex]?.[activeSetModal.setIndex]?.status === 'paused' ? (
                                        <button
                                            onClick={() => {
                                                setSetsProgress(prev => {
                                                    const next = { ...prev };
                                                    const sets = [...next[activeSetModal.exerciseIndex]];
                                                    sets[activeSetModal.setIndex] = { ...sets[activeSetModal.setIndex], status: 'active' };
                                                    next[activeSetModal.exerciseIndex] = sets;
                                                    return next;
                                                });
                                            }}
                                            className="w-20 h-20 rounded-full bg-indigo-500/20 text-indigo-400 border-2 border-indigo-500 flex items-center justify-center hover:bg-indigo-500/40 transition-colors shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                                        >
                                            <Play size={36} fill="currentColor" className="ml-2" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleSetAction(activeSetModal.exerciseIndex, activeSetModal.setIndex, 'pause', 0, activeSetModal.exerciseName)}
                                            className="w-20 h-20 rounded-full bg-amber-500/20 text-amber-500 border-2 border-amber-500 flex items-center justify-center hover:bg-amber-500/40 transition-colors shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                                        >
                                            <Pause size={36} fill="currentColor" />
                                        </button>
                                    )}

                                    <button
                                        onClick={() => {
                                            const exercise = todayData.exercises[activeSetModal.exerciseIndex];
                                            handleSetAction(activeSetModal.exerciseIndex, activeSetModal.setIndex, 'done', exercise.rest_seconds, activeSetModal.exerciseName);
                                        }}
                                        className="w-24 h-24 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                                    >
                                        <Square size={40} fill="currentColor" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">{plan.name}</p>
                <h2 className="text-xl font-bold text-white">{todayData.name}</h2>
                <p className="text-gray-500 text-sm">{totalCount} exercícios</p>
            </div>

            <div>
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                    <span>Séries Concluídas</span>
                    <span>{Math.round(progressPct)}%</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                    <motion.div className="h-full rounded-full" style={{ backgroundColor: '#10B981' }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.4 }} />
                </div>
            </div>

            <AnimatePresence>
                {restTimer && !activeSetModal && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center justify-between px-5 py-3 rounded-xl sticky top-4 z-10 shadow-lg" style={{ backgroundColor: '#1E1B4B', border: '1px solid #7C3AED' }}>
                        <div className="flex items-center gap-2">
                            <Timer size={18} style={{ color: '#A78BFA' }} />
                            <span className="text-white text-sm font-medium">Descanso</span>
                        </div>
                        <span className="text-2xl font-bold" style={{ color: '#C4B5FD' }}>{formatTime(restTimer.seconds)}</span>
                        <button onClick={() => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); setRestTimer(null); }} className="text-xs text-gray-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-lg">Pular</button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex flex-col gap-3">
                {todayData.exercises.map((exercise: Exercise, i: number) => {
                    const done = isExerciseCompleted(i);
                    const expanded = expandedIndex === i || (expandedIndex === null && !done && i === todayData.exercises.findIndex((_, idx) => !isExerciseCompleted(idx)));
                    const gifUrl = gifUrls[exercise.exercise_id];
                    const sets = setsProgress[i] || [];

                    return (
                        <motion.div key={i} layout className="rounded-2xl overflow-hidden transition-all duration-300" style={{ backgroundColor: '#1A1A2E', border: `1px solid ${done ? 'rgba(16,185,129,0.4)' : expanded ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.06)'}`, boxShadow: expanded ? '0 10px 25px -5px rgba(0, 0, 0, 0.5)' : 'none' }}>
                            <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedIndex(expanded ? null : i)}>
                                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center opacity-90" style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}>
                                    {gifUrl ? <img src={gifUrl} alt={exercise.name} className="w-full h-full object-cover" /> : <span className="text-2xl">💪</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-semibold text-sm truncate ${done ? 'text-green-400' : 'text-white'}`}>{exercise.name}</p>
                                    <p className="text-gray-400 text-xs mt-0.5">{exercise.sets} séries × {exercise.reps} · {exercise.rest_seconds}s desc.</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {done && <div className="w-6 h-6 flex items-center justify-center rounded-full bg-green-500/20 text-green-500"><Check size={14} /></div>}
                                    <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                </div>
                            </div>

                            <AnimatePresence>
                                {expanded && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="px-4 pb-4 flex flex-col gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div className="mt-4 flex flex-col gap-2">
                                                {sets.map((setInfo, setIdx) => (
                                                    <div key={setIdx} className={`flex flex-col gap-2 py-3 px-3 rounded-xl transition-colors ${setInfo.status === 'done' ? 'bg-green-500/10 border border-green-500/30' : 'bg-white/5 border border-white/5'}`}>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 text-center text-xs font-bold text-gray-400">S{setIdx + 1}</div>

                                                            {setInfo.showWeightInput || setInfo.weight ? (
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Kg"
                                                                        value={setInfo.weight}
                                                                        onChange={(e) => handleWeightChange(i, setIdx, e.target.value)}
                                                                        onBlur={() => { if (!setInfo.weight) toggleWeightInput(i, setIdx, false); }}
                                                                        disabled={setInfo.status === 'done'}
                                                                        className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-sm text-center text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                                                                    />
                                                                    {setInfo.status !== 'done' && (
                                                                        <div className="flex gap-1 ml-1">
                                                                            <button onClick={() => saveWeight(i, setIdx, exercise.exercise_id)} title="Salvar Peso" className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-400 hover:bg-white/5 transition-colors">
                                                                                <Save size={14} />
                                                                            </button>
                                                                            {setIdx < sets.length - 1 && (
                                                                                <button onClick={() => saveAndReplicateWeight(i, setIdx, exercise.exercise_id)} title="Salvar e Replicar para as próximas" className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-400 hover:bg-white/5 transition-colors">
                                                                                    <Copy size={14} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => toggleWeightInput(i, setIdx, true)}
                                                                    disabled={setInfo.status === 'done'}
                                                                    className="text-xs px-2 py-1.5 rounded bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition text-center disabled:opacity-50"
                                                                >
                                                                    Configurar Peso KG
                                                                </button>
                                                            )}

                                                            <div className="flex-1"></div>

                                                            <div className="text-center text-xs font-mono text-gray-400 mr-2">
                                                                {setInfo.status === 'done' ? formatTime(setInfo.time) : ''}
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                {setInfo.status !== 'done' ? (
                                                                    <button onClick={() => handleSetAction(i, setIdx, 'start', exercise.rest_seconds, exercise.name)} className="px-4 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 font-semibold text-sm flex items-center gap-1.5 transition-colors border border-indigo-500/20">
                                                                        <Play size={14} fill="currentColor" />
                                                                        Iniciar
                                                                    </button>
                                                                ) : (
                                                                    <div className="px-2 text-green-500 flex items-center gap-1">
                                                                        <Check size={16} />
                                                                        <span className="text-xs font-semibold">Concluído</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-2 text-sm">
                                                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Como executar</p>
                                                <p className="text-gray-300">{exercise.instructions}</p>
                                            </div>

                                            {gifUrl && (
                                                <div className="rounded-xl overflow-hidden bg-white/5 border border-white/5">
                                                    <img src={gifUrl} alt={exercise.name} className="w-full mix-blend-screen opacity-80" />
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            {getCompletedCount() > 0 && (
                <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleFinishWorkout} disabled={saving} className="w-full py-4 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2 mb-8 mt-4" style={{ background: getCompletedCount() === totalCount ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #7C3AED, #6d28d9)', opacity: saving ? 0.7 : 1 }}>
                    {saving ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : <><Trophy size={18} /> {getCompletedCount() === totalCount ? 'Treino Concluído! 🎉' : `Finalizar (${getCompletedCount()}/${totalCount})`}</>}
                </motion.button>
            )}
        </div>
    );
}
