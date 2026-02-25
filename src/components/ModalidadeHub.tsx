import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Loader2, ChevronRight, Sparkles, Play, Trophy, Activity, Bike, Waves, Shield, Wind, Target, Dumbbell, CalendarDays, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { aiService } from '../services/aiService';
import { moderateContent } from '../services/moderationService';
import type { Profile, WorkoutPlan, Modality, CommunityExercise } from '../types';
import WeeklyPlanView from './WeeklyPlanView';
import ExercisePicker from './ExercisePicker';

type HubView = 'grid' | 'modality' | 'plan' | 'add' | 'manual';

interface Props {
    plan: WorkoutPlan | null;
    profile: Profile;
    onBack: () => void;
    onPlanChange: (plan: WorkoutPlan) => void;
    onComplete: (pts: number) => void;
}

const EMOJI_SUGGESTIONS = ['🏋️', '🤸', '🧘', '🥊', '🏊', '🚴', '🤼', '⚡', '🎯', '🏃', '💪', '🦵'];
const WEEK_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const MODALITY_ICON_MAP: Record<string, React.ReactNode> = {
    pilates: <Target size={24} />,
    boxe: <Shield size={24} />,
    'boxe tailandês': <Shield size={24} />,
    muay: <Shield size={24} />,
    jump: <Activity size={24} />,
    karatê: <Shield size={24} />,
    karate: <Shield size={24} />,
    yoga: <Wind size={24} />,
    natação: <Waves size={24} />,
    natacao: <Waves size={24} />,
    ciclismo: <Bike size={24} />,
    corrida: <Activity size={24} />,
    aeróbica: <Activity size={24} />,
    aerobica: <Activity size={24} />,
    dança: <Activity size={24} />,
    danca: <Activity size={24} />,
    funcional: <Dumbbell size={24} />,
    crossfit: <Dumbbell size={24} />,
};

function getModalityIcon(name: string, emoji: string, size = 24): React.ReactNode {
    const key = name.toLowerCase().trim();
    for (const k of Object.keys(MODALITY_ICON_MAP)) {
        if (key.includes(k)) return MODALITY_ICON_MAP[k];
    }
    // Fallback: render emoji
    return <span style={{ fontSize: size * 0.85 }}>{emoji}</span>;
}

