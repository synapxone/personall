import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Camera, PenLine, X, Loader2, Sparkles, Pencil, Trash2, Images, ChevronLeft, ChevronRight, CalendarDays, GlassWater, Flame, Zap, Activity, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { geminiService } from '../services/geminiService';
import type { Profile, Meal, MealType, FoodAnalysis } from '../types';

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

const MEAL_TYPES: { id: MealType; label: string; icon: React.ReactNode; time: string; color: string }[] = [
    { id: 'breakfast', label: 'Café da manhã', icon: <Flame size={18} />, time: '07:00', color: '#8B5CF6' },
    { id: 'lunch', label: 'Almoço', icon: <Activity size={18} />, time: '12:00', color: '#3B82F6' },
    { id: 'snack', label: 'Lanche', icon: <Zap size={18} />, time: '15:30', color: '#F59E0B' },
    { id: 'dinner', label: 'Jantar', icon: <TrendingUp size={18} />, time: '19:00', color: '#10B981' },
];

function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prevDay(date: string): string {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return localDateStr(d);
}

function nextDay(date: string): string {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return localDateStr(d);
}

function formatDateLabel(date: string): string {
    const t = today();
    if (date === t) return 'Hoje';
    if (date === prevDay(t)) return 'Ontem';
    const d = new Date(date + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '');
}

