import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Flame, Dumbbell, UtensilsCrossed, Gift, Lock, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { REWARDS_CATALOG, xpForLevel } from '../types';
import type { Gamification as GamificationType, Profile, Reward } from '../types';

interface Props {
    gamification: GamificationType | null;
    profile: Profile;
    onUpdate: () => void;
}

function AnimatedCounter({ value }: { value: number }) {
    const [display, setDisplay] = useState(0);
    const prevRef = useRef(0);

    useEffect(() => {
        const start = prevRef.current;
        const end = value;
        const diff = end - start;
        if (diff === 0) return;
        const duration = 600;
        const startTime = performance.now();
        function frame(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(start + diff * ease));
            if (progress < 1) requestAnimationFrame(frame);
            else prevRef.current = end;
        }
        requestAnimationFrame(frame);
    }, [value]);

    return <span>{display.toLocaleString('pt-BR')}</span>;
}

export default function GamificationView({ gamification, profile, onUpdate }: Props) {
    const [celebrating, setCelebrating] = useState<string | null>(null);
    const [loading, setLoading] = useState<string | null>(null);

    if (!gamification) {
        return (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4">
                <span className="text-5xl">⭐</span>
                <p className="text-white font-bold text-lg">Sem dados de gamificação</p>
                <p className="text-gray-400 text-sm">Complete um treino ou registre uma refeição para começar a ganhar pontos!</p>
            </div>
        );
    }

    const { points, level, streak_days, total_workouts, total_meals_logged, rewards_available, rewards_earned } = gamification;
    const xpForThis = xpForLevel(level);
    const xpProgress = Math.min((points % xpForThis) / xpForThis, 1) * 100;

    async function handleRedeem(reward: Reward) {
        if (points < reward.cost) {
            toast.error(`Você precisa de ${reward.cost - points} pontos a mais para resgatar este prêmio.`);
            return;
        }
        setLoading(reward.id);
        const newPoints = points - reward.cost;
        const newAvailable = [...rewards_available, { ...reward, earned_at: new Date().toISOString() }];

        const { error } = await supabase.from('gamification').update({
            points: newPoints,
            rewards_available: newAvailable,
        }).eq('user_id', profile.id);

        if (error) {
            toast.error('Erro ao resgatar prêmio.');
        } else {
            toast.success(`Prêmio "${reward.name}" resgatado!`);
            onUpdate();
        }
        setLoading(null);
    }

    async function handleUseReward(reward: Reward) {
        setLoading(reward.id);
        setCelebrating(reward.id);
        const newAvailable = rewards_available.filter((r) => r.id !== reward.id || r.earned_at !== reward.earned_at);
        const newEarned = [...rewards_earned, { ...reward, used_at: new Date().toISOString() }];

        await supabase.from('gamification').update({
            rewards_available: newAvailable,
            rewards_earned: newEarned,
        }).eq('user_id', profile.id);

        setTimeout(() => {
            setCelebrating(null);
            onUpdate();
        }, 2000);
        setLoading(null);
    }

    return (
        <div className="flex flex-col px-4 py-5 gap-5 max-w-lg mx-auto">
            {/* Level & XP */}
            <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(124,58,237,0.2)' }}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Nível Atual</p>
                        <motion.p
                            key={level}
                            initial={{ scale: 1.3, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-5xl font-extrabold mt-1"
                            style={{ color: '#7C3AED' }}
                        >
                            {level}
                        </motion.p>
                    </div>
                    <div className="text-right">
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Pontos Totais</p>
                        <p className="text-3xl font-extrabold text-white mt-1">
                            <AnimatedCounter value={points} />
                        </p>
                    </div>
                </div>
                {/* XP bar */}
                <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>XP</span>
                        <span>{points % xpForThis} / {xpForThis}</span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                        <motion.div
                            className="h-full rounded-full"
                            style={{ background: 'linear-gradient(90deg, #7C3AED, #a78bfa)' }}
                            animate={{ width: `${xpProgress}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                    </div>
                    <p className="text-gray-500 text-xs mt-1">Faltam {xpForThis - (points % xpForThis)} XP para o nível {level + 1}</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
                <StatBubble icon={<Flame size={20} style={{ color: '#EF4444' }} />} label="Sequência" value={`${streak_days}d`} />
                <StatBubble icon={<Dumbbell size={20} style={{ color: '#7C3AED' }} />} label="Treinos" value={String(total_workouts)} />
                <StatBubble icon={<UtensilsCrossed size={20} style={{ color: '#10B981' }} />} label="Refeições" value={String(total_meals_logged)} />
            </div>

            {/* Rewards available */}
            {rewards_available.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h3 className="text-white font-bold flex items-center gap-2">
                        <Gift size={18} style={{ color: '#F59E0B' }} />
                        Prêmios Disponíveis
                    </h3>
                    {rewards_available.map((reward, idx) => (
                        <AnimatePresence key={`${reward.id}-${idx}`}>
                            {celebrating === reward.id ? (
                                <motion.div
                                    initial={{ scale: 0.9 }}
                                    animate={{ scale: [1, 1.05, 1] }}
                                    className="flex flex-col items-center gap-2 py-6 rounded-2xl text-center"
                                    style={{ backgroundColor: 'rgba(245,158,11,0.15)', border: '2px solid rgba(245,158,11,0.4)' }}
                                >
                                    <motion.span
                                        animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                                        transition={{ duration: 0.6 }}
                                        className="text-5xl"
                                    >
                                        {reward.emoji}
                                    </motion.span>
                                    <p className="text-white font-bold">Aproveite seu prêmio!</p>
                                    <p className="text-gray-400 text-sm">{reward.description}</p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    layout
                                    className="flex items-center gap-4 px-4 py-4 rounded-2xl"
                                    style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
                                >
                                    <span className="text-3xl">{reward.emoji}</span>
                                    <div className="flex-1">
                                        <p className="text-white font-semibold text-sm">{reward.name}</p>
                                        <p className="text-gray-400 text-xs">{reward.description}</p>
                                    </div>
                                    <button
                                        onClick={() => handleUseReward(reward)}
                                        disabled={loading === reward.id}
                                        className="px-3 py-2 rounded-xl text-xs font-bold"
                                        style={{ backgroundColor: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#F59E0B' }}
                                    >
                                        {loading === reward.id ? '...' : 'Usar'}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    ))}
                </div>
            )}

            {/* Rewards catalog */}
            <div className="flex flex-col gap-3">
                <h3 className="text-white font-bold flex items-center gap-2">
                    <Star size={18} style={{ color: '#7C3AED' }} />
                    Catálogo de Prêmios
                </h3>
                {REWARDS_CATALOG.map((reward) => {
                    const canAfford = points >= reward.cost;
                    const progress = Math.min((points / reward.cost) * 100, 100);
                    const alreadyOwned = rewards_available.some((r) => r.id === reward.id) || rewards_earned.some((r) => r.id === reward.id);

                    return (
                        <motion.div
                            key={reward.id}
                            layout
                            className="flex flex-col gap-3 px-4 py-4 rounded-2xl"
                            style={{
                                backgroundColor: '#1A1A2E',
                                border: `1px solid ${canAfford ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                opacity: alreadyOwned ? 0.6 : 1,
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-3xl">{reward.emoji}</span>
                                <div className="flex-1">
                                    <p className="text-white font-semibold text-sm">{reward.name}</p>
                                    <p className="text-gray-400 text-xs">{reward.description}</p>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-bold" style={{ color: '#F59E0B' }}>
                                    <Star size={12} />
                                    {reward.cost.toLocaleString('pt-BR')}
                                </div>
                            </div>

                            {!canAfford && (
                                <div>
                                    <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: '#7C3AED' }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 0.6 }}
                                        />
                                    </div>
                                    <p className="text-gray-500 text-xs">{reward.cost - points} pontos faltando</p>
                                </div>
                            )}

                            {alreadyOwned ? (
                                <div className="flex items-center gap-1 text-xs" style={{ color: '#10B981' }}>
                                    <CheckCircle size={14} />
                                    Já resgatado
                                </div>
                            ) : canAfford ? (
                                <button
                                    onClick={() => handleRedeem(reward)}
                                    disabled={loading === reward.id}
                                    className="w-full py-2.5 rounded-xl font-bold text-white text-sm"
                                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)', opacity: loading === reward.id ? 0.7 : 1 }}
                                >
                                    {loading === reward.id ? 'Resgatando...' : 'Resgatar Prêmio'}
                                </button>
                            ) : (
                                <div className="flex items-center gap-1 text-xs text-gray-600">
                                    <Lock size={12} />
                                    Acumule mais pontos para desbloquear
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* Earned rewards history */}
            {rewards_earned.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h3 className="text-white font-bold text-sm text-gray-400 flex items-center gap-2">
                        <CheckCircle size={16} style={{ color: '#10B981' }} />
                        Prêmios Utilizados
                    </h3>
                    {rewards_earned.map((reward, idx) => (
                        <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-xl opacity-50"
                            style={{ backgroundColor: '#1A1A2E' }}>
                            <span className="text-2xl">{reward.emoji}</span>
                            <div>
                                <p className="text-white text-sm">{reward.name}</p>
                                {reward.used_at && (
                                    <p className="text-gray-500 text-xs">
                                        Usado em {new Date(reward.used_at).toLocaleDateString('pt-BR')}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatBubble({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex flex-col items-center gap-2 py-4 rounded-2xl" style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.06)' }}>
            {icon}
            <p className="text-white font-bold text-lg">{value}</p>
            <p className="text-gray-500 text-xs">{label}</p>
        </div>
    );
}
