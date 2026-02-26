import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalYYYYMMDD } from '../lib/dateUtils';
import Mascot from './Mascot';
import { aiService } from '../services/aiService';
import type { Profile, Message } from '../types';

interface NutritionData {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    calGoal: number;
    protGoal: number;
    carbGoal: number;
    fatGoal: number;
}

interface NutritionAlert {
    type: 'cal_over' | 'cal_near' | 'prot_low' | 'water' | 'dinner' | 'goal_hit';
    message: string;
    autoPrompt: string;
}

interface Props {
    profile: Profile;
    nutritionData?: NutritionData | null;
}

const MAX_MESSAGES = 50;

function buildContext(
    profile: Profile,
    sessions: any[],
    meals: any[],
    nutrition: any[],
    gamification: any
): string {
    const goalLabels: Record<string, string> = {
        lose_weight: 'Perda de Peso',
        gain_muscle: 'Hipertrofia',
        maintain: 'Manutenção',
        gain_weight: 'Ganho de Peso',
    };

    const sessionLines = sessions.slice(0, 10).map((s: any) =>
        `- ${s.session_date}: ${s.exercises_completed?.length || 0} exercícios, ${s.duration_minutes} min, ${s.points_earned} pts`
    ).join('\n');

    const nutritionLines = nutrition.slice(0, 10).map((n: any) =>
        `- ${n.date}: ${n.total_calories} kcal (meta: ${n.goal_calories})`
    ).join('\n');

    const recentMeals = meals.slice(0, 5).map((m: any) =>
        `- ${m.description} (${m.calories} kcal, ${m.meal_date})`
    ).join('\n');

    return `
USUÁRIO: ${profile.name}
Objetivo: ${goalLabels[profile.goal] || profile.goal}
Peso atual: ${profile.weight}kg | Altura: ${profile.height}cm
Meta calórica: ${profile.daily_calorie_goal} kcal/dia

GAMIFICAÇÃO:
- Pontos totais: ${gamification?.points || 0}
- Nível: ${gamification?.level || 1}
- Sequência atual: ${gamification?.streak_days || 0} dias
- Total de treinos: ${gamification?.total_workouts || 0}
- Refeições registradas: ${gamification?.total_meals_logged || 0}

TREINOS RECENTES (últimos 15 dias):
${sessionLines || 'Nenhum treino registrado'}

NUTRIÇÃO RECENTE (últimos 15 dias):
${nutritionLines || 'Nenhum dado de nutrição'}

REFEIÇÕES RECENTES:
${recentMeals || 'Nenhuma refeição registrada'}
`.trim();
}

