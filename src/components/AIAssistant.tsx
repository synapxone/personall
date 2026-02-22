import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { geminiService } from '../services/geminiService';
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

function computeAlert(data: NutritionData): NutritionAlert | null {
    const calPct = data.calories / data.calGoal;
    const protPct = data.protein / data.protGoal;
    const calRemaining = Math.max(0, data.calGoal - data.calories);
    const calExcess = Math.max(0, data.calories - data.calGoal);

    if (calPct >= 1.0) {
        return {
            message: `Você passou da meta calórica em ${calExcess} kcal hoje! 🛑 Evite refeições pesadas no restante do dia.`,
            autoPrompt: `Passei ${calExcess} kcal da minha meta hoje (${data.calories}/${data.calGoal} kcal). O que posso fazer para minimizar o impacto? O que é seguro comer no restante do dia?`,
        };
    }

    if (calPct >= 0.8 && protPct < 0.5) {
        return {
            message: `Quase na meta calórica (${Math.round(calPct * 100)}%)! Mas só ${data.protein}g de ${data.protGoal}g de proteína. 💪 Quer uma sugestão proteica que caiba nos ${calRemaining} kcal restantes?`,
            autoPrompt: `Estou com ${data.calories} kcal de ${data.calGoal} (faltam ${calRemaining} kcal) mas só ${data.protein}g de ${data.protGoal}g de proteína. Me sugira uma refeição rica em proteína que caiba no déficit calórico restante.`,
        };
    }

    if (calPct >= 0.8) {
        return {
            message: `Você já consumiu ${Math.round(calPct * 100)}% da sua meta calórica hoje! 🔥 Faltam apenas ${calRemaining} kcal. Quer saber o que ainda pode comer?`,
            autoPrompt: `Já consumi ${Math.round(calPct * 100)}% da meta calórica (faltam ${calRemaining} kcal, ${data.protein}g de proteína consumidos de ${data.protGoal}g). Quais opções leves e nutritivas posso comer no restante do dia?`,
        };
    }

    if (calPct >= 0.65 && protPct < 0.4) {
        return {
            message: `Proteína ainda baixa! Apenas ${data.protein}g de ${data.protGoal}g consumidos hoje. 💪 Ainda tem espaço nas calorias — quer uma sugestão?`,
            autoPrompt: `Consumi apenas ${data.protein}g de proteína (meta: ${data.protGoal}g) com ${data.calories} kcal hoje. Me sugira refeições ou lanches ricos em proteína para o restante do dia.`,
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

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const contextRef = useRef<string>('');
    const prevNutritionRef = useRef<NutritionData | null>(null);
    const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Proactive nutrition alert
    useEffect(() => {
        if (!nutritionData) return;

        const prev = prevNutritionRef.current;
        prevNutritionRef.current = nutritionData;

        // Only trigger when calories increase (new meal added), never on initial load
        if (!prev || nutritionData.calories <= prev.calories) return;

        const alert = computeAlert(nutritionData);
        if (alert) {
            setNutritionAlert(alert);
            setAlertDismissed(false);

            // Auto-dismiss after 12s
            if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
            alertTimerRef.current = setTimeout(() => setAlertDismissed(true), 12000);
        }
    }, [nutritionData]);

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
                .gte('session_date', new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                .order('session_date', { ascending: false }),
            supabase.from('meals')
                .select('*')
                .eq('user_id', profile.id)
                .gte('meal_date', new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                .order('logged_at', { ascending: false }),
            supabase.from('daily_nutrition')
                .select('*')
                .eq('user_id', profile.id)
                .gte('date', new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
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
            const response = await geminiService.getAssistantResponse(text, context);
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
        } catch {
            setMessages((prev) => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Desculpe, tive um problema ao processar sua mensagem. Tente novamente em instantes.',
                created_at: new Date().toISOString(),
            }]);
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
                            className="relative rounded-2xl p-4 flex flex-col gap-3"
                            style={{
                                backgroundColor: '#1A1A2E',
                                border: '1px solid rgba(124,58,237,0.45)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
                            }}
                        >
                            {/* Dismiss */}
                            <button
                                onClick={() => setAlertDismissed(true)}
                                className="absolute top-2.5 right-2.5 text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={13} />
                            </button>

                            {/* Header */}
                            <div className="flex items-center gap-2 pr-4">
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                                    style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                                >
                                    💪
                                </div>
                                <span className="text-xs font-bold" style={{ color: '#a78bfa' }}>Pers</span>
                            </div>

                            {/* Message */}
                            <p className="text-gray-200 text-xs leading-relaxed">{nutritionAlert.message}</p>

                            {/* CTA */}
                            <button
                                onClick={() => handleOpenWithAutoMessage(nutritionAlert.autoPrompt)}
                                className="w-full py-2 rounded-xl text-xs font-semibold text-white"
                                style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                            >
                                Ver sugestão 💬
                            </button>

                            {/* Arrow pointing to Pers button */}
                            <div
                                className="absolute -bottom-2 right-7 w-4 h-4 rotate-45"
                                style={{
                                    backgroundColor: '#1A1A2E',
                                    borderRight: '1px solid rgba(124,58,237,0.45)',
                                    borderBottom: '1px solid rgba(124,58,237,0.45)',
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
                        whileTap={{ scale: 0.9 }}
                        onClick={handleOpen}
                        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-lg text-2xl"
                        style={{
                            background: 'linear-gradient(135deg, #7C3AED, #6d28d9)',
                            boxShadow: showBubble
                                ? '0 4px 20px rgba(124,58,237,0.6), 0 0 0 3px rgba(124,58,237,0.3)'
                                : '0 4px 20px rgba(124,58,237,0.4)',
                        }}
                    >
                        💪
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
                        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-3xl"
                        style={{
                            backgroundColor: '#0F0F1A',
                            border: '1px solid rgba(124,58,237,0.25)',
                            maxHeight: '70vh',
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between px-5 py-4 rounded-t-3xl flex-shrink-0"
                            style={{ backgroundColor: '#1A1A2E', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                                    style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                                >
                                    💪
                                </div>
                                <div>
                                    <p className="text-white font-bold text-sm">Pers</p>
                                    <p className="text-gray-400 text-xs">Personal Trainer IA</p>
                                </div>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }} />
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white"
                                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                            >
                                <X size={16} />
                            </button>
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
                                            className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mr-2 mt-0.5"
                                            style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                                        >
                                            💪
                                        </div>
                                    )}
                                    <div
                                        className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                                        style={{
                                            backgroundColor: msg.role === 'user' ? '#7C3AED' : '#1A1A2E',
                                            color: '#fff',
                                            borderRadius: msg.role === 'user'
                                                ? '18px 18px 4px 18px'
                                                : '18px 18px 18px 4px',
                                            border: msg.role === 'assistant'
                                                ? '1px solid rgba(255,255,255,0.07)'
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
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mr-2"
                                        style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                                    >
                                        💪
                                    </div>
                                    <div
                                        className="px-4 py-3 rounded-2xl flex items-center gap-2"
                                        style={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '18px 18px 18px 4px' }}
                                    >
                                        <Loader2 size={14} className="animate-spin" style={{ color: '#7C3AED' }} />
                                        <span className="text-gray-400 text-sm">Pers está pensando...</span>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div
                            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.07)', backgroundColor: '#1A1A2E' }}
                        >
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Pergunte ao Pers..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                                className="flex-1 px-4 py-3 rounded-xl text-white text-sm outline-none"
                                style={{
                                    backgroundColor: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                }}
                            />
                            <motion.button
                                whileHover={{ scale: input.trim() ? 1.08 : 1 }}
                                whileTap={{ scale: input.trim() ? 0.92 : 1 }}
                                onClick={sendMessage}
                                disabled={!input.trim() || loading}
                                className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0"
                                style={{
                                    background: input.trim() ? 'linear-gradient(135deg, #7C3AED, #6d28d9)' : 'rgba(124,58,237,0.2)',
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
