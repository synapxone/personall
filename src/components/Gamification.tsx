import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Flame, Dumbbell, UtensilsCrossed, Gift, Lock, CheckCircle, TrendingUp, Settings2, X, Loader2, Save } from 'lucide-react';
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
        if (diff === 0) {
            setDisplay(value);
            return;
        }
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

    // History & Config States
    const [history, setHistory] = useState<any[]>([]);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [editCalGoal, setEditCalGoal] = useState(profile.daily_calorie_goal || 2000);
    const [editWeight, setEditWeight] = useState(profile.weight || 70);
    const [savingConfig, setSavingConfig] = useState(false);

    useEffect(() => {
        if (profile) {
            fetchHistory();
        }
    }, [profile]);

    async function fetchHistory() {
        // Fetch last 7 days of daily nutrition
        const { data, error } = await supabase
            .from('daily_nutrition')
            .select('date, total_calories, goal_calories')
            .eq('user_id', profile.id)
            .order('date', { ascending: false })
            .limit(7);

        if (!error && data) {
            setHistory(data.reverse()); // oldest to newest
        }
    }

    async function saveGoals() {
        setSavingConfig(true);
        const { error } = await supabase.from('profiles').update({
            daily_calorie_goal: editCalGoal,
            weight: editWeight,
        }).eq('id', profile.id);

        setSavingConfig(false);
        if (error) {
            toast.error('Erro ao atualizar metas.');
        } else {
            toast.success('Metas atualizadas com sucesso!');
            setShowConfigModal(false);
            onUpdate(); // Triggers app-wide refresh
        }
    }

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
        <div className="flex flex-col px-4 py-5 gap-6 max-w-lg mx-auto pb-24">

            {/* Header / Config row */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-white font-bold text-xl tracking-tight">Sua Evolução</h2>
                    <p className="text-gray-400 text-xs">Acompanhe seu progresso e metas</p>
                </div>
                <button
                    onClick={() => setShowConfigModal(true)}
                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shadow-sm"
                >
                    <Settings2 size={20} />
                </button>
            </div>

            {/* Premium Chart & Macro Stats */}
            <div className="relative overflow-hidden rounded-[24px] p-5 bg-gradient-to-br from-[#1A1A2E] to-[#12121A] border border-white/5 shadow-2xl flex flex-col gap-5">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/10 blur-[50px] rounded-full pointer-events-none" />

                <div className="flex justify-between items-center relative z-10">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <TrendingUp size={16} className="text-indigo-400" />
                        Histórico de Calorias da Semana
                    </h3>
                </div>

                {history.length > 0 ? (
                    <div className="flex items-end justify-between h-32 gap-2 relative z-10 custom-scrollbar overflow-x-auto pb-2">
                        {history.map((day, idx) => {
                            const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
                            const goal = day.goal_calories || profile.daily_calorie_goal;
                            const pct = Math.min((day.total_calories / goal) * 100, 100);
                            const isOver = day.total_calories > goal;

                            return (
                                <div key={idx} className="flex flex-col items-center justify-end h-full gap-2 min-w-[30px] flex-1">
                                    <div className="text-[9px] text-gray-500 font-bold">{day.total_calories}</div>
                                    <div className="w-full flex justify-center h-[70px] bg-black/40 rounded-t-md relative overflow-hidden group">
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${pct}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                            className={`absolute bottom-0 w-full rounded-t-md ${isOver ? 'bg-orange-500' : 'bg-indigo-500'}`}
                                        />
                                        {/* Goal line tick */}
                                        <div className="absolute top-[30%] w-full border-t border-dashed border-white/30" />
                                    </div>
                                    <div className="text-[10px] uppercase text-gray-400 font-semibold">{dateLabel.replace('.', '')}</div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-32 flex items-center justify-center text-gray-500 text-sm italic z-10 relative">
                        Registre refeições para ver o gráfico.
                    </div>
                )}
            </div>

            {/* Level & XP */}
            <div className="rounded-2xl p-6 flex flex-col gap-5 bg-white/[0.02] border backdrop-blur-sm shadow-xl" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-widest">Nível Atual</p>
                        <motion.p
                            key={level}
                            initial={{ scale: 1.3, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-4xl font-bold mt-1 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400"
                        >
                            {level}
                        </motion.p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-widest">Pontos Totais</p>
                        <p className="text-2xl font-bold text-white mt-1">
                            <AnimatedCounter value={points} />
                        </p>
                    </div>
                </div>
                {/* XP bar */}
                <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-2 font-medium">
                        <span>XP Progress</span>
                        <span className="text-indigo-300">{points % xpForThis} / {xpForThis}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-black/40">
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400"
                            animate={{ width: `${xpProgress}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                    </div>
                    <p className="text-gray-500 text-[11px] mt-2 font-medium text-right">*{xpForThis - (points % xpForThis)} XP para o nível {level + 1}</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
                <StatBubble icon={<Flame size={18} className="text-red-400" />} label="Sequência" value={`${streak_days}d`} />
                <StatBubble icon={<Dumbbell size={18} className="text-indigo-400" />} label="Treinos" value={String(total_workouts)} />
                <StatBubble icon={<UtensilsCrossed size={18} className="text-emerald-400" />} label="Refeições" value={String(total_meals_logged)} />
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
                <h3 className="text-white font-bold flex items-center gap-2 text-sm">
                    <Star size={16} className="text-indigo-400" />
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
                            className={`flex flex-col gap-3 px-4 py-4 rounded-2xl bg-white/[0.02] border transition-colors ${alreadyOwned ? 'opacity-60 grayscale-[0.5]' : ''}`}
                            style={{
                                borderColor: canAfford ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.05)'
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-3xl bg-white/5 w-12 h-12 flex justify-center items-center rounded-xl">{reward.emoji}</span>
                                <div className="flex-1">
                                    <p className="text-white font-medium text-sm">{reward.name}</p>
                                    <p className="text-gray-400 text-xs mt-0.5">{reward.description}</p>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md">
                                    <Star size={12} />
                                    {reward.cost.toLocaleString('pt-BR')}
                                </div>
                            </div>

                            {!canAfford && (
                                <div>
                                    <div className="h-1 rounded-full overflow-hidden mb-1.5 bg-black/40">
                                        <motion.div
                                            className="h-full rounded-full bg-indigo-500"
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 0.6 }}
                                        />
                                    </div>
                                    <p className="text-gray-500 text-[10px] uppercase font-medium mt-1">{reward.cost - points} pontos faltando</p>
                                </div>
                            )}

                            {alreadyOwned ? (
                                <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                                    <CheckCircle size={14} />
                                    Resgatado Ativo
                                </div>
                            ) : canAfford ? (
                                <button
                                    onClick={() => handleRedeem(reward)}
                                    disabled={loading === reward.id}
                                    className="w-full py-2.5 rounded-xl font-semibold text-white text-sm bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-500/20"
                                    style={{ opacity: loading === reward.id ? 0.7 : 1 }}
                                >
                                    {loading === reward.id ? 'Resgatando...' : 'Resgatar Prêmio'}
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mt-1">
                                    <Lock size={12} />
                                    Bloqueado
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

            {/* Edit Goals Modal */}
            <AnimatePresence>
                {showConfigModal && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ y: 200, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 200, opacity: 0 }}
                            className="bg-[#111116] border border-white/10 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-6 -mb-6 sm:mb-0 pb-12 sm:pb-6"
                        >
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                    <Settings2 size={20} className="text-indigo-400" /> Metas
                                </h3>
                                <button onClick={() => setShowConfigModal(false)} disabled={savingConfig} className="text-gray-500 hover:text-white p-2 -mr-2">
                                    <X size={20} />
                                </button>
                            </div>

                            <p className="text-gray-400 text-sm leading-relaxed">Ajuste manualmente os seus objetivos. Isso atualizará todo o seu perfil e gráficos.</p>

                            <div className="flex flex-col gap-5">
                                <div className="flex flex-col gap-2">
                                    <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Meta Diária (Kcal)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editCalGoal}
                                            onChange={e => setEditCalGoal(Number(e.target.value))}
                                            disabled={savingConfig}
                                            className="form-input w-full bg-white/5 border border-white/10 text-white rounded-xl h-12 px-4 focus:border-indigo-500 outline-none"
                                        />
                                        <Flame size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-400" />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Peso Atual (Kg)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editWeight}
                                            onChange={e => setEditWeight(Number(e.target.value))}
                                            disabled={savingConfig}
                                            className="form-input w-full bg-white/5 border border-white/10 text-white rounded-xl h-12 px-4 focus:border-indigo-500 outline-none"
                                        />
                                        <Dumbbell size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400" />
                                    </div>
                                    <p className="text-[10px] text-gray-500">Isso ajustará automaticamente sua meta de hidratação (35ml x kg).</p>
                                </div>
                            </div>

                            <button
                                onClick={saveGoals}
                                disabled={savingConfig}
                                className="w-full h-14 mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                {savingConfig ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : <><Save size={18} /> Salvar Alterações</>}
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function StatBubble({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex flex-col items-center gap-1.5 py-4 rounded-xl bg-white/[0.02] border border-white/5 backdrop-blur-sm shadow-sm transition-transform hover:bg-white/[0.04]">
            <div className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/5 rounded-full mb-1">
                {icon}
            </div>
            <p className="text-white font-semibold text-base">{value}</p>
            <p className="text-gray-500 text-[10px] uppercase tracking-wider font-medium">{label}</p>
        </div>
    );
}