function computeAlert(data: NutritionData, profile: Profile): NutritionAlert | null {
    const calPct = data.calories / data.calGoal;
    const protPct = data.protein / data.protGoal;
    const calRemaining = Math.max(0, data.calGoal - data.calories);
    const calExcess = Math.max(0, data.calories - data.calGoal);

    if (protPct >= 1.0 && calPct < 1.0) {
        return {
            type: 'goal_hit',
            message: `👑 Meta de proteína batida e calorias sob controle! Você está no caminho certo para grandes ganhos!`,
            autoPrompt: `Bati minha meta de proteínas hoje sem estourar as calorias. Como posso manter esse equilíbrio durante a semana inteira? O que sugere para o jantar?`,
        };
    }

    if (calPct >= 0.95 && calPct <= 1.05 && protPct >= 0.9) {
        return {
            type: 'goal_hit',
            message: `🎯 No ponto! Você atingiu suas metas com precisão cirúrgica hoje. O Pers está impressionado!`,
            autoPrompt: `Consegui atingir exatamente minhas metas hoje. Me dê parabéns e me diga por que isso é tão importante para o meu objetivo de ${profile.goal}.`,
        };
    }

    if (calPct >= 1.0) {
        return {
            type: 'cal_over',
            message: `Você passou da meta calórica em ${calExcess} kcal! 🛑 Momento de foco: prefira alimentos leves pelo resto do dia.`,
            autoPrompt: `Passei ${calExcess} kcal da minha meta hoje (${data.calories}/${data.calGoal} kcal). O que posso fazer para minimizar o impacto sem passar fome?`,
        };
    }

    if (calPct >= 0.8 && protPct < 0.5) {
        return {
            type: 'prot_low',
            message: `Meta calórica quase batida, mas sua proteína está baixa (${Math.round(protPct * 100)}%). 🍖 Foque em carnes magras ou ovos agora.`,
            autoPrompt: `Estou perto do meu limite calórico, mas quase não comi proteína hoje (${data.protein}g/${data.protGoal}g). Me sugira lanches práticos com alta densidade de proteína mas poucas calorias.`,
        };
    }

    if (calPct > 0.5 && protPct < 0.3) {
        return {
            type: 'prot_low',
            message: `Hora de focar na proteína! Você já consumiu metade das calorias mas apenas ${Math.round(protPct * 100)}% da proteína diária.`,
            autoPrompt: `Como aumentar minha ingestão de proteína sem ganhar gordura?`,
        };
    }

    if (calPct >= 0.8) {
        return {
            type: 'cal_near',
            message: `Você já consumiu ${Math.round(calPct * 100)}% da sua meta calórica hoje! 🔥 Faltam apenas ${calRemaining} kcal. Quer saber o que ainda pode comer?`,
            autoPrompt: `Já consumi ${Math.round(calPct * 100)}% da meta calórica (faltam ${calRemaining} kcal, ${data.protein}g de proteína consumidos de ${data.protGoal}g). Quais opções leves e nutritivas posso comer no restante do dia?`,
        };
    }

    if (calPct >= 0.65 && protPct < 0.4) {
        return {
            type: 'prot_low',
            message: `Proteína ainda baixa! Apenas ${data.protein}g de ${data.protGoal}g consumidos hoje. 💪 Ainda tem espaço nas calorias — quer uma sugestão?`,
            autoPrompt: `Consumi apenas ${data.protein}g de proteína (meta: ${data.protGoal}g) with ${data.calories} kcal hoje. Me sugira refeições ou lanches ricos em proteína para o restante do dia.`,
        };
    }

    // General proactive tips based on time, hydration and calories remaining
    const todayStr = getLocalYYYYMMDD();
    const waterStr = localStorage.getItem(`water_${profile.id}_${todayStr}`);
    const waterCups = waterStr ? parseInt(waterStr) : 0;
    const goalCups = Math.ceil((profile.weight * 35) / 250);
    const hour = new Date().getHours();

    if (waterCups < goalCups / 2 && hour > 14) {
        return {
            type: 'water',
            message: "Alerta de Hidratação 💧: Você bebeu pouca água para essa hora do dia! Que tal levantar e pegar um copo agora?",
            autoPrompt: "Beber mais água me ajuda nos treinos? Como criar o hábito?",
        };
    }

    if (hour >= 18 && calRemaining > 200 && calRemaining < 600) {
        return {
            type: 'dinner',
            message: `Boa noite! Faltam ${calRemaining} kcal. 🍲 Sugestão: um grelhado leve com vegetais para bater a meta sem pesar no estômago!`,
            autoPrompt: `Faltam ${calRemaining} kcal para a minha meta de hoje e já é noite. Me sugira preparos de jantar que sejam leves e ricos em nutrientes!`,
        };
    }

    if (hour < 20 && calRemaining <= 50 && data.calories > 0) {
        return {
            type: 'goal_hit',
            message: "Você já atingiu a meta do dia! 🛑 Se a fome bater à noite, vá de chá, gelatina zero ou água com limão.",
            autoPrompt: "Já atingi minha meta de calorias hoje mas estou com um pouco de vontade de comer algo. O que posso consumir com 0 calorias que engane o estômago?",
        };
    }

    return null;
}

