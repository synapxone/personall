import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Camera, X, Loader2, ChevronLeft, ChevronRight, Sparkles, Activity, Database, TrendingUp, Barcode, Flame, Zap, CalendarDays, GlassWater, Pencil, Search, PlusCircle, History, Save, Quote } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { getLocalYYYYMMDD } from '../lib/dateUtils';
import { aiService } from '../services/aiService';
import Mascot from './Mascot';
import { gamificationService } from '../lib/gamificationService';
import BarcodeScanner from './BarcodeScanner';
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

const MEAL_TYPES: { id: MealType; label: string; icon: React.ReactNode; time: string; colorKey: string }[] = [
    { id: 'breakfast', label: 'Café da manhã', icon: <Flame size={18} />, time: '07:00', colorKey: 'primary' },
    { id: 'lunch', label: 'Almoço', icon: <Activity size={18} />, time: '12:00', colorKey: 'primary' },
    { id: 'snack', label: 'Lanche', icon: <Zap size={18} />, time: '15:30', colorKey: 'accent' },
    { id: 'dinner', label: 'Jantar', icon: <TrendingUp size={18} />, time: '19:00', colorKey: 'proteina' },
];

const MOTIVATIONAL_MESSAGES = [
    "Relaxa. Um dia fora da dieta não apaga uma semana de disciplina. Consistência ganha de perfeição.",
    "Seu corpo não funciona no modo “punição automática”. Ele trabalha com média, não com um episódio isolado.",
    "Se fosse tão fácil engordar em um dia, também seria fácil emagrecer em um dia. E você sabe que não é assim 😉",
    "Hoje foi exceção, não identidade. Você continua sendo alguém que cuida de si.",
    "Calorias extras não são fracasso, são só energia. Amanhã você realinha o volante e segue a estrada.",
    "Se comida resolvesse tudo, nutricionista era filósofo. Equilíbrio é construção, não milagre.",
    "Você não “estragou tudo”. Isso não é videogame pra zerar progresso por causa de um erro.",
    "Às vezes a dieta sai da linha. O importante é você não sair do compromisso.",
    "Foi um dia calórico, não um veredito sobre sua força de vontade.",
    "Respira. Bebe água. Dorme bem. Amanhã você volta pro plano como alguém maduro — não como alguém culpado."
];

function today(): string {
    return getLocalYYYYMMDD();
}

