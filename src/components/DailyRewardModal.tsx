import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Droplets, Dumbbell, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase } from '../lib/supabase';
import type { Profile, Gamification } from '../types';
import { REWARDS_CATALOG } from '../types';

interface Props {
    profile: Profile;
    gamification: Gamification | null;
    onClose: () => void;
}

export default function DailyRewardModal({ profile, gamification, onClose }: Props) {
    const [loading, setLoading] = useState(true);
    const [achievements, setAchievements] = useState<{ calories: boolean; water: boolean; workout: boolean } | null>(null);

    useEffect(() => {
        async function checkYesterday() {
            try {
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                const ymd = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

                // Check Meals (Calories)
                const { data: meals } = await supabase
                    .from('meals')
                    .select('calories')
                    .eq('user_id', profile.id)
                    .eq('meal_date', ymd);

                const totalCalories = meals?.reduce((acc, curr) => acc + (curr.calories || 0), 0) || 0;
                const hitCalories = totalCalories > 0 && totalCalories <= profile.daily_calorie_goal;

                // Check Water
                const { data: waterLog } = await supabase
                    .from('water_logs')
                    .select('cups')
                    .eq('user_id', profile.id)
                    .eq('log_date', ymd)
                    .maybeSingle();

                const cups = waterLog?.cups || 0;
                // profile.weight isn't strictly defined as water goal directly here, but usually it's weight * 35ml
                const goalMl = profile.weight * 35;
                const goalCups = Math.ceil(goalMl / 250);
                const hitWater = cups >= goalCups;

                // Check Workout
                const { data: workouts } = await supabase
                    .from('workout_logs')
                    .select('id')
                    .eq('user_id', profile.id)
                    .eq('completed_date', ymd)
                    .limit(1);

                const hitWorkout = (workouts?.length ?? 0) > 0;

                if (hitCalories || hitWater || hitWorkout) {
                    setAchievements({ calories: hitCalories, water: hitWater, workout: hitWorkout });
                    triggerConfetti();
                } else {
                    onClose(); // No achievements, just generic close silently
                }
            } catch (e) {
                console.error('Error checking yesterday stats', e);
                onClose();
            } finally {
                setLoading(false);
            }
        }

        checkYesterday();
    }, [profile, onClose]);

    function triggerConfetti() {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
        }, 250);
    }

    if (loading) return null;
    if (!achievements) return null;

    // Calculate points earned (Simulated logic based on previous rules or generic)
    let pointsEarned = 0;
    if (achievements.calories) pointsEarned += 20;
    if (achievements.water) pointsEarned += 10;
    if (achievements.workout) pointsEarned += 50;

    // Determine next reward
    const currentPoints = gamification?.points || 0;
    const nextReward = REWARDS_CATALOG.find(r => r.cost > currentPoints) || REWARDS_CATALOG[REWARDS_CATALOG.length - 1];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="bg-card border w-full max-w-sm rounded-[32px] p-6 shadow-2xl relative overflow-hidden flex flex-col items-center flex-start text-center"
                    style={{ borderColor: 'rgba(var(--primary-rgb), 0.3)' }}
                >
                    {/* Glow effect */}
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-indigo-500/20 blur-[60px] rounded-full pointer-events-none" />
                    <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-emerald-500/20 blur-[60px] rounded-full pointer-events-none" />

                    <div className="relative z-10 w-full flex flex-col items-center">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(99,102,241,0.4)]">
                            <Trophy size={40} className="text-white" />
                        </div>

                        <h2 className="text-2xl font-black text-text-main mb-1">Incrível!</h2>
                        <p className="text-text-muted text-sm mb-6">Veja o que você conquistou ontem:</p>

                        <div className="w-full flex flex-col gap-3 mb-6">
                            {achievements.calories && (
                                <div className="flex items-center gap-3 p-3 rounded-2xl border border-orange-500/20 bg-orange-500/5">
                                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                                        <Flame className="text-orange-400" size={20} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="text-text-main font-bold text-sm">Meta Calórica</p>
                                        <p className="text-orange-400/80 text-[10px] font-black uppercase tracking-widest">+20 Pontos</p>
                                    </div>
                                </div>
                            )}
                            {achievements.water && (
                                <div className="flex items-center gap-3 p-3 rounded-2xl border border-blue-500/20 bg-blue-500/5">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                        <Droplets className="text-blue-400" size={20} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="text-text-main font-bold text-sm">Hidratação</p>
                                        <p className="text-blue-400/80 text-[10px] font-black uppercase tracking-widest">+10 Pontos</p>
                                    </div>
                                </div>
                            )}
                            {achievements.workout && (
                                <div className="flex items-center gap-3 p-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <Dumbbell className="text-emerald-400" size={20} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="text-text-main font-bold text-sm">Treino Concluído</p>
                                        <p className="text-emerald-400/80 text-[10px] font-black uppercase tracking-widest">+50 Pontos</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="w-full rounded-2xl border bg-text-main/5 p-4 mb-6" style={{ borderColor: 'var(--border-main)' }}>
                            <p className="text-xs text-text-muted font-medium mb-2 uppercase tracking-wide">Próximo Prêmio</p>
                            <div className="flex items-center gap-3">
                                <span className="text-3xl bg-text-main/5 w-12 h-12 flex justify-center items-center rounded-xl">{nextReward.emoji}</span>
                                <div className="text-left flex-1">
                                    <p className="text-text-main font-bold text-sm">{nextReward.name}</p>
                                    {nextReward.cost > currentPoints ? (
                                        <p className="text-primary text-[11px] font-bold mt-0.5">Faltam {nextReward.cost - currentPoints} pontos!</p>
                                    ) : (
                                        <p className="text-proteina text-[11px] font-bold mt-0.5">Disponível para resgate!</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="w-full py-3.5 rounded-xl font-bold border border-primary/20 bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                        >
                            Continuar
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