export default function ModalidadeHub({ plan, profile, onBack, onPlanChange, onComplete }: Props) {
    const [view, setView] = useState<HubView>('grid');
    const [modalities, setModalities] = useState<Modality[]>([]);
    const [selectedModality, setSelectedModality] = useState<Modality | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');

    // Add new modality state
    const [newName, setNewName] = useState('');
    const [newIcon, setNewIcon] = useState('🏋️');
    const [newDesc, setNewDesc] = useState('');
    const [moderating, setModerating] = useState(false);
    const [modError, setModError] = useState('');
    const [saving, setSaving] = useState(false);

    // Manual plan state
    const [showExercisePicker, setShowExercisePicker] = useState(false);
    const [manualExercises, setManualExercises] = useState<CommunityExercise[]>([]);
    const [manualDays, setManualDays] = useState<boolean[]>(Array(7).fill(false));
    const [manualSaving, setManualSaving] = useState(false);
    const [manualError, setManualError] = useState('');

    useEffect(() => {
        loadModalities();
    }, []);

    async function loadModalities() {
        setLoading(true);
        try {
            const { data } = await supabase.from('modalities').select('*').order('name');
            setModalities((data ?? []) as Modality[]);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddModality() {
        if (!newName.trim()) return;
        setModError(''); setModerating(true);
        const modResult = await moderateContent(newName.trim(), 'modalidade');
        setModerating(false);
        if (!modResult.ok) { setModError(modResult.reason); return; }

        setSaving(true);
        try {
            const { data: inserted, error: insErr } = await supabase.from('modalities').insert({
                name: newName.trim(),
                icon: newIcon,
                description: newDesc.trim() || null,
                created_by: profile.id,
            }).select().single();

            if (insErr || !inserted) throw insErr ?? new Error('Insert failed');

            const exercises = await aiService.generateModalityExercises(
                { name: inserted.name, description: inserted.description },
                6
            );
            if (exercises.length > 0) {
                await supabase.from('community_exercises').insert(
                    exercises.map(ex => ({
                        name: ex.name,
                        category: 'musculacao',
                        modality_id: inserted.id,
                        muscle_group: ex.muscle_group ?? null,
                        equipment: ex.equipment ?? 'livre',
                        instructions: ex.instructions ?? null,
                        created_by: profile.id,
                    }))
                );
            }

            setModalities(prev => [...prev, inserted as Modality].sort((a, b) => a.name.localeCompare(b.name)));
            setNewName(''); setNewIcon('🏋️'); setNewDesc('');
            setView('grid');
        } catch { setModError('Erro ao salvar modalidade.'); }
        finally { setSaving(false); }
    }

    async function handleGeneratePlan() {
        if (!selectedModality) return;
        setGenerating(true); setError('');
        try {
            const planData = await aiService.generateModalityPlan(profile, selectedModality);
            if (plan?.id) await supabase.from('workout_plans').update({ is_active: false }).eq('id', plan.id);
            const { data: saved } = await supabase.from('workout_plans').insert({
                user_id: profile.id,
                name: planData?.name ?? `${selectedModality.icon} ${selectedModality.name}`,
                description: planData?.description ?? selectedModality.description,
                estimated_weeks: planData?.estimated_weeks ?? 4,
                plan_data: planData ?? { weeks: [] },
                is_active: true,
                category: 'modalidade',
                plan_type: 'ai',
                modality_id: selectedModality.id,
            }).select().single();
            if (saved) { onPlanChange(saved as WorkoutPlan); setView('plan'); }
        } catch { setError('Erro ao gerar plano. Tente novamente.'); }
        finally { setGenerating(false); }
    }

    async function handleCreateManualPlan() {
        if (!selectedModality) return;
        const activeDayIndices = manualDays.map((on, i) => on ? i : -1).filter(i => i >= 0);
        if (activeDayIndices.length === 0) { setManualError('Selecione pelo menos um dia.'); return; }
        if (manualExercises.length === 0) { setManualError('Selecione pelo menos um exercício.'); return; }
        setManualSaving(true); setManualError('');
        try {
            const exercises = manualExercises.map(ex => ({
                name: ex.name,
                sets: 3,
                reps: '12',
                rest_seconds: 60,
                instructions: ex.instructions ?? '',
            }));
            const weeks = Array.from({ length: 4 }, (_, w) => ({
                week: w + 1,
                days: Array.from({ length: 7 }, (_, d) => {
                    const isActive = activeDayIndices.includes(d);
                    return {
                        day: d + 1,
                        name: isActive ? selectedModality.name : 'Descanso',
                        type: isActive ? 'strength' : 'rest',
                        exercises: isActive ? exercises : [],
                    };
                }),
            }));
            if (plan?.id) await supabase.from('workout_plans').update({ is_active: false }).eq('id', plan.id);
            const { data: saved } = await supabase.from('workout_plans').insert({
                user_id: profile.id,
                name: `${selectedModality.name} — Manual`,
                plan_data: { weeks },
                estimated_weeks: 4,
                is_active: true,
                category: 'modalidade',
                plan_type: 'custom',
                modality_id: selectedModality.id,
            }).select().single();
            if (saved) { onPlanChange(saved as WorkoutPlan); setView('plan'); }
        } catch { setManualError('Erro ao salvar plano.'); }
        finally { setManualSaving(false); }
    }

    // ── Plan view ──
    if (view === 'plan' && plan && selectedModality) {
        return (
            <WeeklyPlanView
                plan={plan}
                profile={profile}
                modality={selectedModality}
                onBack={() => setView('modality')}
                onComplete={onComplete}
                onEditPlan={() => setView('modality')}
            />
        );
    }

    return (
        <div className="flex flex-col min-h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-5 pb-4">
                <button
                    onClick={() => {
                        if (view === 'grid') onBack();
                        else if (view === 'modality') setView('grid');
                        else if (view === 'add') setView('grid');
                        else if (view === 'manual') setView('modality');
                    }}
                    className="p-2 rounded-xl"
                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)' }}
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-proteina flex items-center gap-1"><Trophy size={10} /> Modalidade</p>
                    <h2 className="font-bold text-base text-text-main">
                        {view === 'grid' ? 'Escolha uma modalidade' :
                            view === 'add' ? 'Nova Modalidade' :
                                view === 'manual' ? `${selectedModality?.name} — Manual` :
                                    view === 'modality' ? selectedModality?.name ?? '' : ''}
                    </h2>
                </div>
                {view === 'grid' && (
                    <button
                        onClick={() => setView('add')}
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(var(--proteina-rgb),0.1)', border: '1px solid rgba(var(--proteina-rgb),0.2)' }}
                    >
                        <Plus size={18} style={{ color: 'var(--proteina)' }} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-32">
                <AnimatePresence mode="wait">

                    {/* ── MODALITY GRID ── */}
                    {view === 'grid' && (
                        <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {loading ? (
                                <div className="flex justify-center pt-12"><Loader2 size={24} className="animate-spin text-proteina" /></div>
                            ) : (
                                <div className="grid grid-cols-3 gap-3">
                                    {modalities.map(m => (
                                        <motion.button
                                            key={m.id}
                                            whileTap={{ scale: 0.96 }}
                                            onClick={() => { setSelectedModality(m); setView('modality'); }}
                                            className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all"
                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.04)', border: '1px solid var(--border-main)' }}
                                        >
                                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(var(--proteina-rgb),0.15), rgba(var(--text-main-rgb),0.06))',
                                                    color: 'var(--proteina)',
                                                }}>
                                                {getModalityIcon(m.name, m.icon, 22)}
                                            </div>
                                            <p className="text-xs font-semibold text-text-main text-center leading-tight">{m.name}</p>
                                        </motion.button>
                                    ))}
                                    {/* Add new card */}
                                    <button
                                        onClick={() => setView('add')}
                                        className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all"
                                        style={{ backgroundColor: 'rgba(var(--proteina-rgb),0.06)', border: '1px dashed rgba(var(--proteina-rgb),0.3)' }}
                                    >
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--proteina-rgb),0.1)' }}>
                                            <Plus size={20} style={{ color: 'var(--proteina)' }} />
                                        </div>
                                        <p className="text-xs font-semibold text-center leading-tight" style={{ color: 'var(--proteina)' }}>Nova</p>
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── MODALITY DETAIL ── */}
                    {view === 'modality' && selectedModality && (
                        <motion.div key="modality" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
                            {/* Hero card */}
                            <div className="rounded-2xl p-6 flex flex-col items-center text-center gap-3"
                                style={{ background: 'linear-gradient(135deg, rgba(var(--proteina-rgb),0.1), rgba(var(--primary-rgb),0.05))', border: '1px solid rgba(var(--proteina-rgb),0.15)' }}>
                                <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(var(--proteina-rgb),0.2), rgba(var(--primary-rgb),0.08))',
                                        color: 'var(--proteina)',
                                    }}>
                                    {getModalityIcon(selectedModality.name, selectedModality.icon, 36)}
                                </div>
                                <div>
                                    <h3 className="text-xl font-extrabold text-text-main">{selectedModality.name}</h3>
                                    {selectedModality.description && (
                                        <p className="text-sm text-text-muted mt-1">{selectedModality.description}</p>
                                    )}
                                </div>
                            </div>

                            {plan?.modality_id === selectedModality.id ? (
                                <button
                                    onClick={() => setView('plan')}
                                    className="flex items-center gap-3 p-4 rounded-2xl text-left"
                                    style={{ background: 'linear-gradient(135deg, rgba(var(--primary-rgb),0.12), rgba(var(--primary-rgb),0.04))', border: '1px solid rgba(var(--primary-rgb),0.25)' }}
                                >
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
                                        <Play size={16} className="text-white" fill="white" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs text-primary font-bold uppercase tracking-widest">Plano Ativo</p>
                                        <p className="font-bold text-text-main">{plan.name}</p>
                                    </div>
                                    <ChevronRight size={16} className="text-primary shrink-0" />
                                </button>
                            ) : null}

                            {/* AI option */}
                            <button
                                onClick={handleGeneratePlan}
                                disabled={generating}
                                className="flex items-center gap-4 p-4 rounded-2xl text-left disabled:opacity-50"
                                style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.04)', border: '1px solid var(--border-main)' }}
                            >
                                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)' }}>
                                    {generating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                                </div>
                                <div>
                                    <p className="font-bold text-text-main">{generating ? 'Gerando plano...' : plan?.modality_id === selectedModality.id ? 'Recriar com IA' : 'Gerar com IA'}</p>
                                    <p className="text-xs text-text-muted">IA cria treino baseado no seu perfil</p>
                                </div>
                            </button>

                            {/* Manual option */}
                            <button
                                onClick={() => { setManualExercises([]); setManualDays(Array(7).fill(false)); setView('manual'); }}
                                className="flex items-center gap-4 p-4 rounded-2xl text-left"
                                style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.04)', border: '1px solid var(--border-main)' }}
                            >
                                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: 'rgba(var(--primary-rgb),0.1)', color: 'var(--primary)' }}>
                                    <CalendarDays size={20} />
                                </div>
                                <div>
                                    <p className="font-bold text-text-main">Criar Manual</p>
                                    <p className="text-xs text-text-muted">Escolha os exercícios e os dias você mesmo</p>
                                </div>
                            </button>

                            {error && <p className="text-xs text-gordura">{error}</p>}
                        </motion.div>
                    )}

                    {/* ── MANUAL PLAN ── */}
                    {view === 'manual' && selectedModality && (
                        <motion.div key="manual" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5">
                            {/* Day picker */}
                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Dias de treino:</p>
                                <div className="flex gap-2">
                                    {WEEK_SHORT.map((d, i) => (
                                        <button key={i} onClick={() => setManualDays(prev => { const n = [...prev]; n[i] = !n[i]; return n; })}
                                            className="w-10 h-10 rounded-xl text-xs font-bold transition-all"
                                            style={{
                                                backgroundColor: manualDays[i] ? 'var(--proteina)' : 'rgba(var(--text-main-rgb),0.06)',
                                                color: manualDays[i] ? '#fff' : 'var(--text-muted)',
                                            }}>
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Exercise picker trigger */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs text-text-muted font-semibold">Exercícios selecionados ({manualExercises.length})</p>
                                    <button
                                        onClick={() => setShowExercisePicker(true)}
                                        className="text-xs text-proteina font-bold flex items-center gap-1"
                                    >
                                        <Plus size={14} /> Adicionar
                                    </button>
                                </div>
                                {manualExercises.length === 0 ? (
                                    <button
                                        onClick={() => setShowExercisePicker(true)}
                                        className="w-full py-10 rounded-2xl flex flex-col items-center gap-2 text-text-muted"
                                        style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.04)', border: '1px dashed var(--border-main)' }}
                                    >
                                        <Dumbbell size={28} className="opacity-30" />
                                        <p className="text-sm">Toque para adicionar exercícios</p>
                                    </button>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {manualExercises.map(ex => (
                                            <div key={ex.id} className="flex items-center gap-3 p-3 rounded-xl"
                                                style={{ backgroundColor: 'rgba(var(--proteina-rgb),0.08)', border: '1px solid rgba(var(--proteina-rgb),0.15)' }}>
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                                                    style={{ backgroundColor: 'rgba(var(--proteina-rgb),0.15)', color: 'var(--proteina)' }}>
                                                    <Dumbbell size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-text-main truncate">{ex.name}</p>
                                                    {ex.muscle_group && <p className="text-xs text-text-muted">{ex.muscle_group}</p>}
                                                </div>
                                                <button onClick={() => setManualExercises(prev => prev.filter(e => e.id !== ex.id))}
                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-text-muted"
                                                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.08)' }}>
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => setShowExercisePicker(true)}
                                            className="py-2 rounded-xl text-xs font-semibold text-proteina flex items-center justify-center gap-1"
                                            style={{ backgroundColor: 'rgba(var(--proteina-rgb),0.08)' }}
                                        >
                                            <Plus size={14} /> Adicionar mais
                                        </button>
                                    </div>
                                )}
                            </div>

                            {manualError && <p className="text-xs text-gordura">{manualError}</p>}
                        </motion.div>
                    )}

                    {/* ── ADD NEW MODALITY ── */}
                    {view === 'add' && (
                        <motion.div key="add" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
                            <div className="rounded-2xl p-4 flex flex-col gap-1"
                                style={{ backgroundColor: 'rgba(var(--proteina-rgb),0.08)', border: '1px solid rgba(var(--proteina-rgb),0.15)' }}>
                                <p className="text-xs font-bold text-proteina uppercase tracking-widest">Comunidade</p>
                                <p className="text-sm text-text-muted">Sua modalidade fica disponível para todos os usuários!</p>
                            </div>

                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Ícone</p>
                                <div className="flex flex-wrap gap-2">
                                    {EMOJI_SUGGESTIONS.map(e => (
                                        <button
                                            key={e}
                                            onClick={() => setNewIcon(e)}
                                            className="w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all"
                                            style={{
                                                backgroundColor: newIcon === e ? 'rgba(var(--proteina-rgb),0.15)' : 'rgba(var(--text-main-rgb),0.06)',
                                                border: newIcon === e ? '2px solid rgba(var(--proteina-rgb),0.4)' : '1px solid var(--border-main)',
                                            }}
                                        >
                                            {e}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Nome da modalidade *</p>
                                <input
                                    value={newName}
                                    onChange={e => { setNewName(e.target.value); setModError(''); }}
                                    placeholder="Ex: Capoeira, Zumba, Parkour..."
                                    className="w-full rounded-xl px-4 py-3 text-sm outline-none text-text-main"
                                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)', border: '1px solid var(--border-main)' }}
                                    maxLength={60}
                                />
                            </div>

                            <div>
                                <p className="text-xs text-text-muted font-semibold mb-2">Descrição (opcional)</p>
                                <input
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                    placeholder="Ex: Dança de origem africana..."
                                    className="w-full rounded-xl px-4 py-3 text-sm outline-none text-text-main"
                                    style={{ backgroundColor: 'rgba(var(--text-main-rgb),0.06)', border: '1px solid var(--border-main)' }}
                                    maxLength={120}
                                />
                            </div>

                            {moderating && (
                                <div className="flex items-center gap-2 text-xs text-text-muted">
                                    <Loader2 size={14} className="animate-spin" />
                                    Verificando conteúdo...
                                </div>
                            )}
                            {modError && <p className="text-xs text-gordura">{modError}</p>}

                            <p className="text-[10px] text-text-muted leading-relaxed">
                                A IA vai gerar automaticamente alguns exercícios básicos para sua modalidade.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom buttons */}
            {view === 'add' && (
                <div className="fixed bottom-0 left-0 right-0 p-4 z-[60]" style={{ backgroundColor: 'var(--bg-main)', borderTop: '1px solid var(--border-main)' }}>
                    <button
                        onClick={handleAddModality}
                        disabled={!newName.trim() || saving || moderating}
                        className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, var(--proteina), rgba(var(--proteina-rgb),0.7))' }}
                    >
                        {moderating ? <><Loader2 size={18} className="animate-spin" /> Verificando...</>
                            : saving ? <><Loader2 size={18} className="animate-spin" /> Salvando...</>
                                : <><Plus size={18} /> Cadastrar Modalidade</>}
                    </button>
                </div>
            )}

            {view === 'manual' && (
                <div className="fixed bottom-0 left-0 right-0 p-4 z-[60]" style={{ backgroundColor: 'var(--bg-main)', borderTop: '1px solid var(--border-main)' }}>
                    <button
                        onClick={handleCreateManualPlan}
                        disabled={manualSaving}
                        className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, var(--proteina), rgba(var(--proteina-rgb),0.7))' }}
                    >
                        {manualSaving ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : <><Check size={18} /> Salvar Plano Manual</>}
                    </button>
                </div>
            )}

            {/* ExercisePicker overlay */}
            {showExercisePicker && selectedModality && (
                <ExercisePicker
                    category="musculacao"
                    modalityId={selectedModality.id}
                    selected={manualExercises}
                    onToggle={ex => setManualExercises(prev =>
                        prev.some(e => e.id === ex.id) ? prev.filter(e => e.id !== ex.id) : [...prev, ex]
                    )}
                    onClose={() => setShowExercisePicker(false)}
                />
            )}
        </div>
    );
}