function localDateStr(d: Date): string {
    return getLocalYYYYMMDD(d);
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
    const [modalMode, setModalMode] = useState<'choose' | 'photo' | 'manual' | 'photoItems' | 'camera' | 'barcode' | 'frequent' | 'quick'>('choose');
    const [photoItems, setPhotoItems] = useState<(FoodAnalysis & { quantity?: number; unit?: string })[]>([]);
    const [analyzeLoading, setAnalyzeLoading] = useState(false);
    const [frequentFoods, setFrequentFoods] = useState<(FoodAnalysis & { quantity?: number; unit?: string })[]>([]);
    const [loadingFrequent, setLoadingFrequent] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const [detectedItems, setDetectedItems] = useState<string[]>([]);

    const [analyzeLoadingMessage, setAnalyzeLoadingMessage] = useState('Analisando seu prato...');

    useEffect(() => {
        let interval: any;
        if (analyzeLoading) {
            setAnalyzeLoadingMessage('Analisando seu prato...');
            const messages = [
                "Escaneando o prato... detectando níveis perigosos de delícia.",
                "Consultando os deuses da hipertrofia...",
                "Calculando se isso brota músculo ou barriga...",
                "Analisando se esse prato merece um 'cheat day'...",
                "Contando as calorias... 1, 2, 3... são muitas!",
                "Verificando se tem proteína o suficiente para esse bíceps...",
                "Procurando por macros escondidos...",
                "Quase lá! Só mais um segundo enquanto eu julgo sua dieta (brincadeira!)."
            ];
            interval = setInterval(() => {
                setAnalyzeLoadingMessage(messages[Math.floor(Math.random() * messages.length)]);
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [analyzeLoading]);

    // Form state
    const [formDesc, setFormDesc] = useState('');
    const [formCal, setFormCal] = useState(0);
    const [formProt, setFormProt] = useState(0);
    const [formCarbs, setFormCarbs] = useState(0);
    const [formFat, setFormFat] = useState(0);
    const [analyzed, setAnalyzed] = useState(false);
    const [isFromDb, setIsFromDb] = useState(false);
    const [saving, setSaving] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [suggestLoading, setSuggestLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [formQty, setFormQty] = useState<number | string>(100);
    const [formUnit, setFormUnit] = useState('gramas');
    const [unitOptions, setUnitOptions] = useState<string[]>([]);
    const [baseNutrients, setBaseNutrients] = useState<FoodAnalysis | null>(null);
    const [dataSource, setDataSource] = useState<'ai' | 'db' | 'off' | null>(null);
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
    const [editQty, setEditQty] = useState<number | string>('');
    const [editUnit, setEditUnit] = useState('');
    const [randomMsgIndex] = useState(() => Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length));

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

    async function fetchFrequentFoods() {
        setLoadingFrequent(true);
        try {
            // Get most frequent items from the last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { data, error } = await supabase
                .from('meals')
                .select('description, calories, protein, carbs, fat, quantity, unit')
                .eq('user_id', profile.id)
                .gte('logged_at', thirtyDaysAgo.toISOString())
                .limit(50);

            if (data && !error) {
                // Count frequencies
                const counts: Record<string, { count: number; item: any }> = {};
                data.forEach(m => {
                    const key = m.description.toLowerCase();
                    if (!counts[key]) counts[key] = { count: 0, item: m };
                    counts[key].count++;
                });

                const sorted = Object.values(counts)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10)
                    .map(it => it.item);

                setFrequentFoods(sorted);
            }
        } catch (e) {
            console.warn('Error fetching frequent foods:', e);
        } finally {
            setLoadingFrequent(false);
        }
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
        setModalMode('manual'); // Default to Search mode
        resetForm();
        setShowModal(true);
        fetchFrequentFoods();
    }

    function resetForm() {
        setFormDesc(''); setFormCal(0); setFormProt(0); setFormCarbs(0); setFormFat(0);
        setFormQty(''); setFormUnit(''); setUnitOptions([]);
        setAnalyzed(false); setIsFromDb(false); setSuggestions([]); setShowSuggestions(false);
        setBaseNutrients(null); setDataSource(null);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
        if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
    }

    function checkQuantitySanity(qty: number, unit: string, desc: string): { ok: boolean; message: string } {
        const u = unit.toLowerCase();
        const d = desc.toLowerCase();
        if (qty <= 0) return { ok: false, message: 'A quantidade deve ser maior que zero.' };

        // Specific Item Checks (Extravagant Checks)
        if (d.includes('ovo') && qty > 24 && !u.includes('g')) return { ok: false, message: 'Quantidade de ovos muito alta (máx. 24). Se for peso, use gramas.' };
        if (d.includes('maçã') && qty > 10 && !u.includes('g')) return { ok: false, message: 'Quantidade de maçãs muito alta (máx. 10).' };
        if (d.includes('banana') && qty > 10 && !u.includes('g')) return { ok: false, message: 'Quantidade de bananas muito alta (máx. 10).' };
        if ((d.includes('biscoito') || d.includes('bolacha')) && qty > 40 && !u.includes('g')) return { ok: false, message: 'Quantidade de biscoitos excessiva (máx. 40).' };
        if (d.includes('pizza') && qty > 12 && u.includes('fatia')) return { ok: false, message: 'Quantidade de fatias de pizza excessiva (máx. 12).' };
        if (d.includes('pão') && qty > 10 && (u.includes('un') || u.includes('fatia'))) return { ok: false, message: 'Quantidade de pães excessiva (máx. 10).' };
        if (d.includes('hambúrguer') && qty > 5 && !u.includes('g')) return { ok: false, message: 'Quantidade de hambúrgueres excessiva (máx. 5).' };

        // Suspiciously Low Checks (The "1g rice" cases)
        const isMainCarbOrProtein = d.match(/(arroz|feijão|frango|carne|peixe|purê|massa|macarrão)/);
        if (isMainCarbOrProtein && (u === 'g' || u === 'gramas') && qty < 5) {
            return { ok: false, message: `Quantidade de ${d} muito baixa (apenas ${qty}g?). Talvez você quis dizer porção ou um valor maior?` };
        }

        // Generic Category Limits
        if ((u.includes('grama') || u === 'g') && qty > 5000) return { ok: false, message: 'Quantidade de gramas muito alta (máx. 5kg).' };
        if ((u.includes('ml') || u === 'ml') && qty > 5000) return { ok: false, message: 'Quantidade de ml muito alta (máx. 5L).' };
        if ((u.includes('litro')) && qty > 10) return { ok: false, message: 'Quantidade de litros muito alta (máx. 10L).' };
        if ((u.includes('unidade') || u === 'un') && qty > 50) return { ok: false, message: 'Quantidade de unidades muito alta (máx. 50).' };
        if ((u.includes('colher')) && qty > 30) return { ok: false, message: 'Quantidade de colheres muito alta (máx. 30).' };
        if ((u.includes('copo')) && qty > 20) return { ok: false, message: 'Quantidade de copos muito alta (máx. 20).' };
        if ((u.includes('porção') || u.includes('fatia')) && qty > 30) return { ok: false, message: 'Quantidade muito alta (máx. 30).' };
        if (u === 'kg' && qty > 10) return { ok: false, message: 'Quantidade de kg muito alta (máx. 10kg).' };

        return { ok: true, message: '' };
    }

    const getUnitFactor = useCallback((unit: string, qty: number, unitWeight: number = 100): number => {
        const u = unit.toLowerCase().trim();

        // Weight based units (relative to 100g)
        if (['g', 'gramas', 'grama', 'gr', 'ml'].includes(u)) {
            return qty / 100;
        }

        if (['kg', 'quilo', 'quilos', 'l', 'litro', 'litros'].includes(u)) {
            return (qty * 1000) / 100;
        }

        if (['oz', 'onça'].includes(u)) {
            return (qty * 28.35) / 100;
        }

        // Smart defaults for informal units if we don't have a specific unitWeight from IA/DB
        // (If unitWeight is exactly 100, it's likely a fallback)
        if (unitWeight === 100) {
            if (u.includes('colher')) return (qty * 15) / 100; // Average tablespoon
            if (u.includes('copo')) return (qty * 200) / 100;  // Average cup
            if (u.includes('xícara')) return (qty * 200) / 100;
        }

        // Unit based (relative to unitWeight which is weight of 1 unit)
        return (qty * unitWeight) / 100;
    }, []);

    const localCalculate = useCallback((food: FoodAnalysis, qty: number, unit: string) => {
        const factor = getUnitFactor(unit, qty, food.unit_weight || 100);
        const result = {
            calories: Math.round(food.calories * factor),
            protein: Math.round((food.protein || 0) * factor),
            carbs: Math.round((food.carbs || 0) * factor),
            fat: Math.round((food.fat || 0) * factor)
        };

        setFormCal(result.calories);
        setFormProt(result.protein);
        setFormCarbs(result.carbs);
        setFormFat(result.fat);
        return result;
    }, [getUnitFactor]);

    const analyzeText = useCallback(async (food: string, qty: number, unit: string) => {
        if (!food.trim()) return null;

        // If we already have base nutrients for this exact food name, just recalculate locally
        if (baseNutrients && baseNutrients.description.toLowerCase() === food.toLowerCase()) {
            setAnalyzed(true);
            return localCalculate(baseNutrients, qty, unit);
        }

        const numQty = typeof qty === 'number' ? qty : 1;
        // Request for 100g to keep database clean
        const searchDesc = `100g de ${food} `;
        setAnalyzeLoading(true);
        setAnalyzed(false);
        try {
            // Prefer local database (normalized items)
            const dbResults = await aiService.searchFoodDatabase(food);
            const match = dbResults.find(r => r.description.toLowerCase() === food.toLowerCase()) ||
                (dbResults.length > 0 ? dbResults[0] : null);

            if (match) {
                setBaseNutrients(match);
                setFormDesc(match.description);
                setIsFromDb(true);
                setDataSource('db');
                setAnalyzed(true);
                setAnalyzeLoading(false);
                return localCalculate(match, numQty, unit || 'porção');
            }

            setIsFromDb(false);
            const results = await aiService.analyzeFoodText(searchDesc);
            if (results.length === 1) {
                const result = results[0];
                setBaseNutrients(result);
                setFormDesc(result.description);
                setDataSource('ai');
                setAnalyzed(true);
                return localCalculate(result, numQty, unit || 'unidade');
            } else if (results.length > 1) {
                setPhotoItems(results);
                setModalMode('photoItems');
            }
        } catch (e) {
            console.error('Analyze error', e);
        } finally {
            setAnalyzeLoading(false);
        }
        return null;
    }, [baseNutrients, localCalculate]);

    const fetchSuggestions = useCallback(async (query: string) => {
        if (query.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
        setSuggestLoading(true);
        try {
            // 1. Prioritize local database (TACO)
            const dbResults = await aiService.searchFoodDatabase(query);
            if (dbResults.length > 0) {
                setSuggestions(dbResults.map(r => r.description));
                setShowSuggestions(true);
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        } catch {
            setSuggestions([]);
            setShowSuggestions(false);
        } finally {
            setSuggestLoading(false);
        }
    }, []);

    function handleDescChange(value: string) {
        setFormDesc(value);
        setAnalyzed(false);
        setIsFromDb(false);
        setBaseNutrients(null);

        if (value.trim().length >= 2) {
            if (unitOptions.length === 0) {
                setUnitOptions(DEFAULT_UNITS);
                setFormUnit('gramas');
                setFormQty(100);
            }
            if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
            suggestDebounceRef.current = setTimeout(() => fetchSuggestions(value), 400);
        } else {
            setUnitOptions([]);
            setFormUnit('');
            setFormQty('');
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }


    async function onSearch() {
        if (formDesc.trim().length < 2) return;
        setSuggestLoading(true);
        setShowSuggestions(false);
        try {
            // 1. First search in local food_database (TACO)
            const dbResults = await aiService.searchFoodDatabase(formDesc);

            if (dbResults.length > 0) {
                setSuggestions(dbResults.map(r => r.description));
                setShowSuggestions(true);

                // If it's an exact match (case insensitive), fill the data
                const exact = dbResults.find(r => r.description.toLowerCase() === formDesc.toLowerCase());
                if (exact) {
                    setFormCal(exact.calories);
                    setFormProt(exact.protein);
                    setFormCarbs(exact.carbs);
                    setFormFat(exact.fat);
                    setAnalyzed(true);
                    setIsFromDb(true);
                    setUnitOptions(['unidade', 'gramas', 'porção']);
                    setFormUnit('porção');
                }
            } else {
                setIsFromDb(false);
                // 2. Fallback to AI for suggestions
                await fetchSuggestions(formDesc);
            }
        } catch (e) {
            console.error('Search failed', e);
        } finally {
            setSuggestLoading(false);
        }
    }

    async function onBarcodeScan(barcode: string) {
        setAnalyzeLoading(true);
        const toastId = toast.loading('Buscando produto no Open Food Facts...');
        try {
            const result = await aiService.fetchFromOpenFoodFacts(barcode);
            if (result) {
                setFormDesc(result.description);
                setFormCal(result.calories);
                setFormProt(result.protein);
                setFormCarbs(result.carbs);
                setFormFat(result.fat);
                setBaseNutrients(result); // SET THIS to prevent AI recalculation
                setDataSource('off');
                setAnalyzed(true);
                setUnitOptions(['unidade', 'gramas', 'embalagem']);
                setFormUnit('gramas');
                toast.success('Produto encontrado!', { id: toastId });
                setModalMode('manual'); // Só muda para o form se encontrou algo
            } else {
                toast.error('Produto não encontrado. Tente novamente ou feche o scanner.', { id: toastId });
            }
        } catch (e) {
            toast.error('Erro ao acessar banco de dados de produtos.', { id: toastId });
        } finally {
            setAnalyzeLoading(false);
        }
    }

    const DEFAULT_UNITS = ['gramas', 'unidade', 'porção', 'colher', 'copo', 'ml', 'Litro'];

    async function loadUnitsAndAnalyze(food: string, qty: number, unit: string) {
        setUnitOptions(DEFAULT_UNITS);
        const selectedUnit = unit || 'gramas';
        setFormUnit(selectedUnit);
        await analyzeText(food, qty, selectedUnit);
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
        const numQty = Number(qty);
        if (baseNutrients) {
            localCalculate(baseNutrients, isNaN(numQty) ? 0 : numQty, formUnit);
        } else {
            if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
            qtyDebounceRef.current = setTimeout(() => analyzeText(formDesc, isNaN(numQty) ? 1 : numQty, formUnit), 800);
        }
    }

    function handleUnitChange(unit: string) {
        setFormUnit(unit);
        const numQty = typeof formQty === 'number' ? formQty : 1;
        if (baseNutrients) {
            localCalculate(baseNutrients, numQty, unit);
        } else {
            analyzeText(formDesc, numQty, unit);
        }
    }


    async function handleCameraPhoto(file: File) {
        setModalMode('photo');
        setAnalyzeLoading(true);
        setDetectedItems([]);

        // Show local preview immediately
        const reader = new FileReader();
        reader.onload = (e) => setCapturedPhoto(e.target?.result as string);
        reader.readAsDataURL(file);

        try {
            const { base64, mimeType } = await compressImage(file);
            const items = await aiService.analyzeFoodPhotoItems(base64, mimeType);

            // Populate detected items for the 'analysing' view
            setDetectedItems(items.map(it => it.description));

            if (items.length === 1) {
                // Short-circuit to manual if only one item
                setFormDesc(items[0].description);
                setFormCal(items[0].calories);
                setFormProt(items[0].protein);
                setFormCarbs(items[0].carbs);
                setFormFat(items[0].fat);
                setAnalyzed(true);
                setModalMode('manual');
            } else {
                setPhotoItems(items.map(it => ({ ...it, quantity: 1, unit: 'porção' })));
                // We stay in 'photo' mode for a moment so user sees the detected items list, 
                // but the JSX 'Continuar' button will move them to 'photoItems'
            }
        } catch (e) {
            console.error('Camera photo analysis error', e);
            toast.error('Não foi possível analisar a foto. Tente novamente ou preencha manualmente.');
            setModalMode('manual');
        } finally {
            setAnalyzeLoading(false);
        }
    }

    function updatePhotoItemQty(index: number, newQty: number) {
        setPhotoItems(prev => {
            const updated = [...prev];
            const item = updated[index];
            const currentQty = (item as any).quantity || 1;
            const factor = newQty / currentQty;

            updated[index] = {
                ...item,
                quantity: newQty,
                calories: Math.round(item.calories * factor),
                protein: Number((item.protein * factor).toFixed(1)),
                carbs: Number((item.carbs * factor).toFixed(1)),
                fat: Number((item.fat * factor).toFixed(1))
            } as any;
            return updated;
        });
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
            toast.success(`${items.length} ${items.length === 1 ? 'item registrado' : 'itens registrados'} !`, { id: toastId });
            setShowModal(false);
            resetForm();
            setPhotoItems([]);
            const newMeals = [...meals, ...(inserted as Meal[])];
            setMeals(newMeals);
            await updateDailyNutrition(newMeals);
            await gamificationService.awardPoints(profile.id, 'MEAL_LOGGED', items.length);
            onUpdate();
        } catch (e) {
            toast.error('Erro ao salvar.', { id: toastId });
        } finally {
            setSaving(false);
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

    async function calculateAndSaveMeal() {
        if (!formDesc.trim()) {
            toast.error('Descreva o alimento primeiro.');
            return;
        }

        const numQty = typeof formQty === 'number' ? formQty : 0;
        const selectedUnit = formUnit || 'gramas';

        // Sanity check before expensive calculation
        const sanity = checkQuantitySanity(numQty, selectedUnit, formDesc);
        if (!sanity.ok) {
            toast.error(sanity.message);
            return;
        }

        let calculationResult = null;
        setAnalyzeLoading(true);
        try {
            calculationResult = await analyzeText(formDesc, numQty, selectedUnit);
        } catch (e) {
            console.error('Calculation failed', e);
            toast.error('Falha ao calcular nutrientes. Salvando para cálculo em segundo plano.');
        } finally {
            setAnalyzeLoading(false);
        }

        await saveMeal(calculationResult || undefined);
    }

    async function saveMeal(overrides?: MacroTotals) {
        if (!formDesc.trim()) {
            toast.error('Descreva o alimento primeiro.');
            return;
        }

        const numQty = typeof formQty === 'number' ? formQty : 0;
        const selectedUnit = formUnit || 'gramas';

        // Sanity check
        const sanity = checkQuantitySanity(numQty, selectedUnit, formDesc);
        if (!sanity.ok) {
            toast.error(sanity.message);
            return;
        }

        setSaving(true);
        const fullDescription = selectedUnit ? `${numQty} ${selectedUnit} de ${formDesc}` : formDesc;

        const mealData = {
            user_id: profile.id,
            meal_date: selectedDate,
            meal_type: modalMealType,
            description: fullDescription,
            calories: overrides?.calories ?? formCal,
            protein: overrides?.protein ?? formProt,
            carbs: overrides?.carbs ?? formCarbs,
            fat: overrides?.fat ?? formFat,
            quantity: numQty,
            unit: selectedUnit,
            unit_weight: baseNutrients?.unit_weight || 100,
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
        await gamificationService.awardPoints(profile.id, 'MEAL_LOGGED');
        onUpdate();

        // Background calculation if not analyzed AND no overrides provided
        if (!overrides && !analyzed && formCal === 0) {
            const toastId = toast.loading(`Calculando nutrientes em segundo plano...`);
            try {
                const results = await aiService.analyzeFoodText(fullDescription);
                const result = results[0] || { calories: 0, protein: 0, carbs: 0, fat: 0 };
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
                toast.error(`O cálculo de IA falhou.Continue usando com 0 calorias ou edite depois.`, { id: toastId });
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
        setEditQty(selectedMeal.quantity || 1);
        setEditUnit(selectedMeal.unit || 'unidade');
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
        if (!selectedMeal || !editDesc.trim()) return;
        setEditSaving(true);
        try {
            const { error } = await supabase.from('meals')
                .update({
                    description: editDesc,
                    calories: editCal,
                    protein: editProt,
                    carbs: editCarbs,
                    fat: editFat,
                    quantity: Number(editQty),
                    unit: editUnit
                })
                .eq('id', selectedMeal.id);

            if (error) throw error;
            toast.success('Refeição atualizada!');
            const updated = meals.map((m) =>
                m.id === selectedMeal.id
                    ? { ...m, description: editDesc, calories: editCal, protein: editProt, carbs: editCarbs, fat: editFat, quantity: Number(editQty), unit: editUnit, unit_weight: selectedMeal.unit_weight }
                    : m
            );
            await updateDailyNutrition(updated);
            setSelectedMeal(null);
            await loadData(selectedDate);
            onUpdate();
        } catch (e: any) {
            toast.error('Erro ao salvar: ' + e.message);
        } finally {
            setEditSaving(false);
        }
    }

    const totals = getTodayTotals();
    const goal = profile.daily_calorie_goal || 2000;

    // Estimated macro targets (rough)
    const protGoal = Math.round((goal * 0.3) / 4);
    const carbGoal = Math.round((goal * 0.4) / 4);
    const fatGoal = Math.round((goal * 0.3) / 9);

    const circumference = 2 * Math.PI * 68;
    const waterCircumference = 2 * Math.PI * 78;
    const waterGoalMl = profile.weight * 35;
    const goalCups = Math.ceil(waterGoalMl / 250);
    const waterPct = Math.min((waterCups / Math.max(goalCups, 1)) * 100, 100);

    // Pcts for the segmented ring, clamped so they never exceed 100% combined.
    const protItemPct = Math.min(((totals.protein * 4) / goal) * 100, 100);
    const carbItemPct = Math.min(((totals.carbs * 4) / goal) * 100, 100 - protItemPct);
    const fatItemPct = Math.min(((totals.fat * 9) / goal) * 100, 100 - protItemPct - carbItemPct);

    const maxHistCal = Math.max(...history.map((h) => h.calories), goal, 1);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
        );
    }

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
                    className="w-9 h-9 flex items-center justify-center rounded-full text-text-muted hover:text-text-main transition-colors"
                    style={{ backgroundColor: 'var(--bg-card)' }}
                >
                    <ChevronLeft size={18} />
                </button>

                <button
                    type="button"
                    onClick={() => { setCalendarMonth(new Date(selectedDate + 'T12:00:00')); setShowCalendar(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-text-main transition-colors"
                    style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.15)', border: '1px solid rgba(var(--primary-rgb),0.3)' }}
                >
                    <CalendarDays size={14} style={{ color: 'var(--primary)' }} />
                    {formatDateLabel(selectedDate)}
                </button>

                <button
                    type="button"
                    onClick={() => setSelectedDate(nextDay(selectedDate))}
                    disabled={selectedDate >= today()}
                    className="w-9 h-9 flex items-center justify-center rounded-full text-text-muted hover:text-text-main transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--bg-card)' }}
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Daily Summary Card (Premium) */}
            <div className="relative overflow-hidden rounded-[32px] p-6 bg-card border shadow-2xl flex flex-col gap-6 w-full" style={{ borderColor: 'var(--border-main)' }}>
                {/* Decorative glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 blur-[80px] rounded-full pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent/10 blur-[80px] rounded-full pointer-events-none" />

                <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                    {/* Premium Calorie Ring */}
                    <div className="relative w-40 h-40 flex-shrink-0">
                        <svg width="160" height="160" viewBox="0 0 160 160" className="transform -rotate-90">
                            {/* Background Track */}
                            <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(var(--text-main-rgb), 0.05)" strokeWidth="12" />

                            {/* Water Outer Ring (Thin Blue Line) */}
                            <motion.circle
                                cx="80" cy="80" r="78" fill="none"
                                stroke="#3b82f6"
                                strokeWidth="2"
                                strokeDasharray={waterCircumference}
                                initial={{ strokeDashoffset: waterCircumference }}
                                animate={{ strokeDashoffset: waterCircumference - (waterPct / 100) * waterCircumference }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                strokeLinecap="round"
                                style={{ opacity: totals.calories > goal ? 0.3 : 0.8 }}
                            />

                            <g style={{ opacity: totals.calories > goal ? 0.3 : 1, transition: 'opacity 0.5s ease' }}>
                                {/* Protein segment */}
                                <motion.circle
                                    cx="80" cy="80" r="68" fill="none"
                                    stroke="var(--proteina)"
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
                                        cx="80" cy="80" r="68" fill="none"
                                        stroke="var(--carbos)"
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
                                        cx="80" cy="80" r="68" fill="none"
                                        stroke="var(--gordura)"
                                        strokeWidth="12"
                                        strokeDasharray={circumference}
                                        initial={{ strokeDashoffset: circumference }}
                                        animate={{ strokeDashoffset: circumference - (fatItemPct / 100) * circumference }}
                                        transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                                        strokeLinecap="round"
                                        transform={`rotate(${((protItemPct + carbItemPct) / 100) * 360} 80 80)`}
                                    />
                                )}
                            </g>

                            <defs>
                                <linearGradient id="failGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#EF4444" />
                                    <stop offset="100%" stopColor="#B91C1C" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                            {totals.calories > goal ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="relative flex flex-col items-center justify-center pt-2"
                                >
                                    {/* Large Stylish Background Quote */}
                                    <div className="absolute -top-8 -left-3 opacity-[0.10] text-primary -rotate-12 pointer-events-none">
                                        <Quote size={64} fill="currentColor" />
                                    </div>

                                    <p className="text-[16px] font-black text-text-main leading-tight italic relative z-10 tracking-tight drop-shadow-md">
                                        {MOTIVATIONAL_MESSAGES[randomMsgIndex]}
                                        <span className="text-primary font-serif not-italic ml-1 text-2xl inline-block align-middle">”</span>
                                    </p>

                                    {/* Subtle decorative dot for premium touch */}
                                    <div className="w-6 h-0.5 rounded-full bg-primary/20 mt-3" />
                                </motion.div>
                            ) : totals.calories === goal ? (
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] leading-tight">Meta<br />Batida</span>
                                </div>
                            ) : (
                                <>
                                    <span className="text-4xl font-mono font-black text-text-main tracking-tighter">{goal - totals.calories}</span>
                                    <span className="text-[10px] text-text-muted uppercase font-black tracking-widest mt-1">Kcal Faltam</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Macro Stats */}
                    <div className="flex flex-col gap-4 flex-1 w-full justify-center">
                        <MacroProgress label="Proteína" current={totals.protein} target={protGoal} color="var(--proteina)" icon={<Flame size={12} />} />
                        <MacroProgress label="Carbos" current={totals.carbs} target={carbGoal} color="var(--carbos)" icon={<Zap size={12} />} />
                        <MacroProgress label="Gorduras" current={totals.fat} target={fatGoal} color="var(--gordura)" icon={<TrendingUp size={12} />} />
                    </div>
                </div>

                {/* Footer Summary */}
                <div className="pt-5 flex items-center justify-between border-t relative z-10" style={{ borderColor: 'var(--border-main)' }}>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-text-muted uppercase font-bold tracking-widest">Consumido</span>
                        <span className="text-lg font-black text-text-main">{totals.calories} <span className="text-xs text-text-muted font-normal">kcal</span></span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-text-muted uppercase font-bold tracking-widest">Meta Diária</span>
                        <span className="text-lg font-black text-primary">{goal} <span className="text-xs text-primary/50 font-normal">kcal</span></span>
                    </div>
                </div>
            </div>

            {/* Premium Water Tracker */}
            <div className="rounded-[28px] p-6 flex flex-col gap-6 bg-card border border-primary/10 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[50px] rounded-full pointer-events-none" />

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                            <GlassWater size={20} className="text-blue-400" />
                        </div>
                        <div>
                            <p className="text-base font-black text-text-main tracking-tight">Hidratação</p>
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{waterCups >= goalCups ? 'Meta Concluída! 🌊' : 'Faltam ' + ((goalCups - waterCups) * 0.25).toFixed(2).replace('.', ',') + ' litros'}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-black text-text-main tabular-nums">{(waterCups * 0.25).toFixed(2).replace('.', ',')}</span>
                        <span className="text-xs text-text-muted font-bold ml-1">LITROS</span>
                    </div>
                </div>

                <div className="h-2 rounded-full overflow-hidden bg-blue-500/5 border" style={{ borderColor: 'rgba(var(--text-main-rgb), 0.1)' }}>
                    <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                        animate={{ width: `${Math.min((waterCups / Math.max(goalCups, 1)) * 100, 100)}% ` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                </div>

                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                    {Array.from({ length: Math.max(12, goalCups, waterCups) }).map((_, i) => {
                        const isSelected = i < waterCups;
                        const isNext = i === waterCups;
                        return (
                            <button
                                key={i}
                                onClick={() => handleCupClick(i)}
                                className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 overflow-hidden ${isSelected
                                    ? 'border-blue-500/40 text-blue-400 shadow-[0_5px_15px_rgba(59,130,246,0.1)]'
                                    : isNext
                                        ? 'bg-white/5 border-white/10 text-text-muted hover:border-white/20'
                                        : 'bg-white/[0.02] border-white/5 text-text-muted/10'
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
                                        className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border-2 z-20"
                                        style={{ borderColor: 'var(--bg-main)' }}
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
                        <div key={mt.id} className="rounded-[20px] p-5 bg-card border backdrop-blur-sm transition-colors hover:bg-card-rgb/10" style={{ borderColor: 'var(--border-main)' }}>

                            {/* Premium Card Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300"
                                        style={{
                                            backgroundColor: `rgba(var(--${mt.colorKey}-rgb), 0.15)`,
                                            border: `1px solid rgba(var(--${mt.colorKey}-rgb), 0.3)`,
                                            color: `var(--${mt.colorKey})`
                                        }}
                                    >
                                        {mt.icon}
                                    </div>
                                    <div className="flex flex-col">
                                        <p className="text-text-main font-black text-sm tracking-tight">{mt.label}</p>
                                        <p className="text-text-muted text-[10px] font-black tracking-widest uppercase">{mt.time} · {mealCals} KCAL</p>
                                    </div>
                                </div>

                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => openModal(mt.id)}
                                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-card border text-text-muted hover:text-text-main transition-all"
                                    style={{ borderColor: 'var(--border-main)' }}
                                >
                                    <Plus size={20} strokeWidth={2.5} className="text-text-muted hover:text-text-main" />
                                </motion.button>
                            </div>

                            {/* Food Items */}
                            {mealItems.length > 0 ? (
                                <div className="flex flex-col gap-2 mt-4">
                                    {mealItems.map((meal) => (
                                        <button
                                            key={meal.id}
                                            onClick={() => openMealDetail(meal)}
                                            className="flex items-center justify-between p-3 rounded-xl bg-card border text-left group transition-colors"
                                            style={{ borderColor: 'var(--border-main)' }}
                                        >
                                            <div className="flex flex-col flex-1 min-w-0 pr-3">
                                                <span className="text-text-main text-sm font-medium truncate">{meal.description}</span>
                                            </div>
                                            <div className="flex flex-col items-end flex-shrink-0">
                                                <span className="text-primary font-bold text-sm">{meal.calories}</span>
                                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">kcal</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <button
                                    onClick={() => openModal(mt.id)}
                                    className="w-full mt-2 py-3 border border-dashed rounded-xl text-xs font-semibold text-text-muted uppercase tracking-widest hover:bg-card transition-colors"
                                    style={{ borderColor: 'var(--border-main)' }}
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
                <div className="rounded-2xl p-5 flex flex-col gap-4 bg-card border backdrop-blur-sm shadow-sm transition-colors hover:opacity-90" style={{ borderColor: 'var(--border-main)' }}>
                    <p className="text-text-main font-semibold text-sm">Últimos 7 dias</p>
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
                                            animate={{ height: `${pct}% ` }}
                                            transition={{ duration: 0.5 }}
                                            className="w-full rounded-t-md"
                                            style={{ backgroundColor: h.calories >= goal ? 'var(--proteina)' : 'var(--primary)', opacity: 0.7 }}
                                        />
                                    </div>
                                    <span className="text-text-muted text-xs capitalize">{label}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between text-xs text-text-muted">
                        <span>0 kcal</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--accent)' }} />Meta</span>
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
                        className="fixed inset-0 z-[60] flex items-start justify-center"
                        style={{ backgroundColor: 'rgba(var(--bg-main-rgb), 0.95)' }}
                        onClick={(e) => { if (e.target === e.currentTarget) { stopCamera(); setShowModal(false); } }}
                    >
                        <motion.div
                            initial={{ y: '100%', opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="w-full h-full max-w-lg mx-auto p-6 flex flex-col gap-4 overflow-y-auto overflow-x-hidden max-w-full md:max-w-lg"
                            style={{ backgroundColor: 'var(--bg-main)' }}
                        >
                            {/* Header consistent with image */}
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20 flex-shrink-0 flex items-center justify-center">
                                            {/* Icon placeholder or representative image */}
                                            <GlassWater size={20} className="text-primary" />
                                        </div>
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <h3 className="text-text-main font-bold text-base leading-tight truncate">
                                                {MEAL_TYPES.find((m) => m.id === modalMealType)?.label || 'Refeição'}
                                            </h3>
                                            <p className="text-text-muted text-[10px] font-medium whitespace-nowrap">
                                                {getTodayTotals().calories} / {goal} kcal
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => { stopCamera(); setShowModal(false); }} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-text-muted hover:text-text-main">
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Calorie Progress Bar in Header */}
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min((getTodayTotals().calories / goal) * 100, 100)}%` }}
                                        className="h-full bg-primary"
                                    />
                                </div>
                            </div>

                            {/* Horizontal Tabs per image */}
                            <div className="flex items-center gap-2 overflow-x-auto py-2 custom-scrollbar">
                                {[
                                    { id: 'barcode', label: 'Barras', icon: <Barcode size={18} /> },
                                    { id: 'frequent', label: 'Histórico', icon: <History size={18} /> },
                                    { id: 'manual', label: 'Buscar', icon: <Search size={18} /> },
                                    { id: 'camera', label: 'Foto', icon: <Camera size={18} /> },
                                    { id: 'quick', label: 'manual', icon: <PlusCircle size={18} /> },
                                ].map((tab) => {
                                    const isActive = modalMode === tab.id ||
                                        (tab.id === 'manual' && (modalMode === 'manual' || modalMode === 'photoItems' || modalMode === 'photo'));
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => {
                                                stopCamera();
                                                if (tab.id === 'barcode') setModalMode('barcode');
                                                else if (tab.id === 'camera') openInAppCamera();
                                                else if (tab.id === 'manual') setModalMode('manual');
                                                else if (tab.id === 'frequent') setModalMode('frequent');
                                                else if (tab.id === 'quick') setModalMode('quick');
                                            }}
                                            className={`flex flex-col items-center gap-1 min-w-[64px] p-2 transition-all rounded-2xl ${isActive ? 'bg-primary/15 text-primary' : 'text-text-muted hover:bg-white/5'}`}
                                        >
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${isActive ? 'border-primary/30 bg-primary/10' : 'border-white/10'}`}>
                                                {tab.icon}
                                            </div>
                                            <span className="text-[9px] font-bold whitespace-nowrap">{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>


                            {modalMode === 'photo' && (
                                <div className="flex flex-col gap-4">
                                    <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: '1/1' }}>
                                        {capturedPhoto && <img src={capturedPhoto} className="w-full h-full object-cover" alt="Captured" />}
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <h4 className="text-text-main font-bold">Analisando Refeição...</h4>
                                        <div className="flex flex-col gap-4">
                                            {detectedItems.length === 0 ? (
                                                <div className="flex flex-col items-center gap-4 py-8">
                                                    <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2 border-primary/20 bg-bg-main">
                                                        <Mascot size={80} bust={true} pose="thinking" />
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <Loader2 size={16} className="animate-spin text-primary" />
                                                            <span className="text-text-main font-medium">Analisando Refeição...</span>
                                                        </div>
                                                        <p className="text-text-muted text-center max-w-xs text-sm italic">{analyzeLoadingMessage}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    {detectedItems.map((item, i) => (
                                                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                                    {i + 1}
                                                                </div>
                                                                <span className="text-text-main font-medium">{item}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { setCapturedPhoto(null); setModalMode('camera'); }}
                                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.06)' }}
                                        >
                                            Refazer Foto
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setModalMode('photoItems')}
                                            disabled={detectedItems.length === 0}
                                            className="flex-[2] py-3 rounded-xl font-bold text-white shadow-lg"
                                            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', opacity: detectedItems.length === 0 ? 0.5 : 1 }}
                                        >
                                            Continuar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {modalMode === 'photoItems' && (
                                <div className="flex flex-col gap-4">
                                    <h4 className="text-text-main font-bold">Ajustes Finais</h4>
                                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                                        {photoItems.map((item, i) => (
                                            <div key={i} className="p-4 rounded-xl bg-card border flex flex-col gap-3" style={{ borderColor: 'var(--border-main)' }}>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-text-main font-bold">{item.description}</span>
                                                    <button onClick={() => setPhotoItems(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-600 transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <button
                                                            onClick={() => updatePhotoItemQty(i, Math.max(0.1, (item.quantity as number) - 0.5))}
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)' }}
                                                        >
                                                            -
                                                        </button>
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updatePhotoItemQty(i, parseFloat(e.target.value) || 0)}
                                                            className="w-12 text-center bg-transparent text-text-main font-bold outline-none"
                                                        />
                                                        <button
                                                            onClick={() => updatePhotoItemQty(i, (item.quantity as number) + 0.5)}
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)' }}
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                    <span className="text-text-muted text-xs uppercase font-bold tracking-widest">{item.unit}</span>
                                                </div>
                                                <div className="flex gap-4 text-xs font-medium">
                                                    <span className="text-emerald-500">{Math.round(item.calories)} kcal</span>
                                                    <span className="text-purple-500">{item.protein}g prot</span>
                                                    <span className="text-amber-500">{item.carbs}g carb</span>
                                                    <span className="text-red-500">{item.fat}g gord</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {photoItems.length === 0 && (
                                        <p className="text-center text-gray-500 text-sm py-4">Nenhum item. Adicione manualmente ou refaça a foto.</p>
                                    )}

                                    <div className="flex gap-3 mt-2">
                                        <button
                                            type="button"
                                            onClick={() => setModalMode('manual')}
                                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.06)' }}
                                        >
                                            Adicionar Manual
                                        </button>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.97 }}
                                            type="button"
                                            onClick={() => saveAllPhotoItems(photoItems)}
                                            disabled={saving || photoItems.length === 0}
                                            className="flex-[2] py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                                            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', opacity: (saving || photoItems.length === 0) ? 0.5 : 1 }}
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
                                        <div className="absolute inset-0 pointer-events-none" style={{ border: '2px solid rgba(var(--primary-rgb), 0.4)', borderRadius: '16px' }} />
                                    </div>
                                    <canvas ref={canvasRef} className="hidden" />
                                    <p className="text-center text-gray-500 text-xs">Enquadre o prato e pressione Capturar</p>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { stopCamera(); setModalMode('choose'); }}
                                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                                            style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.06)' }}
                                        >
                                            Cancelar
                                        </button>
                                        <motion.button
                                            whileTap={{ scale: 0.95 }}
                                            type="button"
                                            onClick={captureFromCamera}
                                            className="flex-[2] py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                                            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}
                                        >
                                            <Camera size={18} />
                                            Capturar
                                        </motion.button>
                                    </div>
                                </div>
                            )}

                            {modalMode === 'manual' && (
                                <div className="flex flex-col gap-4">
                                    {/* Data Source Badge */}
                                    {analyzed && dataSource && (
                                        <div className="flex justify-end">
                                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${dataSource === 'db' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' : dataSource === 'off' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'}`}>
                                                {dataSource === 'ai' && <Sparkles size={10} />}
                                                {dataSource === 'db' && <Database size={10} />}
                                                {dataSource === 'off' && <Barcode size={10} />}
                                                <span>{dataSource === 'ai' ? 'IA' : dataSource === 'db' ? 'Banco Local' : 'Open Food Facts'}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Food description input as a search box per image */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="relative group">
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="Buscar alimento..."
                                                value={formDesc}
                                                onChange={(e) => handleDescChange(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') setShowSuggestions(false);
                                                    if (e.key === 'Enter') calculateAndSaveMeal();
                                                }}
                                                className="w-full pl-11 pr-10 py-4 rounded-3xl text-text-main text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
                                                style={{ backgroundColor: 'var(--bg-card)', border: '2px solid var(--border-main)' }}
                                            />
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={18} />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                {(analyzeLoading || suggestLoading)
                                                    ? <Loader2 size={16} className="animate-spin text-primary" />
                                                    : analyzed
                                                        ? isFromDb
                                                            ? <Database size={16} className="text-blue-500" />
                                                            : <Sparkles size={16} className="text-emerald-500" />
                                                        : (
                                                            <button
                                                                type="button"
                                                                onClick={onSearch}
                                                                className="text-text-muted hover:text-primary transition-colors"
                                                            >
                                                                <TrendingUp size={16} />
                                                            </button>
                                                        )}
                                            </div>

                                            {/* Suggestions dropdown */}
                                            <AnimatePresence>
                                                {showSuggestions && suggestions.length > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -4 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -4 }}
                                                        transition={{ duration: 0.15 }}
                                                        className="absolute w-full mt-2 rounded-2xl overflow-y-auto z-[100] max-h-[220px] shadow-2xl"
                                                        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                                                    >
                                                        {suggestions.map((item, i) => (
                                                            <button
                                                                key={i}
                                                                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(item); }}
                                                                className="w-full text-left px-4 py-3 text-sm text-text-main hover:bg-primary/10 transition-colors"
                                                                style={{ borderBottom: i < suggestions.length - 1 ? '1px solid var(--border-main)' : 'none' }}
                                                            >
                                                                {item}
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    {/* No longer showing frequent foods directly in manual mode to avoid clutter */}

                                    {/* Quantity + Unit selector (Visible when an item is selected/analyzed) */}
                                    {(analyzed || formDesc.length > 2) && (
                                        <div className="flex flex-col gap-2 p-1">
                                            <label className="text-text-muted text-xs font-semibold uppercase tracking-wider">Ajustar Quantidade</label>
                                            <div className="flex flex-col gap-4">
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-white/5 rounded-2xl p-1 border border-white/5">
                                                        <button
                                                            onClick={() => handleQtyChange(Math.max(0.1, (typeof formQty === 'number' ? formQty : 100) - 10))}
                                                            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-main hover:bg-primary/20"
                                                        >
                                                            -
                                                        </button>
                                                        <input
                                                            type="number"
                                                            value={formQty}
                                                            onChange={(e) => handleQtyChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                            className="flex-1 min-w-0 bg-transparent text-center text-lg font-black text-text-main outline-none"
                                                            placeholder="100"
                                                        />
                                                        <button
                                                            onClick={() => handleQtyChange((typeof formQty === 'number' ? formQty : 100) + 10)}
                                                            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-main hover:bg-primary/20"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                    <select
                                                        value={formUnit}
                                                        onChange={(e) => handleUnitChange(e.target.value)}
                                                        className="flex-shrink-0 w-24 h-12 rounded-2xl bg-white/5 border border-white/5 text-text-main font-bold text-xs px-2 outline-none appearance-none text-center"
                                                    >
                                                        {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            {formUnit === 'unidade' && baseNutrients?.unit_weight && baseNutrients.unit_weight !== 100 && (
                                                <p className="text-[10px] text-text-muted mt-1 px-1 flex items-center gap-1">
                                                    <TrendingUp size={10} className="text-primary" />
                                                    <span>1 unidade considerada como <b>{baseNutrients.unit_weight}g</b></span>
                                                </p>
                                            )}
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
                                                    className="flex flex-col items-center gap-1 py-3 rounded-2xl"
                                                    style={{ backgroundColor: `${m.color}15`, border: `1px solid ${m.color}30` }}
                                                >
                                                    {analyzeLoading
                                                        ? <div className="w-8 h-4 rounded animate-pulse" style={{ backgroundColor: `${m.color}30` }} />
                                                        : <span className="text-lg font-black text-text-main">{m.value}</span>}
                                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60" style={{ color: m.color }}>{m.label}</span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-3 mt-4">
                                        <div className="flex gap-3">
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.97 }}
                                                onClick={() => saveMeal()}
                                                disabled={saving || !formDesc.trim()}
                                                className="flex-1 py-4 rounded-xl font-bold text-text-main border border-border-main"
                                                style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)', opacity: (saving || !formDesc.trim()) ? 0.5 : 1 }}
                                            >
                                                {saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Salvar Agora'}
                                                {!saving && <p className="text-[10px] font-normal opacity-60">IA em 2º plano</p>}
                                            </motion.button>

                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.97 }}
                                                onClick={calculateAndSaveMeal}
                                                disabled={saving || analyzeLoading || !formDesc.trim()}
                                                className="flex-[1.5] py-4 rounded-xl font-bold text-white shadow-lg"
                                                style={{
                                                    background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                                                    opacity: (saving || analyzeLoading || !formDesc.trim()) ? 0.5 : 1
                                                }}
                                            >
                                                {analyzeLoading ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Loader2 size={18} className="animate-spin" />
                                                        <span>Calculando...</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span>Calcular Nutrientes</span>
                                                        <p className="text-[10px] font-normal opacity-80">Ver antes de salvar</p>
                                                    </>
                                                )}
                                            </motion.button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalMode === 'barcode' && (
                                <BarcodeScanner
                                    onScan={onBarcodeScan}
                                    onClose={() => setModalMode('manual')}
                                />
                            )}

                            {modalMode === 'frequent' && (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between pl-1">
                                        <h4 className="text-text-main font-bold">Mais Consumidos</h4>
                                        {loadingFrequent && <Loader2 size={16} className="animate-spin text-primary" />}
                                    </div>
                                    <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {frequentFoods.length === 0 && !loadingFrequent && (
                                            <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-40">
                                                <History size={48} />
                                                <p className="text-sm font-medium">Nenhum alimento frequente ainda.</p>
                                            </div>
                                        )}
                                        {frequentFoods.map((food, i) => (
                                            <motion.button
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                key={i}
                                                onClick={() => {
                                                    setFormDesc(food.description);
                                                    setFormCal(food.calories);
                                                    setFormProt(food.protein);
                                                    setFormCarbs(food.carbs);
                                                    setFormFat(food.fat);
                                                    setFormQty(food.quantity || 100);
                                                    setFormUnit(food.unit || 'gramas');
                                                    setAnalyzed(true);
                                                    setBaseNutrients(food);
                                                    setDataSource('db');
                                                    setModalMode('manual');
                                                }}
                                                className="flex items-center justify-between p-4 rounded-2xl bg-card border hover:border-primary/40 transition-all text-left group"
                                                style={{ borderColor: 'var(--border-main)' }}
                                            >
                                                <div className="flex flex-col gap-1 min-w-0 flex-1 pr-4">
                                                    <span className="text-text-main font-bold text-sm truncate">{food.description}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase">{food.calories} kcal</span>
                                                        <span className="text-[10px] text-text-muted font-bold tracking-tight">{food.quantity} {food.unit}</span>
                                                    </div>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-text-muted group-hover:bg-primary group-hover:text-white transition-colors">
                                                    <Plus size={16} />
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-center text-text-muted italic opacity-60">
                                        Basado nos itens que você costuma registrar nos últimos 30 dias.
                                    </p>
                                </div>
                            )}

                            {modalMode === 'quick' && (
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-col gap-1">
                                        <h4 className="text-text-main font-bold">Registro Direto</h4>
                                        <p className="text-text-muted text-xs">Informe os dados manualmente sem busca.</p>
                                    </div>

                                    <div className="flex flex-col gap-4">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Nome do Alimento</label>
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="Ex: Almoço Caseiro, Salada Especial..."
                                                value={formDesc}
                                                onChange={(e) => setFormDesc(e.target.value)}
                                                className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-text-main font-bold outline-none focus:border-primary/50 transition-colors"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Calorias (kcal)</label>
                                                <input
                                                    type="number"
                                                    value={formCal || ''}
                                                    onChange={(e) => setFormCal(parseInt(e.target.value) || 0)}
                                                    className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-text-main font-bold outline-none focus:border-primary/50 transition-colors"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Proteína (g)</label>
                                                <input
                                                    type="number"
                                                    value={formProt || ''}
                                                    onChange={(e) => setFormProt(parseFloat(e.target.value) || 0)}
                                                    className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-text-main font-bold outline-none focus:border-primary/50 transition-colors"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Carbos (g)</label>
                                                <input
                                                    type="number"
                                                    value={formCarbs || ''}
                                                    onChange={(e) => setFormCarbs(parseFloat(e.target.value) || 0)}
                                                    className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-text-main font-bold outline-none focus:border-primary/50 transition-colors"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Gordura (g)</label>
                                                <input
                                                    type="number"
                                                    value={formFat || ''}
                                                    onChange={(e) => setFormFat(parseFloat(e.target.value) || 0)}
                                                    className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-text-main font-bold outline-none focus:border-primary/50 transition-colors"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => {
                                            if (!formDesc.trim() || !formCal) {
                                                toast.error('Informe nome e calorias.');
                                                return;
                                            }
                                            saveMeal();
                                        }}
                                        disabled={saving}
                                        className="w-full py-4 rounded-2xl font-black text-white shadow-xl flex items-center justify-center gap-2 mt-2"
                                        style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', opacity: saving ? 0.7 : 1 }}
                                    >
                                        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                        {saving ? 'Registrando...' : 'Salvar Registro'}
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
                        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                        onClick={(e) => { if (e.target === e.currentTarget) setSelectedMeal(null); }}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-24 sm:pb-6 flex flex-col gap-4 bg-card border" style={{ borderColor: 'var(--border-main)' }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <h3 className="text-text-main font-bold truncate flex-1 pr-2">
                                    {detailMode === 'edit' ? 'Editar refeição' : MEAL_TYPES.find((m) => m.id === selectedMeal.meal_type)?.label ?? 'Refeição'}
                                </h3>
                                <button onClick={() => setSelectedMeal(null)} className="text-text-muted hover:text-text-main flex-shrink-0">
                                    <X size={20} />
                                </button>
                            </div>

                            {detailMode === 'view' && (
                                <>
                                    {/* Description */}
                                    <p className="text-text-main text-sm leading-relaxed">{selectedMeal.description}</p>

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
                                                style={{ backgroundColor: `${m.color} 15`, border: `1px solid ${m.color} 30` }}
                                            >
                                                <span className="text-lg font-bold text-text-main">{m.value}</span>
                                                <span className="text-xs" style={{ color: m.color }}>{m.unit}</span>
                                                <span className="text-text-muted text-xs">{m.label}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={startEditMeal}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white"
                                            style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.2)', border: '1px solid rgba(var(--primary-rgb), 0.4)' }}
                                        >
                                            <Pencil size={15} />
                                            Editar
                                        </button>
                                        {confirmDelete ? (
                                            <div className="flex-1 flex gap-2">
                                                <button
                                                    onClick={() => setConfirmDelete(false)}
                                                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-text-muted"
                                                    style={{ backgroundColor: 'var(--bg-card)' }}
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={handleDeleteMeal}
                                                    disabled={deleting}
                                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1"
                                                    style={{ backgroundColor: 'var(--proteina)' }}
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
                                        <label className="text-text-muted text-xs font-medium">Descrição</label>
                                        <input
                                            type="text"
                                            value={editDesc}
                                            onChange={(e) => setEditDesc(e.target.value)}
                                            className="w-full px-3 py-3 rounded-xl text-text-main text-sm outline-none"
                                            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                                        />
                                    </div>

                                    {/* Qty and Unit */}
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col gap-1.5 flex-1">
                                            <label className="text-text-muted text-xs font-medium">Quantidade</label>
                                            <input
                                                type="number"
                                                min={0.1}
                                                step={0.1}
                                                value={editQty}
                                                onChange={(e) => setEditQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                className="w-full px-3 py-3 rounded-xl text-text-main text-sm font-bold outline-none text-center"
                                                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5 flex-1">
                                            <label className="text-text-muted text-xs font-medium">Unidade</label>
                                            <select
                                                value={editUnit}
                                                onChange={(e) => setEditUnit(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-xl text-text-main text-sm font-semibold outline-none bg-card border"
                                                style={{ borderColor: 'var(--border-main)' }}
                                            >
                                                <option value="gramas">gramas</option>
                                                <option value="unidade">unidade</option>
                                                <option value="fatia">fatia</option>
                                                <option value="colher">colher</option>
                                                <option value="copo">copo</option>
                                                <option value="ml">ml</option>
                                                <option value="litro">litro</option>
                                                <option value="embalagem">embalagem</option>
                                            </select>
                                        </div>
                                    </div>
                                    {editUnit === 'unidade' && selectedMeal?.unit_weight && selectedMeal.unit_weight !== 100 && (
                                        <p className="text-[10px] text-text-muted mt-1 px-1 flex items-center gap-1">
                                            <TrendingUp size={10} className="text-primary" />
                                            <span>1 unidade considerada como <b>{selectedMeal.unit_weight}g</b></span>
                                        </p>
                                    )}

                                    {/* Macro inputs */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: 'Calorias (kcal)', value: editCal, set: setEditCal, color: '#10B981' },
                                            { label: 'Proteína (g)', value: editProt, set: setEditProt, color: '#7C3AED' },
                                            { label: 'Carboidratos (g)', value: editCarbs, set: setEditCarbs, color: '#F59E0B' },
                                            { label: 'Gordura (g)', value: editFat, set: setEditFat, color: '#EF4444' },
                                        ].map((f) => (
                                            <div key={f.label} className="flex flex-col gap-1.5">
                                                <label className="text-text-muted text-xs font-medium">{f.label}</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={f.value}
                                                    onChange={(e) => f.set(parseFloat(e.target.value) || 0)}
                                                    className="w-full px-3 py-2.5 rounded-xl text-text-main text-sm font-bold outline-none text-center"
                                                    style={{ backgroundColor: `${f.color} 15`, border: `1px solid ${f.color} 40` }}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setDetailMode('view')}
                                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-text-muted"
                                            style={{ backgroundColor: 'var(--card-bg)' }}
                                        >
                                            Cancelar
                                        </button>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.97 }}
                                            onClick={saveEditMeal}
                                            disabled={editSaving || !editDesc.trim()}
                                            className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                                            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', opacity: (editSaving || !editDesc.trim()) ? 0.5 : 1 }}
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
                            className="w-full max-w-sm rounded-3xl p-5 pb-8 bg-card border" style={{ borderColor: 'var(--border-main)' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Month header */}
                            <div className="flex items-center justify-between mb-5">
                                <button
                                    type="button"
                                    onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-main"
                                    style={{ backgroundColor: 'var(--card-bg)' }}
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <p className="text-text-main font-bold text-sm capitalize">
                                    {calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-main"
                                    style={{ backgroundColor: 'var(--card-bg)' }}
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>

                            {/* Weekday labels */}
                            <div className="grid grid-cols-7 mb-2">
                                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                                    <div key={i} className="text-center text-[10px] font-semibold text-text-muted uppercase py-1">{d}</div>
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
                                                    backgroundColor: isSelected ? 'var(--primary)' : isToday ? 'rgba(var(--primary-rgb), 0.15)' : 'transparent',
                                                    color: isSelected ? '#fff' : isToday ? 'var(--primary)' : 'var(--text-muted)',
                                                    border: isToday && !isSelected ? '1px solid rgba(var(--primary-rgb), 0.4)' : 'none',
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
                                    className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-primary transition-colors"
                                    style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.1)', border: '1px solid rgba(var(--primary-rgb), 0.2)' }}
                                >
                                    Ir para Hoje
                                </button>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}

function MacroProgress({ label, current, target, color, icon }: { label: string; current: number; target: number; color: string; icon: React.ReactNode }) {
    const pct = Math.min((current / Math.max(target, 1)) * 100, 100);
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-end">
                <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: `${color} 15`, color: color }}>
                        {icon}
                    </div>
                    <span className="text-[10px] uppercase font-black tracking-widest text-text-muted">{label}</span>
                </div>
                <span className="text-xs font-bold text-text-main">{current.toFixed(1).replace('.0', '')} <span className="text-[10px] text-text-muted font-normal">/ {target}g</span></span>
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.05)' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                />
            </div>
        </div>
    );
}
