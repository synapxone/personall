import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Camera, SkipForward, Check, Loader2, LogOut, User, Ruler, Activity, Target, MapPin, Clock, Utensils, Sparkles, PlusCircle } from 'lucide-react';
import { aiService } from '../services/aiService';
import { supabase } from '../lib/supabase';
import type { OnboardingData, Gender, ActivityLevel, Goal, TrainingLocation } from '../types';

interface Props {
    onComplete: (data: OnboardingData, workoutPlan: any, dietPlan: any) => void;
}

type Step =
    | 'welcome'
    | 'basics'
    | 'body'
    | 'activity'
    | 'goal'
    | 'location'
    | 'time'
    | 'food'
    | 'photo'
    | 'generating'
    | 'done';

const STEPS: Step[] = ['welcome', 'basics', 'body', 'activity', 'goal', 'location', 'time', 'food', 'photo', 'generating', 'done'];

const FOOD_OPTIONS = [
    'Frango', 'Arroz', 'Feijão', 'Ovo', 'Batata Doce', 'Aveia',
    'Banana', 'Maçã', 'Atum', 'Carne Vermelha', 'Peixe', 'Tofu',
    'Brócolis', 'Cenoura', 'Alface', 'Iogurte', 'Queijo', 'Leite',
    'Pão Integral', 'Macarrão',
];

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; desc: string; emoji: string }[] = [
    { value: 'sedentary', label: 'Sedentário', desc: 'Pouco ou nenhum exercício', emoji: '🛋️' },
    { value: 'light', label: 'Levemente Ativo', desc: '1-3 dias de exercício/semana', emoji: '🚶' },
    { value: 'moderate', label: 'Moderadamente Ativo', desc: '3-5 dias de exercício/semana', emoji: '🏃' },
    { value: 'active', label: 'Muito Ativo', desc: '6-7 dias de exercício/semana', emoji: '⚡' },
    { value: 'very_active', label: 'Extremamente Ativo', desc: 'Atleta ou trabalho físico intenso', emoji: '🏆' },
];

const GOALS: { value: Goal; label: string; emoji: string; desc: string }[] = [
    { value: 'lose_weight', label: 'Perder Peso', emoji: '🔥', desc: 'Reduzir gordura corporal' },
    { value: 'gain_muscle', label: 'Ganhar Músculo', emoji: '💪', desc: 'Hipertrofia e força' },
    { value: 'maintain', label: 'Manter Peso', emoji: '⚖️', desc: 'Saúde e bem-estar' },
    { value: 'gain_weight', label: 'Ganhar Peso', emoji: '📈', desc: 'Massa muscular e peso' },
];

function calcBMI(weight: number, height: number): number {
    if (!weight || !height) return 0;
    return weight / ((height / 100) ** 2);
}

function bmiLabel(bmi: number): { label: string; color: string } {
    if (bmi < 18.5) return { label: 'Abaixo do peso', color: '#F59E0B' };
    if (bmi < 25) return { label: 'Peso normal', color: '#10B981' };
    if (bmi < 30) return { label: 'Sobrepeso', color: '#F59E0B' };
    return { label: 'Obesidade', color: '#EF4444' };
}

const slideVariants = {
    enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: -dir * 60, opacity: 0 }),
};

