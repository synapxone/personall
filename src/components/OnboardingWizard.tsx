import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Camera, SkipForward, Check, Loader2, LogOut } from 'lucide-react';
import { geminiService } from '../services/geminiService';
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
        const plan = await geminiService.generateWorkoutPlan(fullData);
        setGeneratedPlan(plan);
        setGeneratingPhase(2);

        // Phase 2: Generate diet plan
        const diet = await geminiService.generateDietPlan(fullData);
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
            const analysis = await geminiService.analyzeBodyPhoto(base64, data.photo_file.type);
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
        ? geminiService.calculateCalorieGoal(data as OnboardingData)
        : 0;

    return (
        <div className="min-h-screen flex flex-col bg-background">
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
                            <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="mb-4"
                                >
                                    <img src="/assets/brand/icon.png" alt="icon" className="w-24 h-24 object-contain mx-auto" />
                                </motion.div>
                                <div className="mb-6">
                                    <img src="/assets/brand/logo.png" alt="niume logo" className="h-10 w-auto mx-auto mb-4" />
                                    <p className="text-text-muted text-base">Seu Personal Trainer com IA</p>
                                </div>
                                <p className="text-text-muted/80 text-sm max-w-xs">
                                    Em poucos passos, nossa IA vai montar o treino e a dieta ideal para o seu objetivo.
                                </p>
                                <motion.button
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={goNext}
                                    className="px-10 py-4 rounded-2xl font-bold text-white text-lg mt-4 bg-primary"
                                >
                                    Começar
                                </motion.button>
                            </div>
                        )}

                        {/* ===== BASICS ===== */}
                        {step === 'basics' && (
                            <div className="flex flex-col gap-6 max-w-md w-full mx-auto">
                                <div>
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Informações Básicas</h2>
                                    <p className="text-text-muted text-sm">Como podemos te chamar?</p>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-text-main text-sm font-medium">Seu nome</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: João Silva"
                                        value={data.name || ''}
                                        onChange={(e) => updateData({ name: e.target.value })}
                                        className="w-full px-4 py-3.5 rounded-xl text-text-main text-sm outline-none bg-card border"
                                        style={{ borderColor: 'var(--border-main)' }}
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-text-main text-sm font-medium">Idade</label>
                                    <input
                                        type="number"
                                        min={10}
                                        max={100}
                                        value={data.age || ''}
                                        onChange={(e) => updateData({ age: parseInt(e.target.value) })}
                                        className="w-full px-4 py-3.5 rounded-xl text-text-main text-sm outline-none bg-card border"
                                        style={{ borderColor: 'var(--border-main)' }}
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-text-main text-sm font-medium">Gênero</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {(['male', 'female', 'other'] as Gender[]).map((g) => {
                                            const labels = { male: 'Masculino', female: 'Feminino', other: 'Outro' };
                                            const emojis = { male: '♂️', female: '♀️', other: '⚧' };
                                            const selected = data.gender === g;
                                            return (
                                                <button
                                                    key={g}
                                                    onClick={() => updateData({ gender: g })}
                                                    className="flex flex-col items-center gap-1 py-3 rounded-xl text-sm font-medium transition-all"
                                                    style={{
                                                        backgroundColor: selected ? 'var(--primary-10)' : 'var(--bg-card)',
                                                        border: `1px solid ${selected ? 'var(--primary)' : 'var(--border-main)'}`,
                                                        color: selected ? 'var(--primary)' : 'var(--text-muted)',
                                                    }}
                                                >
                                                    <span className="text-xl">{emojis[g]}</span>
                                                    <span>{labels[g]}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <PrimaryButton
                                    disabled={!data.name || !data.age}
                                    onClick={goNext}
                                    label="Continuar"
                                />
                            </div>
                        )}

                        {/* ===== BODY ===== */}
                        {step === 'body' && (
                            <div className="flex flex-col gap-6 max-w-md w-full mx-auto">
                                <div>
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Medidas Corporais</h2>
                                    <p className="text-text-muted text-sm">Nos ajude a calibrar seu plano</p>
                                </div>

                                <SliderField
                                    label="Peso"
                                    value={data.weight ?? 70}
                                    min={40}
                                    max={200}
                                    unit="kg"
                                    onChange={(v) => updateData({ weight: v })}
                                />

                                <SliderField
                                    label="Altura"
                                    value={data.height ?? 170}
                                    min={140}
                                    max={220}
                                    unit="cm"
                                    onChange={(v) => updateData({ height: v })}
                                />

                                {bmi > 0 && (
                                    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                        <span className="text-text-muted text-sm">IMC</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-text-main font-bold">{bmi.toFixed(1)}</span>
                                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${bmiInfo.color}20`, color: bmiInfo.color }}>
                                                {bmiInfo.label}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <PrimaryButton onClick={goNext} label="Continuar" />
                            </div>
                        )}

                        {/* ===== ACTIVITY ===== */}
                        {step === 'activity' && (
                            <div className="flex flex-col gap-4 max-w-md w-full mx-auto">
                                <div>
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Nível de Atividade</h2>
                                    <p className="text-text-muted text-sm">Qual é a sua rotina atual?</p>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {ACTIVITY_LEVELS.map((a) => {
                                        const selected = data.activity_level === a.value;
                                        return (
                                            <button
                                                key={a.value}
                                                onClick={() => updateData({ activity_level: a.value })}
                                                className="flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all"
                                                style={{
                                                    backgroundColor: selected ? 'var(--primary-15)' : 'var(--bg-card)',
                                                    border: `1px solid ${selected ? 'var(--primary)' : 'var(--border-main)'}`,
                                                }}
                                            >
                                                <span className="text-2xl">{a.emoji}</span>
                                                <div className="flex-1">
                                                    <p className="text-text-main font-medium text-sm">{a.label}</p>
                                                    <p className="text-text-muted text-xs mt-0.5">{a.desc}</p>
                                                </div>
                                                {selected && <Check size={18} className="text-primary" />}
                                            </button>
                                        );
                                    })}
                                </div>
                                <PrimaryButton onClick={goNext} label="Continuar" />
                            </div>
                        )}

                        {/* ===== GOAL ===== */}
                        {step === 'goal' && (
                            <div className="flex flex-col gap-4 max-w-md w-full mx-auto">
                                <div>
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Seu Objetivo</h2>
                                    <p className="text-text-muted text-sm">O que você quer alcançar?</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {GOALS.map((g) => {
                                        const selected = data.goal === g.value;
                                        return (
                                            <button
                                                key={g.value}
                                                onClick={() => updateData({ goal: g.value })}
                                                className="flex flex-col items-center gap-2 py-5 px-3 rounded-xl transition-all"
                                                style={{
                                                    backgroundColor: selected ? 'var(--primary-15)' : 'var(--bg-card)',
                                                    border: `1px solid ${selected ? 'var(--primary)' : 'var(--border-main)'}`,
                                                }}
                                            >
                                                <span className="text-3xl">{g.emoji}</span>
                                                <p className="text-text-main font-semibold text-sm text-center">{g.label}</p>
                                                <p className="text-text-muted text-xs text-center">{g.desc}</p>
                                                {selected && (
                                                    <div className="w-5 h-5 rounded-full flex items-center justify-center bg-primary">
                                                        <Check size={12} className="text-white" />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <PrimaryButton onClick={goNext} label="Continuar" />
                            </div>
                        )}

                        {/* ===== LOCATION ===== */}
                        {step === 'location' && (
                            <div className="flex flex-col gap-4 max-w-md w-full mx-auto">
                                <div>
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Local de Treino</h2>
                                    <p className="text-text-muted text-sm">Onde você vai treinar?</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {([
                                        { value: 'gym' as TrainingLocation, label: 'Academia', emoji: '🏋️', desc: 'Com equipamentos completos' },
                                        { value: 'home' as TrainingLocation, label: 'Em Casa', emoji: '🏠', desc: 'Sem equipamentos ou básico' },
                                    ]).map((loc) => {
                                        const selected = data.training_location === loc.value;
                                        return (
                                            <button
                                                key={loc.value}
                                                onClick={() => updateData({ training_location: loc.value })}
                                                className="flex flex-col items-center gap-3 py-8 rounded-2xl transition-all"
                                                style={{
                                                    backgroundColor: selected ? 'var(--primary-15)' : 'var(--bg-card)',
                                                    border: `2px solid ${selected ? 'var(--primary)' : 'var(--border-main)'}`,
                                                }}
                                            >
                                                <span className="text-5xl">{loc.emoji}</span>
                                                <p className="text-text-main font-bold">{loc.label}</p>
                                                <p className="text-text-muted text-xs text-center px-2">{loc.desc}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                                <PrimaryButton onClick={goNext} label="Continuar" />
                            </div>
                        )}

                        {/* ===== TIME ===== */}
                        {step === 'time' && (
                            <div className="flex flex-col gap-6 max-w-md w-full mx-auto">
                                <div>
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Tempo Disponível</h2>
                                    <p className="text-text-muted text-sm">Quanto tempo você tem por sessão?</p>
                                </div>

                                <div className="flex flex-col items-center gap-2 py-6">
                                    <span className="text-6xl font-extrabold text-text-main">{data.available_minutes ?? 45}</span>
                                    <span className="text-text-muted">minutos por dia</span>
                                </div>

                                <input
                                    type="range"
                                    min={20}
                                    max={120}
                                    step={5}
                                    value={data.available_minutes ?? 45}
                                    onChange={(e) => updateData({ available_minutes: parseInt(e.target.value) })}
                                    className="w-full accent-violet-600"
                                />
                                <div className="flex justify-between text-xs text-text-muted">
                                    <span>20 min</span>
                                    <span>120 min</span>
                                </div>

                                <div className="px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                                    <p className="text-purple-300">
                                        {(data.available_minutes ?? 45) <= 30
                                            ? '⚡ Treino rápido e intenso — ótimo para quem tem pouco tempo!'
                                            : (data.available_minutes ?? 45) <= 60
                                                ? '💪 Tempo ideal para um treino completo e eficiente.'
                                                : '🏆 Tempo excelente para treinos detalhados com volume extra.'}
                                    </p>
                                </div>

                                <PrimaryButton onClick={goNext} label="Continuar" />
                            </div>
                        )}

                        {/* ===== FOOD ===== */}
                        {step === 'food' && (
                            <div className="flex flex-col gap-6 max-w-md w-full mx-auto">
                                <div>
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Preferências Alimentares</h2>
                                    <p className="text-text-muted text-sm">Selecione o que você gosta e tem em casa</p>
                                </div>

                                <FoodSection
                                    title="Comidas favoritas"
                                    subtitle="O que você mais gosta de comer?"
                                    selected={(data.food_preferences as string[]) || []}
                                    onToggle={(item) => toggleFood('food_preferences', item)}
                                    customInput={foodInput}
                                    onCustomChange={setFoodInput}
                                    onCustomAdd={() => addCustomFood('food_preferences', foodInput, () => setFoodInput(''))}
                                />

                                <FoodSection
                                    title="Sempre tenho em casa"
                                    subtitle="O que você sempre tem disponível?"
                                    selected={(data.foods_at_home as string[]) || []}
                                    onToggle={(item) => toggleFood('foods_at_home', item)}
                                    customInput={homeInput}
                                    onCustomChange={setHomeInput}
                                    onCustomAdd={() => addCustomFood('foods_at_home', homeInput, () => setHomeInput(''))}
                                />

                                <PrimaryButton onClick={goNext} label="Continuar" />
                            </div>
                        )}

                        {/* ===== PHOTO ===== */}
                        {step === 'photo' && (
                            <div className="flex flex-col gap-6 max-w-md w-full mx-auto items-center">
                                <div className="text-center">
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Foto Corporal</h2>
                                    <p className="text-text-muted text-sm">Nossa IA analisará seu corpo para personalizar ainda mais o plano (opcional)</p>
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
                                    <div className="relative">
                                        <img src={photoPreview} alt="Preview" className="w-48 h-64 object-cover rounded-2xl" />
                                        <button
                                            onClick={() => { setPhotoPreview(null); updateData({ photo_file: undefined }); }}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs text-white"
                                            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => fileRef.current?.click()}
                                        className="flex flex-col items-center gap-3 w-48 h-64 rounded-2xl justify-center"
                                        style={{ backgroundColor: 'var(--bg-card)', border: '2px dashed var(--primary-40)' }}
                                    >
                                        <Camera size={36} className="text-primary" />
                                        <span className="text-sm text-text-muted">Tirar ou escolher foto</span>
                                    </motion.button>
                                )}

                                <div className="text-xs text-text-muted text-center max-w-xs px-4 py-3 rounded-xl bg-card border" style={{ borderColor: 'var(--border-main)' }}>
                                    Sua foto é processada de forma segura e nunca compartilhada.
                                </div>

                                <div className="flex flex-col gap-3 w-full">
                                    <PrimaryButton onClick={startGeneration} label={photoPreview ? 'Gerar Meu Plano!' : 'Gerar Plano com IA'} />
                                    <button
                                        onClick={startGeneration}
                                        className="flex items-center justify-center gap-2 py-3 text-text-muted text-sm hover:text-text-main transition-colors"
                                    >
                                        <SkipForward size={16} />
                                        Pular foto
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ===== GENERATING ===== */}
                        {step === 'generating' && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
                                <motion.div
                                    animate={{ y: [0, -10, 0] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    className="text-7xl"
                                >
                                    🤖
                                </motion.div>

                                <div>
                                    <h2 className="text-2xl font-bold text-text-main mb-2">Criando seu plano...</h2>
                                    <p className="text-text-muted text-sm">Nossa IA está trabalhando para você</p>
                                </div>

                                <div className="w-full max-w-xs">
                                    <motion.div
                                        className="h-2 rounded-full overflow-hidden bg-text-main/10"
                                    >
                                        <motion.div
                                            className="h-full rounded-full bg-primary"
                                            animate={{ width: `${[0, 25, 60, 80, 100][generatingPhase] || 0}%` }}
                                            transition={{ duration: 0.8 }}
                                        />
                                    </motion.div>
                                </div>

                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    {[
                                        'Analisando seu perfil...',
                                        'Criando seu treino personalizado...',
                                        'Montando sua dieta...',
                                        'Analisando foto corporal...',
                                        'Finalizando...',
                                    ].map((phase, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <div className="w-5 h-5 flex items-center justify-center">
                                                {generatingPhase > i ? (
                                                    <span className="text-emerald-500 text-sm">✓</span>
                                                ) : generatingPhase === i ? (
                                                    <Loader2 size={16} className="animate-spin text-primary" />
                                                ) : (
                                                    <div className="w-2 h-2 rounded-full bg-text-main/20" />
                                                )}
                                            </div>
                                            <span className={`text-sm ${generatingPhase >= i ? 'text-text-main' : 'text-text-muted/40'}`}>
                                                {phase}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ===== DONE ===== */}
                        {step === 'done' && generatedPlan && (
                            <div className="flex flex-col gap-6 max-w-md w-full mx-auto">
                                <div className="text-center">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 200 }}
                                        className="text-6xl mb-3"
                                    >
                                        🎉
                                    </motion.div>
                                    <h2 className="text-2xl font-bold text-text-main mb-1">Plano Pronto!</h2>
                                    <p className="text-text-muted text-sm">Seu plano personalizado foi criado com sucesso</p>
                                </div>

                                {/* Plan card */}
                                <div className="rounded-2xl p-5 flex flex-col gap-3 bg-card border" style={{ borderColor: 'var(--primary-20)' }}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="text-text-main font-bold">{generatedPlan.name}</h3>
                                            <p className="text-text-muted text-xs mt-0.5">{generatedPlan.estimated_weeks} semanas</p>
                                        </div>
                                        <span className="text-2xl">💪</span>
                                    </div>
                                    {generatedPlan.description && (
                                        <p className="text-text-muted text-sm">{generatedPlan.description}</p>
                                    )}

                                    {/* First day preview */}
                                    {generatedPlan.weeks?.[0]?.days?.[0]?.exercises?.length > 0 && (
                                        <div>
                                            <p className="text-text-muted text-xs mb-2">Primeiro treino:</p>
                                            <div className="flex flex-col gap-1">
                                                {generatedPlan.weeks[0].days[0].exercises.slice(0, 3).map((ex: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-sm">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                        <span className="text-text-main/80">{ex.name}</span>
                                                        <span className="text-text-muted text-xs">{ex.sets}x{ex.reps}</span>
                                                    </div>
                                                ))}
                                                {generatedPlan.weeks[0].days[0].exercises.length > 3 && (
                                                    <span className="text-text-muted text-xs">+{generatedPlan.weeks[0].days[0].exercises.length - 3} exercícios</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Calorie goal */}
                                {calorieGoal > 0 && (
                                    <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-card border" style={{ borderColor: 'var(--proteina-20)' }}>
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">🥗</span>
                                            <div>
                                                <p className="text-text-main font-semibold">Meta Calórica</p>
                                                <p className="text-text-muted text-xs">Diária personalizada</p>
                                            </div>
                                        </div>
                                        <span className="text-2xl font-extrabold text-proteina">{calorieGoal}</span>
                                    </div>
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => onComplete(data as OnboardingData, generatedPlan, generatedDiet)}
                                    className="w-full py-4 rounded-2xl font-bold text-white text-lg"
                                    style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                                >
                                    Começar Jornada! 🚀
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
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.97 }}
            onClick={onClick}
            disabled={disabled}
            className="w-full py-4 rounded-2xl font-bold text-white text-base mt-2 bg-primary"
            style={{
                opacity: disabled ? 0.4 : 1,
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
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <label className="text-text-main text-sm font-medium">{label}</label>
                <div className="flex items-center gap-1">
                    <input
                        type="number"
                        min={min}
                        max={max}
                        value={value}
                        onChange={(e) => onChange(parseInt(e.target.value))}
                        className="w-16 text-center px-2 py-1 rounded-lg text-text-main text-sm font-bold outline-none bg-card border"
                        style={{ borderColor: 'var(--primary-30)' }}
                    />
                    <span className="text-text-muted text-sm">{unit}</span>
                </div>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-text-muted">
                <span>{min}{unit}</span>
                <span>{max}{unit}</span>
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
        <div className="flex flex-col gap-3">
            <div>
                <h3 className="text-text-main font-semibold text-sm">{title}</h3>
                <p className="text-text-muted text-xs">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                {FOOD_OPTIONS.map((food) => {
                    const sel = selected.includes(food);
                    return (
                        <button
                            key={food}
                            onClick={() => onToggle(food)}
                            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                            style={{
                                backgroundColor: sel ? 'var(--primary-20)' : 'var(--text-main-5)',
                                border: `1px solid ${sel ? 'var(--primary)' : 'var(--text-main-10)'}`,
                                color: sel ? 'var(--primary)' : 'var(--text-muted)',
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
                        className="px-3 py-1.5 rounded-full text-xs font-medium"
                        style={{
                            backgroundColor: 'var(--primary-20)',
                            border: '1px solid var(--primary)',
                            color: 'var(--primary)',
                        }}
                    >
                        {food} ✕
                    </button>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Adicionar outro alimento..."
                    value={customInput}
                    onChange={(e) => onCustomChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCustomAdd(); } }}
                    className="flex-1 px-3 py-2 rounded-lg text-text-main text-sm outline-none bg-card border"
                    style={{ borderColor: 'var(--border-main)' }}
                />
                <button
                    onClick={onCustomAdd}
                    className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-primary/30 border border-primary/40"
                >
                    +
                </button>
            </div>
        </div>
    );
}