function buildCalendarDays(month: Date): (string | null)[] {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push(`${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return cells;
}

function compressImage(file: File, maxSize = 512): Promise<{ base64: string; mimeType: string }> {
    return new Promise(async (resolve) => {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;

            // Use createImageBitmap if available for MASSIVE memory savings (prevents iOS Safari OOM crash)
            if ('createImageBitmap' in window) {
                try {
                    const bitmap = await createImageBitmap(file);
                    let { width, height } = bitmap;
                    if (width > maxSize || height > maxSize) {
                        const ratio = Math.min(maxSize / width, maxSize / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(bitmap, 0, 0, width, height);
                    bitmap.close(); // free memory immediately
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
                    return;
                } catch (err) {
                    console.warn('createImageBitmap failed, falling back to Image', err);
                }
            }

            // Fallback for older browsers
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
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                URL.revokeObjectURL(url);
                resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve({ base64: '', mimeType: 'image/jpeg' });
            };
            img.src = url;
        } catch (e) {
            console.error('compressImage crash', e);
            resolve({ base64: '', mimeType: 'image/jpeg' });
        }
    });
}

export default function NutritionLog({ profile, onUpdate, onNutritionChange }: Props) {
    const [selectedDate, setSelectedDate] = useState<string>(today());
    const [showCalendar, setShowCalendar] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(() => new Date());
    const [mealDates, setMealDates] = useState<Set<string>>(new Set());

    const [meals, setMeals] = useState<Meal[]>([]);
    const [history, setHistory] = useState<{ date: string; calories: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [waterCups, setWaterCups] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [modalMealType, setModalMealType] = useState<MealType>('breakfast');
    const [modalMode, setModalMode] = useState<'choose' | 'photo' | 'manual' | 'photoItems' | 'camera'>('choose');
    const [photoItems, setPhotoItems] = useState<FoodAnalysis[]>([]);
    const [analyzeLoading, setAnalyzeLoading] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

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
    const [formQty, setFormQty] = useState<number | string>('');
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
        loadData(selectedDate);
    }, [selectedDate]);

    useEffect(() => {
        fetchMealDates();
    }, []);

    async function loadData(date: string) {
        setLoading(true);
        try {
            const [mealsRes, histRes, waterRes] = await Promise.all([
                supabase.from('meals').select('*').eq('user_id', profile.id).eq('meal_date', date).order('logged_at', { ascending: true }),
                supabase.from('daily_nutrition').select('date,total_calories').eq('user_id', profile.id).order('date', { ascending: false }).limit(7),
                supabase.from('daily_nutrition').select('water_cups').eq('user_id', profile.id).eq('date', date).maybeSingle(),
            ]);
            const loadedMeals = (mealsRes.data as Meal[]) || [];
            setMeals(loadedMeals);
            if (histRes.data) {
                setHistory(histRes.data.map((r: any) => ({ date: r.date, calories: r.total_calories })).reverse());
            }
            const dbWater = (waterRes.data as any)?.water_cups;
            if (typeof dbWater === 'number') {
                setWaterCups(dbWater);
            } else {
                const saved = localStorage.getItem(`water_${profile.id}_${date}`);
                if (saved) setWaterCups(parseInt(saved));
                else setWaterCups(0);
            }
            const totals = loadedMeals.reduce((acc, m) => ({
                calories: acc.calories + (m.calories || 0),
                protein: acc.protein + (m.protein || 0),
                carbs: acc.carbs + (m.carbs || 0),
                fat: acc.fat + (m.fat || 0),
            }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
            onNutritionChange?.(totals);
        } catch (e) {
            console.error('NutritionLog loadData error:', e);
            const saved = localStorage.getItem(`water_${profile.id}_${date}`);
            if (saved) setWaterCups(parseInt(saved));
            else setWaterCups(0);
        } finally {
            setLoading(false);
        }
    }

    async function fetchMealDates() {
        const { data } = await supabase.from('meals').select('meal_date').eq('user_id', profile.id);
        if (data) setMealDates(new Set(data.map((r: any) => r.meal_date)));
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
        setFormQty(''); setFormUnit(''); setUnitOptions([]);
        setAnalyzed(false); setSuggestions([]); setShowSuggestions(false);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
        if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
    }

    const analyzeText = useCallback(async (food: string, qty: number, unit: string) => {
        const numQty = typeof qty === 'number' ? qty : 1;
        const fullDesc = unit ? `${numQty} ${unit} de ${food}` : food;
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
    }

    function onSearch() {
        if (formDesc.trim().length < 2) return;
        fetchSuggestions(formDesc);
    }

    function onAddDirectly() {
        if (formDesc.trim().length < 2) return;
        setFormQty(1);
        loadUnitsAndAnalyze(formDesc, 1, '');
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

    function handleQtyChange(qty: number | string) {
        setFormQty(qty);
        setAnalyzed(false);
        if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
        const numQty = typeof qty === 'number' ? qty : 1;
        qtyDebounceRef.current = setTimeout(() => analyzeText(formDesc, numQty, formUnit), 800);
    }

    function handleUnitChange(unit: string) {
        setFormUnit(unit);
        const numQty = typeof formQty === 'number' ? formQty : 1;
        analyzeText(formDesc, numQty, unit);
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
        } catch (e) {
            console.error('Photo analysis error', e);
            toast.error('Não foi possível analisar a foto. Tente tirar a foto mais de perto ou preencha manualmente.');
            setModalMode('manual');
        } finally {
            setAnalyzeLoading(false);
        }
    }

    async function handleCameraPhoto(file: File) {
        setModalMode('photo');
        setAnalyzeLoading(true);
        try {
            const { base64, mimeType } = await compressImage(file);
            const items = await geminiService.analyzeFoodPhotoItems(base64, mimeType);
            if (items.length === 1) {
                setFormDesc(items[0].description);
                setFormCal(items[0].calories);
                setFormProt(items[0].protein);
                setFormCarbs(items[0].carbs);
                setFormFat(items[0].fat);
                setAnalyzed(true);
                setModalMode('manual');
            } else {
                setPhotoItems(items);
                setModalMode('photoItems');
            }
        } catch (e) {
            console.error('Camera photo analysis error', e);
            toast.error('Não foi possível analisar a foto. Tente novamente ou preencha manualmente.');
            setModalMode('manual');
        } finally {
            setAnalyzeLoading(false);
        }
    }

    // Attach stream to video element whenever camera mode activates
    useEffect(() => {
        if (modalMode === 'camera' && cameraStream && videoRef.current) {
            videoRef.current.srcObject = cameraStream;
            videoRef.current.play().catch(() => {/* autoplay may be blocked */ });
        }
    }, [modalMode, cameraStream]);

    // Stop camera stream when modal closes
    useEffect(() => {
        if (!showModal && cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            setCameraStream(null);
        }
    }, [showModal]);

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            setCameraStream(null);
        }
    }

    async function openInAppCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            setCameraStream(stream);
            setModalMode('camera');
        } catch (e) {
            console.error('Camera access error', e);
            toast.error('Câmera não disponível. Use a Galeria ou Manual.');
        }
    }

    function captureFromCamera() {
        if (!videoRef.current || !canvasRef.current || !cameraStream) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        stopCamera();
        canvas.toBlob((blob) => {
            if (!blob) { setModalMode('choose'); return; }
            const file = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
            handleCameraPhoto(file);
        }, 'image/jpeg', 0.85);
    }

    async function saveAllPhotoItems(items: FoodAnalysis[]) {
        setSaving(true);
        const toastId = toast.loading(`Salvando ${items.length} itens...`);
        try {
            const inserts = items.map(item => ({
                user_id: profile.id,
                meal_date: selectedDate,
                meal_type: modalMealType,
                description: item.description,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                logged_at: new Date().toISOString(),
            }));
            const { data: inserted, error } = await supabase.from('meals').insert(inserts).select();
            if (error || !inserted) {
                toast.error('Erro ao salvar refeições.', { id: toastId });
                return;
            }
            toast.success(`${items.length} ${items.length === 1 ? 'item registrado' : 'itens registrados'}!`, { id: toastId });
            setShowModal(false);
            resetForm();
            setPhotoItems([]);
            const newMeals = [...meals, ...(inserted as Meal[])];
            setMeals(newMeals);
            await updateDailyNutrition(newMeals);
            await rewardGamification(items.length);
            onUpdate();
        } catch (e) {
            toast.error('Erro ao salvar.', { id: toastId });
        } finally {
            setSaving(false);
        }
    }
    async function rewardGamification(mealCount = 1) {
        const { data } = await supabase.from('gamification').select('points, total_meals_logged').eq('user_id', profile.id).single();
        if (data) {
            await supabase.from('gamification').update({
                points: data.points + (mealCount * 25), // 25 points per meal
                total_meals_logged: data.total_meals_logged + mealCount
            }).eq('user_id', profile.id);
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
            date: selectedDate,
            ...totals,
            goal_calories: profile.daily_calorie_goal,
            water_cups: waterCups,
        }, { onConflict: 'user_id,date' });
    }

    async function saveMeal() {
        if (!formDesc.trim()) {
            toast.error('Descreva o alimento primeiro.');
            return;
        }
        setSaving(true);
        const numQty = typeof formQty === 'number' ? formQty : 1;
        const fullDescription = formUnit ? `${numQty} ${formUnit} de ${formDesc}` : formDesc;
        const mealData = {
            user_id: profile.id,
            meal_date: selectedDate,
            meal_type: modalMealType,
            description: fullDescription,
            calories: formCal,
            protein: formProt,
            carbs: formCarbs,
            fat: formFat,
            logged_at: new Date().toISOString(),
        };

        const { data: insertedMeal, error } = await supabase.from('meals').insert(mealData).select().single();
        if (error || !insertedMeal) {
            toast.error('Erro ao salvar refeição.');
            setSaving(false);
            return;
        }

        toast.success('Refeição registrada!');
        setShowModal(false);
        resetForm();
        setSaving(false);

        const newMeals = [...meals, insertedMeal as Meal];
        setMeals(newMeals);
        await updateDailyNutrition(newMeals);
        await rewardGamification(1);
        onUpdate();

        // Background calculation if not analyzed
        if (!analyzed && formCal === 0) {
            const toastId = toast.loading(`Calculando nutrientes do alimento...`);
            try {
                const result = await geminiService.analyzeFoodText(fullDescription);
                const { error: updateErr } = await supabase.from('meals').update({
                    calories: result.calories,
                    protein: result.protein,
                    carbs: result.carbs,
                    fat: result.fat,
                }).eq('id', insertedMeal.id);

                if (!updateErr) {
                    toast.success(`Nutrientes calculados!`, { id: toastId });
                    const updatedMeal = { ...insertedMeal, ...result } as Meal;
                    setMeals((prev) => {
                        const updated = prev.map(m => m.id === insertedMeal.id ? updatedMeal : m);
                        updateDailyNutrition(updated);
                        return updated;
                    });
                    onUpdate();
                } else {
                    toast.error(`Falha ao atualizar nutrientes no banco.`, { id: toastId });
                }
            } catch (e) {
                toast.error(`O cálculo de IA falhou. Continue usando com 0 calorias ou edite depois.`, { id: toastId });
            }
        }
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
            await loadData(selectedDate);
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
            await loadData(selectedDate);
            onUpdate();
        }
        setEditSaving(false);
    }

    const totals = getTodayTotals();
    const goal = profile.daily_calorie_goal || 2000;

    // Estimated macro targets (rough)
    const protGoal = Math.round((goal * 0.3) / 4);
    const carbGoal = Math.round((goal * 0.4) / 4);
    const fatGoal = Math.round((goal * 0.3) / 9);

    const circumference = 2 * Math.PI * 72;
    // Pcts for the segmented ring, clamped so they never exceed 100% combined.
    const protItemPct = Math.min(((totals.protein * 4) / goal) * 100, 100);
    const carbItemPct = Math.min(((totals.carbs * 4) / goal) * 100, 100 - protItemPct);
    const fatItemPct = Math.min(((totals.fat * 9) / goal) * 100, 100 - protItemPct - carbItemPct);

    const maxHistCal = Math.max(...history.map((h) => h.calories), goal, 1);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 size={32} className="animate-spin" style={{ color: '#7C3AED' }} />
            </div>
        );
    }

    const waterGoalMl = profile.weight * 35;
    const goalCups = Math.ceil(waterGoalMl / 250);

    const handleCupClick = (idx: number) => {
        setWaterCups(prev => {
            let n = idx + 1;
            if (prev === n) n--;
            localStorage.setItem(`water_${profile.id}_${selectedDate}`, n.toString());
            // Persist to Supabase (update only — row is created by updateDailyNutrition on meal save)
            supabase.from('daily_nutrition')
                .update({ water_cups: n })
                .eq('user_id', profile.id)
                .eq('date', selectedDate)
                .then(({ error }) => { if (error) console.warn('Water save error:', error.message); });
            return n;
        });
    };

    return (
        <div className="flex flex-col px-4 py-5 gap-6 max-w-lg mx-auto pb-56">
            {/* Date Navigation */}
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setSelectedDate(prevDay(selectedDate))}
                    className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-white transition-colors"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                >
                    <ChevronLeft size={18} />
                </button>

                <button
                    type="button"
                    onClick={() => { setCalendarMonth(new Date(selectedDate + 'T12:00:00')); setShowCalendar(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}
                >
                    <CalendarDays size={14} style={{ color: '#7C3AED' }} />
                    {formatDateLabel(selectedDate)}
                </button>

                <button
                    type="button"
                    onClick={() => setSelectedDate(nextDay(selectedDate))}
                    disabled={selectedDate >= today()}
                    className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Daily Summary Card (Premium) */}
            <div className="relative overflow-hidden rounded-[32px] p-6 bg-gradient-to-br from-[#1A1A2E] to-[#12121A] border border-white/5 shadow-2xl flex flex-col gap-6 w-full">
                {/* Decorative glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 blur-[80px] rounded-full pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />

                <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                    {/* Premium Calorie Ring */}
                    <div className="relative w-40 h-40 flex-shrink-0">
                        <svg width="160" height="160" viewBox="0 0 160 160" className="transform -rotate-90">
                            {/* Background Track */}
                            <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />

                            {totals.calories > goal ? (
                                /* Over goal - show failure gradient */
                                <motion.circle
                                    cx="80" cy="80" r="72" fill="none"
                                    stroke="url(#failGradient)"
                                    strokeWidth="12"
                                    strokeDasharray={circumference}
                                    initial={{ strokeDashoffset: circumference }}
                                    animate={{ strokeDashoffset: 0 }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    strokeLinecap="round"
                                />
                            ) : (
                                /* Under goal - segmented macro colors */
                                <>
                                    {/* Protein segment */}
                                    <motion.circle
                                        cx="80" cy="80" r="72" fill="none"
                                        stroke="#8B5CF6"
                                        strokeWidth="12"
                                        strokeDasharray={circumference}
                                        initial={{ strokeDashoffset: circumference }}
                                        animate={{ strokeDashoffset: circumference - (protItemPct / 100) * circumference }}
                                        transition={{ duration: 1.5, ease: "easeOut" }}
                                        strokeLinecap="round"
                                    />
                                    {/* Carbs segment */}
                                    {carbItemPct > 0 && (
                                        <motion.circle
                                            cx="80" cy="80" r="72" fill="none"
                                            stroke="#3B82F6"
                                            strokeWidth="12"
                                            strokeDasharray={circumference}
                                            initial={{ strokeDashoffset: circumference }}
                                            animate={{ strokeDashoffset: circumference - (carbItemPct / 100) * circumference }}
                                            transition={{ duration: 1.5, ease: "easeOut", delay: 0.1 }}
                                            strokeLinecap="round"
                                            transform={`rotate(${(protItemPct / 100) * 360} 80 80)`}
                                        />
                                    )}
                                    {/* Fat segment */}
                                    {fatItemPct > 0 && (
                                        <motion.circle
                                            cx="80" cy="80" r="72" fill="none"
                                            stroke="#F59E0B"
                                            strokeWidth="12"
                                            strokeDasharray={circumference}
                                            initial={{ strokeDashoffset: circumference }}
                                            animate={{ strokeDashoffset: circumference - (fatItemPct / 100) * circumference }}
                                            transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                                            strokeLinecap="round"
                                            transform={`rotate(${((protItemPct + carbItemPct) / 100) * 360} 80 80)`}
                                        />
                                    )}
                                </>
                            )}

                            <defs>
                                <linearGradient id="failGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#EF4444" />
                                    <stop offset="100%" stopColor="#B91C1C" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            {totals.calories >= goal ? (
                                <div className="flex flex-col items-center gap-1">
                                    <Sparkles size={24} className="text-emerald-400 animate-pulse" />
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] leading-tight">Meta<br />Batida</span>
                                </div>
                            ) : (
                                <>
                                    <span className="text-4xl font-mono font-black text-white tracking-tighter">{goal - totals.calories}</span>
                                    <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">Kcal Faltam</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Macro Stats */}
                    <div className="flex flex-col gap-4 flex-1 w-full justify-center">
                        <MacroProgress label="Proteína" current={totals.protein} target={protGoal} color="#8B5CF6" icon={<Flame size={12} />} />
                        <MacroProgress label="Carbos" current={totals.carbs} target={carbGoal} color="#3B82F6" icon={<Zap size={12} />} />
                        <MacroProgress label="Gorduras" current={totals.fat} target={fatGoal} color="#F59E0B" icon={<TrendingUp size={12} />} />
                    </div>
                </div>

                {/* Footer Summary */}
                <div className="pt-5 flex items-center justify-between border-t border-white/5 relative z-10">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Consumido</span>
                        <span className="text-lg font-black text-white">{totals.calories} <span className="text-xs text-gray-500 font-normal">kcal</span></span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Meta Diária</span>
                        <span className="text-lg font-black text-indigo-400">{goal} <span className="text-xs text-indigo-500/50 font-normal">kcal</span></span>
                    </div>
                </div>
            </div>

            {/* Premium Water Tracker */}
            <div className="rounded-[28px] p-6 flex flex-col gap-6 bg-[#12121A] border border-blue-500/10 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[50px] rounded-full pointer-events-none" />

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                            <GlassWater size={20} className="text-blue-400" />
                        </div>
                        <div>
                            <p className="text-base font-black text-white tracking-tight">Hidratação</p>
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{waterCups >= goalCups ? 'Meta Concluída! 🌊' : 'Faltam ' + ((goalCups - waterCups) * 0.25).toFixed(2).replace('.', ',') + ' litros'}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-black text-white tabular-nums">{(waterCups * 0.25).toFixed(2).replace('.', ',')}</span>
                        <span className="text-xs text-gray-500 font-bold ml-1">LITROS</span>
                    </div>
                </div>

                <div className="h-2 rounded-full overflow-hidden bg-blue-500/5 border border-blue-500/10">
                    <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                        animate={{ width: `${Math.min((waterCups / Math.max(goalCups, 1)) * 100, 100)}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                </div>

                <div className="flex flex-wrap gap-2.5 justify-start">
                    {Array.from({ length: Math.max(12, goalCups, waterCups) }).map((_, i) => {
                        const isSelected = i < waterCups;
                        const isNext = i === waterCups;
                        return (
                            <button
                                key={i}
                                onClick={() => handleCupClick(i)}
                                className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 overflow-hidden ${isSelected
                                    ? 'border-blue-500/40 text-blue-400 shadow-[0_5px_15px_rgba(59,130,246,0.2)]'
                                    : isNext
                                        ? 'bg-white/5 border-white/10 text-gray-600 hover:border-blue-500/30'
                                        : 'bg-white/[0.02] border-white/5 text-gray-800'
                                    } border`}
                            >
                                {/* Animated Liquid Fill */}
                                <motion.div
                                    className="absolute bottom-0 left-0 right-0 bg-blue-500/20"
                                    initial={{ height: '0%' }}
                                    animate={{ height: isSelected ? '100%' : '0%' }}
                                    transition={{ duration: 0.5, ease: "easeInOut" }}
                                />

                                <GlassWater
                                    size={18}
                                    fill={isSelected ? "currentColor" : "none"}
                                    className="relative z-10"
                                />
                                {isSelected && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.3 }}
                                        className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border-2 border-[#12121A] z-20"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Meal cards (Foodvisor aesthetic) */}
            <div className="flex flex-col gap-4">
                {MEAL_TYPES.map((mt) => {
                    const mealItems = meals.filter((m) => m.meal_type === mt.id);
                    const mealCals = mealItems.reduce((sum, m) => sum + m.calories, 0);

                    return (
                        <div key={mt.id} className="rounded-[20px] p-5 bg-white/[0.02] border border-white/5 backdrop-blur-sm transition-colors hover:bg-white/[0.03]">

                            {/* Premium Card Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300" style={{ backgroundColor: `${mt.color}15`, border: `1px solid ${mt.color}30`, color: mt.color }}>
                                        {mt.icon}
                                    </div>
                                    <div className="flex flex-col">
                                        <p className="text-white font-black text-sm tracking-tight">{mt.label}</p>
                                        <p className="text-gray-500 text-[10px] font-black tracking-widest uppercase">{mt.time} · {mealCals} KCAL</p>
                                    </div>
                                </div>

                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => openModal(mt.id)}
                                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
                                >
                                    <Plus size={20} strokeWidth={2.5} />
                                </motion.button>
                            </div>

                            {/* Food Items */}
                            {mealItems.length > 0 ? (
                                <div className="flex flex-col gap-2 mt-4">
                                    {mealItems.map((meal) => (
                                        <button
                                            key={meal.id}
                                            onClick={() => openMealDetail(meal)}
                                            className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-left group hover:bg-white/10 transition-colors"
                                        >
                                            <div className="flex flex-col flex-1 min-w-0 pr-3">
                                                <span className="text-gray-200 text-sm font-medium truncate">{meal.description}</span>
                                            </div>
                                            <div className="flex flex-col items-end flex-shrink-0">
                                                <span className="text-indigo-400 font-bold text-sm">{meal.calories}</span>
                                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">kcal</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <button
                                    onClick={() => openModal(mt.id)}
                                    className="w-full mt-2 py-3 border border-dashed border-white/10 rounded-xl text-xs font-semibold text-gray-400 uppercase tracking-widest hover:bg-white/5 transition-colors"
                                >
                                    Adicionar Alimento
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 7-day history */}
            {history.length > 0 && (
                <div className="rounded-2xl p-5 flex flex-col gap-4 bg-white/[0.02] border border-white/5 backdrop-blur-sm shadow-sm transition-colors hover:bg-white/[0.04]">
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

            {/* Add modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-start justify-center"
                        style={{ backgroundColor: 'rgba(26,26,46,0.95)' }}
                        onClick={(e) => { if (e.target === e.currentTarget) { stopCamera(); setShowModal(false); } }}
                    >
                        <motion.div
                            initial={{ y: '100%', opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="w-full h-full max-w-lg mx-auto p-6 flex flex-col gap-4 overflow-y-auto"
                            style={{ backgroundColor: '#09090B' }}
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-bold">
                                    Adicionar a {MEAL_TYPES.find((m) => m.id === modalMealType)?.label}
                                </h3>
                                <button onClick={() => { stopCamera(); setShowModal(false); }} className="text-gray-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>

                            {modalMode === 'choose' && (
                                <div className="flex flex-col gap-3">
                                    <button
                                        type="button"
                                        onClick={openInAppCamera}
                                        className="flex items-center gap-4 px-4 py-4 rounded-xl text-left w-full"
                                        style={{ backgroundColor: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)' }}
                                    >
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(124,58,237,0.2)' }}>
                                            <Camera size={20} style={{ color: '#7C3AED' }} />
                                        </div>
                                        <div>
                                            <p className="text-white font-semibold text-sm">Câmera</p>
                                            <p className="text-gray-400 text-xs">Tire uma foto — IA detecta cada item do prato</p>
                                        </div>
                                    </button>
                                    <label
                                        className="flex items-center gap-4 px-4 py-4 rounded-xl text-left cursor-pointer"
                                        style={{ backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}
                                    >
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.2)' }}>
                                            <Images size={20} style={{ color: '#3B82F6' }} />
                                        </div>
                                        <div>
                                            <p className="text-white font-semibold text-sm">Galeria</p>
                                            <p className="text-gray-400 text-xs">Escolha uma foto existente</p>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) {
                                                    setTimeout(() => handlePhotoAnalysis(f), 500);
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                    </label>
                                    <button
                                        type="button"
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

                            {modalMode === 'photoItems' && (
                                <div className="flex flex-col gap-4">
                                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                                        {photoItems.length} {photoItems.length === 1 ? 'item detectado' : 'itens detectados'} — toque no × para remover
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        {photoItems.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                                                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-medium truncate">{item.description}</p>
                                                    <p className="text-gray-500 text-xs mt-0.5">
                                                        {item.calories} kcal · P {item.protein}g · C {item.carbs}g · G {item.fat}g
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setPhotoItems(prev => prev.filter((_, i) => i !== idx))}
                                                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 transition-colors"
                                                    style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {photoItems.length === 0 && (
                                        <p className="text-center text-gray-500 text-sm py-4">Nenhum item. Preencha manualmente.</p>
                                    )}

                                    <div className="flex gap-3 mt-2">
                                        <button
                                            type="button"
                                            onClick={() => setModalMode('manual')}
                                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                        >
                                            Manual
                                        </button>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.97 }}
                                            type="button"
                                            onClick={() => saveAllPhotoItems(photoItems)}
                                            disabled={saving || photoItems.length === 0}
                                            className="flex-[2] py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                                            style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)', opacity: (saving || photoItems.length === 0) ? 0.5 : 1 }}
                                        >
                                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                            {saving ? 'Salvando...' : `Salvar ${photoItems.length} ${photoItems.length === 1 ? 'item' : 'itens'}`}
                                        </motion.button>
                                    </div>
                                </div>
                            )}

                            {modalMode === 'camera' && (
                                <div className="flex flex-col gap-4">
                                    {/* Live camera preview */}
                                    <div className="relative w-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="w-full h-full object-cover"
                                        />
                                        {/* Overlay corners for frame effect */}
                                        <div className="absolute inset-0 pointer-events-none" style={{ border: '2px solid rgba(124,58,237,0.4)', borderRadius: '16px' }} />
                                    </div>
                                    <canvas ref={canvasRef} className="hidden" />
                                    <p className="text-center text-gray-500 text-xs">Enquadre o prato e pressione Capturar</p>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { stopCamera(); setModalMode('choose'); }}
                                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                        >
                                            Cancelar
                                        </button>
                                        <motion.button
                                            whileTap={{ scale: 0.95 }}
                                            type="button"
                                            onClick={captureFromCamera}
                                            className="flex-[2] py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                                            style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                                        >
                                            <Camera size={18} />
                                            Capturar
                                        </motion.button>
                                    </div>
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
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') setShowSuggestions(false);
                                                    if (e.key === 'Enter') onAddDirectly();
                                                }}
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
                                                        className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-20"
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

                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={onSearch}
                                                disabled={formDesc.trim().length < 2 || suggestLoading}
                                                className="flex-1 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                                                style={{ backgroundColor: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', opacity: formDesc.trim().length < 2 ? 0.5 : 1 }}
                                            >
                                                {suggestLoading ? 'Buscando...' : 'Buscar'}
                                            </button>
                                            <button
                                                onClick={onAddDirectly}
                                                disabled={formDesc.trim().length < 2 || analyzeLoading}
                                                className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-colors"
                                                style={{ background: 'linear-gradient(135deg, #10B981, #059669)', opacity: formDesc.trim().length < 2 ? 0.5 : 1 }}
                                            >
                                                {analyzeLoading ? 'Calculando...' : 'Adicionar'}
                                            </button>
                                        </div>

                                        <p className="text-gray-600 text-xs mt-1">
                                            <AnimatePresence>
                                                {analyzed && (
                                                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-emerald-500 font-semibold mb-1">
                                                        Nutrientes calculados automaticamente ✓
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                        </p>
                                    </div>

                                    {/* Quantity + Unit selector */}
                                    {(unitOptions.length > 0 || unitsLoading || analyzed) && (
                                        <div className="flex flex-col gap-2">
                                            <label className="text-gray-400 text-xs font-medium">Quantidade</label>
                                            <div className="flex gap-3 items-center">
                                                <input
                                                    type="number"
                                                    min={0.25}
                                                    step={0.25}
                                                    value={formQty}
                                                    placeholder="1"
                                                    onChange={(e) => handleQtyChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
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
                            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4 bg-[#09090B] border border-white/5"
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

            {/* Calendar Modal */}
            <AnimatePresence>
                {showCalendar && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowCalendar(false)}
                    >
                        <motion.div
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-sm rounded-3xl p-5 pb-8"
                            style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.1)' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Month header */}
                            <div className="flex items-center justify-between mb-5">
                                <button
                                    type="button"
                                    onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <p className="text-white font-bold text-sm capitalize">
                                    {calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>

                            {/* Weekday labels */}
                            <div className="grid grid-cols-7 mb-2">
                                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                                    <div key={i} className="text-center text-[10px] font-semibold text-gray-600 uppercase py-1">{d}</div>
                                ))}
                            </div>

                            {/* Day grid */}
                            <div className="grid grid-cols-7 gap-y-1">
                                {buildCalendarDays(calendarMonth).map((dateStr, i) => {
                                    if (!dateStr) return <div key={i} />;
                                    const isSelected = dateStr === selectedDate;
                                    const isToday = dateStr === today();
                                    const hasMeals = mealDates.has(dateStr);
                                    return (
                                        <div key={dateStr} className="flex flex-col items-center gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => { setSelectedDate(dateStr); setShowCalendar(false); }}
                                                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
                                                style={{
                                                    backgroundColor: isSelected ? '#7C3AED' : isToday ? 'rgba(124,58,237,0.15)' : 'transparent',
                                                    color: isSelected ? '#fff' : isToday ? '#A78BFA' : '#D1D5DB',
                                                    border: isToday && !isSelected ? '1px solid rgba(124,58,237,0.4)' : 'none',
                                                }}
                                            >
                                                {parseInt(dateStr.split('-')[2])}
                                            </button>
                                            {hasMeals && !isSelected && (
                                                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: '#7C3AED' }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Jump to today */}
                            {selectedDate !== today() && (
                                <button
                                    type="button"
                                    onClick={() => { setSelectedDate(today()); setShowCalendar(false); }}
                                    className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-purple-400 transition-colors"
                                    style={{ backgroundColor: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}
                                >
                                    Ir para Hoje
                                </button>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function MacroProgress({ label, current, target, color, icon }: { label: string; current: number; target: number; color: string; icon: React.ReactNode }) {
    const pct = Math.min((current / Math.max(target, 1)) * 100, 100);
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center px-0.5">
                <div className="flex items-center gap-1.5">
                    <div className="p-1 rounded bg-white/5" style={{ color }}>{icon}</div>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
                </div>
                <div className="text-[11px] font-mono">
                    <span className="text-white font-bold">{current}g</span>
                    <span className="text-gray-600"> / {target}g</span>
                </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}30` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, delay: 0.2 }}
                />
            </div>
        </div>
    );
}