export default function OnboardingWizard({ onComplete }: Props) {
    useEffect(() => {
        // Force light mode for onboarding
        const originalTheme = document.documentElement.className;
        document.documentElement.classList.add('light');
        return () => {
            // Restore theme if necessary, though App.tsx usually handles this
            if (!originalTheme.includes('light')) {
                // Keep it light if that's the default, or handle as needed
            }
        };
    }, []);

    const [step, setStep] = useState<Step>('welcome');
    const [dir, setDir] = useState(1);
    const [data, setData] = useState<Partial<OnboardingData>>({
        food_preferences: [],
        foods_at_home: [],
        available_minutes: 45,
        weight: 70,
        height: 170,
        age: 25,
        gender: 'male',
        activity_level: 'moderate',
        goal: 'gain_muscle',
        training_location: 'gym',
    });
    const [foodInput, setFoodInput] = useState('');
    const [homeInput, setHomeInput] = useState('');
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [generatingPhase, setGeneratingPhase] = useState(0);
    const [generatedPlan, setGeneratedPlan] = useState<any>(null);
    const [generatedDiet, setGeneratedDiet] = useState<any>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const stepIndex = STEPS.indexOf(step);
    const totalSteps = STEPS.length - 2; // exclude generating and done from progress

    function goNext() {
        setDir(1);
        setStep(STEPS[stepIndex + 1]);
    }

    function goBack() {
        setDir(-1);
        setStep(STEPS[stepIndex - 1]);
    }

    function updateData(patch: Partial<OnboardingData>) {
        setData((prev) => ({ ...prev, ...patch }));
    }

    function toggleFood(list: 'food_preferences' | 'foods_at_home', item: string) {
        const arr = (data[list] as string[]) || [];
        if (arr.includes(item)) {
            updateData({ [list]: arr.filter((f) => f !== item) });
        } else {
            updateData({ [list]: [...arr, item] });
        }
    }

    function addCustomFood(list: 'food_preferences' | 'foods_at_home', value: string, clear: () => void) {
        const v = value.trim();
        if (!v) return;
        const arr = (data[list] as string[]) || [];
        if (!arr.includes(v)) {
            updateData({ [list]: [...arr, v] });
        }
        clear();
    }

    async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
        reader.readAsDataURL(file);
        updateData({ photo_file: file });
    }

    async function startGeneration() {
        setDir(1);
        setStep('generating');
        setGeneratingPhase(0);

        const fullData = data as OnboardingData;

        // Phase 0: Analyzing profile
        await new Promise((r) => setTimeout(r, 800));
        setGeneratingPhase(1);

        // Phase 1: Generate workout plan
        const plan = await aiService.generateWorkoutPlan(fullData);
        setGeneratedPlan(plan);
        setGeneratingPhase(2);

        // Phase 2: Generate diet plan
        const diet = await aiService.generateDietPlan(fullData);
        setGeneratedDiet(diet);

        // Phase 3: Analyze body photo if provided
        if (data.photo_file) {
            setGeneratingPhase(3);
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
                reader.onload = (e) => {
                    const result = e.target?.result as string;
                    resolve(result.split(',')[1]);
                };
                reader.readAsDataURL(data.photo_file!);
            });
            const analysis = await aiService.analyzeBodyPhoto(base64, data.photo_file.type);
            updateData({ body_analysis: analysis });
        }

        setGeneratingPhase(4);
        await new Promise((r) => setTimeout(r, 600));
        setDir(1);
        setStep('done');
    }

    const showBack = !['welcome', 'generating'].includes(step);

    const progressPercent = step === 'done' ? 100
        : step === 'generating' ? 90
            : Math.round((stepIndex / (totalSteps)) * 100);

    const bmi = calcBMI(data.weight ?? 70, data.height ?? 170);
    const bmiInfo = bmiLabel(bmi);

    // Calorie goal for done screen
    const calorieGoal = data.weight && data.height && data.age && data.goal
        ? aiService.calculateCalorieGoal(data as OnboardingData)
        : 0;

    return (
        <div className="min-h-screen flex flex-col bg-[#FAFAF8] text-[#1C1C1E]">
            {/* Background Decoration */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -right-[10%] w-[40%] h-[40%] bg-primary/5 blur-[100px] rounded-full" />
                <div className="absolute top-[20%] -left-[10%] w-[30%] h-[30%] bg-accent/5 blur-[80px] rounded-full" />
            </div>

            {/* Progress bar */}
            {step !== 'welcome' && (
                <div className="w-full h-1 bg-text-main/5">
                    <motion.div
                        className="h-full rounded-full bg-primary"
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.4 }}
                    />
                </div>
            )}

            {/* Top bar: back + sign out */}
            {step !== 'generating' && (
                <div className="flex items-center justify-between px-4 pt-4">
                    <div>
                        {showBack && (
                            <button onClick={goBack} className="flex items-center gap-1 text-text-muted hover:text-text-main transition-colors text-sm">
                                <ChevronLeft size={18} />
                                Voltar
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => supabase.auth.signOut()}
                        className="flex items-center gap-1.5 text-text-muted opacity-60 hover:text-red-400 transition-colors text-xs"
                        title="Sair da conta"
                    >
                        <LogOut size={14} />
                        Sair
                    </button>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <AnimatePresence mode="wait" custom={dir}>
                    <motion.div
                        key={step}
                        custom={dir}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="flex-1 flex flex-col px-6 py-6"
                    >
                        {/* ===== WELCOME ===== */}
                        {step === 'welcome' && (
                            <div className="flex-1 flex flex-col items-center justify-center text-center gap-8 relative">
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-primary to-primary-hover shadow-xl shadow-primary/20 flex items-center justify-center mb-2"
                                >
                                    <Sparkles size={48} className="text-white" />
                                </motion.div>
                                <div className="flex flex-col items-center gap-2">
                                    <h1 className="font-['Quicksand'] font-bold text-6xl lowercase text-[#1C1C1E] tracking-tight">niume</h1>
                                    <div className="h-1 w-12 bg-primary rounded-full" />
                                    <p className="text-[#6B6B7B] text-lg font-medium mt-2">Sua jornada VIP com IA</p>
                                </div>
                                <p className="text-[#6B6B7B]/80 text-base max-w-xs leading-relaxed">
                                    Prepare-se para uma experiência de elite. Nossa IA criará um ecossistema completo de treino e nutrição exclusivo para você.
                                </p>
                                <motion.button
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={goNext}
                                    className="px-12 py-5 rounded-2xl font-bold bg-[#1C1C1E] text-white text-lg mt-6 shadow-2xl shadow-black/10 transition-all hover:bg-black"
                                >
                                    Começar agora
                                </motion.button>
                            </div>
                        )}

                        {/* ===== BASICS ===== */}
                        {step === 'basics' && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                        <User size={24} className="text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">Bem-vindo(a)</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium">Vamos começar pelo essencial.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-6 p-1">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[#1C1C1E] text-[10px] font-black uppercase tracking-widest pl-1">Como devemos te chamar?</label>
                                        <input
                                            type="text"
                                            autoFocus
                                            placeholder="Seu nome completo"
                                            value={data.name || ''}
                                            onChange={(e) => updateData({ name: e.target.value })}
                                            className="w-full px-5 py-4 rounded-2xl text-[#1C1C1E] text-base font-bold outline-none bg-white border border-[#1C1C1E]/10 focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-[#1C1C1E] text-[10px] font-black uppercase tracking-widest pl-1">Sua Idade</label>
                                        <input
                                            type="number"
                                            min={10}
                                            max={100}
                                            placeholder="25"
                                            value={data.age || ''}
                                            onChange={(e) => updateData({ age: parseInt(e.target.value) })}
                                            className="w-full px-5 py-4 rounded-2xl text-[#1C1C1E] text-base font-bold outline-none bg-white border border-[#1C1C1E]/10 focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-[#1C1C1E] text-[10px] font-black uppercase tracking-widest pl-1">Identidade biológica</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {(['male', 'female', 'other'] as Gender[]).map((g) => {
                                                const labels = { male: 'Masculino', female: 'Feminino', other: 'Outro' };
                                                const emojis = { male: '♂️', female: '♀️', other: '⚧' };
                                                const selected = data.gender === g;
                                                return (
                                                    <button
                                                        key={g}
                                                        onClick={() => updateData({ gender: g })}
                                                        className="flex flex-col items-center gap-2 py-4 rounded-2xl text-xs font-bold transition-all shadow-sm"
                                                        style={{
                                                            backgroundColor: selected ? 'var(--primary)' : '#FFF',
                                                            border: `1px solid ${selected ? 'var(--primary)' : 'rgba(28,28,30,0.1)'}`,
                                                            color: selected ? '#FFF' : 'var(--text-muted)',
                                                        }}
                                                    >
                                                        <span className="text-2xl">{emojis[g]}</span>
                                                        <span>{labels[g]}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <PrimaryButton
                                    disabled={!data.name || !data.age}
                                    onClick={goNext}
                                    label="Próximo passo"
                                />
                            </div>
                        )}

                        {/* ===== BODY ===== */}
                        {step === 'body' && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                                        <Ruler size={24} className="text-amber-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">Bioestatística</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium">Sua base física para cálculos precisos.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-8">
                                    <SliderField
                                        label="Seu Peso Atual"
                                        value={data.weight ?? 70}
                                        min={40}
                                        max={200}
                                        unit="kg"
                                        onChange={(v) => updateData({ weight: v })}
                                    />

                                    <SliderField
                                        label="Sua Altura"
                                        value={data.height ?? 170}
                                        min={140}
                                        max={220}
                                        unit="cm"
                                        onChange={(v) => updateData({ height: v })}
                                    />

                                    {bmi > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex flex-col gap-3 p-5 rounded-3xl bg-white border border-[#1C1C1E]/5 shadow-sm"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-[#6B6B7B] text-xs font-black uppercase tracking-widest font-mono">Índice de Massa Corporal (IMC)</span>
                                                <span className="text-[#1C1C1E] font-black text-xl">{bmi.toFixed(1)}</span>
                                            </div>
                                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
                                                <div className="h-full bg-amber-400" style={{ width: '18%' }} />
                                                <div className="h-full bg-emerald-400" style={{ width: '32%' }} />
                                                <div className="h-full bg-amber-400" style={{ width: '20%' }} />
                                                <div className="h-full bg-red-400" style={{ width: '30%' }} />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-[#6B6B7B]">Classificação técnica:</span>
                                                <span className="text-xs font-black px-3 py-1 rounded-full uppercase tracking-tighter" style={{ backgroundColor: `${bmiInfo.color}15`, color: bmiInfo.color }}>
                                                    {bmiInfo.label}
                                                </span>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>

                                <PrimaryButton onClick={goNext} label="Confirmar medidas" />
                            </div>
                        )}

                        {/* ===== ACTIVITY ===== */}
                        {step === 'activity' && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                                        <Activity size={24} className="text-blue-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">Estilo de Vida</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium">Qual seu ritmo de atividade?</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {ACTIVITY_LEVELS.map((a) => {
                                        const selected = data.activity_level === a.value;
                                        return (
                                            <button
                                                key={a.value}
                                                onClick={() => updateData({ activity_level: a.value })}
                                                className="flex items-center gap-5 px-5 py-5 rounded-3xl text-left transition-all group relative overflow-hidden"
                                                style={{
                                                    backgroundColor: selected ? '#1C1C1E' : '#FFF',
                                                    border: `1px solid ${selected ? '#1C1C1E' : 'rgba(28,28,30,0.1)'}`,
                                                    boxShadow: selected ? '0 20px 25px -5px rgba(0,0,0,0.1)' : 'none'
                                                }}
                                            >
                                                <span className="text-3xl relative z-10">{a.emoji}</span>
                                                <div className="flex-1 relative z-10">
                                                    <p className={`font-black text-sm uppercase tracking-wider ${selected ? 'text-white' : 'text-[#1C1C1E]'}`}>{a.label}</p>
                                                    <p className={`text-xs mt-0.5 font-medium ${selected ? 'text-white/60' : 'text-[#6B6B7B]'}`}>{a.desc}</p>
                                                </div>
                                                {selected && (
                                                    <motion.div
                                                        layoutId="check-act"
                                                        className="w-6 h-6 rounded-full flex items-center justify-center bg-primary"
                                                    >
                                                        <Check size={14} className="text-white" />
                                                    </motion.div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <PrimaryButton onClick={goNext} label="Configurar perfil" />
                            </div>
                        )}

                        {/* ===== GOAL ===== */}
                        {step === 'goal' && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                        <Target size={24} className="text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">O Destino</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium">Qual sua prioridade máxima?</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {GOALS.map((g) => {
                                        const selected = data.goal === g.value;
                                        return (
                                            <button
                                                key={g.value}
                                                onClick={() => updateData({ goal: g.value })}
                                                className="flex flex-col items-center gap-3 py-6 px-4 rounded-[32px] transition-all relative overflow-hidden"
                                                style={{
                                                    backgroundColor: selected ? 'var(--primary-10)' : '#FFF',
                                                    border: `2px solid ${selected ? 'var(--primary)' : 'transparent'}`,
                                                    boxShadow: selected ? '0 10px 15px -3px rgba(var(--primary-rgb), 0.1)' : '0 4px 6px -1px rgba(0,0,0,0.02)'
                                                }}
                                            >
                                                <span className="text-4xl">{g.emoji}</span>
                                                <div className="text-center">
                                                    <p className={`font-black text-xs uppercase tracking-widest ${selected ? 'text-primary' : 'text-[#1C1C1E]'}`}>{g.label}</p>
                                                    <p className="text-[10px] text-[#6B6B7B] mt-1 font-semibold leading-tight">{g.desc}</p>
                                                </div>
                                                {selected && (
                                                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center bg-primary text-white shadow-lg">
                                                        <Check size={14} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <PrimaryButton onClick={goNext} label="Definir objetivo" />
                            </div>
                        )}

                        {/* ===== LOCATION ===== */}
                        {step === 'location' && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                                        <MapPin size={24} className="text-indigo-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">Ambiente</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium">Onde a mágica acontece?</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-5">
                                    {([
                                        { value: 'gym' as TrainingLocation, label: 'Academia', emoji: '🏋️', desc: 'Estruturação completa.' },
                                        { value: 'home' as TrainingLocation, label: 'Em Casa', emoji: '🏠', desc: 'Treino otimizado sem máquinas.' },
                                    ]).map((loc) => {
                                        const selected = data.training_location === loc.value;
                                        return (
                                            <button
                                                key={loc.value}
                                                onClick={() => updateData({ training_location: loc.value })}
                                                className="flex flex-col items-center gap-4 py-10 rounded-[40px] transition-all relative border-2 border-transparent"
                                                style={{
                                                    backgroundColor: selected ? '#1C1C1E' : '#FFF',
                                                    boxShadow: selected ? '0 25px 50px -12px rgba(0, 0, 0, 0.2)' : '0 10px 15px -3px rgba(0, 0, 0, 0.04)',
                                                    borderColor: selected ? '#1C1C1E' : 'transparent'
                                                }}
                                            >
                                                <span className="text-6xl">{loc.emoji}</span>
                                                <div className="text-center">
                                                    <p className={`font-black text-sm uppercase tracking-widest ${selected ? 'text-white' : 'text-[#1C1C1E]'}`}>{loc.label}</p>
                                                    <p className={`text-xs mt-1 font-medium px-4 opacity-70 ${selected ? 'text-white/70' : 'text-[#6B6B7B]'}`}>{loc.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <PrimaryButton onClick={goNext} label="Próximo passo" />
                            </div>
                        )}

                        {/* ===== TIME ===== */}
                        {step === 'time' && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                        <Clock size={24} className="text-emerald-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">Disponibilidade</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium">Quanto tempo temos para treinar?</p>
                                    </div>
                                </div>

                                <div className="flex flex-col items-center gap-1 py-4 bg-white rounded-3xl border border-[#1C1C1E]/5 shadow-sm">
                                    <span className="text-7xl font-black text-[#1C1C1E] tracking-tighter">{data.available_minutes ?? 45}</span>
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#6B6B7B]">minutos por sessão</span>
                                </div>

                                <div className="px-1">
                                    <input
                                        type="range"
                                        min={20}
                                        max={120}
                                        step={5}
                                        value={data.available_minutes ?? 45}
                                        onChange={(e) => updateData({ available_minutes: parseInt(e.target.value) })}
                                        className="w-full accent-primary h-2 bg-gray-100 rounded-full appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-[10px] font-black text-[#6B6B7B] mt-3 uppercase tracking-widest pl-1 pr-1">
                                        <span>20 min</span>
                                        <span>Express</span>
                                        <span>Elite</span>
                                        <span>120 min</span>
                                    </div>
                                </div>

                                <motion.div
                                    className="px-6 py-5 rounded-[28px] text-sm text-center font-medium leading-relaxed"
                                    style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.08)', border: '1px solid rgba(var(--primary-rgb), 0.1)' }}
                                    key={data.available_minutes}
                                    initial={{ scale: 0.95, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                >
                                    <p className="text-primary italic">
                                        {(data.available_minutes ?? 45) <= 30
                                            ? '"Foco total em alta intensidade (HIIT) para resultados rápidos."'
                                            : (data.available_minutes ?? 45) <= 60
                                                ? '"Equilíbrio perfeito entre força e condicionamento atlético."'
                                                : '"Volume de elite para maximizar hipertrofia e detalhamento muscular."'}
                                    </p>
                                </motion.div>

                                <PrimaryButton onClick={goNext} label="Ajustar rotina" />
                            </div>
                        )}

                        {/* ===== FOOD ===== */}
                        {step === 'food' && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                        <Utensils size={24} className="text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">Gastronomia</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium">O que vai no seu prato?</p>
                                    </div>
                                </div>

                                <FoodSection
                                    title="Suas Preferências"
                                    subtitle="Proteínas e carboidratos favoritos"
                                    selected={(data.food_preferences as string[]) || []}
                                    onToggle={(item) => toggleFood('food_preferences', item)}
                                    customInput={foodInput}
                                    onCustomChange={setFoodInput}
                                    onCustomAdd={() => addCustomFood('food_preferences', foodInput, () => setFoodInput(''))}
                                />

                                <FoodSection
                                    title="Estoque Atual"
                                    subtitle="O que já temos disponível agora?"
                                    selected={(data.foods_at_home as string[]) || []}
                                    onToggle={(item) => toggleFood('foods_at_home', item)}
                                    customInput={homeInput}
                                    onCustomChange={setHomeInput}
                                    onCustomAdd={() => addCustomFood('foods_at_home', homeInput, () => setHomeInput(''))}
                                />

                                <PrimaryButton onClick={goNext} label="Finalizar perfil" />
                            </div>
                        )}

                        {/* ===== PHOTO ===== */}
                        {step === 'photo' && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto items-center">
                                <div className="text-center flex flex-col items-center gap-3">
                                    <div className="w-16 h-16 rounded-[24px] bg-primary/10 flex items-center justify-center">
                                        <Camera size={32} className="text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">O Olhar da IA</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium max-w-xs">Análise visual para precisão cirúrgica no seu plano corporal (opcional).</p>
                                    </div>
                                </div>

                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={handlePhotoSelect}
                                />

                                {photoPreview ? (
                                    <div className="relative group">
                                        <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full scale-75 group-hover:scale-100 transition-transform duration-500 opacity-50" />
                                        <div className="relative w-56 h-72 rounded-[40px] overflow-hidden border-4 border-white shadow-2xl">
                                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => { setPhotoPreview(null); updateData({ photo_file: undefined }); }}
                                                className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center bg-black/60 backdrop-blur-md text-white border border-white/20 transition-all hover:bg-black/80"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <motion.button
                                        whileHover={{ scale: 1.02, y: -4 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => fileRef.current?.click()}
                                        className="flex flex-col items-center gap-4 w-56 h-72 rounded-[40px] justify-center bg-white border-2 border-dashed border-[#1C1C1E]/10 transition-all hover:bg-white hover:border-primary/40 group shadow-sm"
                                    >
                                        <div className="w-20 h-20 rounded-full bg-[#FAFAF8] flex items-center justify-center group-hover:bg-primary/5 transition-colors">
                                            <Camera size={32} className="text-[#1C1C1E]/30 group-hover:text-primary transition-colors" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs font-black uppercase tracking-widest text-[#1C1C1E]">Capturar Agora</p>
                                            <p className="text-[10px] text-[#6B6B7B] font-medium mt-1">Sua foto é confidencial</p>
                                        </div>
                                    </motion.button>
                                )}

                                <div className="text-xs text-[#6B6B7B] text-center max-w-xs px-6 py-4 rounded-3xl bg-white border border-[#1C1C1E]/5 shadow-sm leading-relaxed">
                                    <p>Usamos visão computacional para detectar simetria e composição corporal. O arquivo é deletado após o processamento.</p>
                                </div>

                                <div className="flex flex-col gap-4 w-full">
                                    <PrimaryButton onClick={startGeneration} label={photoPreview ? 'Processar e Gerar Plano' : 'Gerar Plano com IA'} />
                                    <button
                                        onClick={startGeneration}
                                        className="flex items-center justify-center gap-2 py-2 text-[#6B6B7B] text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:text-[#1C1C1E]"
                                    >
                                        <SkipForward size={14} />
                                        Seguir sem foto
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ===== GENERATING ===== */}
                        {step === 'generating' && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-10 text-center relative">
                                <div className="relative">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                                        className="absolute -inset-8 bg-gradient-to-tr from-primary/30 to-accent/30 blur-[40px] opacity-40 rounded-full"
                                    />
                                    <motion.div
                                        animate={{ y: [0, -12, 0] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                        className="relative w-32 h-32 rounded-[40px] bg-white shadow-2xl flex items-center justify-center"
                                    >
                                        <Sparkles size={56} className="text-primary animate-pulse" />
                                    </motion.div>
                                </div>

                                <div>
                                    <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight uppercase">Engenharia de Elite</h2>
                                    <p className="text-[#6B6B7B] text-sm font-medium mt-1">Processando {Math.round([0, 25, 60, 85, 100][generatingPhase] || 0)}% dos dados bioestatísticos</p>
                                </div>

                                <div className="w-full max-w-xs relative bg-white h-3 rounded-full overflow-hidden shadow-inner border border-[#1C1C1E]/5">
                                    <motion.div
                                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary-hover rounded-full"
                                        animate={{ width: `${[0, 25, 60, 85, 100][generatingPhase] || 0}%` }}
                                        transition={{ duration: 0.8, ease: 'circOut' }}
                                    />
                                </div>

                                <div className="flex flex-col gap-4 w-full max-w-xs text-left">
                                    {[
                                        'Analisando perfil biológico...',
                                        'Otimizando periodização de treino...',
                                        'Sincronizando macronutrientes...',
                                        'Ajustando visão computacional corporal...',
                                        'Consolidando ecossistema niume...',
                                    ].map((phase, i) => (
                                        <motion.div
                                            key={i}
                                            className="flex items-center gap-4"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: generatingPhase >= i ? 1 : 0.2, x: 0 }}
                                        >
                                            <div className="w-6 h-6 rounded-full flex items-center justify-center border-2 border-[#1C1C1E]/5 bg-white">
                                                {generatingPhase > i ? (
                                                    <Check size={12} className="text-emerald-500 font-black" />
                                                ) : generatingPhase === i ? (
                                                    <Loader2 size={12} className="animate-spin text-primary" />
                                                ) : (
                                                    <div className="w-1 h-1 rounded-full bg-[#6B6B7B]" />
                                                )}
                                            </div>
                                            <span className={`text-xs font-black uppercase tracking-widest ${generatingPhase === i ? 'text-[#1C1C1E]' : 'text-[#6B6B7B]'}`}>
                                                {phase}
                                            </span>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ===== DONE ===== */}
                        {step === 'done' && generatedPlan && (
                            <div className="flex flex-col gap-8 max-w-md w-full mx-auto">
                                <div className="text-center flex flex-col items-center gap-4">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -20 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: 'spring', damping: 10 }}
                                        className="w-20 h-20 rounded-[32px] bg-emerald-500 shadow-xl shadow-emerald-200 flex items-center justify-center text-white"
                                    >
                                        <Check size={40} strokeWidth={3} />
                                    </motion.div>
                                    <div>
                                        <h2 className="text-3xl font-black text-[#1C1C1E] tracking-tight">VIP Ativado</h2>
                                        <p className="text-[#6B6B7B] text-sm font-medium">Seu ecossistema sob medida está pronto.</p>
                                    </div>
                                </div>

                                {/* Plan card */}
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-primary/5 blur-2xl rounded-full" />
                                    <div className="relative rounded-[40px] p-8 flex flex-col gap-6 bg-white border border-[#1C1C1E]/5 shadow-2xl">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-[#6B6B7B]">Treino Principal</span>
                                                <h3 className="text-xl font-black text-[#1C1C1E] mt-1">{generatedPlan.name}</h3>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className="bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full uppercase truncate">
                                                        {generatedPlan.estimated_weeks} Semanas
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="w-14 h-14 rounded-3xl bg-primary/5 flex items-center justify-center">
                                                <Sparkles size={24} className="text-primary" />
                                            </div>
                                        </div>

                                        {generatedPlan.description && (
                                            <p className="text-sm text-[#6B6B7B] font-medium leading-relaxed italic border-l-2 border-primary pl-4">
                                                "{generatedPlan.description}"
                                            </p>
                                        )}

                                        {/* First day preview */}
                                        {generatedPlan.weeks?.[0]?.days?.[0]?.exercises?.length > 0 && (
                                            <div className="bg-[#FAFAF8] rounded-3xl p-5 border border-[#1C1C1E]/5">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[#6B6B7B] mb-3">Preview Sessão 01</p>
                                                <div className="flex flex-col gap-3">
                                                    {generatedPlan.weeks[0].days[0].exercises.slice(0, 3).map((ex: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-3">
                                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                                            <div className="flex-1">
                                                                <p className="text-xs font-black text-[#1C1C1E]">{ex.name}</p>
                                                                <p className="text-[10px] text-[#6B6B7B] uppercase font-bold">{ex.sets} séries × {ex.reps} reps</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {generatedPlan.weeks[0].days[0].exercises.length > 3 && (
                                                        <p className="text-[10px] text-primary font-black uppercase tracking-tight ml-5">
                                                            + {generatedPlan.weeks[0].days[0].exercises.length - 3} exercícios técnicos
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Calorie goal */}
                                {calorieGoal > 0 && (
                                    <div className="flex items-center justify-between px-8 py-6 rounded-[32px] bg-white border border-[#1C1C1E]/5 shadow-lg group hover:border-primary/20 transition-all">
                                        <div className="flex items-center gap-5">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                                <Utensils size={24} className="text-emerald-500" />
                                            </div>
                                            <div>
                                                <p className="text-[#6B6B7B] text-[10px] font-black uppercase tracking-widest">Meta de Nutrição</p>
                                                <p className="text-[#1C1C1E] font-black text-xs">Diária Personalizada</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-2xl font-black text-emerald-500">{calorieGoal}</span>
                                            <span className="text-[10px] font-black text-[#6B6B7B] uppercase tracking-tighter">kcal/dia</span>
                                        </div>
                                    </div>
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => onComplete(data as OnboardingData, generatedPlan, generatedDiet)}
                                    className="w-full py-5 rounded-[28px] font-black text-white text-lg shadow-2xl transition-all"
                                    style={{ background: 'linear-gradient(135deg, #1C1C1E 0%, #000 100%)' }}
                                >
                                    Abrir Meu Dashboard 🚀
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Floating mascot */}
            {!['welcome', 'generating'].includes(step) && (
                <motion.div
                    className="fixed bottom-6 right-6 text-2xl select-none pointer-events-none"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                    💪
                </motion.div>
            )}
        </div>
    );
}

// ---- Sub-components ----

function PrimaryButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
    return (
        <motion.button
            whileHover={{ scale: disabled ? 1 : 1.02, y: disabled ? 0 : -2 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={onClick}
            disabled={disabled}
            className="w-full py-5 rounded-[28px] font-black text-white text-base shadow-xl transition-all"
            style={{
                backgroundColor: disabled ? '#E5E5E5' : 'var(--primary)',
                color: disabled ? '#A1A1AA' : '#FFF',
                cursor: disabled ? 'not-allowed' : 'pointer',
            }}
        >
            {label}
        </motion.button>
    );
}

interface SliderFieldProps {
    label: string;
    value: number;
    min: number;
    max: number;
    unit: string;
    onChange: (v: number) => void;
}

function SliderField({ label, value, min, max, unit, onChange }: SliderFieldProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between pl-1">
                <label className="text-[#1C1C1E] text-[10px] font-black uppercase tracking-widest">{label}</label>
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#1C1C1E]/5 shadow-sm">
                    <input
                        type="number"
                        min={min}
                        max={max}
                        value={value}
                        onChange={(e) => onChange(parseInt(e.target.value) || min)}
                        className="w-12 text-center text-[#1C1C1E] text-sm font-black outline-none bg-transparent"
                    />
                    <span className="text-[#6B6B7B] text-[10px] font-bold uppercase">{unit}</span>
                </div>
            </div>
            <div className="px-1">
                <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="w-full accent-primary h-2 bg-gray-100 rounded-full appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] font-black text-[#6B6B7B] mt-2 uppercase tracking-tight">
                    <span>{min}{unit}</span>
                    <span>Meta: {value}{unit}</span>
                    <span>{max}{unit}</span>
                </div>
            </div>
        </div>
    );
}

interface FoodSectionProps {
    title: string;
    subtitle: string;
    selected: string[];
    onToggle: (item: string) => void;
    customInput: string;
    onCustomChange: (v: string) => void;
    onCustomAdd: () => void;
}

function FoodSection({ title, subtitle, selected, onToggle, customInput, onCustomChange, onCustomAdd }: FoodSectionProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="pl-1">
                <h3 className="text-[#1C1C1E] text-[10px] font-black uppercase tracking-widest">{title}</h3>
                <p className="text-[#6B6B7B] text-[10px] font-medium mt-0.5">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                {FOOD_OPTIONS.map((food) => {
                    const sel = selected.includes(food);
                    return (
                        <button
                            key={food}
                            onClick={() => onToggle(food)}
                            className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
                            style={{
                                backgroundColor: sel ? 'var(--primary)' : '#FFF',
                                border: `1px solid ${sel ? 'var(--primary)' : 'rgba(28,28,30,0.08)'}`,
                                color: sel ? '#FFF' : '#6B6B7B',
                            }}
                        >
                            {food}
                        </button>
                    );
                })}
                {selected.filter((f) => !FOOD_OPTIONS.includes(f)).map((food) => (
                    <button
                        key={food}
                        onClick={() => onToggle(food)}
                        className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider bg-primary text-white shadow-md flex items-center gap-2"
                    >
                        {food} <span className="opacity-50 text-[8px]">✕</span>
                    </button>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Adicionar preferência..."
                    value={customInput}
                    onChange={(e) => onCustomChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCustomAdd(); } }}
                    className="flex-1 px-4 py-3 rounded-2xl text-[#1C1C1E] text-xs font-bold outline-none bg-white border border-[#1C1C1E]/10 focus:border-primary transition-all shadow-sm"
                />
                <button
                    onClick={onCustomAdd}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-primary shadow-lg shadow-primary/20 transition-all hover:scale-105"
                >
                    <PlusCircle size={20} />
                </button>
            </div>
        </div>
    );
}
