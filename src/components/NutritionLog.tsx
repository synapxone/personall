import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Camera, PenLine, X, Loader2, Sparkles, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { geminiService } from '../services/geminiService';
import type { Profile, Meal, MealType } from '../types';

interface Props {
    profile: Profile;
    onUpdate: () => void;
    onNutritionChange?: (totals: MacroTotals) => void;
}

interface MacroTotals {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

const MEAL_TYPES: { id: MealType; label: string; emoji: string; time: string }[] = [
    { id: 'breakfast', label: 'Café da manhã', emoji: '☀️', time: '07:00' },
    { id: 'lunch', label: 'Almoço', emoji: '🍽️', time: '12:00' },
    { id: 'snack', label: 'Lanche', emoji: '🍌', time: '15:30' },
    { id: 'dinner', label: 'Jantar', emoji: '🌙', time: '19:00' },
];

function today(): string {
    return new Date().toISOString().split('T')[0];
}

function compressImage(file: File, maxSize = 800): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            let { width, height } = img;
            if (width > maxSize || height > maxSize) {
                const ratio = Math.min(maxSize / width, maxSize / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
            URL.revokeObjectURL(url);
            resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
        };
        img.src = url;
    });
}

export default function NutritionLog({ profile, onUpdate, onNutritionChange }: Props) {
    const [meals, setMeals] = useState<Meal[]>([]);
    const [history, setHistory] = useState<{ date: string; calories: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMealType, setModalMealType] = useState<MealType>('breakfast');
    const [modalMode, setModalMode] = useState<'choose' | 'photo' | 'manual'>('choose');
    const [analyzeLoading, setAnalyzeLoading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Form state
    const [formDesc, setFormDesc] = useState('');
    const [formCal, setFormCal] = useState(0);
    const [formProt, setFormProt] = useState(0);
    const [formCarbs, setFormCarbs] = useState(0);
    const [formFat, setFormFat] = useState(0);
    const [analyzed, setAnalyzed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [suggestLoading, setSuggestLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [formQty, setFormQty] = useState<number>(1);
    const [formUnit, setFormUnit] = useState('');
    const [unitOptions, setUnitOptions] = useState<string[]>([]);
    const [unitsLoading, setUnitsLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const qtyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Detail / edit modal
    const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
    const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
    const [editDesc, setEditDesc] = useState('');
    const [editCal, setEditCal] = useState(0);
    const [editProt, setEditProt] = useState(0);
    const [editCarbs, setEditCarbs] = useState(0);
    const [editFat, setEditFat] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [editSaving, setEditSaving] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [mealsRes, histRes] = await Promise.all([
            supabase.from('meals').select('*').eq('user_id', profile.id).eq('meal_date', today()).order('logged_at', { ascending: true }),
            supabase.from('daily_nutrition').select('date,total_calories').eq('user_id', profile.id).order('date', { ascending: false }).limit(7),
        ]);
        const loadedMeals = (mealsRes.data as Meal[]) || [];
        setMeals(loadedMeals);
        if (histRes.data) {
            setHistory(histRes.data.map((r: any) => ({ date: r.date, calories: r.total_calories })).reverse());
        }
        setLoading(false);

        const totals = loadedMeals.reduce((acc, m) => ({
            calories: acc.calories + (m.calories || 0),
            protein: acc.protein + (m.protein || 0),
            carbs: acc.carbs + (m.carbs || 0),
            fat: acc.fat + (m.fat || 0),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
        onNutritionChange?.(totals);
    }

    function getTodayTotals(): MacroTotals {
        return meals.reduce((acc, m) => ({
            calories: acc.calories + (m.calories || 0),
            protein: acc.protein + (m.protein || 0),
            carbs: acc.carbs + (m.carbs || 0),
            fat: acc.fat + (m.fat || 0),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    }

    function openModal(type: MealType) {
        setModalMealType(type);
        setModalMode('choose');
        resetForm();
        setShowModal(true);
    }

    function resetForm() {
        setFormDesc(''); setFormCal(0); setFormProt(0); setFormCarbs(0); setFormFat(0);
        setFormQty(1); setFormUnit(''); setUnitOptions([]);
        setAnalyzed(false); setSuggestions([]); setShowSuggestions(false);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
        if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
    }

    const analyzeText = useCallback(async (food: string, qty: number, unit: string) => {
        if (!food.trim() || food.trim().length < 3) return;
        const fullDesc = unit ? `${qty} ${unit} de ${food}` : food;
        setAnalyzeLoading(true);
        setAnalyzed(false);
        try {
            const result = await geminiService.analyzeFoodText(fullDesc);
            setFormCal(result.calories);
            setFormProt(result.protein);
            setFormCarbs(result.carbs);
            setFormFat(result.fat);
            setAnalyzed(true);
        } catch {
            // keep zeros
        } finally {
            setAnalyzeLoading(false);
        }
    }, []);

    const fetchSuggestions = useCallback(async (query: string) => {
        if (query.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
        setSuggestLoading(true);
        try {
            const list = await geminiService.suggestFoods(query.trim());
            setSuggestions(list);
            setShowSuggestions(list.length > 0);
        } catch {
            setSuggestions([]);
        } finally {
            setSuggestLoading(false);
        }
    }, []);

    function handleDescChange(value: string) {
        setFormDesc(value);
        setAnalyzed(false);
        setShowSuggestions(false);
        setUnitOptions([]); setFormUnit('');
        if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
        suggestDebounceRef.current = setTimeout(() => fetchSuggestions(value), 500);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (value.trim().length >= 3) {
            debounceRef.current = setTimeout(() => {
                loadUnitsAndAnalyze(value, 1, '');
            }, 2000);
        }
    }

    async function loadUnitsAndAnalyze(food: string, qty: number, unit: string) {
        setUnitsLoading(true);
        try {
            const units = await geminiService.suggestUnits(food);
            setUnitOptions(units);
            const firstUnit = unit || units[0] || '';
            setFormUnit(firstUnit);
            await analyzeText(food, qty, firstUnit);
        } catch {
            await analyzeText(food, qty, unit);
        } finally {
            setUnitsLoading(false);
        }
    }

    function selectSuggestion(item: string) {
        setFormDesc(item);
        setShowSuggestions(false);
        setSuggestions([]);
        setFormQty(1); setFormUnit(''); setUnitOptions([]);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
        loadUnitsAndAnalyze(item, 1, '');
    }

    function handleQtyChange(qty: number) {
        setFormQty(qty);
        setAnalyzed(false);
        if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
        qtyDebounceRef.current = setTimeout(() => analyzeText(formDesc, qty, formUnit), 800);
    }

    function handleUnitChange(unit: string) {
        setFormUnit(unit);
        analyzeText(formDesc, formQty, unit);
    }

    async function handlePhotoAnalysis(file: File) {
        setModalMode('photo');
        setAnalyzeLoading(true);
        try {
            const { base64, mimeType } = await compressImage(file);
            const result = await geminiService.analyzeFoodPhoto(base64, mimeType);
            setFormDesc(result.description);
            setFormCal(result.calories);
            setFormProt(result.protein);
            setFormCarbs(result.carbs);
            setFormFat(result.fat);
            setAnalyzed(true);
            setModalMode('manual');
        } catch {
            toast.error('Não foi possível analisar a foto. Preencha manualmente.');
            setModalMode('manual');
        } finally {
            setAnalyzeLoading(false);
        }
    }

    async function updateDailyNutrition(mealList: { calories: number; protein: number; carbs: number; fat: number }[]) {
        const totals = mealList.reduce((acc, m) => ({
            total_calories: acc.total_calories + (m.calories || 0),
            total_protein: acc.total_protein + (m.protein || 0),
            total_carbs: acc.total_carbs + (m.carbs || 0),
            total_fat: acc.total_fat + (m.fat || 0),
        }), { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 });
        await supabase.from('daily_nutrition').upsert({
            user_id: profile.id,
            date: today(),
            ...totals,
            goal_calories: profile.daily_calorie_goal,
        }, { onConflict: 'user_id,date' });
    }

    async function saveMeal() {
        if (!formDesc.trim()) {
            toast.error('Descreva o alimento primeiro.');
            return;
        }
        setSaving(true);
        const fullDescription = formUnit ? `${formQty} ${formUnit} de ${formDesc}` : formDesc;
        const mealData = {
            user_id: profile.id,
            meal_date: today(),
            meal_type: modalMealType,
            description: fullDescription,
            calories: formCal,
            protein: formProt,
            carbs: formCarbs,
            fat: formFat,
            logged_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('meals').insert(mealData);
        if (error) {
            toast.error('Erro ao salvar refeição.');
        } else {
            toast.success('Refeição registrada!');
            setShowModal(false);
            resetForm();
            await updateDailyNutrition([...meals, mealData as any]);
            await loadData();
            onUpdate();
        }
        setSaving(false);
    }

    function openMealDetail(meal: Meal) {
        setSelectedMeal(meal);
        setDetailMode('view');
        setConfirmDelete(false);
    }

    function startEditMeal() {
        if (!selectedMeal) return;
        setEditDesc(selectedMeal.description);
        setEditCal(selectedMeal.calories);
        setEditProt(selectedMeal.protein);
        setEditCarbs(selectedMeal.carbs);
        setEditFat(selectedMeal.fat);
        setDetailMode('edit');
    }

    async function handleDeleteMeal() {
        if (!selectedMeal) return;
        setDeleting(true);
        const { error } = await supabase.from('meals').delete().eq('id', selectedMeal.id);
        if (error) {
            toast.error('Erro ao excluir refeição.');
        } else {
            toast.success('Refeição excluída.');
            const remaining = meals.filter((m) => m.id !== selectedMeal.id);
            await updateDailyNutrition(remaining);
            setSelectedMeal(null);
            await loadData();
            onUpdate();
        }
        setDeleting(false);
    }

    async function saveEditMeal() {
        if (!selectedMeal) return;
        setEditSaving(true);
        const { error } = await supabase.from('meals').update({
            description: editDesc,
            calories: editCal,
            protein: editProt,
            carbs: editCarbs,
            fat: editFat,
        }).eq('id', selectedMeal.id);
        if (error) {
            toast.error('Erro ao salvar alterações.');
        } else {
            toast.success('Refeição atualizada!');
            const updated = meals.map((m) =>
                m.id === selectedMeal.id
                    ? { ...m, description: editDesc, calories: editCal, protein: editProt, carbs: editCarbs, fat: editFat }
                    : m
            );
            await updateDailyNutrition(updated);
            setSelectedMeal(null);
            await loadData();
            onUpdate();
        }
        setEditSaving(false);
    }

    const totals = getTodayTotals();
    const goal = profile.daily_calorie_goal || 2000;
    const calPct = Math.min((totals.calories / Math.max(goal, 1)) * 100, 100) || 0;

    // SVG ring
    const radius = 56;
    const circ = 2 * Math.PI * radius;
    const dashOffset = circ - (calPct / 100) * circ;

    // Estimated macro targets (rough)
    const protGoal = Math.round((goal * 0.3) / 4);
    const carbGoal = Math.round((goal * 0.4) / 4);
    const fatGoal = Math.round((goal * 0.3) / 9);

    const maxHistCal = Math.max(...history.map((h) => h.calories), goal, 1);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 size={32} className="animate-spin" style={{ color: '#7C3AED' }} />
            </div>
        );
    }

    return (
        <div className="flex flex-col px-4 py-5 gap-5 max-w-lg mx-auto">
            {/* Calorie ring */}
            <div className="flex flex-col items-center gap-2">
                <div className="relative w-36 h-36">
                    <svg width="144" height="144" viewBox="0 0 144 144" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="72" cy="72" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                        <circle
                            cx="72" cy="72" r={radius} fill="none"
                            stroke={totals.calories > goal ? '#EF4444' : '#10B981'}
                            strokeWidth="10"
                            strokeDasharray={circ}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-extrabold text-white">{totals.calories}</span>
                        <span className="text-xs text-gray-400">/ {goal} kcal</span>
                    </div>
                </div>
                <p className="text-gray-400 text-sm">
                    {totals.calories >= goal
                        ? 'Meta atingida!'
                        : `Faltam ${goal - totals.calories} kcal`}
                </p>
            </div>

            {/* Macro bars */}
            <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ backgroundColor: '#1A1A2E' }}>
                <p className="text-white font-semibold text-sm mb-1">Macronutrientes</p>
                <MacroBar label="Proteína" value={totals.protein} goal={protGoal} unit="g" color="#7C3AED" />
                <MacroBar label="Carboidratos" value={totals.carbs} goal={carbGoal} unit="g" color="#F59E0B" />
                <MacroBar label="Gordura" value={totals.fat} goal={fatGoal} unit="g" color="#EF4444" />
            </div>

            {/* Meal cards */}
            <div className="flex flex-col gap-3">
                {MEAL_TYPES.map((mt) => {
                    const mealItems = meals.filter((m) => m.meal_type === mt.id);
                    const mealCals = mealItems.reduce((sum, m) => sum + m.calories, 0);

                    return (
                        <div key={mt.id} className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center justify-between px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">{mt.emoji}</span>
                                    <div>
                                        <p className="text-white font-semibold text-sm">{mt.label}</p>
                                        <p className="text-gray-500 text-xs">{mt.time} · {mealCals} kcal</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => openModal(mt.id)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-white"
                                    style={{ backgroundColor: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.4)' }}
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                            {mealItems.length > 0 && (
                                <div className="flex flex-col px-4 pb-3">
                                    {mealItems.map((meal) => (
                                        <button
                                            key={meal.id}
                                            onClick={() => openMealDetail(meal)}
                                            className="flex items-center justify-between text-xs py-2 w-full text-left group"
                                            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                                        >
                                            <span className="text-gray-300 flex-1 truncate group-hover:text-white transition-colors">{meal.description}</span>
                                            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                                <span className="text-gray-500">{meal.calories} kcal</span>
                                                <ChevronRight size={12} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 7-day history */}
            {history.length > 0 && (
                <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ backgroundColor: '#1A1A2E' }}>
                    <p className="text-white font-semibold text-sm">Últimos 7 dias</p>
                    <div className="flex items-end gap-2 h-20">
                        {history.map((h) => {
                            const pct = (h.calories / maxHistCal) * 100;
                            const date = new Date(h.date + 'T12:00:00');
                            const label = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
                            return (
                                <div key={h.date} className="flex-1 flex flex-col items-center gap-1">
                                    <div className="w-full flex items-end" style={{ height: '64px' }}>
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${pct}%` }}
                                            transition={{ duration: 0.5 }}
                                            className="w-full rounded-t-md"
                                            style={{ backgroundColor: h.calories >= goal ? '#10B981' : '#7C3AED', opacity: 0.7 }}
                                        />
                                    </div>
                                    <span className="text-gray-500 text-xs capitalize">{label}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>0 kcal</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#10B981' }} />Meta</span>
                    </div>
                </div>
            )}

            {/* Hidden file input */}
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoAnalysis(f); }}
            />

            {/* Add modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
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
                                <h3 className="text-white font-bold">
                                    Adicionar a {MEAL_TYPES.find((m) => m.id === modalMealType)?.label}
                                </h3>
                                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>

                            {modalMode === 'choose' && (
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => fileRef.current?.click()}
                                        className="flex items-center gap-4 px-4 py-4 rounded-xl text-left"
                                        style={{ backgroundColor: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)' }}
                                    >
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.2)' }}>
                                            <Camera size={20} style={{ color: '#7C3AED' }} />
                                        </div>
                                        <div>
                                            <p className="text-white font-semibold text-sm">Foto</p>
                                            <p className="text-gray-400 text-xs">IA analisa a refeição automaticamente</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setModalMode('manual')}
                                        className="flex items-center gap-4 px-4 py-4 rounded-xl text-left"
                                        style={{ backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}
                                    >
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.2)' }}>
                                            <PenLine size={20} style={{ color: '#10B981' }} />
                                        </div>
                                        <div>
                                            <p className="text-white font-semibold text-sm">Manual</p>
                                            <p className="text-gray-400 text-xs">Preencha os dados da refeição</p>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {modalMode === 'photo' && analyzeLoading && (
                                <div className="flex flex-col items-center gap-4 py-8">
                                    <Loader2 size={32} className="animate-spin" style={{ color: '#7C3AED' }} />
                                    <p className="text-gray-400 text-sm">Analisando a foto com IA...</p>
                                </div>
                            )}

                            {modalMode === 'manual' && (
                                <div className="flex flex-col gap-4">
                                    {/* Food description input */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-gray-400 text-xs font-medium">O que você comeu?</label>
                                        <div className="relative">
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="Ex: pão, arroz com frango, banana..."
                                                value={formDesc}
                                                onChange={(e) => handleDescChange(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Escape') setShowSuggestions(false); }}
                                                className="w-full px-3 py-3 pr-10 rounded-xl text-white text-sm outline-none"
                                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                {(analyzeLoading || suggestLoading)
                                                    ? <Loader2 size={16} className="animate-spin" style={{ color: '#7C3AED' }} />
                                                    : analyzed
                                                        ? <Sparkles size={16} style={{ color: '#10B981' }} />
                                                        : null}
                                            </div>

                                            {/* Suggestions dropdown */}
                                            <AnimatePresence>
                                                {showSuggestions && suggestions.length > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -4 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -4 }}
                                                        transition={{ duration: 0.15 }}
                                                        className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-10"
                                                        style={{ backgroundColor: '#12122A', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                                                    >
                                                        {suggestions.map((item, i) => (
                                                            <button
                                                                key={i}
                                                                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(item); }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white transition-colors"
                                                                style={{ borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                                                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(124,58,237,0.15)')}
                                                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                                            >
                                                                {item}
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <p className="text-gray-600 text-xs">
                                            {analyzeLoading ? 'Calculando nutrientes com IA...'
                                                : suggestLoading ? 'Buscando sugestões...'
                                                    : analyzed ? 'Nutrientes calculados automaticamente ✓'
                                                        : 'Digite e escolha uma opção ou pressione Enter'}
                                        </p>
                                    </div>

                                    {/* Quantity + Unit selector */}
                                    {(unitOptions.length > 0 || unitsLoading) && (
                                        <div className="flex flex-col gap-2">
                                            <label className="text-gray-400 text-xs font-medium">Quantidade</label>
                                            <div className="flex gap-3 items-center">
                                                <input
                                                    type="number"
                                                    min={0.25}
                                                    step={0.25}
                                                    value={formQty}
                                                    onChange={(e) => handleQtyChange(parseFloat(e.target.value) || 1)}
                                                    className="w-20 px-3 py-2.5 rounded-xl text-white text-sm font-bold text-center outline-none"
                                                    style={{ backgroundColor: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)' }}
                                                />
                                                <div className="flex-1 flex flex-wrap gap-2">
                                                    {unitsLoading
                                                        ? [1, 2, 3].map(i => <div key={i} className="h-8 w-16 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />)
                                                        : unitOptions.map((u) => (
                                                            <button
                                                                key={u}
                                                                onClick={() => handleUnitChange(u)}
                                                                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap"
                                                                style={{
                                                                    backgroundColor: formUnit === u ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)',
                                                                    border: `1px solid ${formUnit === u ? '#7C3AED' : 'rgba(255,255,255,0.1)'}`,
                                                                    color: formUnit === u ? '#a78bfa' : '#9ca3af',
                                                                }}
                                                            >
                                                                {u}
                                                            </button>
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Nutrition result cards */}
                                    {(analyzed || analyzeLoading) && (
                                        <div className="grid grid-cols-4 gap-2">
                                            {[
                                                { label: 'Calorias', value: formCal, unit: 'kcal', color: '#10B981' },
                                                { label: 'Proteína', value: formProt, unit: 'g', color: '#7C3AED' },
                                                { label: 'Carbs', value: formCarbs, unit: 'g', color: '#F59E0B' },
                                                { label: 'Gordura', value: formFat, unit: 'g', color: '#EF4444' },
                                            ].map((m) => (
                                                <motion.div
                                                    key={m.label}
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: analyzeLoading ? 0.4 : 1, y: 0 }}
                                                    className="flex flex-col items-center gap-1 py-3 rounded-xl"
                                                    style={{ backgroundColor: `${m.color}15`, border: `1px solid ${m.color}30` }}
                                                >
                                                    {analyzeLoading
                                                        ? <div className="w-8 h-4 rounded animate-pulse" style={{ backgroundColor: `${m.color}30` }} />
                                                        : <span className="text-lg font-bold text-white">{m.value}</span>}
                                                    <span className="text-xs" style={{ color: m.color }}>{m.unit}</span>
                                                    <span className="text-gray-500 text-xs">{m.label}</span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}

                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={saveMeal}
                                        disabled={saving || !formDesc.trim()}
                                        className="w-full py-4 rounded-xl font-bold text-white"
                                        style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)', opacity: (saving || !formDesc.trim()) ? 0.5 : 1 }}
                                    >
                                        {saving ? 'Salvando...' : 'Salvar Refeição'}
                                    </motion.button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Meal detail / edit modal */}
            <AnimatePresence>
                {selectedMeal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                        onClick={(e) => { if (e.target === e.currentTarget) setSelectedMeal(null); }}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4"
                            style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(124,58,237,0.2)' }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-bold truncate flex-1 pr-2">
                                    {detailMode === 'edit' ? 'Editar refeição' : MEAL_TYPES.find((m) => m.id === selectedMeal.meal_type)?.label ?? 'Refeição'}
                                </h3>
                                <button onClick={() => setSelectedMeal(null)} className="text-gray-400 hover:text-white flex-shrink-0">
                                    <X size={20} />
                                </button>
                            </div>

                            {detailMode === 'view' && (
                                <>
                                    {/* Description */}
                                    <p className="text-gray-200 text-sm leading-relaxed">{selectedMeal.description}</p>

                                    {/* Macro grid */}
                                    <div className="grid grid-cols-4 gap-2">
                                        {[
                                            { label: 'Calorias', value: selectedMeal.calories, unit: 'kcal', color: '#10B981' },
                                            { label: 'Proteína', value: selectedMeal.protein, unit: 'g', color: '#7C3AED' },
                                            { label: 'Carbs', value: selectedMeal.carbs, unit: 'g', color: '#F59E0B' },
                                            { label: 'Gordura', value: selectedMeal.fat, unit: 'g', color: '#EF4444' },
                                        ].map((m) => (
                                            <div
                                                key={m.label}
                                                className="flex flex-col items-center gap-1 py-3 rounded-xl"
                                                style={{ backgroundColor: `${m.color}15`, border: `1px solid ${m.color}30` }}
                                            >
                                                <span className="text-lg font-bold text-white">{m.value}</span>
                                                <span className="text-xs" style={{ color: m.color }}>{m.unit}</span>
                                                <span className="text-gray-500 text-xs">{m.label}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={startEditMeal}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white"
                                            style={{ backgroundColor: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)' }}
                                        >
                                            <Pencil size={15} />
                                            Editar
                                        </button>
                                        {confirmDelete ? (
                                            <div className="flex-1 flex gap-2">
                                                <button
                                                    onClick={() => setConfirmDelete(false)}
                                                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={handleDeleteMeal}
                                                    disabled={deleting}
                                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1"
                                                    style={{ backgroundColor: '#EF4444' }}
                                                >
                                                    {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Confirmar'}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDelete(true)}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
                                                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                                            >
                                                <Trash2 size={15} />
                                                Excluir
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}

                            {detailMode === 'edit' && (
                                <div className="flex flex-col gap-4">
                                    {/* Description */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-gray-400 text-xs font-medium">Descrição</label>
                                        <input
                                            type="text"
                                            value={editDesc}
                                            onChange={(e) => setEditDesc(e.target.value)}
                                            className="w-full px-3 py-3 rounded-xl text-white text-sm outline-none"
                                            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                        />
                                    </div>

                                    {/* Macro inputs */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: 'Calorias (kcal)', value: editCal, set: setEditCal, color: '#10B981' },
                                            { label: 'Proteína (g)', value: editProt, set: setEditProt, color: '#7C3AED' },
                                            { label: 'Carboidratos (g)', value: editCarbs, set: setEditCarbs, color: '#F59E0B' },
                                            { label: 'Gordura (g)', value: editFat, set: setEditFat, color: '#EF4444' },
                                        ].map((f) => (
                                            <div key={f.label} className="flex flex-col gap-1.5">
                                                <label className="text-gray-400 text-xs font-medium">{f.label}</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={f.value}
                                                    onChange={(e) => f.set(parseFloat(e.target.value) || 0)}
                                                    className="w-full px-3 py-2.5 rounded-xl text-white text-sm font-bold outline-none text-center"
                                                    style={{ backgroundColor: `${f.color}15`, border: `1px solid ${f.color}40` }}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setDetailMode('view')}
                                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                        >
                                            Cancelar
                                        </button>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.97 }}
                                            onClick={saveEditMeal}
                                            disabled={editSaving || !editDesc.trim()}
                                            className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                                            style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)', opacity: (editSaving || !editDesc.trim()) ? 0.5 : 1 }}
                                        >
                                            {editSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                                            {editSaving ? 'Salvando...' : 'Salvar'}
                                        </motion.button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function MacroBar({ label, value, goal, unit, color }: { label: string; value: number; goal: number; unit: string; color: string }) {
    const pct = Math.min((value / Math.max(goal, 1)) * 100, 100);
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
                <span className="text-gray-400">{label}</span>
                <span className="text-white">{value}{unit} / {goal}{unit}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5 }}
                />
            </div>
        </div>
    );
}

