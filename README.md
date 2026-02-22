# Personall 💪

Aplicativo de fitness pessoal com IA — treinos, nutrição, gamificação e acompanhamento de evolução.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Estilo | Tailwind CSS + Framer Motion |
| Backend / Auth / DB | Supabase (PostgreSQL + Row Level Security) |
| Storage | Supabase Storage |
| IA | Google Gemini API (`gemini-2.5-flash-lite` / `gemini-2.5-flash`) |
| Ícones | Lucide React |
| Notificações | react-hot-toast |

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz com:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave-anon>
VITE_GEMINI_API_KEY=<chave-gemini>
```

---

## Banco de Dados (Supabase)

Execute os SQLs abaixo no SQL Editor do Supabase.

### Tabelas

```sql
-- Perfil do usuário
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  age int not null,
  weight numeric(5,1) not null,
  height int not null,
  gender text not null,
  activity_level text not null,
  goal text not null,
  training_location text not null,
  available_minutes int not null,
  photo_url text,
  body_analysis text,
  food_preferences text[] default '{}',
  foods_at_home text[] default '{}',
  daily_calorie_goal int not null default 2000,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Planos de treino gerados pela IA
create table workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  description text,
  estimated_weeks int not null,
  plan_data jsonb not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Sessões de treino concluídas
create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  plan_id uuid references workout_plans(id),
  session_date date not null,
  day_index int not null,
  exercises_completed text[] default '{}',
  duration_minutes int default 0,
  points_earned int default 0,
  completed boolean default false,
  created_at timestamptz default now()
);

-- Refeições registradas
create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  meal_date date not null,
  meal_type text not null,
  description text not null,
  photo_url text,
  calories int not null default 0,
  protein numeric(6,1) not null default 0,
  carbs numeric(6,1) not null default 0,
  fat numeric(6,1) not null default 0,
  logged_at timestamptz default now()
);

-- Resumo diário de nutrição (desnormalizado para performance)
create table daily_nutrition (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  date date not null,
  total_calories int default 0,
  total_protein numeric(6,1) default 0,
  total_carbs numeric(6,1) default 0,
  total_fat numeric(6,1) default 0,
  goal_calories int default 2000,
  unique(user_id, date)
);

-- Gamificação (pontos, nível, streak, recompensas)
create table gamification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique,
  points int default 0,
  level int default 1,
  xp_to_next int default 200,
  streak_days int default 0,
  last_activity_date date,
  total_workouts int default 0,
  total_meals_logged int default 0,
  rewards_available jsonb default '[]',
  rewards_earned jsonb default '[]',
  updated_at timestamptz default now()
);

-- Histórico de conversa com a IA (Pers)
create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

-- Registros de evolução (peso + foto timeline)
create table progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  date date not null,
  weight numeric(5,1),
  photo_url text,
  notes text,
  created_at timestamptz default now()
);
```

### Row Level Security

```sql
-- Habilitar RLS em todas as tabelas
alter table profiles          enable row level security;
alter table workout_plans     enable row level security;
alter table workout_sessions  enable row level security;
alter table meals             enable row level security;
alter table daily_nutrition   enable row level security;
alter table gamification      enable row level security;
alter table ai_conversations  enable row level security;
alter table progress_entries  enable row level security;