export default function AIAssistant({ profile, nutritionData }: Props) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [nutritionAlert, setNutritionAlert] = useState<NutritionAlert | null>(null);
    const [alertDismissed, setAlertDismissed] = useState(false);

    const [loadingMessage, setLoadingMessage] = useState('Pers está pensando...');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let interval: any;
        if (loading) {
            setLoadingMessage('Pers está pensando...');
            const LOADING_MESSAGES = [
                "Consultando os deuses da hipertrofia...",
                "Analisando seu potencial anabólico...",
                "Calculando se isso brota músculo ou barriga...",
                "Pers está de olho na sua meta...",
                "Quase lá! Só mais um segundo...",
                "Verificando se seus macros estão em dia...",
                "Processando dados nutricionais incríveis...",
                "Escaneando bíceps virtuais para melhor resposta..."
            ];
            interval = setInterval(() => {
                setLoadingMessage(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [loading]);
    const inputRef = useRef<HTMLInputElement>(null);
    const contextRef = useRef<string>('');
    const prevNutritionRef = useRef<(NutritionData & { lastMessage?: string }) | null>(null);
    const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Proactive nutrition alert
    useEffect(() => {
        if (!nutritionData) return;

        const alert = computeAlert(nutritionData, profile);
        if (alert) {
            const todayStr = getLocalYYYYMMDD();
            const alertKey = `ai_alert_${profile.id}_${alert.type}_${todayStr}`;

            // Check if this type of alert was already shown today
            const alreadyShown = localStorage.getItem(alertKey);

            if (!alreadyShown && alert.message !== prevNutritionRef.current?.lastMessage) {
                prevNutritionRef.current = { ...nutritionData, lastMessage: alert.message };
                setNutritionAlert(alert);
                setAlertDismissed(false);

                // Mark as shown for today
                localStorage.setItem(alertKey, 'true');

                // Auto-dismiss after 12s
                if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
                alertTimerRef.current = setTimeout(() => setAlertDismissed(true), 12000);
            }
        }
    }, [nutritionData, profile]);

    // Cleanup timer on unmount
    useEffect(() => () => {
        if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    }, []);

    async function initialize(): Promise<string> {
        if (initialized) return contextRef.current;
        setInitialized(true);

        const [sessionsRes, mealsRes, nutritionRes, gamRes] = await Promise.all([
            supabase.from('workout_sessions')
                .select('*')
                .eq('user_id', profile.id)
                .gte('session_date', getLocalYYYYMMDD(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)))
                .order('session_date', { ascending: false }),
            supabase.from('meals')
                .select('*')
                .eq('user_id', profile.id)
                .gte('meal_date', getLocalYYYYMMDD(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)))
                .order('logged_at', { ascending: false }),
            supabase.from('daily_nutrition')
                .select('*')
                .eq('user_id', profile.id)
                .gte('date', getLocalYYYYMMDD(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)))
                .order('date', { ascending: false }),
            supabase.from('gamification').select('*').eq('user_id', profile.id).single(),
        ]);

        const ctx = buildContext(
            profile,
            sessionsRes.data || [],
            mealsRes.data || [],
            nutritionRes.data || [],
            gamRes.data
        );
        contextRef.current = ctx;

        const prevRes = await supabase
            .from('ai_conversations')
            .select('*')
            .eq('user_id', profile.id)
            .order('created_at', { ascending: true })
            .limit(MAX_MESSAGES);

        if (prevRes.data && prevRes.data.length > 0) {
            setMessages(prevRes.data as Message[]);
        } else {
            const welcome: Message = {
                id: 'welcome',
                role: 'assistant',
                content: `Olá, ${profile.name.split(' ')[0]}! Sou o Pers, seu personal trainer virtual. 💪\n\nEstou aqui para te ajudar com dúvidas sobre treino, nutrição, motivação ou qualquer coisa relacionada à sua jornada fitness. Como posso te ajudar hoje?`,
                created_at: new Date().toISOString(),
            };
            setMessages([welcome]);
        }

        return ctx;
    }

    async function doSend(text: string, ctx?: string) {
        const context = ctx ?? contextRef.current;
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev.slice(-MAX_MESSAGES + 1), userMsg]);
        setLoading(true);

        await supabase.from('ai_conversations').insert({
            user_id: profile.id,
            role: 'user',
            content: text,
        });

        try {
            const response = await aiService.getAssistantResponse(text, context);
            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response,
                created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev.slice(-MAX_MESSAGES + 1), assistantMsg]);
            await supabase.from('ai_conversations').insert({
                user_id: profile.id,
                role: 'assistant',
                content: response,
            });
        } catch (e: any) {
            const isQuota = e.message === 'QUOTA_EXCEEDED';
            const errorMsg = isQuota
                ? 'Puxa, atingi meu limite de mensagens gratuitas por agora. 😅 Tente novamente em alguns minutos ou mais tarde!'
                : 'Desculpe, tive um problema ao processar sua mensagem. Tente novamente em instantes.';

            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: errorMsg,
                created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } finally {
            setLoading(false);
        }
    }

    async function sendMessage() {
        const text = input.trim();
        if (!text || loading) return;
        setInput('');
        await doSend(text);
    }

    async function handleClearConversation() {
        if (!confirm('Tem certeza que deseja apagar todo o histórico de conversas com o Pers?')) return;
        await supabase.from('ai_conversations').delete().eq('user_id', profile.id);
        const welcome: Message = {
            id: 'welcome-new',
            role: 'assistant',
            content: `Conversa reiniciada! Olá, ${profile.name.split(' ')[0]}! 💪 Como posso te ajudar?`,
            created_at: new Date().toISOString(),
        };
        setMessages([welcome]);
        setInitialized(false);
        contextRef.current = '';
    }

    async function handleOpen() {
        setOpen(true);
        await initialize();
        setTimeout(() => inputRef.current?.focus(), 300);
    }

    async function handleOpenWithAutoMessage(autoPrompt: string) {
        setAlertDismissed(true);
        setOpen(true);
        const ctx = await initialize();
        setTimeout(() => doSend(autoPrompt, ctx), 400);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    const visibleMessages = messages.slice(-MAX_MESSAGES);
    const showBubble = nutritionAlert && !alertDismissed && !open;

    return (
        <>
            {/* Proactive nutrition alert bubble */}
            <AnimatePresence>
                {showBubble && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.85, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: 8 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="fixed bottom-36 right-4 z-40 w-64"
                    >
                        <div
                            className="relative rounded-2xl p-4 flex flex-col gap-3 shadow-2xl"
                            style={{
                                backgroundColor: 'var(--bg-card)',
                                border: '1px solid var(--border-main)',
                            }}
                        >
                            {/* Mascot Bust */}
                            <div className="absolute -top-10 -left-6 w-16 h-16 drop-shadow-lg pointer-events-none">
                                <Mascot size={70} bust={true} pose="happy" />
                            </div>

                            {/* Dismiss */}
                            <button
                                onClick={() => setAlertDismissed(true)}
                                className="absolute top-2.5 right-2.5 text-text-muted hover:text-text-main transition-colors z-10"
                            >
                                <X size={13} />
                            </button>

                            {/* Header */}
                            <div className="flex items-center gap-2 pr-4 ml-6">
                                <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>Dica do Pers</span>
                            </div>

                            {/* Message */}
                            <p className="text-text-main text-xs leading-relaxed">{nutritionAlert.message}</p>

                            {/* CTA */}
                            <button
                                onClick={() => handleOpenWithAutoMessage(nutritionAlert.autoPrompt)}
                                className="w-full py-2 rounded-xl text-xs font-semibold text-white"
                                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}
                            >
                                Ver sugestão 💬
                            </button>

                            {/* Arrow pointing to Pers button */}
                            <div
                                className="absolute -bottom-2 right-7 w-4 h-4 rotate-45"
                                style={{
                                    backgroundColor: 'var(--bg-card)',
                                    borderRight: '1px solid var(--border-main)',
                                    borderBottom: '1px solid var(--border-main)',
                                }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating button */}
            <AnimatePresence>
                {!open && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.1 }}
                        onClick={handleOpen}
                        className="fixed bottom-20 right-4 z-40 w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2 border-primary/40 shadow-xl bg-bg-card cursor-pointer"
                        style={{ backgroundColor: 'var(--bg-card)' }}
                    >
                        <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-full">
                            <Mascot
                                size={90}
                                bust={true}
                                pose={loading ? 'thinking' : showBubble ? 'happy' : 'neutral'}
                            />
                        </div>
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                        className="fixed bottom-0 left-0 right-0 z-[60] flex flex-col rounded-t-3xl border-t shadow-2xl"
                        style={{
                            backgroundColor: 'var(--bg-main)',
                            borderColor: 'var(--border-main)',
                            maxHeight: '70vh',
                        }}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between px-5 py-4 rounded-t-3xl flex-shrink-0 border-b"
                            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border border-primary/20 bg-bg-main"
                                >
                                    <Mascot size={55} bust={true} pose="neutral" />
                                </div>
                                <div>
                                    <p className="text-text-main font-bold text-sm">Pers</p>
                                    <p className="text-text-muted text-xs">Personal Trainer IA</p>
                                </div>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }} />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleClearConversation}
                                    title="Limpar conversa"
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-red-400 transition-colors"
                                    style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.08)' }}
                                >
                                    <Trash2 size={14} />
                                </button>
                                <button
                                    onClick={() => setOpen(false)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-main transition-colors"
                                    style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.08)' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
                            {visibleMessages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div
                                            className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden border border-primary/20 bg-bg-main flex-shrink-0 mr-2 mt-0.5"
                                        >
                                            <Mascot size={40} bust={true} pose="neutral" />
                                        </div>
                                    )}
                                    <div
                                        className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                                        style={{
                                            backgroundColor: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-card)',
                                            color: msg.role === 'user' ? '#fff' : 'var(--text-main)',
                                            borderRadius: msg.role === 'user'
                                                ? '18px 18px 4px 18px'
                                                : '18px 18px 18px 4px',
                                            border: msg.role === 'assistant'
                                                ? '1px solid var(--border-main)'
                                                : 'none',
                                        }}
                                    >
                                        {msg.content}
                                    </div>
                                </motion.div>
                            ))}

                            {loading && (
                                <div className="flex justify-start">
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden border border-primary/20 bg-bg-main flex-shrink-0 mr-2"
                                    >
                                        <Mascot size={40} bust={true} pose="thinking" />
                                    </div>
                                    <div
                                        className="px-4 py-3 rounded-2xl flex items-center gap-2 border"
                                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)', borderRadius: '18px 18px 18px 4px' }}
                                    >
                                        <Loader2 size={14} className="animate-spin text-primary" />
                                        <span className="text-text-muted text-xs font-medium italic">{loadingMessage}</span>
                                    </div>
                                </div>
                            )}

                            {messages.length <= 1 && !loading && (
                                <div className="flex flex-wrap gap-2 py-2 mb-2">
                                    {[
                                        "Avaliar meu desempenho",
                                        "Sugestão de almoço proteico",
                                        "Dicas para emagrecer",
                                        "Falar sobre meus macros"
                                    ].map(text => (
                                        <button
                                            key={text}
                                            onClick={() => doSend(text)}
                                            className="px-3 py-1.5 rounded-full border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                                            style={{ backgroundColor: 'rgba(var(--primary-rgb), 0.05)' }}
                                        >
                                            {text}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div
                            className="flex items-center gap-3 px-4 pt-3 pb-24 sm:pb-3 flex-shrink-0 border-t"
                            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                        >
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Pergunte ao Pers..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                                className="flex-1 px-4 py-3 rounded-xl text-text-main text-sm outline-none border"
                                style={{
                                    backgroundColor: 'rgba(var(--text-main-rgb), 0.05)',
                                    borderColor: 'var(--border-main)',
                                }}
                            />
                            <motion.button
                                whileHover={{ scale: input.trim() ? 1.08 : 1 }}
                                whileTap={{ scale: input.trim() ? 0.92 : 1 }}
                                onClick={sendMessage}
                                disabled={!input.trim() || loading}
                                className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0"
                                style={{
                                    background: input.trim() ? 'linear-gradient(135deg, var(--primary), var(--primary-hover))' : 'rgba(var(--primary-rgb), 0.2)',
                                    cursor: input.trim() ? 'pointer' : 'not-allowed',
                                }}
                            >
                                <Send size={16} className="text-white" />
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
