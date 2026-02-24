import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Mail, Lock, Eye, EyeOff, Dumbbell, Apple, Trophy, Bot, ArrowRight, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
    onAuthSuccess: () => void;
}

const features = [
    {
        icon: <Dumbbell size={28} />,
        title: 'Treinos Personalizados',
        desc: 'Planos de treino gerados por IA adaptados ao seu objetivo, local e tempo disponível.',
        color: '#7C3AED',
    },
    {
        icon: <Apple size={28} />,
        title: 'Dieta Inteligente',
        desc: 'Plano alimentar personalizado com análise de fotos e registro fácil de refeições.',
        color: '#10B981',
    },
    {
        icon: <Trophy size={28} />,
        title: 'Gamificação',
        desc: 'Ganhe pontos, suba de nível e resgate recompensas reais por cada treino concluído.',
        color: '#F59E0B',
    },
    {
        icon: <Bot size={28} />,
        title: 'Assistente IA',
        desc: 'Converse com o Pers, seu personal trainer virtual disponível 24 horas por dia.',
        color: '#7C3AED',
    },
];

export default function LandingPage({ onAuthSuccess }: Props) {
    const [showAuth, setShowAuth] = useState(false);
    const [isLogin, setIsLogin] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleAuth(e: React.FormEvent) {
        e.preventDefault();
        if (!email || !password) {
            toast.error('Preencha e-mail e senha.');
            return;
        }
        if (password.length < 6) {
            toast.error('A senha deve ter no mínimo 6 caracteres.');
            return;
        }
        setLoading(true);
        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                toast.success('Bem-vindo de volta!');
                onAuthSuccess();
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                toast.success('Conta criada! Verifique seu e-mail se necessário.');
                onAuthSuccess();
            }
        } catch (err: any) {
            const msg = err?.message || 'Erro ao autenticar.';
            if (msg.includes('Invalid login credentials')) {
                toast.error('E-mail ou senha incorretos.');
            } else if (msg.includes('User already registered')) {
                toast.error('Este e-mail já está cadastrado. Faça login.');
                setIsLogin(true);
            } else if (msg.includes('Email not confirmed')) {
                toast.error('Confirme seu e-mail antes de entrar.');
            } else {
                toast.error(msg);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex flex-col bg-bg-main">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2">
                    <span className="font-['Quicksand'] font-bold text-2xl lowercase text-text-main">niume</span>
                </div>
                <button
                    onClick={() => { setIsLogin(true); setShowAuth(true); }}
                    className="text-sm font-medium px-4 py-2 rounded-lg border border-primary/40 text-primary transition-colors hover:bg-primary/10"
                >
                    Entrar
                </button>
            </header>

            {/* Hero */}
            <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 relative overflow-hidden">
                {/* Branding Hero */}
                <motion.div
                    className="mb-6 select-none"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <span className="font-['Quicksand'] font-bold text-7xl lowercase text-text-main tracking-tight">niume</span>
                </motion.div>

                {/* Removed Mascot decoration */}

                <motion.h1
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-4xl sm:text-5xl font-extrabold mb-4 leading-tight"
                >
                    <span style={{
                        background: 'linear-gradient(135deg, #52B788, #2D6A4F, #10B981)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}>
                        Seu Personal Trainer com IA
                    </span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="text-text-muted text-lg max-w-md mb-8"
                >
                    Treinos e dietas 100% personalizados por inteligência artificial. Evolua com gamificação e acompanhe cada resultado.
                </motion.p>

                <motion.button
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setIsLogin(false); setShowAuth(true); }}
                    className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-white text-lg shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #6d28d9)' }}
                >
                    Começar Grátis
                    <ArrowRight size={20} />
                </motion.button>

                <p className="text-gray-600 text-xs mt-4">Sem cartão de crédito. 100% gratuito para começar.</p>
            </section>

            {/* Features */}
            <section className="px-4 pb-16 max-w-2xl mx-auto w-full">
                <h2 className="text-center text-text-main font-bold text-xl mb-6">Tudo que você precisa</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {features.map((f, i) => (
                        <motion.div
                            key={f.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 * i + 0.3 }}
                            className="rounded-2xl p-5 flex flex-col gap-3 bg-bg-card border border-border-main"
                        >
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${f.color}20`, color: f.color }}>
                                {f.icon}
                            </div>
                            <div>
                                <h3 className="text-text-main font-semibold mb-1">{f.title}</h3>
                                <p className="text-text-muted text-sm">{f.desc}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="text-center text-gray-600 text-xs pb-8">
                <p>niume v1.3.1 &copy; {new Date().getFullYear()} — Personal Trainer com IA</p>
            </footer>

            {/* Auth Modal */}
            <AnimatePresence>
                {showAuth && (
                    <motion.div
                        key="overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowAuth(false); }}
                    >
                        <motion.div
                            key="modal"
                            initial={{ y: '100%', opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-8 bg-card border border-[var(--border-main)] shadow-2xl"
                        >
                            {/* Modal header */}
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-text-main text-xl font-bold">
                                        {isLogin ? 'Entrar na sua conta' : 'Criar sua conta'}
                                    </h2>
                                    <p className="text-text-muted text-sm mt-0.5">
                                        {isLogin ? 'Bem-vindo de volta!' : 'Comece sua jornada fitness'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowAuth(false)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-main transition-colors bg-text-main/5"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <form onSubmit={handleAuth} className="flex flex-col gap-4">
                                {/* Email */}
                                <div className="relative">
                                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                                    <input
                                        type="email"
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-text-main/5 border border-border-main text-text-main text-sm outline-none transition-all placeholder:text-text-muted/50"
                                        autoComplete="email"
                                    />
                                </div>

                                {/* Password */}
                                <div className="relative">
                                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                                    <input
                                        type={showPass ? 'text' : 'password'}
                                        placeholder="Senha (mínimo 6 caracteres)"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-text-main/5 border border-border-main text-text-main text-sm outline-none placeholder:text-text-muted/50"
                                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass(!showPass)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
                                    >
                                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>

                                {/* Submit */}
                                <motion.button
                                    type="submit"
                                    disabled={loading}
                                    whileHover={{ scale: loading ? 1 : 1.02 }}
                                    whileTap={{ scale: loading ? 1 : 0.98 }}
                                    className="w-full py-4 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2 mt-2"
                                    style={{
                                        background: loading ? 'rgba(124,58,237,0.5)' : 'linear-gradient(135deg, #7C3AED, #6d28d9)',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {loading ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                                            className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                                        />
                                    ) : (
                                        <>
                                            {isLogin ? 'Entrar' : 'Criar Conta'}
                                            <ArrowRight size={18} />
                                        </>
                                    )}
                                </motion.button>
                            </form>

                            {/* Toggle */}
                            <p className="text-center text-gray-400 text-sm mt-5">
                                {isLogin ? 'Não tem conta?' : 'Já tem uma conta?'}{' '}
                                <button
                                    onClick={() => setIsLogin(!isLogin)}
                                    className="font-semibold text-primary"
                                >
                                    {isLogin ? 'Criar conta grátis' : 'Fazer login'}
                                </button>
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}
