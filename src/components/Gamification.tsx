import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Flame, Dumbbell, UtensilsCrossed, Gift, Lock, CheckCircle, TrendingUp, Settings2, X, Loader2, Save, Camera, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { calculateEvolutionXP } from '../lib/xpHelpers';
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

    // Evolution States
    const [showEvoModal, setShowEvoModal] = useState(false);
    const [evoWeight, setEvoWeight] = useState(profile.weight || 70);
    const [evoSaving, setEvoSaving] = useState(false);

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
                <p className="text-text-main font-bold text-lg">Sem dados de gamificação</p>
                <p className="text-text-muted text-sm">Complete um treino ou registre uma refeição para começar a ganhar pontos!</p>
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

    async function handleEvolution() {
        setEvoSaving(true);
        try {
            // Update weight in profile
            await supabase.from('profiles').update({ weight: evoWeight }).eq('id', profile.id);

            // Add a progress entry
            await supabase.from('progress_entries').insert({
                user_id: profile.id,
                date: new Date().toISOString().split('T')[0],
                weight: evoWeight,
            });

            // Reward dynamic points (based on month progress)
            const earnedXP = await calculateEvolutionXP(profile.id);
            const newPoints = points + earnedXP;
            await supabase.from('gamification').update({ points: newPoints }).eq('user_id', profile.id);

            toast.success(`Evolução registrada! Baseada na sua dedicação, você ganhou +${earnedXP} XP!`);
            setShowEvoModal(false);
            onUpdate();
        } catch (e) {
            toast.error('Erro ao registrar evolução.');
        } finally {
            setEvoSaving(false);
        }
    }

    return (
        <div className="flex flex-col px-4 py-5 gap-6 max-w-lg mx-auto pb-24">

            {/* Header / Config row */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-text-main font-bold text-xl tracking-tight">Sua Evolução</h2>
                    <p className="text-text-muted text-xs">Acompanhe seu progresso e metas</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowEvoModal(true)}
                        className="h-10 px-4 rounded-xl bg-primary border border-primary/50 flex items-center justify-center gap-2 text-white font-semibold hover:bg-primary-hover transition-colors shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]"
                    >
                        <Camera size={16} />
                        Avaliação
                    </button>
                    <button
                        onClick={() => setShowConfigModal(true)}
                        className="w-10 h-10 rounded-xl bg-card border flex items-center justify-center text-text-muted hover:text-text-main transition-colors shadow-sm"
                        style={{ borderColor: 'var(--border-main)' }}
                    >
                        <Settings2 size={20} />
                    </button>
                </div>
            </div>

            {/* Premium Chart & Macro Stats */}
            <div className="relative overflow-hidden rounded-[24px] p-5 bg-card border shadow-2xl flex flex-col gap-5" style={{ borderColor: 'var(--border-main)' }}>
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 blur-[50px] rounded-full pointer-events-none" />

                <div className="flex justify-between items-center relative z-10">
                    <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                        <TrendingUp size={16} className="text-primary" />
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
                                    <div className="text-[9px] text-text-muted font-bold">{day.total_calories}</div>
                                    <div className="w-full flex justify-center h-[70px] bg-text-main/5 rounded-t-md relative overflow-hidden group border-x border-t" style={{ borderColor: 'var(--border-main)' }}>
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${pct}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                            className={`absolute bottom-0 w-full rounded-t-md ${isOver ? 'bg-orange-500' : 'bg-primary'}`}
                                        />
                                        {/* Goal line tick */}
                                        <div className="absolute top-[30%] w-full border-t border-dashed border-text-main/10" />
                                    </div>
                                    <div className="text-[10px] uppercase text-text-muted font-semibold">{dateLabel.replace('.', '')}</div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-32 flex items-center justify-center text-text-muted text-sm italic z-10 relative">
                        Registre refeições para ver o gráfico.
                    </div>
                )}
            </div>

            {/* Level & XP */}
            <div className="rounded-2xl p-6 flex flex-col gap-5 bg-card border shadow-xl" style={{ borderColor: 'var(--border-main)' }}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[11px] text-text-muted font-medium uppercase tracking-widest">Nível Atual</p>
                        <motion.p
                            key={level}
                            initial={{ scale: 1.3, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-4xl font-bold mt-1 bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400"
                        >
                            {level}
                        </motion.p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] text-text-muted font-medium uppercase tracking-widest">Pontos Totais</p>
                        <p className="text-2xl font-bold text-text-main mt-1">
                            <AnimatedCounter value={points} />
                        </p>
                    </div>
                </div>
                {/* XP bar */}
                <div>
                    <div className="flex justify-between text-xs text-text-muted mb-2 font-medium">
                        <span>Progresso de XP</span>
                        <span className="text-primary">{points % xpForThis} / {xpForThis}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-text-main/5 border" style={{ borderColor: 'var(--border-main)' }}>
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                            animate={{ width: `${xpProgress}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                    </div>
                    <p className="text-text-muted text-[11px] mt-2 font-medium text-right">*{xpForThis - (points % xpForThis)} XP para o nível {level + 1}</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
                <StatBubble icon={<Flame size={18} className="text-orange-400" />} label="Sequência" value={`${streak_days}d`} />
                <StatBubble icon={<Dumbbell size={18} className="text-primary" />} label="Treinos" value={String(total_workouts)} />
                <StatBubble icon={<UtensilsCrossed size={18} className="text-proteina" />} label="Refeições" value={String(total_meals_logged)} />
            </div>

            {/* Rewards available */}
            {rewards_available.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h3 className="text-text-main font-bold flex items-center gap-2">
                        <Gift size={18} className="text-accent" />
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
                                    <p className="text-text-main font-bold">Aproveite seu prêmio!</p>
                                    <p className="text-text-muted text-sm">{reward.description}</p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    layout
                                    className="flex items-center gap-4 px-4 py-4 rounded-2xl achievement-glow"
                                    style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid rgba(var(--accent-rgb), 0.25)' }}
                                >
                                    <span className="text-3xl">{reward.emoji}</span>
                                    <div className="flex-1">
                                        <p className="text-text-main font-semibold text-sm">{reward.name}</p>
                                        <p className="text-text-muted text-xs">{reward.description}</p>
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
                <h3 className="text-text-main font-bold flex items-center gap-2 text-sm">
                    <Star size={16} className="text-primary" />
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
                            className={`flex flex-col gap-3 px-4 py-4 rounded-2xl bg-card border transition-colors ${alreadyOwned ? 'opacity-60 grayscale-[0.5]' : ''}`}
                            style={{
                                borderColor: canAfford ? 'var(--proteina)' : 'var(--border-main)'
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-3xl bg-text-main/5 w-12 h-12 flex justify-center items-center rounded-xl border" style={{ borderColor: 'var(--border-main)' }}>{reward.emoji}</span>
                                <div className="flex-1">
                                    <p className="text-text-main font-medium text-sm">{reward.name}</p>
                                    <p className="text-text-muted text-xs mt-0.5">{reward.description}</p>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md">
                                    <Star size={12} />
                                    {reward.cost.toLocaleString('pt-BR')}
                                </div>
                            </div>

                            {!canAfford && (
                                <div>
                                    <div className="h-1 rounded-full overflow-hidden mb-1.5 bg-text-main/5 border" style={{ borderColor: 'var(--border-main)' }}>
                                        <motion.div
                                            className="h-full rounded-full bg-indigo-500"
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 0.6 }}
                                        />
                                    </div>
                                    <p className="text-text-muted text-[10px] uppercase font-medium mt-1">{reward.cost - points} pontos faltando</p>
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
                        <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-xl opacity-50 bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                            <span className="text-2xl">{reward.emoji}</span>
                            <div>
                                <p className="text-text-main text-sm">{reward.name}</p>
                                {reward.used_at && (
                                    <p className="text-text-muted text-xs">
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
                            className="bg-card border p-6 rounded-3xl w-full max-w-sm flex flex-col gap-6 -mb-6 sm:mb-0 pb-12 sm:pb-6"
                            style={{ borderColor: 'var(--border-main)' }}
                        >
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold text-text-main tracking-tight flex items-center gap-2">
                                    <Settings2 size={20} className="text-primary" /> Metas
                                </h3>
                                <button onClick={() => setShowConfigModal(false)} disabled={savingConfig} className="text-text-muted hover:text-text-main p-2 -mr-2">
                                    <X size={20} />
                                </button>
                            </div>

                            <p className="text-text-muted text-sm leading-relaxed">Ajuste manualmente os seus objetivos. Isso atualizará todo o seu perfil e gráficos.</p>

                            <div className="flex flex-col gap-5">
                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider">Meta Diária (Kcal)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editCalGoal}
                                            onChange={e => setEditCalGoal(Number(e.target.value))}
                                            disabled={savingConfig}
                                            className="form-input w-full rounded-xl h-12 px-4 focus:border-primary outline-none text-text-main border"
                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)', borderColor: 'var(--border-main)' }}
                                        />
                                        <Flame size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-400" />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider">Peso Atual (Kg)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={editWeight}
                                            onChange={e => setEditWeight(Number(e.target.value))}
                                            disabled={savingConfig}
                                            className="form-input w-full rounded-xl h-12 px-4 focus:border-primary outline-none text-text-main border"
                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)', borderColor: 'var(--border-main)' }}
                                        />
                                        <Dumbbell size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-primary" />
                                    </div>
                                    <p className="text-[10px] text-text-muted">Isso ajustará automaticamente sua meta de hidratação (35ml x kg).</p>
                                </div>
                            </div>

                            <button
                                onClick={saveGoals}
                                disabled={savingConfig}
                                className="w-full h-14 mt-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                {savingConfig ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : <><Save size={18} /> Salvar Alterações</>}
                            </button>
                        </motion.div>
                    </div>
                )}

                {/* Evolution Registration Modal */}
                {showEvoModal && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ y: 200, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 200, opacity: 0 }}
                            className="bg-card border border-white/10 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-6 -mb-6 sm:mb-0 pb-12 sm:pb-6 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute -top-20 -right-20 w-40 h-40 bg-indigo-500/20 blur-[60px] rounded-full pointer-events-none" />

                            <div className="flex justify-between items-center relative z-10">
                                <h3 className="text-xl font-bold text-text-main tracking-tight flex items-center gap-2">
                                    <Sparkles size={20} className="text-primary" /> Registrar Evolução
                                </h3>
                                <button onClick={() => setShowEvoModal(false)} disabled={evoSaving} className="text-text-muted hover:text-text-main p-2 -mr-2">
                                    <X size={20} />
                                </button>
                            </div>

                            <p className="text-text-muted text-sm leading-relaxed relative z-10">
                                Tire uma foto do seu corpo e atualize seu peso. Nossa inteligência avaliará seus ganhos e seu histórico de treino para reajustar automaticamente a dificuldade do plano e a sua dieta.
                            </p>

                            <div className="flex flex-col gap-5 relative z-10">
                                <div className="flex flex-col gap-2">
                                    <label className="text-text-muted text-xs font-semibold uppercase tracking-wider">Novo Peso (Kg)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={evoWeight}
                                            onChange={e => setEvoWeight(Number(e.target.value))}
                                            disabled={evoSaving}
                                            className="form-input w-full rounded-xl h-12 px-4 focus:border-primary outline-none text-text-main border"
                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)', borderColor: 'var(--border-main)' }}
                                        />
                                        <TrendingUp size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400" />
                                    </div>
                                </div>

                                <button
                                    onClick={() => document.getElementById('evo-photo-upload')?.click()}
                                    className="w-full h-14 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-center gap-2 text-primary font-semibold text-sm"
                                >
                                    <Camera size={18} />
                                    Adicionar Foto do Corpo
                                </button>
                                <input type="file" id="evo-photo-upload" accept="image/*" className="hidden" />
                            </div>

                            <button
                                onClick={handleEvolution}
                                disabled={evoSaving}
                                className="w-full h-14 mt-2 rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:from-primary-hover hover:to-purple-500 disabled:opacity-50 font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 relative z-10"
                            >
                                {evoSaving ? <><Loader2 size={18} className="animate-spin" /> Analisando Corpo e Treinos...</> : 'Analisar e Ajustar Tudo'}
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
        <div className="flex flex-col items-center gap-1.5 py-4 rounded-xl bg-card border shadow-sm transition-transform hover:bg-card/80" style={{ borderColor: 'var(--border-main)' }}>
            <div className="w-8 h-8 flex items-center justify-center bg-text-main/5 border rounded-full mb-1" style={{ borderColor: 'var(--border-main)' }}>
                {icon}
            </div>
            <p className="text-text-main font-semibold text-base">{value}</p>
            <p className="text-text-muted text-[10px] uppercase tracking-wider font-medium">{label}</p>
        </div>
    );
}