-- Políticas (usuário acessa apenas seus próprios dados)
create policy "own" on profiles         for all using (auth.uid() = id);
create policy "own" on workout_plans    for all using (auth.uid() = user_id);
create policy "own" on workout_sessions for all using (auth.uid() = user_id);
create policy "own" on meals            for all using (auth.uid() = user_id);
create policy "own" on daily_nutrition  for all using (auth.uid() = user_id);
create policy "own" on gamification     for all using (auth.uid() = user_id);
create policy "own" on ai_conversations for all using (auth.uid() = user_id);
create policy "own" on progress_entries for all using (auth.uid() = user_id);
```

### Storage Buckets

No painel do Supabase → Storage → criar dois buckets **públicos**:

| Bucket | Uso |
|---|---|
| `body-photos` | Foto corporal do onboarding |
| `progress-photos` | Fotos da timeline de evolução |

---

## Estrutura do Projeto

```
src/
├── App.tsx                  # Roteamento de views (landing / onboarding / dashboard)
├── main.tsx
├── types/
│   └── index.ts             # Tipos TypeScript (Profile, WorkoutPlan, Meal, ProgressEntry…)
├── lib/
│   └── supabase.ts          # Cliente Supabase
├── services/
│   ├── geminiService.ts     # Integração Gemini: plano de treino, dieta, análise de foto/texto
│   ├── exerciseService.ts   # Busca GIFs na ExerciseDB
│   └── notificationService.ts
└── components/
    ├── LandingPage.tsx      # Tela inicial + autenticação (magic link / OAuth)
    ├── OnboardingWizard.tsx # Wizard multi-etapas de cadastro inicial
    ├── Dashboard.tsx        # Shell com abas e navegação inferior
    ├── WorkoutDay.tsx       # Visualização e execução do treino do dia
    ├── NutritionLog.tsx     # Registro de refeições (foto / texto / IA)
    ├── Gamification.tsx     # Pontos, nível, streak e loja de recompensas
    ├── ProfileView.tsx      # Perfil, edição de dados e timeline de evolução
    └── AIAssistant.tsx      # Assistente "Pers" (chat flutuante + alertas proativos)
```

---

## Funcionalidades

### Onboarding
- Wizard multi-etapas: nome, dados físicos, objetivo, local de treino, preferências alimentares
- Análise da foto corporal via Gemini Vision (% gordura estimada, pontos fortes, áreas a melhorar)
- Geração automática de plano de treino personalizado (JSON estruturado via Gemini)
- Geração de plano alimentar com base na TDEE calculada (Mifflin-St Jeor)

### Treino
- Visualização do treino do dia (calculado pelo dia da semana)
- GIFs dos exercícios via ExerciseDB
- Registro de conclusão com seleção de exercícios completados
- Ganho de pontos ao concluir (150 pts completo / 75 pts parcial)

### Nutrição
- Registro por foto (Gemini Vision identifica alimento e estima macros)
- Registro por texto com busca inteligente + sugestão de unidades de medida
- Edição e exclusão de itens registrados
- Anel de progresso calórico diário + barras de macros
- Histórico de 7 dias

### Gamificação
- Sistema de pontos, XP e níveis
- Streak de dias consecutivos com bônus
- Loja de recompensas (chocolate, pizza, hambúrguer, dia livre de dieta…)
- Histórico de treinos concluídos

### Assistente IA (Pers)
- Chat flutuante com contexto dos últimos 15 dias (treinos, refeições, gamificação)
- Alertas proativos de nutrição:
  - ≥ 80% da meta calórica + déficit de proteína → sugere próxima refeição
  - ≥ 80% da meta calórica → avisa que está próximo do limite
  - ≥ 100% da meta → alerta de excesso com sugestão de atividade
  - ≥ 65% das calorias + proteína baixa → alerta de déficit proteico
- Bubble animado com auto-dismiss em 12 segundos

### Perfil & Evolução
- Edição de dados pessoais (peso, altura, idade, objetivo, nível de atividade, tempo disponível)
- Recálculo automático da meta calórica ao salvar edições
- Registro de evolução: peso + foto + observações
- Timeline de progresso com indicador de tendência (↑↓) entre registros
- Visualização em tela cheia das fotos de progresso

---

## Desenvolvimento

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build de produção
npm run lint      # ESLint
npx tsc --noEmit  # type check
```

---

## Gamificação — Tabela de Pontos

| Ação | Pontos |
|---|---|
| Treino completo | 150 |
| Treino parcial | 75 |
| Refeição registrada | 25 |
| Bônus de streak (por dia) | 10 |
| Foto corporal | 50 |

**Nível:** cada nível requer `nível × 200 XP`.

---

## Cálculo de Calorias

- **BMR** — Mifflin-St Jeor: `10×peso + 6,25×altura − 5×idade ± 5/161`
- **TDEE** — BMR × multiplicador de atividade (1,2 a 1,9)
- **Meta:**
  - Perder peso: TDEE − 500 kcal (mínimo 1200)
  - Ganhar peso: TDEE + 500 kcal
  - Hipertrofia: TDEE + 300 kcal
  - Manutenção: TDEE
