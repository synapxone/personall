import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Pencil, Plus, X, Camera, Loader2, TrendingDown, TrendingUp, Minus, Sparkles, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { geminiService } from '../services/geminiService';
import type { Profile, ProgressEntry, Goal, ActivityLevel } from '../types';

interface Props {
    profile: Profile;
    onSignOut: () => void;
    onRefresh: () => void;
}

const GOAL_LABELS: Record<string, string> = {
    lose_weight: 'Perder Peso',
    gain_muscle: 'Ganhar Músculo',
    maintain: 'Manutenção',
    gain_weight: 'Ganhar Peso',
};

const ACTIVITY_LABELS: Record<string, string> = {
    sedentary: 'Sedentário',
    light: 'Leve',
    moderate: 'Moderado',
    active: 'Ativo',
    very_active: 'Muito Ativo',
};

const inputStyle = { backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' };
const inputClass = 'w-full px-3 py-3 rounded-xl text-white text-sm outline-none';

export default function ProfileView({ profile, onSignOut, onRefresh }: Props) {
    const [entries, setEntries] = useState<ProgressEntry[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit profile modal
    const [showEdit, setShowEdit] = useState(false);
    const [editName, setEditName] = useState('');
    const [editAge, setEditAge] = useState(0);
    const [editWeight, setEditWeight] = useState(0);
    const [editHeight, setEditHeight] = useState(0);
    const [editGoal, setEditGoal] = useState<Goal>('maintain');
    const [editActivity, setEditActivity] = useState<ActivityLevel>('moderate');
    const [editMinutes, setEditMinutes] = useState(0);
    const [editSaving, setEditSaving] = useState(false);

    // Add progress modal
    const [showAddProgress, setShowAddProgress] = useState(false);
    const [progWeight, setProgWeight] = useState('');
    const [progNotes, setProgNotes] = useState('');
    const [progPhotoFile, setProgPhotoFile] = useState<File | null>(null);
    const [progPhotoPreview, setProgPhotoPreview] = useState<string | null>(null);
    const [progSaving, setProgSaving] = useState(false);
    const photoRef = useRef<HTMLInputElement>(null);

    // View full photo
    const [viewEntry, setViewEntry] = useState<ProgressEntry | null>(null);

    // Theme state
    const [isLightMode, setIsLightMode] = useState(() => document.documentElement.classList.contains('light'));

    function toggleTheme() {
        const nextLight = !isLightMode;
        setIsLightMode(nextLight);
        if (nextLight) {
            document.documentElement.classList.add('light');
            localStorage.setItem('app-theme', 'light');
        } else {
            document.documentElement.classList.remove('light');
            localStorage.setItem('app-theme', 'dark');
        }
    }

    useEffect(() => {
        loadEntries();
    }, []);

    async function loadEntries() {
        setLoading(true);
        const { data } = await supabase
            .from('progress_entries')
            .select('*')
            .eq('user_id', profile.id)
            .order('date', { ascending: false });
        setEntries((data as ProgressEntry[]) || []);
        setLoading(false);
    }

    function openEdit() {
        setEditName(profile.name);
        setEditAge(profile.age);
        setEditWeight(profile.weight);
        setEditHeight(profile.height);
        setEditGoal(profile.goal);
        setEditActivity(profile.activity_level);
        setEditMinutes(profile.available_minutes);
        setShowEdit(true);
    }

    async function saveProfile() {
        if (!editName.trim()) { toast.error('Nome é obrigatório.'); return; }
        setEditSaving(true);
        const newCalGoal = geminiService.calculateCalorieGoal({
            name: editName,
            age: editAge,
            gender: profile.gender,
            weight: editWeight,
            height: editHeight,
            activity_level: editActivity,
            goal: editGoal,
            training_location: profile.training_location,
            available_minutes: editMinutes,
            food_preferences: profile.food_preferences || [],
            foods_at_home: profile.foods_at_home || [],
        });
        const { error } = await supabase.from('profiles').update({
            name: editName,
            age: editAge,
            weight: editWeight,
            height: editHeight,
            goal: editGoal,
            activity_level: editActivity,
            available_minutes: editMinutes,
            daily_calorie_goal: newCalGoal,
            updated_at: new Date().toISOString(),
        }).eq('id', profile.id);
        if (error) {
            toast.error('Erro ao salvar perfil.');
        } else {
            toast.success('Perfil atualizado!');
            setShowEdit(false);
            onRefresh();
        }
        setEditSaving(false);
    }

    function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setProgPhotoFile(file);
        setProgPhotoPreview(URL.createObjectURL(file));
    }

    function resetAddProgress() {
        setProgWeight('');
        setProgNotes('');
        setProgPhotoFile(null);
        if (progPhotoPreview) URL.revokeObjectURL(progPhotoPreview);
        setProgPhotoPreview(null);
    }

    async function saveProgress() {
        if (!progWeight && !progPhotoFile) {
            toast.error('Registre pelo menos o peso ou uma foto.');
            return;
        }
        setProgSaving(true);

        let photoUrl: string | undefined;
        if (progPhotoFile) {
            const ext = progPhotoFile.name.split('.').pop() || 'jpg';
            const filename = `${profile.id}/${Date.now()}.${ext}`;
            const { data: uploadData } = await supabase.storage
                .from('progress-photos')
                .upload(filename, progPhotoFile);
            if (uploadData) {
                const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(uploadData.path);
                photoUrl = urlData.publicUrl;
            }
        }

        const weight = progWeight ? parseFloat(progWeight) : null;
        const { error } = await supabase.from('progress_entries').insert({
            user_id: profile.id,
            date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
            weight,
            photo_url: photoUrl || null,
            notes: progNotes.trim() || null,
        });

        if (error) {
            toast.error('Erro ao registrar evolução.');
        } else {
            // Update profile weight + recalculate calorie goal if weight changed
            if (weight && weight !== profile.weight) {
                const newCalGoal = geminiService.calculateCalorieGoal({
                    name: profile.name,
                    age: profile.age,
                    gender: profile.gender,
                    weight,
                    height: profile.height,
                    activity_level: profile.activity_level,
                    goal: profile.goal,
                    training_location: profile.training_location,
                    available_minutes: profile.available_minutes,
                    food_preferences: profile.food_preferences || [],
                    foods_at_home: profile.foods_at_home || [],
                });
                await supabase.from('profiles').update({
                    weight,
                    daily_calorie_goal: newCalGoal,
                    updated_at: new Date().toISOString(),
                }).eq('id', profile.id);
                onRefresh();
            }

            // Reward massive points (500 XP for monthly review)
            const { data: gamData } = await supabase.from('gamification').select('points').eq('user_id', profile.id).single();
            if (gamData) {
                await supabase.from('gamification').update({ points: gamData.points + 500 }).eq('user_id', profile.id);
            }

            toast.success('Evolução registrada! A IA reavaliou e intensificou seus treinos. Você ganhou +500 XP!');
            resetAddProgress();
            setShowAddProgress(false);
            await loadEntries();
        }
        setProgSaving(false);
    }

    const bmi = profile.weight && profile.height
        ? (profile.weight / ((profile.height / 100) ** 2)).toFixed(1)
        : '—';

    // Weight trend: diff between last two logged weights
    const weightEntries = entries.filter(e => e.weight != null);
    const weightDiff = weightEntries.length >= 2
        ? weightEntries[0].weight! - weightEntries[1].weight!
        : null;

    return (
        <div className="px-4 py-6 flex flex-col gap-6 max-w-lg mx-auto pb-24">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4 py-4">
                {profile.photo_url ? (
                    <img src={profile.photo_url} alt="Foto" className="w-24 h-24 rounded-full object-cover ring-2 ring-indigo-500/50 shadow-lg" />
                ) : (
                    <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-semibold text-white shadow-xl bg-gradient-to-br from-indigo-500 to-purple-600 ring-2 ring-indigo-500/30">
                        {profile.name.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="text-center">
                    <h2 className="text-lg font-bold text-white tracking-tight">{profile.name}</h2>
                    <p className="text-indigo-400 text-[11px] uppercase tracking-wider font-medium mt-0.5">{GOAL_LABELS[profile.goal] || profile.goal}</p>
                </div>
            </div>

            {/* Stats + edit button */}
            <div className="rounded-2xl p-5 bg-white/[0.02] border border-white/5 backdrop-blur-sm shadow-sm transition-colors hover:bg-white/[0.04]">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-500 text-[11px] font-medium uppercase tracking-widest">Dados Pessoais</span>
                    <button
                        onClick={openEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                    >
                        <Pencil size={12} />
                        Editar
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <StatItem label="Peso atual" value={`${profile.weight} kg`} trend={weightDiff} />
                    <StatItem label="Altura" value={`${profile.height} cm`} />
                    <StatItem label="IMC" value={String(bmi)} />
                    <StatItem label="Idade" value={`${profile.age} anos`} />
                    <StatItem label="Objetivo" value={GOAL_LABELS[profile.goal] || profile.goal} />
                    <StatItem label="Atividade" value={ACTIVITY_LABELS[profile.activity_level] || profile.activity_level} />
                </div>
            </div>

            {/* Body Analysis Display */}
            {profile.body_analysis && (
                <div className="rounded-2xl p-5 bg-indigo-500/5 border border-indigo-500/20 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={16} className="text-indigo-400" />
                        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Análise Física por IA</span>
                    </div>
                    <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {profile.body_analysis}
                    </div>
                </div>
            )}

            {/* Register progress button */}
            <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setProgWeight(String(profile.weight)); setShowAddProgress(true); }}
                className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-semibold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
            >
                <Plus size={18} />
                Registrar Evolução
            </motion.button>

            {/* Progress timeline */}
            <div>
                <h3 className="text-white font-bold mb-3">Histórico de Evolução</h3>
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 size={24} className="animate-spin" style={{ color: '#7C3AED' }} />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="text-3xl">📊</span>
                        <p className="text-gray-400 text-sm mt-2">Nenhum registro ainda. Clique em "Registrar Evolução" para começar!</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {entries.map((entry, i) => {
                            const prevEntry = entries[i + 1];
                            const diff = entry.weight != null && prevEntry?.weight != null
                                ? entry.weight - prevEntry.weight
                                : null;
                            const hasPhoto = !!entry.photo_url;
                            return (
                                <div
                                    key={entry.id}
                                    className="rounded-2xl p-4 flex items-center gap-4"
                                    style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.06)' }}
                                >
                                    {/* Photo thumbnail */}
                                    {hasPhoto ? (
                                        <button
                                            onClick={() => setViewEntry(entry)}
                                            className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity"
                                        >
                                            <img src={entry.photo_url!} alt="" className="w-full h-full object-cover" />
                                        </button>
                                    ) : (
                                        <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{ backgroundColor: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                                            <span className="text-2xl">📈</span>
                                        </div>
                                    )}

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-gray-400 text-xs">
                                            {new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </p>
                                        {entry.weight != null && (
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-white font-bold">{entry.weight} kg</span>
                                                {diff !== null && (
                                                    <span className={`text-xs font-semibold flex items-center gap-0.5 ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                                        {diff < 0 ? <TrendingDown size={12} /> : diff > 0 ? <TrendingUp size={12} /> : <Minus size={12} />}
                                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {entry.notes && <p className="text-gray-500 text-xs mt-1 truncate">{entry.notes}</p>}
                                    </div>

                                    {hasPhoto && (
                                        <button onClick={() => setViewEntry(entry)} className="text-gray-500 text-xs hover:text-gray-300 flex-shrink-0 transition-colors">
                                            Ver foto
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Theme Toggle */}
            <div className="rounded-2xl p-5 bg-white/[0.02] border border-white/5 backdrop-blur-sm mt-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                        <Moon size={18} className="text-gray-400" />
                    </div>
                    <div>
                        <p className="text-white font-semibold text-sm">Aparência do App</p>
                        <p className="text-gray-500 text-[11px]">Alternar modo claro e escuro</p>
                    </div>
                </div>
                <button
                    onClick={toggleTheme}
                    className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                    {isLightMode ? 'Ativar Escuro' : 'Ativar Claro'}
                </button>
            </div>

            {/* Sign out */}
            <button
                onClick={onSignOut}
                className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-semibold text-sm mt-2"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
                <LogOut size={18} />
                Sair da conta
            </button>

            {/* ===== EDIT PROFILE MODAL ===== */}
            <AnimatePresence>
                {showEdit && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowEdit(false); }}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4 overflow-y-auto"
                            style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(124,58,237,0.2)', maxHeight: '92vh' }}
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-bold text-lg">Editar Perfil</h3>
                                <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-3">
                                <FormField label="Nome">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        className={inputClass}
                                        style={inputStyle}
                                    />
                                </FormField>

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="Peso (kg)">
                                        <input
                                            type="number"
                                            value={editWeight}
                                            onChange={e => setEditWeight(parseFloat(e.target.value) || 0)}
                                            className={inputClass}
                                            style={inputStyle}
                                            step="0.1" min="30" max="300"
                                        />
                                    </FormField>
                                    <FormField label="Altura (cm)">
                                        <input
                                            type="number"
                                            value={editHeight}
                                            onChange={e => setEditHeight(parseInt(e.target.value) || 0)}
                                            className={inputClass}
                                            style={inputStyle}
                                            min="100" max="250"
                                        />
                                    </FormField>
                                </div>

                                <FormField label="Idade">
                                    <input
                                        type="number"
                                        value={editAge}
                                        onChange={e => setEditAge(parseInt(e.target.value) || 0)}
                                        className={inputClass}
                                        style={inputStyle}
                                        min="10" max="100"
                                    />
                                </FormField>

                                <FormField label="Objetivo">
                                    <select
                                        value={editGoal}
                                        onChange={e => setEditGoal(e.target.value as Goal)}
                                        className={inputClass}
                                        style={inputStyle}
                                    >
                                        <option value="lose_weight">Perder Peso</option>
                                        <option value="gain_muscle">Ganhar Músculo</option>
                                        <option value="maintain">Manutenção</option>
                                        <option value="gain_weight">Ganhar Peso</option>
                                    </select>
                                </FormField>

                                <FormField label="Nível de Atividade">
                                    <select
                                        value={editActivity}
                                        onChange={e => setEditActivity(e.target.value as ActivityLevel)}
                                        className={inputClass}
                                        style={inputStyle}
                                    >
                                        <option value="sedentary">Sedentário</option>
                                        <option value="light">Leve</option>
                                        <option value="moderate">Moderado</option>
                                        <option value="active">Ativo</option>
                                        <option value="very_active">Muito Ativo</option>
                                    </select>
                                </FormField>

                                <FormField label="Tempo disponível por dia (min)">
                                    <input
                                        type="number"
                                        value={editMinutes}
                                        onChange={e => setEditMinutes(parseInt(e.target.value) || 0)}
                                        className={inputClass}
                                        style={inputStyle}
                                        min="15" max="180" step="5"
                                    />
                                </FormField>
                            </div>

                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={() => setShowEdit(false)}
                                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                >
                                    Cancelar
                                </button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={saveProfile}
                                    disabled={editSaving}
                                    className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                                    style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)', opacity: editSaving ? 0.6 : 1 }}
                                >
                                    {editSaving && <Loader2 size={16} className="animate-spin" />}
                                    {editSaving ? 'Salvando...' : 'Salvar'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ===== ADD PROGRESS MODAL ===== */}
            <AnimatePresence>
                {showAddProgress && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                        onClick={(e) => { if (e.target === e.currentTarget) { resetAddProgress(); setShowAddProgress(false); } }}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4"
                            style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(124,58,237,0.2)' }}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-white font-bold text-lg">Registrar Evolução</h3>
                                    <p className="text-gray-500 text-xs mt-0.5">
                                        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </p>
                                </div>
                                <button onClick={() => { resetAddProgress(); setShowAddProgress(false); }} className="text-gray-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Weight input */}
                            <FormField label="Peso atual (kg) — opcional">
                                <input
                                    type="number"
                                    value={progWeight}
                                    onChange={e => setProgWeight(e.target.value)}
                                    placeholder={String(profile.weight)}
                                    className={inputClass}
                                    style={inputStyle}
                                    step="0.1" min="30" max="300"
                                />
                            </FormField>

                            {/* Photo picker */}
                            <div>
                                <label className="text-gray-400 text-xs font-medium mb-2 block">Foto de progresso — opcional</label>
                                <input
                                    ref={photoRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoSelect}
                                    className="hidden"
                                />
                                {progPhotoPreview ? (
                                    <div className="relative">
                                        <img src={progPhotoPreview} alt="" className="w-full h-48 rounded-xl object-cover" />
                                        <button
                                            onClick={() => {
                                                setProgPhotoFile(null);
                                                if (progPhotoPreview) URL.revokeObjectURL(progPhotoPreview);
                                                setProgPhotoPreview(null);
                                            }}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                                            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                                        >
                                            <X size={14} className="text-white" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => photoRef.current?.click()}
                                        className="w-full py-7 rounded-xl flex flex-col items-center gap-2 transition-colors hover:opacity-80"
                                        style={{ backgroundColor: 'rgba(124,58,237,0.08)', border: '2px dashed rgba(124,58,237,0.3)' }}
                                    >
                                        <Camera size={26} style={{ color: '#7C3AED' }} />
                                        <span className="text-gray-400 text-sm">Tirar foto ou escolher da galeria</span>
                                    </button>
                                )}
                            </div>

                            {/* Notes */}
                            <FormField label="Observações — opcional">
                                <textarea
                                    value={progNotes}
                                    onChange={e => setProgNotes(e.target.value)}
                                    placeholder="Como você está se sentindo? Mudanças percebidas..."
                                    rows={2}
                                    className={inputClass + ' resize-none'}
                                    style={inputStyle}
                                />
                            </FormField>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => { resetAddProgress(); setShowAddProgress(false); }}
                                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                >
                                    Cancelar
                                </button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={saveProgress}
                                    disabled={progSaving || (!progWeight && !progPhotoFile)}
                                    className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                                    style={{
                                        background: 'linear-gradient(135deg, #7C3AED, #6d28d9)',
                                        opacity: (progSaving || (!progWeight && !progPhotoFile)) ? 0.5 : 1,
                                    }}
                                >
                                    {progSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    {progSaving ? 'Salvando...' : 'Registrar'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ===== VIEW PHOTO MODAL ===== */}
            <AnimatePresence>
                {viewEntry && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
                        onClick={() => setViewEntry(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative max-w-sm w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <img
                                src={viewEntry.photo_url!}
                                alt=""
                                className="w-full rounded-2xl object-contain"
                                style={{ maxHeight: '70vh' }}
                            />
                            <button
                                onClick={() => setViewEntry(null)}
                                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                            >
                                <X size={16} className="text-white" />
                            </button>
                            <div className="mt-3 text-center">
                                <p className="text-white font-semibold">
                                    {new Date(viewEntry.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                {viewEntry.weight != null && (
                                    <p className="text-gray-400 text-sm">{viewEntry.weight} kg</p>
                                )}
                                {viewEntry.notes && (
                                    <p className="text-gray-400 text-sm mt-1 italic">"{viewEntry.notes}"</p>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function StatItem({ label, value, trend }: { label: string; value: string; trend?: number | null }) {
    return (
        <div className="rounded-xl p-3 bg-white/5 border border-white/5">
            <p className="text-gray-500 text-[10px] uppercase font-medium tracking-wider mb-0.5">{label}</p>
            <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-semibold text-sm">{value}</p>
                {trend !== undefined && trend !== null && (
                    <span className={`text-[10px] font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${trend < 0 ? 'text-emerald-400 bg-emerald-400/10' : trend > 0 ? 'text-rose-400 bg-rose-400/10' : 'text-gray-400 bg-gray-400/10'}`}>
                        {trend < 0 ? <TrendingDown size={10} /> : trend > 0 ? <TrendingUp size={10} /> : <Minus size={10} />}
                        {trend > 0 ? '+' : ''}{trend.toFixed(1)}kg
                    </span>
                )}
            </div>
        </div>
    );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-gray-400 text-xs font-medium">{label}</label>
            {children}
        </div>
    );
}
