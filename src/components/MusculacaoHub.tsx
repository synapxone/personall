import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, Dumbbell, Sparkles, PenLine, ChevronRight,
    Loader2, Check, MapPin, Clock, X, RotateCcw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { aiService } from '../services/aiService';
import type { Profile, WorkoutPlan, CommunityExercise } from '../types';
import WeeklyPlanView from './WeeklyPlanView';
import ExercisePicker from './ExercisePicker';

// ── Split templates ──
interface SplitTemplate {
    id: string;
    label: string;
    days: number;
    description: string;
    dayNames: string[];
}

const SPLITS: SplitTemplate[] = [
    { id: 'FullBody', label: 'Full Body', days: 3, description: '3× por semana, corpo todo', dayNames: ['Full Body A', 'Full Body B', 'Full Body C'] },
    { id: 'AB', label: 'A/B', days: 2, description: '2× por semana, alternado', dayNames: ['Treino A', 'Treino B'] },
    { id: 'ABC', label: 'A/B/C', days: 3, description: 'Peito/Costas/Pernas', dayNames: ['Peito e Tríceps', 'Costas e Bíceps', 'Pernas e Glúteos'] },
    { id: 'PPL', label: 'Push/Pull/Legs', days: 3, description: 'Push, Pull e Legs', dayNames: ['Push (Empurrar)', 'Pull (Puxar)', 'Pernas'] },
    { id: 'ULUL', label: 'Upper/Lower', days: 4, description: '4× semana, superior/inferior', dayNames: ['Superior A', 'Inferior A', 'Superior B', 'Inferior B'] },
    { id: 'ABCDE', label: 'A/B/C/D/E', days: 5, description: '5× semana, isolado por grupo', dayNames: ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços'] },
];

const WEEK_DAYS_PT = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const WEEK_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MUSCLE_GROUP_OPTIONS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços', 'Abdome'];

type HubView = 'menu' | 'template' | 'custom' | 'ai' | 'plan';

interface Props {
    plan: WorkoutPlan | null;
    profile: Profile;
    onBack: () => void;
    onPlanChange: (plan: WorkoutPlan) => void;
    onComplete: (pts: number) => void;
}

export default function MusculacaoHub({ plan, profile, onBack, onPlanChange, onComplete }: Props) {
    const [view, setView] = useState<HubView>(plan ? 'plan' : 'menu');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Template flow state
    const [selectedSplit, setSelectedSplit] = useState<SplitTemplate | null>(null);
    const [activeDaysBitmask, setActiveDaysBitmask] = useState<boolean[]>(Array(7).fill(false));
    const [location, setLocation] = useState<'gym' | 'home'>(profile.training_location ?? 'gym');

    // Custom flow state
    const [customDays, setCustomDays] = useState<boolean[]>(Array(7).fill(false));
    const [customDayExercises, setCustomDayExercises] = useState<Record<number, CommunityExercise[]>>({});
    const [pickerForDay, setPickerForDay] = useState<number | null>(null);

    // AI flow state
    const [aiSplit, setAiSplit] = useState('PPL');
    const [aiLocation, setAiLocation] = useState<'gym' | 'home'>(profile.training_location ?? 'gym');
    const [aiMinutes, setAiMinutes] = useState(profile.available_minutes ?? 60);
    const [aiMuscleGroups, setAiMuscleGroups] = useState<string[]>([]);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    async function deactivatePreviousPlan() {
        if (plan?.id) {
            await supabase.from('workout_plans').update({ is_active: false }).eq('id', plan.id);
        }
    }

    // ── Template: generate via AI ──
    async function handleGenerateTemplate() {
        if (!selectedSplit) return;
        const activeDayLabels = WEEK_DAYS_PT.filter((_, i) => activeDaysBitmask[i]).slice(0, selectedSplit.days);
        if (activeDayLabels.length < selectedSplit.days) {
            setError(`Selecione exatamente ${selectedSplit.days} dia(s) para este split.`);
            return;
        }
        setLoading(true); setError('');
        try {
            const planData = await aiService.generateWorkoutFromTemplate(profile, selectedSplit.id, activeDayLabels, location);
            await deactivatePreviousPlan();
            const { data: saved } = await supabase.from('workout_plans').insert({
                user_id: profile.id,
                name: planData.name ?? `${selectedSplit.label} — ${profile.name.split(' ')[0]}`,
                description: planData.description,
                estimated_weeks: planData.estimated_weeks ?? 8,
                plan_data: planData,
                is_active: true,
                category: 'musculacao',
                plan_type: 'template',
                split_type: selectedSplit.id,
            }).select().single();
            if (saved) { onPlanChange(saved as WorkoutPlan); setView('plan'); }
        } catch { setError('Erro ao gerar o plano. Tente novamente.'); }
        finally { setLoading(false); }
    }

    // ── Custom: build manually ──
    async function handleSaveCustom() {
        const selectedDayIndices = customDays.map((v, i) => v ? i : -1).filter(i => i >= 0);
        if (selectedDayIndices.length === 0) { setError('Selecione pelo menos um dia de treino.'); return; }

        const days = selectedDayIndices.map((dayIdx) => ({
            day: dayIdx + 1,
            name: WEEK_DAYS_PT[dayIdx],
            type: 'strength' as const,
            exercises: (customDayExercises[dayIdx] ?? []).map(ex => ({
                exercise_id: ex.id,
                name: ex.name,
                sets: 3,
                reps: '8-12',
                rest_seconds: 90,
                instructions: ex.instructions ?? '',
            })),
        }));

        const planData = {
            name: `Treino Personalizado — ${profile.name.split(' ')[0]}`,
            description: 'Treino criado manualmente.',
            estimated_weeks: 8,
            weeks: [{ week: 1, days }],
        };

        setLoading(true); setError('');
        try {
            await deactivatePreviousPlan();
            const { data: saved } = await supabase.from('workout_plans').insert({
                user_id: profile.id,
                name: planData.name,
                description: planData.description,
                estimated_weeks: planData.estimated_weeks,
                plan_data: planData,
                is_active: true,
                category: 'musculacao',
                plan_type: 'custom',
            }).select().single();
            if (saved) { onPlanChange(saved as WorkoutPlan); setView('plan'); }
        } catch { setError('Erro ao salvar o plano.'); }
        finally { setLoading(false); }
    }

    // ── AI: full AI generation ──
    async function handleGenerateAI() {
        setLoading(true); setError('');
        try {
            const planData = await aiService.generateWorkoutPlan({
                ...profile,
                training_location: aiLocation,
                available_minutes: aiMinutes,
                active_days: WEEK_DAYS_PT.filter((_, i) => activeDaysBitmask[i]),
                ...(aiMuscleGroups.length > 0 && { focus_muscles: aiMuscleGroups }),
            } as any);
            await deactivatePreviousPlan();
            const { data: saved } = await supabase.from('workout_plans').insert({
                user_id: profile.id,
                name: planData.name ?? `Plano IA — ${profile.name.split(' ')[0]}`,
                description: planData.description,
                estimated_weeks: planData.estimated_weeks ?? 8,
                plan_data: planData,
                is_active: true,
                category: 'musculacao',
                plan_type: 'ai',
            }).select().single();
            if (saved) { onPlanChange(saved as WorkoutPlan); setView('plan'); }
        } catch { setError('Erro ao gerar o plano com IA. Tente novamente.'); }
        finally { setLoading(false); }
    }

    function toggleDay(i: number) {
        setActiveDaysBitmask(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
    }
    function toggleCustomDay(i: number) {
        setCustomDays(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
    }

    // ─────────────────── RENDER ───────────────────

    if (view === 'plan' && plan) {
        return (
            <WeeklyPlanView
                plan={plan}
                profile={profile}
                onBack={onBack}
                onComplete={onComplete}
                onEditPlan={() => setView('menu')}
            />
        );
    }

    if (pickerForDay !== null) {
        return (
            <ExercisePicker
                category="musculacao"
                selected={customDayExercises[pickerForDay] ?? []}
                onToggle={ex => {
                    setCustomDayExercises(prev => {
                        const cur = prev[pickerForDay!] ?? [];
                        const exists = cur.some(e => e.id === ex.id);
                        return { ...prev, [pickerForDay!]: exists ? cur.filter(e => e.id !== ex.id) : [...cur, ex] };
                    });
                }}
                onClose={() => setPickerForDay(null)}
            />
        );
    }

    return (
        <div className="flex flex-col min-h-full">
            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 pt-5 pb-4">
                <button
                    onClick={() => view === 'menu' ? onBack() : setView('menu')}
                    className="p-2 rounded-xl"
                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)' }}
                >
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-primary flex items-center gap-1"><Dumbbell size={10} /> Musculação</p>
                    <h2 className="font-bold text-base text-text-main">
                        {view === 'menu' ? 'Como quer treinar?' :
                            view === 'template' ? 'Treino Pronto' :
                                view === 'custom' ? 'Criar Manual' : 'Gerar com IA'}
                    </h2>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-32">
                <AnimatePresence mode="wait">

                    {/* ── MENU ── */}
                    {view === 'menu' && (
                        <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
                            {plan && (
                                <button
                                    onClick={() => setView('plan')}
                                    className="flex items-center gap-4 p-4 rounded-2xl text-left"
                                    style={{ background: 'linear-gradient(135deg, rgba(var(--primary-rgb),0.15), rgba(var(--primary-rgb),0.05))', border: '1px solid rgba(var(--primary-rgb),0.3)' }}
                                >
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                                        style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
                                        <Dumbbell size={22} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-primary font-bold uppercase tracking-widest mb-0.5">Plano Ativo</p>
                                        <p className="font-bold text-text-main truncate">{plan.name}</p>
                                        <p className="text-xs text-text-muted">{plan.split_type ?? plan.plan_type}</p>
                                    </div>
                                    <ChevronRight size={18} className="text-primary shrink-0" />
                                </button>
                            )}

                            <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mt-2 mb-1">
                                {plan ? 'Recriar plano' : 'Criar plano'}
                            </p>

                            {[
                                { key: 'template', icon: <Dumbbell size={22} />, label: 'Treino Pronto', desc: 'Escolha um split e a IA monta os exercícios', color: 'var(--primary)' },
                                { key: 'custom', icon: <PenLine size={22} />, label: 'Criar Manual', desc: 'Selecione dias e adicione exercícios você mesmo', color: 'var(--proteina)' },
                                { key: 'ai', icon: <Sparkles size={22} />, label: 'Gerar com IA', desc: 'IA cria o plano completo com base no seu perfil', color: 'var(--accent)' },
                            ].map(({ key, icon, label, desc, color }) => (
                                <button
                                    key={key}
                                    onClick={() => setView(key as HubView)}
                                    className="flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:scale-[1.01]"
                                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.04)', border: '1px solid var(--border-main)' }}
                                >
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
                                        <span style={{ color }}>{icon}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-text-main">{label}</p>
                                        <p className="text-xs text-text-muted">{desc}</p>
                                    </div>
                                    <ChevronRight size={18} className="text-text-muted shrink-0" />
                                </button>
                            ))}

                            {/* Reset button */}
                            {plan && !showResetConfirm && (
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    className="flex items-center gap-3 p-3 rounded-2xl text-left mt-1"
                                    style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
                                >
                                    <RotateCcw size={16} style={{ color: '#ef4444' }} />
                                    <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Resetar plano atual</p>
                                </button>
                            )}
                            {plan && showResetConfirm && (
                                <div className="flex flex-col gap-2 p-3 rounded-2xl"
                                    style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>Confirmar reset do plano atual?</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowResetConfirm(false)}
                                            className="flex-1 py-2 rounded-xl text-xs font-semibold text-text-muted"
                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)' }}>
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={async () => {
                                                await supabase.from('workout_plans').update({ is_active: false }).eq('id', plan.id);
                                                setShowResetConfirm(false);
                                                onBack();
                                            }}
                                            className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                                            style={{ backgroundColor: '#ef4444' }}>
                                            Resetar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── TEMPLATE PICKER ── */}
                    {view === 'template' && (
                        <motion.div key="template" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
                            <p className="text-xs text-text-muted">Escolha o split de musculação:</p>
                            <div className="grid grid-cols-2 gap-3">
                                {SPLITS.map(split => (
                                    <button
                                        key={split.id}
                                        onClick={() => setSelectedSplit(split === selectedSplit ? null : split)}
                                        className="p-4 rounded-2xl text-left transition-all"
                                        style={{
                                            backgroundColor: selectedSplit?.id === split.id ? 'rgba(var(--primary-rgb),0.12)' : 'rgba(var(--text-main-rgb),0.04)',
                                            border: `1px solid ${selectedSplit?.id === split.id ? 'rgba(var(--primary-rgb),0.4)' : 'var(--border-main)'}`,
                                        }}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="font-bold text-text-main text-sm">{split.label}</p>
                                            {selectedSplit?.id === split.id && <Check size={14} className="text-primary" />}
                                        </div>
                                        <p className="text-[10px] text-text-muted">{split.description}</p>
                                        <p className="text-[10px] text-primary font-bold mt-1">{split.days}x / semana</p>
                                    </button>
                                ))}
                            </div>

                            {selectedSplit && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
                                    <p className="text-xs text-text-muted">
                                        Selecione {selectedSplit.days} dia(s) na semana:
                                    </p>
                                    <div className="flex gap-2 flex-wrap">
                                        {WEEK_SHORT.map((d, i) => (
                                            <button
                                                key={i}
                                                onClick={() => toggleDay(i)}
                                                className="w-10 h-10 rounded-xl text-xs font-bold transition-all"
                                                style={{
                                                    backgroundColor: activeDaysBitmask[i] ? 'var(--primary)' : 'rgba(var(--text-main-rgb),0.06)',
                                                    color: activeDaysBitmask[i] ? '#fff' : 'var(--text-muted)',
                                                }}
                                            >
                                                {d}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex gap-3">
                                        {(['gym', 'home'] as const).map(loc => (
                                            <button
                                                key={loc}
                                                onClick={() => setLocation(loc)}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                                                style={{
                                                    backgroundColor: location === loc ? 'rgba(var(--primary-rgb),0.12)' : 'rgba(var(--text-main-rgb),0.04)',
                                                    border: `1px solid ${location === loc ? 'rgba(var(--primary-rgb),0.3)' : 'var(--border-main)'}`,
                                                    color: location === loc ? 'var(--primary)' : 'var(--text-muted)',
                                                }}
                                            >
                                                <MapPin size={16} /> {loc === 'gym' ? 'Academia' : 'Casa'}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {error && <p className="text-xs text-gordura">{error}</p>}
                        </motion.div>
                    )}

                    {/* ── CUSTOM BUILDER ── */}
                    {view === 'custom' && (
                        <motion.div key="custom" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
                            <p className="text-xs text-text-muted">Selecione os dias de treino:</p>
                            <div className="flex gap-2 flex-wrap">
                                {WEEK_SHORT.map((d, i) => (
                                    <button
                                        key={i}
                                        onClick={() => toggleCustomDay(i)}
                                        className="w-10 h-10 rounded-xl text-xs font-bold transition-all"
                                        style={{
                                            backgroundColor: customDays[i] ? 'var(--primary)' : 'rgba(var(--text-main-rgb),0.06)',
                                            color: customDays[i] ? '#fff' : 'var(--text-muted)',
                                        }}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-col gap-3">
                                {customDays.map((active, i) => active ? (
                                    <div key={i} className="rounded-2xl p-4 bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                        <div className="flex justify-between items-center mb-2">
                                            <p className="font-semibold text-sm text-text-main">{WEEK_DAYS_PT[i]}</p>
                                            <button
                                                onClick={() => setPickerForDay(i)}
                                                className="text-xs text-primary font-semibold flex items-center gap-1"
                                            >
                                                <PenLine size={14} /> Adicionar
                                            </button>
                                        </div>
                                        {(customDayExercises[i] ?? []).length === 0 ? (
                                            <p className="text-xs text-text-muted">Nenhum exercício</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {customDayExercises[i].map(ex => (
                                                    <span key={ex.id} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                                                        style={{ backgroundColor: 'rgba(var(--primary-rgb),0.1)', color: 'var(--primary)' }}>
                                                        {ex.name}
                                                        <button onClick={() => setCustomDayExercises(prev => ({ ...prev, [i]: prev[i].filter(e => e.id !== ex.id) }))}>
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : null)}
                            </div>

                            {error && <p className="text-xs text-gordura">{error}</p>}
                        </motion.div>
                    )}

                    {/* ── AI GENERATOR ── */}
                    {view === 'ai' && (
                        <motion.div key="ai" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
                            <div className="rounded-2xl p-4 flex flex-col gap-1"
                                style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.1), rgba(var(--primary-rgb),0.05))', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
                                <p className="text-xs font-bold text-accent uppercase tracking-widest">IA vai criar seu plano</p>
                                <p className="text-sm text-text-muted">Com base no seu perfil: {profile.weight}kg, {profile.goal?.replace('_', ' ')}, {profile.activity_level}</p>
                            </div>

                            {/* Split type */}
                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Estrutura de treino</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {SPLITS.slice(0, 6).map(s => (
                                        <button key={s.id} onClick={() => setAiSplit(s.id)}
                                            className="py-2 px-3 rounded-xl text-xs font-semibold transition-all"
                                            style={{
                                                backgroundColor: aiSplit === s.id ? 'rgba(var(--primary-rgb),0.12)' : 'rgba(var(--text-main-rgb),0.04)',
                                                border: `1px solid ${aiSplit === s.id ? 'rgba(var(--primary-rgb),0.3)' : 'var(--border-main)'}`,
                                                color: aiSplit === s.id ? 'var(--primary)' : 'var(--text-muted)',
                                            }}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Location */}
                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Local de treino</p>
                                <div className="flex gap-3">
                                    {(['gym', 'home'] as const).map(loc => (
                                        <button key={loc} onClick={() => setAiLocation(loc)}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                                            style={{
                                                backgroundColor: aiLocation === loc ? 'rgba(var(--primary-rgb),0.12)' : 'rgba(var(--text-main-rgb),0.04)',
                                                border: `1px solid ${aiLocation === loc ? 'rgba(var(--primary-rgb),0.3)' : 'var(--border-main)'}`,
                                                color: aiLocation === loc ? 'var(--primary)' : 'var(--text-muted)',
                                            }}>
                                            <MapPin size={16} /> {loc === 'gym' ? 'Academia' : 'Casa'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Duration */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs text-text-muted font-semibold">Minutos por sessão</p>
                                    <span className="text-sm font-bold text-primary flex items-center gap-1">
                                        <Clock size={14} /> {aiMinutes} min
                                    </span>
                                </div>
                                <input type="range" min={20} max={120} step={5} value={aiMinutes}
                                    onChange={e => setAiMinutes(+e.target.value)}
                                    className="w-full accent-primary h-2 rounded-full" />
                                <div className="flex justify-between text-[9px] text-text-muted mt-1">
                                    <span>20 min</span><span>70 min</span><span>120 min</span>
                                </div>
                            </div>

                            {/* Muscle groups */}
                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Grupos musculares em foco <span className="font-normal">(opcional)</span></p>
                                <div className="flex flex-wrap gap-2">
                                    {MUSCLE_GROUP_OPTIONS.map(mg => (
                                        <button
                                            key={mg}
                                            onClick={() => setAiMuscleGroups(prev =>
                                                prev.includes(mg) ? prev.filter(x => x !== mg) : [...prev, mg]
                                            )}
                                            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                                            style={{
                                                backgroundColor: aiMuscleGroups.includes(mg) ? 'var(--primary)' : 'rgba(var(--text-main-rgb),0.06)',
                                                color: aiMuscleGroups.includes(mg) ? '#fff' : 'var(--text-muted)',
                                            }}
                                        >
                                            {mg}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {error && <p className="text-xs text-gordura">{error}</p>}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Bottom action button ── */}
            {view !== 'menu' && view !== 'plan' && (
                <div className="fixed bottom-0 left-0 right-0 p-4 z-[60]" style={{ backgroundColor: 'var(--bg-main)', borderTop: '1px solid var(--border-main)' }}>
                    <button
                        onClick={view === 'template' ? handleGenerateTemplate : view === 'custom' ? handleSaveCustom : handleGenerateAI}
                        disabled={loading}
                        className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}
                    >
                        {loading
                            ? <><Loader2 size={18} className="animate-spin" /> Gerando plano...</>
                            : view === 'template' ? <><Sparkles size={18} /> Gerar com IA</>
                                : view === 'custom' ? <><Check size={18} /> Salvar Plano</>
                                    : <><Sparkles size={18} /> Gerar Plano</>}
                    </button>
                </div>
            )}
        </div>
    );
}
