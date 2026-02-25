import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Timer, Trophy, Play, Pause, Save, Copy, Settings2, X, Loader2, BedDouble, Target, Activity, Calendar, CalendarClock, Bell, Dumbbell, CheckCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { exerciseMediaService } from '../services/exerciseMediaService';
import type { MediaResult } from '../services/exerciseMediaService';
import { aiService } from '../services/aiService';
import { getLocalYYYYMMDD } from '../lib/dateUtils';
import { POINTS } from '../types';
import { gamificationService } from '../lib/gamificationService';
import type { WorkoutPlan, Profile, Exercise } from '../types';

interface Props {
    plan: WorkoutPlan;
    profile: Profile;
    onComplete: (pointsEarned: number) => void;
    /** When true, hides the top header (used inside WeeklyPlanView which provides its own header) */
    hideHeader?: boolean;
    /** When true, triggers opening the single-day edit/regen config */
    triggerEditDay?: boolean;
    /** When true, triggers opening the full-week rebuild config */
    triggerEditWeek?: boolean;
    /** Called after a trigger has been consumed so parent can reset it */
    onTriggerConsumed?: () => void;
}

const WEEK_DAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

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

export default function WorkoutDayView({ plan, profile, onComplete, hideHeader = false, triggerEditDay, triggerEditWeek, onTriggerConsumed }: Props) {
    const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
        const dayOfWeek = new Date().getDay();
        return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    });

    const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(0);
    const [localPlan, setLocalPlan] = useState<WorkoutPlan>(plan);
    const weeksList = localPlan.plan_data?.weeks || [];
    const todayData = weeksList[selectedWeekIndex]?.days[selectedDayIndex] || null;

    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [mediaData, setMediaData] = useState<Record<string, MediaResult>>({});
    const [loadingMedia, setLoadingMedia] = useState<Record<string, boolean>>({});
    const [restTimer, setRestTimer] = useState<{ active: boolean; seconds: number; exerciseIndex: number; setIndex: number } | null>(null);
    const [sessionDone, setSessionDone] = useState(false);
    const [saving, setSaving] = useState(false);
    const [setsProgress, setSetsProgress] = useState<Record<number, SetState[]>>({});
    const [activeSetModal, setActiveSetModal] = useState<ActiveSetModal | null>(null);
    const [quickFinishModal, setQuickFinishModal] = useState<{ exerciseIndex: number; exerciseName: string; type: string; step: 'question' | 'input' } | null>(null);
    const [quickFinishWeight, setQuickFinishWeight] = useState('');

    // Post-workout summary stats (stored at save time to avoid state-reset race)
    const [summaryDuration, setSummaryDuration] = useState(0);
    const [summaryCalories, setSummaryCalories] = useState(0);
    const [summaryLoadKg, setSummaryLoadKg] = useState(0);

    // Regenerate Modals
    const [showConfig, setShowConfig] = useState(false);
    const [showWeekConfig, setShowWeekConfig] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);

    // Week Rebuild state
    const [regenWeekLoc, setRegenWeekLoc] = useState<string>(profile.training_location || 'gym');
    const [regenWeekMin, setRegenWeekMin] = useState(profile.available_minutes || 45);
    const [remindTime, setRemindTime] = useState('06:00');
    const [weekDaysActive, setWeekDaysActive] = useState<boolean[]>([true, true, true, true, true, false, false]);
    const [isRebuildingWeek, setIsRebuildingWeek] = useState(false);

    // Single Day Rebuild state
    const [regenMin, setRegenMin] = useState(45);
    const [regenLoc, setRegenLoc] = useState<string>(profile.training_location || 'gym');
    const [isGenerating, setIsGenerating] = useState(false);

    const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const setsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<Date>(new Date());

    useEffect(() => {
        setLocalPlan(plan);
    }, [plan]);

    useEffect(() => {
        if (triggerEditDay) { setShowConfig(true); onTriggerConsumed?.(); }
    }, [triggerEditDay]);

    useEffect(() => {
        if (triggerEditWeek) { setShowWeekConfig(true); onTriggerConsumed?.(); }
    }, [triggerEditWeek]);

    // Check if workout session already exists for today
    useEffect(() => {
        if (!todayData || todayData.type === 'rest') {
            setSessionDone(false);
            return;
        }

        async function loadDaySession() {
            setSessionDone(false); // Reset while loading

            // Calculate the date for the selected day in current week
            const now = new Date();
            const currentDay = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0, Sun=6
            const diff = selectedDayIndex - currentDay;
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + diff);
            const dateStr = getLocalYYYYMMDD(targetDate);

            const { data } = await supabase
                .from('workout_sessions')
                .select('*')
                .eq('user_id', profile.id)
                .eq('session_date', dateStr)
                .maybeSingle();

            if (data) {
                setSessionDone(true);
                setSummaryDuration(data.duration_minutes || 0);
                setSummaryCalories(Math.round(5 * profile.weight * (data.duration_minutes / 60)));
                setSummaryLoadKg(data.total_load_kg || 0);

                const doneProgress: Record<number, SetState[]> = {};
                todayData?.exercises.forEach((ex, i) => {
                    const isDone = data.exercises_completed?.includes(ex.name);
                    doneProgress[i] = Array.from({ length: ex.sets }).map(() => ({
                        weight: '0',
                        status: (isDone ? 'done' : 'idle') as any,
                        time: 0,
                        showWeightInput: false
                    }));
                });
                setSetsProgress(doneProgress);
                return;
            }

            // Check localStorage for today specifically if we haven't found a DB session
            const alreadyDone = localStorage.getItem(`workout_done_${profile.id}_${dateStr}`);
            if (alreadyDone === 'true') {
                setSessionDone(true);
                return;
            }

            const initialProgress: Record<number, SetState[]> = {};
            todayData?.exercises.forEach((ex, i) => {
                const savedWeight = localStorage.getItem(`weight_${ex.exercise_id}`) || '';
                initialProgress[i] = Array.from({ length: ex.sets }).map(() => ({
                    weight: savedWeight,
                    status: 'idle',
                    time: 0,
                    showWeightInput: !!savedWeight
                }));
            });
            setSetsProgress(initialProgress);
        }

        loadDaySession();

        // Preload free-exercise-db index in background
        exerciseMediaService.preloadFreeDb();
        const exerciseMeta = todayData.exercises.map((e) => ({ id: e.exercise_id, name: e.name }));
        exerciseMediaService.getCachedBatch(exerciseMeta).then(setMediaData);
    }, [todayData, selectedDayIndex]);

    // Lazy-load media when exercise is expanded and not yet cached
    useEffect(() => {
        if (expandedIndex === null || !todayData || todayData.type === 'rest') return;
        const ex = todayData.exercises[expandedIndex];
        if (!ex) return;
        const id = ex.exercise_id;
        if (mediaData[id] || loadingMedia[id]) return;
        setLoadingMedia((prev) => ({ ...prev, [id]: true }));
        exerciseMediaService.getMedia(ex.name, id).then((result) => {
            if (result) setMediaData((prev) => ({ ...prev, [id]: result }));
            setLoadingMedia((prev) => ({ ...prev, [id]: false }));
        });
    }, [expandedIndex]);

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

    const handleConfirmQuickFinish = (weightOrTime: string) => {
        if (!quickFinishModal || !todayData) return;
        const { exerciseIndex } = quickFinishModal;
        const ex = todayData.exercises[exerciseIndex];
        const numSets = ex.sets || 3;

        const newProgress = { ...setsProgress };
        const sets: SetState[] = [];
        for (let i = 0; i < numSets; i++) {
            sets.push({
                status: 'done' as const,
                weight: weightOrTime,
                time: quickFinishModal.type === 'time' ? parseInt(weightOrTime) || 0 : 0,
                showWeightInput: false
            });
        }
        newProgress[exerciseIndex] = sets;
        setSetsProgress(newProgress);
        setQuickFinishModal(null);

        // Save weight to local storage for future reference
        if (quickFinishModal.type !== 'time') {
            localStorage.setItem(`weight_${ex.exercise_id}`, weightOrTime);
        }
    };

    async function handleFinishWorkout() {
        if (!todayData) return;
        setSaving(true);
        const elapsed = Math.round((new Date().getTime() - startTimeRef.current.getTime()) / 60000);

        const completedExercises = todayData.exercises.filter((_, i) => isExerciseCompleted(i));
        const exercisesCompleted = completedExercises.map((e) => e.name);
        const completedCount = completedExercises.length;
        const allDone = completedCount === todayData.exercises.length;
        const pts = allDone ? POINTS.WORKOUT_COMPLETE : POINTS.WORKOUT_PARTIAL;

        // Compute summary stats before state may get reset
        const durationMin = Math.max(1, elapsed);
        const calBurned = Math.round(5 * profile.weight * (durationMin / 60));
        let loadKg = 0;
        todayData.exercises.forEach((ex, i) => {
            const sets = setsProgress[i];
            if (sets) {
                const reps = parseInt(String(ex.reps)) || 10;
                sets.filter(s => s.status === 'done').forEach(s => {
                    loadKg += (parseFloat(s.weight) || 0) * reps;
                });
            }
        });

        const todayStr = getLocalYYYYMMDD();
        setSummaryDuration(durationMin);
        setSummaryCalories(calBurned);
        setSummaryLoadKg(Math.round(loadKg));

        localStorage.setItem(`workout_done_${profile.id}_${todayStr}`, 'true');

        try {
            await supabase.from('workout_sessions').insert({
                user_id: profile.id,
                plan_id: plan.id,
                session_date: getLocalYYYYMMDD(),
                day_index: new Date().getDay(),
                exercises_completed: exercisesCompleted,
                duration_minutes: elapsed,
                total_load_kg: Math.round(loadKg),
                points_earned: pts,
                completed: allDone,
            }).throwOnError();

            await gamificationService.awardPoints(profile.id, allDone ? 'WORKOUT_COMPLETE' : 'WORKOUT_PARTIAL');

            setSessionDone(true);
            onComplete(pts);
        } catch (e: any) {
            console.error('Error saving workout:', e);
            alert('Não foi possível salvar o treino. Verifique sua conexão e tente novamente.');
        } finally {
            setSaving(false);
        }
    }

    const handleRebuildDay = async () => {
        setIsGenerating(true);
        try {
            const dayName = WEEK_DAYS[selectedDayIndex];

            // Collect all exercises already in the week to avoid duplicates
            const weekExercises: string[] = [];
            localPlan.plan_data?.weeks?.[selectedWeekIndex]?.days?.forEach(d => {
                if (d.exercises) {
                    d.exercises.forEach(ex => weekExercises.push(ex.name));
                }
            });

            const newDay = await aiService.generateWorkoutSingleDay(profile, dayName, regenMin, regenLoc, weekExercises);
            if (newDay) {
                const updatedPlan = { ...localPlan };
                if (!updatedPlan.plan_data.weeks) return;
                updatedPlan.plan_data.weeks[selectedWeekIndex].days[selectedDayIndex] = {
                    ...updatedPlan.plan_data.weeks[selectedWeekIndex].days[selectedDayIndex],
                    ...newDay
                };
                await supabase.from('workout_plans').update({ plan_data: updatedPlan.plan_data }).eq('id', plan.id).throwOnError();
                setLocalPlan(updatedPlan);
                setShowConfig(false);
            } else {
                alert("Falha ao recalcular treino.");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRebuildWeek = async () => {
        setIsRebuildingWeek(true);
        try {
            // Reutiliza a lógica do profile para gerar toda a semana de uma vez pra pessoa
            const activeDaysMap = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
            const activeStrings = activeDaysMap.filter((_, i) => weekDaysActive[i]);

            const newProfileData = { ...profile, training_location: regenWeekLoc as any, available_minutes: regenWeekMin, active_days: activeStrings };
            const newPlanJson = await aiService.generateWorkoutPlan(newProfileData);

            if (newPlanJson && newPlanJson.weeks) {
                await supabase.from('workout_plans').update({ plan_data: newPlanJson }).eq('id', plan.id).throwOnError();
                setLocalPlan({ ...localPlan, name: newPlanJson.name, plan_data: newPlanJson });
                setShowWeekConfig(false);
                alert("Sua semana foi reajustada com sucesso! Lembrete salvo para as " + remindTime);
            } else {
                alert("Falha ao gerar nova semana.");
            }
        } catch (e) {
            console.error(e);
            alert("Erro ao recalcular sua semana. Verifique sua conexão.");
        } finally {
            setIsRebuildingWeek(false);
        }
    };

    const totalCount = todayData ? todayData.exercises.length : 0;
    const progressPct = getProgressPct();

    return (
        <div className={`flex flex-col px-4 ${hideHeader ? 'pt-2' : 'pt-10'} pb-24 gap-5 max-w-lg mx-auto`}>
            {/* Week Tab Selector */}
            <div className="flex gap-2 -mx-4 px-4">
                {WEEK_DAYS.map((d, i) => {
                    const dayData = localPlan.plan_data?.weeks?.[selectedWeekIndex]?.days?.[i];
                    const isRest = dayData?.type === 'rest';

                    return (
                        <button
                            key={i}
                            onClick={() => setSelectedDayIndex(i)}
                            className={`flex-1 min-w-[3rem] py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${selectedDayIndex === i
                                ? 'bg-primary text-white'
                                : isRest
                                    ? 'bg-card text-text-muted opacity-50 hover:bg-card/80'
                                    : 'bg-card border text-text-muted hover:bg-card/80'
                                }`}
                            style={{ borderColor: selectedDayIndex === i ? 'transparent' : 'var(--border-main)' }}
                        >
                            {d}
                        </button>
                    )
                })}
            </div>

            {/* Day and Week Selection */}
            <div className="px-6 mb-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setSelectedWeekIndex(prev => Math.max(0, prev - 1))}
                        disabled={selectedWeekIndex === 0}
                        className="p-2 text-text-muted hover:text-text-main disabled:opacity-20"
                    >
                        <ChevronUp size={24} className="-rotate-90" />
                    </button>
                    <div className="text-center">
                        <span className="text-xs font-bold text-primary uppercase tracking-[0.2em] mb-1 block">Fase do Treino</span>
                        <h2 className="text-xl font-black text-text-main">Semana {selectedWeekIndex + 1}</h2>
                    </div>
                    <button
                        onClick={() => setSelectedWeekIndex(prev => Math.min(weeksList.length - 1, prev + 1))}
                        disabled={selectedWeekIndex >= weeksList.length - 1}
                        className="p-2 text-text-muted hover:text-text-main disabled:opacity-20"
                    >
                        <ChevronUp size={24} className="rotate-90" />
                    </button>
                </div>

                <div className="flex items-center justify-between bg-card p-1.5 rounded-2xl border shadow-inner" style={{ borderColor: 'var(--border-main)' }}>
                    <p className="text-primary text-xs font-bold uppercase tracking-wider pl-1 max-w-[40%] truncate">{localPlan.name}</p>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowCalendar(true)} className="flex items-center justify-center text-text-muted bg-card w-8 h-8 rounded-lg border hover:opacity-80 transition-colors" style={{ borderColor: 'var(--border-main)' }}>
                            <Calendar size={14} />
                        </button>
                        <button onClick={() => setShowWeekConfig(true)} className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 h-8 rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors">
                            <CalendarClock size={14} /> Semana
                        </button>
                        <button onClick={() => setShowConfig(true)} className="flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 h-8 rounded-lg border border-accent/20 hover:bg-accent/20 transition-colors">
                            <Settings2 size={14} /> Dia
                        </button>
                    </div>
                </div>
            </div>

            {/* Post-workout summary banner (shown on top, exercises remain visible below) */}
            {sessionDone && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl overflow-hidden border border-proteina/30" style={{ background: 'linear-gradient(135deg, rgba(var(--proteina-rgb),0.12), rgba(var(--proteina-rgb),0.06))' }}>
                    <div className="flex items-center gap-3 px-5 pt-5 pb-4">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 250, delay: 0.1 }} className="w-12 h-12 rounded-full bg-proteina/20 border border-proteina/30 flex items-center justify-center flex-shrink-0">
                            <Trophy size={24} className="text-proteina" />
                        </motion.div>
                        <div>
                            <h2 className="text-base font-bold text-text-main">Treino Salvo! 🎉</h2>
                            <p className="text-proteina/80 text-[10px] font-medium uppercase tracking-widest mt-0.5">Sua evolução foi registrada</p>
                        </div>
                    </div>
                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-px bg-card border-t" style={{ borderColor: 'var(--border-main)' }}>
                        {[
                            { label: 'Duração', value: `${summaryDuration}min`, icon: <Timer size={14} /> },
                            { label: 'Calorias', value: `~${summaryCalories}kcal`, icon: <Activity size={14} /> },
                            { label: 'Volume', value: summaryLoadKg > 0 ? `${summaryLoadKg}kg` : '—', icon: <Target size={14} /> },
                        ].map((stat) => (
                            <div key={stat.label} className="flex flex-col items-center gap-1 py-3" style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)' }}>
                                <div className="text-proteina/80">{stat.icon}</div>
                                <span className="text-text-main font-bold text-sm">{stat.value}</span>
                                <span className="text-text-muted text-[10px] uppercase tracking-wide">{stat.label}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {(!todayData || todayData.type === 'rest') ? (
                <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-5">
                    <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <BedDouble size={40} className="text-primary" />
                    </motion.div>
                    <h2 className="text-xl font-semibold text-text-main tracking-tight">Dia de Descanso</h2>
                    <p className="text-text-muted text-sm font-medium leading-relaxed max-w-[240px]">Aproveite para recuperar os músculos. O descanso também faz parte do treino!</p>
                    <button
                        onClick={() => setShowConfig(true)}
                        className="mt-4 px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                    >
                        <Dumbbell size={16} />
                        Quero treinar hoje
                    </button>
                </div>
            ) : (
                <>
                    {/* FULLSCREEN ACTIVE SET MODAL */}
                    <AnimatePresence>
                        {activeSetModal && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-dark"
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
                                        <h3 className="text-2xl font-medium text-text-muted">Preparando...</h3>
                                        <div className="text-9xl font-bold text-text-main drop-shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]">
                                            {activeSetModal.countdown}
                                        </div>
                                    </motion.div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center w-full max-w-sm mt-8">
                                        <div className="text-center mb-8">
                                            <p className="text-primary font-bold tracking-widest uppercase text-xs mb-3">Série {activeSetModal.setIndex + 1}</p>
                                            <h2 className="text-3xl font-extrabold text-text-main leading-tight">{activeSetModal.exerciseName}</h2>
                                        </div>

                                        <div className="relative w-64 h-64 flex items-center justify-center">
                                            {/* Glowing background ring */}
                                            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                                            {/* Active progress ring fake */}
                                            <svg className="absolute inset-0 w-full h-full -rotate-90">
                                                <circle cx="128" cy="128" r="124" stroke="url(#gradient)" strokeWidth="8" fill="none" strokeDasharray="780" strokeDashoffset="0" className="opacity-80 drop-shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" />
                                                <defs>
                                                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="var(--primary)" />
                                                        <stop offset="100%" stopColor="var(--secondary)" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>

                                            <div className="text-6xl font-mono font-black text-text-main drop-shadow-md z-10 tabular-nums tracking-tight">
                                                {formatTime(setsProgress[activeSetModal.exerciseIndex]?.[activeSetModal.setIndex]?.time || 0)}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-center gap-6 mt-12 w-full">
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
                                                    className="w-16 h-16 rounded-2xl bg-primary/10 text-primary border border-primary/30 flex items-center justify-center hover:bg-primary/20 transition-all active:scale-95"
                                                >
                                                    <Play size={28} fill="currentColor" className="ml-1" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleSetAction(activeSetModal.exerciseIndex, activeSetModal.setIndex, 'pause', 0, activeSetModal.exerciseName)}
                                                    className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center justify-center hover:bg-amber-500/20 transition-all active:scale-95"
                                                >
                                                    <Pause size={28} fill="currentColor" />
                                                </button>
                                            )}

                                            <button
                                                onClick={() => {
                                                    const exercise = todayData.exercises[activeSetModal.exerciseIndex];
                                                    handleSetAction(activeSetModal.exerciseIndex, activeSetModal.setIndex, 'done', exercise.rest_seconds, activeSetModal.exerciseName);
                                                }}
                                                className="w-20 h-20 rounded-2xl bg-proteina text-white flex items-center justify-center hover:bg-proteina/80 transition-all shadow-[0_10px_30px_rgba(var(--proteina-rgb),0.3)] active:scale-95"
                                            >
                                                <Check size={36} strokeWidth={3} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-text-main">{todayData?.name || ''}</h2>
                            <p className="text-text-muted text-sm">{totalCount} exercícios</p>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-xs text-text-muted mb-2">
                            <span>Séries Concluídas</span>
                            <span>{Math.round(progressPct)}%</span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)' }}>
                            <motion.div className="h-full rounded-full" style={{ backgroundColor: 'var(--proteina)' }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.4 }} />
                        </div>
                    </div>

                    <AnimatePresence>
                        {restTimer && !activeSetModal && (
                            <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} className="flex items-center justify-between px-6 py-4 rounded-2xl sticky top-4 z-10 shadow-2xl backdrop-blur-md" style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.15)', border: '1px solid rgba(var(--primary-rgb), 0.3)' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                                        <Timer size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-primary text-xs font-semibold uppercase tracking-widest">Descanso</span>
                                        <span className="text-text-main text-3xl font-mono font-black tabular-nums tracking-tighter" style={{ textShadow: '0 0 10px rgba(var(--primary-rgb),0.3)' }}>{formatTime(restTimer.seconds)}</span>
                                    </div>
                                </div>
                                <button onClick={() => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); setRestTimer(null); }} className="text-xs font-bold uppercase tracking-wider text-text-main bg-primary hover:bg-primary-hover px-4 py-2.5 rounded-xl transition-colors active:scale-95 shadow-lg shadow-primary/20">Pular</button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex flex-col gap-3">
                        {todayData.exercises.map((exercise: Exercise, i: number) => {
                            const done = isExerciseCompleted(i);
                            const expanded = expandedIndex === i || (expandedIndex === null && !done && i === todayData.exercises.findIndex((_, idx) => !isExerciseCompleted(idx)));
                            const sets = setsProgress[i] || [];

                            return (
                                <motion.div key={i} layout className="rounded-2xl overflow-hidden transition-all duration-300 relative group" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid ${done ? 'rgba(var(--proteina-rgb),0.4)' : expanded ? 'rgba(var(--primary-rgb),0.4)' : 'rgba(var(--text-main-rgb),0.06)'}`, boxShadow: expanded ? '0 10px 25px -5px rgba(0, 0, 0, 0.5)' : 'none' }}>
                                    <div className="flex items-center gap-3 p-4 cursor-pointer relative z-10" onClick={() => setExpandedIndex(expanded ? null : i)}>
                                        <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(var(--primary-rgb),0.18), rgba(var(--primary-rgb),0.06))', border: '1px solid rgba(var(--primary-rgb),0.15)' }}>
                                            <Dumbbell size={22} className="text-primary opacity-80" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-semibold text-sm truncate ${done ? 'text-proteina' : 'text-text-main'}`}>{exercise.name}</p>
                                            <p className="text-text-muted text-xs mt-0.5">{exercise.sets} séries × {exercise.reps} · {exercise.rest_seconds}s desc.</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {!done && !sessionDone && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setQuickFinishModal({
                                                            exerciseIndex: i,
                                                            exerciseName: exercise.name,
                                                            type: (exercise.name.toLowerCase().includes('cardio') || exercise.name.toLowerCase().includes('corrida')) ? 'time' : 'weight',
                                                            step: 'question'
                                                        });
                                                        setQuickFinishWeight('');
                                                    }}
                                                    className="px-3 py-1.5 rounded-xl bg-proteina/10 text-proteina border border-proteina/20 hover:bg-proteina/20 transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                                                >
                                                    <CheckCheck size={14} />
                                                    Finalizar
                                                </button>
                                            )}
                                            {done && <div className="w-6 h-6 flex items-center justify-center rounded-full bg-proteina/20 text-proteina"><Check size={14} /></div>}
                                            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-main border" style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.05)', borderColor: 'var(--border-main)' }}>
                                                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                    <AnimatePresence>
                                        {expanded && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                <div className="px-4 pb-4 flex flex-col gap-4 border-t" style={{ borderColor: 'var(--border-main)' }}>
                                                    <div className="mt-4 flex flex-col gap-2">
                                                        {sets.map((setInfo, setIdx) => (
                                                            <div key={setIdx} className={`flex flex-col gap-2 py-3 px-3 rounded-xl transition-colors ${setInfo.status === 'done' ? 'bg-proteina/10 border-proteina/30' : 'bg-card border-card-rgb/10'} border`}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 text-center text-xs font-bold text-text-muted">S{setIdx + 1}</div>

                                                                    {setInfo.showWeightInput || setInfo.weight ? (
                                                                        <div className="flex items-center gap-1">
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Kg"
                                                                                value={setInfo.weight}
                                                                                onChange={(e) => handleWeightChange(i, setIdx, e.target.value)}
                                                                                onBlur={() => { if (!setInfo.weight) toggleWeightInput(i, setIdx, false); }}
                                                                                disabled={setInfo.status === 'done'}
                                                                                className="w-16 rounded-lg px-2 py-1 text-sm text-center text-text-main placeholder-text-muted/40 focus:outline-none focus:border-primary disabled:opacity-50 border"
                                                                                style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.1)', borderColor: 'var(--border-main)' }}
                                                                            />
                                                                            {setInfo.status !== 'done' && (
                                                                                <div className="flex gap-1 ml-1">
                                                                                    <button onClick={() => saveWeight(i, setIdx, exercise.exercise_id)} title="Salvar Peso" className="p-1.5 rounded-lg text-text-muted hover:text-primary transition-colors hover:opacity-80">
                                                                                        <Save size={14} />
                                                                                    </button>
                                                                                    {setIdx < sets.length - 1 && (
                                                                                        <button onClick={() => saveAndReplicateWeight(i, setIdx, exercise.exercise_id)} title="Salvar e Replicar para as próximas" className="p-1.5 rounded-lg text-text-muted hover:text-primary transition-colors hover:opacity-80">
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
                                                                            className="text-xs px-2 py-1.5 rounded border text-text-muted hover:text-text-main transition text-center disabled:opacity-50"
                                                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)', borderColor: 'var(--border-main)' }}
                                                                        >
                                                                            Configurar Peso KG
                                                                        </button>
                                                                    )}

                                                                    <div className="flex-1"></div>

                                                                    <div className="text-center text-xs font-mono text-text-muted mr-2">
                                                                        {setInfo.status === 'done' ? formatTime(setInfo.time) : ''}
                                                                    </div>

                                                                    <div className="flex items-center gap-2">
                                                                        {setInfo.status !== 'done' ? (
                                                                            <button onClick={() => handleSetAction(i, setIdx, 'start', exercise.rest_seconds, exercise.name)} className="px-4 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 font-semibold text-sm flex items-center gap-1.5 transition-colors border border-primary/20">
                                                                                <Play size={14} fill="currentColor" />
                                                                                Iniciar
                                                                            </button>
                                                                        ) : (
                                                                            <div className="px-2 text-proteina flex items-center gap-1">
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
                                                        <p className="text-xs text-text-muted font-semibold uppercase tracking-wide mb-1 flex items-center gap-1"><Activity size={12} className="text-primary" />Como executar</p>
                                                        <p className="text-text-muted/90">{exercise.instructions}</p>
                                                        {exercise.recommended_weight && (
                                                            <div className="mt-3 p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center gap-2 text-sm font-medium">
                                                                <Target size={16} />
                                                                <span>Sugestão da IA: {exercise.recommended_weight}</span>
                                                            </div>
                                                        )}
                                                        {exercise.tips && <p className="text-primary/80 text-xs mt-3 italic p-2 bg-primary/5 rounded-lg border border-primary/10">💡 Dica: {exercise.tips}</p>}
                                                    </div>

                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>

                    {!sessionDone && (
                        <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleFinishWorkout} disabled={saving} className="w-full py-4 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2 mb-8 mt-4" style={{ background: getCompletedCount() === totalCount ? 'linear-gradient(135deg, var(--proteina), #059669)' : 'linear-gradient(135deg, var(--primary), var(--secondary))', opacity: saving ? 0.7 : 1 }}>
                            {saving ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : <><Trophy size={18} /> {getCompletedCount() === totalCount ? 'Treino Concluído! 🎉' : `Finalizar (${getCompletedCount()}/${totalCount})`}</>}
                        </motion.button>
                    )}
                </>
            )}

            {/* Config Regenerate Modal */}
            <AnimatePresence>
                {showConfig && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(var(--bg-main-rgb), 0.8)', backdropFilter: 'blur(4px)' }}>
                        <motion.div initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }} className="bg-dark border p-6 rounded-3xl w-full max-w-sm flex flex-col gap-6 -mb-6 sm:mb-0 pb-12 sm:pb-6" style={{ borderColor: 'var(--border-main)' }}>
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-text-main tracking-tight">Regerar Dia</h3>
                                <button onClick={() => setShowConfig(false)} disabled={isGenerating} className="text-text-muted hover:text-text-main transition-colors p-2 -mr-2">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-5">
                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider">Local do Treino</label>
                                    <select value={regenLoc} onChange={(e) => setRegenLoc(e.target.value)} disabled={isGenerating} className="form-select w-full bg-card border border-white/10 text-text-main rounded-xl focus:border-primary h-12 px-4 shadow-inner appearance-none">
                                        <option value="gym">Academia (Máquinas e Pesos Livres)</option>
                                        <option value="home">Casa (Sem Equipamentos)</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider text-center">Tempo Disponível</label>
                                    <div className="text-center font-bold text-4xl text-primary my-2">{regenMin} <span className="text-sm font-semibold uppercase">min</span></div>
                                    <input type="range" min="15" max="120" step="5" value={regenMin} onChange={(e) => setRegenMin(Number(e.target.value))} disabled={isGenerating} className="w-full accent-primary h-2 rounded-lg appearance-none cursor-pointer" style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.1)' }} />
                                    <div className="flex justify-between text-xs text-text-muted font-medium px-1"><span>15m</span><span>Curto</span><span>120m</span></div>
                                </div>
                            </div>

                            <button onClick={handleRebuildDay} disabled={isGenerating} className="w-full mt-2 h-14 rounded-xl bg-accent hover:opacity-80 disabled:opacity-50 font-bold text-white transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2">
                                {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Recalculando Inteligência...</> : 'Confirmar Novo Treino'}
                            </button>
                        </motion.div>
                    </div>
                )}

                {showWeekConfig && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(var(--bg-main-rgb), 0.8)', backdropFilter: 'blur(4px)' }}>
                        <motion.div initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }} className="bg-dark border p-6 rounded-3xl w-full max-w-sm flex flex-col gap-5 -mb-6 sm:mb-0 pb-12 sm:pb-6" style={{ borderColor: 'var(--border-main)' }}>
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-text-main tracking-tight flex items-center gap-2"><CalendarClock size={20} className="text-primary" /> Reajustar Semana</h3>
                                <button onClick={() => setShowWeekConfig(false)} disabled={isRebuildingWeek} className="text-text-muted hover:text-text-main p-2 -mr-2">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-4 overflow-y-auto max-h-[60vh] custom-scrollbar px-1 pb-2">
                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider">Dias da Semana</label>
                                    <div className="flex gap-1.5 justify-between">
                                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => {
                                            const realIdx = i === 0 ? 6 : i - 1; // Map D to 6, S to 0...
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => { const n = [...weekDaysActive]; n[realIdx] = !n[realIdx]; setWeekDaysActive(n); }}
                                                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${weekDaysActive[realIdx] ? 'bg-primary text-white shadow-lg' : 'text-text-muted hover:opacity-80 border'}`}
                                                    style={{ backgroundColor: weekDaysActive[realIdx] ? 'var(--primary)' : 'rgba(var(--text-main-rgb), 0.05)', borderColor: 'var(--border-main)' }}
                                                >
                                                    {day}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider">Local Base</label>
                                    <select value={regenWeekLoc} onChange={(e) => setRegenWeekLoc(e.target.value)} disabled={isRebuildingWeek} className="form-select w-full bg-card border border-white/10 text-text-main rounded-xl focus:border-primary h-10 px-4">
                                        <option value="gym">Academia (Máquinas e Pesos Livres)</option>
                                        <option value="home">Casa (Sem Equipamentos)</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider">Tempo por dia: <span className="text-primary">{regenWeekMin} min</span></label>
                                    <input type="range" min="15" max="120" step="5" value={regenWeekMin} onChange={(e) => setRegenWeekMin(Number(e.target.value))} disabled={isRebuildingWeek} className="w-full accent-primary" />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"><Bell size={14} /> Lembrete Diário</label>
                                    <input type="time" value={remindTime} onChange={(e) => setRemindTime(e.target.value)} disabled={isRebuildingWeek} className="form-input bg-card border border-white/10 text-text-main rounded-xl h-10 px-4 w-full" />
                                    <p className="text-[10px] text-text-muted opacity-50">Notificaremos você 30 minutos antes desse horário.</p>
                                </div>
                            </div>

                            <button onClick={handleRebuildWeek} disabled={isRebuildingWeek} className="w-full mt-2 h-14 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2">
                                {isRebuildingWeek ? <><Loader2 size={18} className="animate-spin" /> Gerando 7 dias...</> : 'Salvar e Gerar Programação'}
                            </button>
                        </motion.div>
                    </div>
                )}

                {showCalendar && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(var(--bg-main-rgb), 0.8)', backdropFilter: 'blur(4px)' }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card border p-6 rounded-3xl w-full max-w-sm flex flex-col gap-6 text-center shadow-2xl" style={{ borderColor: 'var(--border-main)' }}>
                            <div className="w-16 h-16 rounded-full border mx-auto flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)', borderColor: 'var(--border-main)' }}>
                                <CalendarClock size={32} className="text-primary" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-text-main mb-2">Histórico de Semanas</h3>
                                <p className="text-sm text-text-muted">Em uma futura atualização, você poderá voltar no tempo e consultar os detalhes antigos, evoluções de carga e treinos passados registrados em seu histórico.</p>
                            </div>
                            <button onClick={() => setShowCalendar(false)} className="w-full h-12 rounded-xl bg-white/5 hover:bg-white/10 text-text-main font-semibold transition-colors mt-2">
                                Voltar aos Treinos Atuais
                            </button>
                        </motion.div>
                    </div>
                )}

                {quickFinishModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(var(--bg-main-rgb), 0.8)', backdropFilter: 'blur(8px)' }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card border p-7 rounded-[32px] w-full max-w-sm flex flex-col gap-6 shadow-2xl relative overflow-hidden" style={{ borderColor: 'var(--border-main)' }}>
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-proteina/50 via-proteina/80 to-proteina/50" />
                            <button onClick={() => setQuickFinishModal(null)} className="absolute top-4 right-4 text-text-muted hover:text-text-main transition-colors"><X size={20} /></button>

                            <div className="flex flex-col items-center text-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-proteina/10 border border-proteina/20 flex items-center justify-center">
                                    <CheckCheck size={32} className="text-proteina" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-text-main leading-tight">Finalizar Exercício</h3>
                                    <p className="text-text-muted text-sm mt-1">{quickFinishModal.exerciseName}</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-5">
                                {quickFinishModal.step === 'question' ? (
                                    <>
                                        <p className="text-lg font-medium text-text-main text-center px-2">
                                            {quickFinishModal.type === 'time'
                                                ? "Quanto tempo você levou?"
                                                : "Você usou pesos nesse exercício?"}
                                        </p>

                                        <div className="flex flex-col gap-3">
                                            <button
                                                onClick={() => {
                                                    if (quickFinishModal.type === 'time') {
                                                        setQuickFinishModal(prev => prev ? { ...prev, step: 'input' } : null);
                                                    } else {
                                                        handleConfirmQuickFinish('0');
                                                    }
                                                }}
                                                className="w-full h-14 rounded-2xl border text-white font-bold transition-all flex items-center justify-center gap-2"
                                                style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)', borderColor: 'var(--border-main)' }}
                                            >
                                                {quickFinishModal.type === 'time' ? 'Inserir Tempo' : 'Não usei pesos'}
                                            </button>

                                            {quickFinishModal.type !== 'time' && (
                                                <button
                                                    onClick={() => setQuickFinishModal(prev => prev ? { ...prev, step: 'input' } : null)}
                                                    className="w-full h-14 rounded-2xl bg-proteina hover:opacity-80 text-white font-bold transition-all shadow-lg shadow-proteina/20 flex items-center justify-center gap-2"
                                                >
                                                    Sim, eu usei!
                                                </button>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex flex-col gap-3">
                                            <label className="text-xs font-bold text-text-muted uppercase tracking-widest text-center">
                                                {quickFinishModal.type === 'time' ? 'Tempo total (minutos)' : 'Carga utilizada (kg)'}
                                            </label>
                                            <div className="relative">
                                                <input
                                                    autoFocus
                                                    type="number"
                                                    placeholder={quickFinishModal.type === 'time' ? 'Ex: 20' : 'Ex: 45'}
                                                    value={quickFinishWeight}
                                                    onChange={(e) => setQuickFinishWeight(e.target.value)}
                                                    className="w-full h-16 border rounded-2xl px-6 text-2xl font-bold text-text-main placeholder-text-muted/30 focus:outline-none focus:border-proteina transition-all text-center"
                                                    style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.1)', borderColor: 'var(--border-main)' }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && quickFinishWeight) {
                                                            handleConfirmQuickFinish(quickFinishWeight);
                                                        }
                                                    }}
                                                />
                                                <div className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-text-muted/60">
                                                    {quickFinishModal.type === 'time' ? 'min' : 'kg'}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                if (quickFinishWeight) handleConfirmQuickFinish(quickFinishWeight);
                                            }}
                                            className="w-full h-14 rounded-2xl bg-proteina hover:opacity-80 text-white font-bold text-base transition-all shadow-lg flex items-center justify-center gap-2"
                                        >
                                            Salvar e Concluir
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
