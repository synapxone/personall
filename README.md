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
| IA | Google Gemini API (`gemini-2.5-flash` / `gemini-2.5-flash-lite`) + Veo 2 (geração de vídeo) |
| Exercícios | ExerciseDB via RapidAPI (com fallback gratuito `exercisedb-api.vercel.app`) |
| Ícones | Lucide React |
| Notificações | react-hot-toast |

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz com:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave-anon>
VITE_GEMINI_API_KEY=<chave-gemini>
VITE_RAPIDAPI_KEY=<chave-rapidapi>   # ExerciseDB (opcional — usa API gratuita como fallback)
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
  water_cups int default 0,
  unique(user_id, date)
);

-- Cache de mídia dos exercícios (GIFs / vídeos Veo 2)
create table exercise_media (
  slug text primary key,
  url text not null,
  media_type text not null check (media_type in ('gif', 'video')),
  created_at timestamptz default now()
);

alter table exercise_media enable row level security;
create policy "Public read"  on exercise_media for select using (true);
create policy "Auth insert"  on exercise_media for insert with check (true);
create policy "Auth update"  on exercise_media for update using (true);

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
-- exercise_media: políticas já incluídas na criação acima

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
| `exercise-media` | GIFs/vídeos dos exercícios (cache do pipeline ExerciseDB → Veo 2) |

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
│   ├── geminiService.ts          # Integração Gemini: plano de treino, dieta, análise de foto/texto
│   ├── exerciseService.ts        # ExerciseDB via RapidAPI + fallback API gratuita (por nome)
│   ├── exerciseMediaService.ts   # Pipeline de mídia: DB cache → free-exercise-db → ExerciseDB free API
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
- Mídia dos exercícios via pipeline em 3 camadas:
  1. Cache no Supabase (`exercise_media`) → resposta instantânea, URL direta sem Storage
  2. [`free-exercise-db`](https://github.com/yuhonas/free-exercise-db) (800+ exercícios, GitHub CDN, sem API key) → fuzzy matching por nome
  3. ExerciseDB free API (`exercisedb-api.vercel.app`) → fallback por nome, URL direta armazenada no cache
- Índice do `free-exercise-db` carregado em background no mount (`preloadFreeDb`)
- Carregamento lazy (dispara apenas quando o exercício é expandido)
- Suporte a `<img>` (JPG/GIF) e `<video autoplay loop muted>` (MP4)
- Registro de conclusão com seleção de exercícios completados
- Ganho de pontos ao concluir (150 pts completo / 75 pts parcial)

### Nutrição
- Registro por foto:
  - **Câmera** → preview de vídeo in-app via `getUserMedia` (sem sair do app); botão "Capturar" congela frame; IA detecta **cada item do prato individualmente** (`analyzeFoodPhotoItems`); tela de revisão permite remover itens antes de salvar todos de uma vez
  - **Galeria** (sem capture) → fluxo existente de item único
- Registro por texto com busca inteligente + sugestão de unidades de medida
- Gemini Vision identifica alimento e estima macros automaticamente
- Edição e exclusão de itens registrados
- Anel de progresso calórico diário + barras de macros
- Rastreador de água premium: sem scroll horizontal, copos em grade flex-wrap, exibe litros consumidos / meta / falta, barra de progresso
- Navegação entre dias: setas `<` / `>` e calendário mensal
  - Ponto roxo nos dias com refeições registradas
  - Atalho "Ir para Hoje"
  - Refeições e água carregam para o dia selecionado
  - Permite adicionar/editar refeições em dias anteriores
- Histórico de 7 dias
- Notificações às 14h (almoço) e 20h30 (jantar) se não houver registro

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

---

## Histórico / Changelog Diário (Comunicação entre Agentes)

**Status e Versão Atual:** v1.1.4

### Últimas Atualizações e Correções (Fev/2026):
- **Design Dashboard Stats:** Os cartões na `Dashboard.tsx` receberam uma reformulação completa para exibir pequenos gráficos SVG/Backgrounds renderizados atrás dos números.
- **Design Sessão de Treinos:** Reformulação pesada no `WorkoutDay.tsx`:
  - O modal de "Descanso" agora possui um layout flutuante com *backdrop-blur* (*glassmorphism*).
  - O modal de tempo ativo ("Active Set") recebeu um arco em gradiente ao redor dos números, garantindo foco central e aspecto premium (*stopColors* SVG).
  - Foram removidos o estilo `mix-blend-screen` das mídias/vídeos dos exercícios, garantindo que as imagens/demonstrações carregadas de origens externas sejam exibidas corretamente sem ficar invisíveis num tema claro com fundo dark.
- **Câmera Móvel (Fix iOS/Android):** Modificamos a Câmera e Galeria na aba de nutrição para usarem nativamente um `<label>` envelopando um `<input type="file" hidden>`. Anteriormente, cliques via script (`ref.current.click()`) forçavam as WebViews móveis a matar a rotina e reiniciar a aplicação (Refresh) em contextos de pouca RAM.
- **Design Nutrição (Foodvisor-like):** O Layout do `NutritionLog.tsx` foi reformulado inteiramente. Adicionado um cartão de resumo panorâmico (SVG), barras dinâmicas para macros e botões minimalistas tracejados nas refeições.
- **Submissões de Formulários:** Adicionado `type="button"` aos botões da interface de Nutrição para impedir que eles acionassem submissões indesejadas (Submit), o que recarregava o app no mobile. Tratado também o erro `img.onerror` na compressão de base64.
- **Treino da IA (Regra 7 dias):** A IA (`geminiService.ts`) foi ajustada no *prompt* para garantir que entregue planos de treinos divididos de Segunda a Domingo. Além disso, foi forçada a gerar GIFs com base SOMENTE em IDs EXATAMENTE numéricos vindos do repositório/API (ex: "0009") para o app não quebrar.
- **Aparência e Temas:** Implementado suporte para alternância entre Claro e Escuro (Tema) persistindo no `localStorage`.
- **Navegação de UI (Recuperação):** O app agora grava qual Aba o usuário estava vendo via `sessionStorage`. Se ao abrir a Câmera o aparelho ficar sem memória e der "Refresh" no painel inteiro, o componente vai renascer automaticamente de volta na Aba de Dieta ao invés de voltar pra Home inicial.
- **Media Caching (Desempenho):** O serviço `exerciseMediaService` foi recentemente implementado para suportar vídeos embarcados além de GIFs para os exercícios do `WorkoutDay.tsx`.
- **Pipeline de Mídia (Exercícios):** `exerciseMediaService.ts` implementa 3 camadas: (1) cache Supabase DB + Storage, (2) ExerciseDB download e rearmazenamento, (3) geração Veo 2 com prompt estilo silhueta minimalista. Carregamento lazy ao expandir exercício.
- **ExerciseDB Fallback Gratuito:** `exerciseService.ts` agora inclui `getByNameFree()` que consulta `exercisedb-api.vercel.app` sem necessidade de chave RapidAPI, usando cache em memória por nome.
- **Tab Persistence (Fix):** A persistência da aba ativa foi corrigida de `sessionStorage` (perdido no refresh) para `localStorage` (persistente entre sessões). O app agora restaura a aba correta ao atualizar a página.
- **Timezone Bug (Fix Crítico):** Corrigido bug onde `new Date().toISOString().split('T')[0]` retornava a data UTC — no Brasil (UTC-3), após as 21h local o app mostrava a dieta/treino do dia seguinte (vazios). Todos os arquivos (`NutritionLog.tsx`, `WorkoutDay.tsx`, `ProfileView.tsx`, `App.tsx`) passaram a usar `getFullYear()/getMonth()/getDate()` para data local.
- **CI/CD (deploy.yml):** Adicionado `VITE_RAPIDAPI_KEY` nas variáveis de ambiente do GitHub Actions para que a ExerciseDB funcione em produção (GitHub Pages).
- **Navegação de Datas (Dieta):** `NutritionLog.tsx` ganhou seletor de data com setas prev/next e calendário mensal. `loadData(date)` agora aceita parâmetro; `saveMeal`, `updateDailyNutrition` e water handler usam `selectedDate`. Calendário destaca dias com refeições via `fetchMealDates()`.
- **Câmera Multi-Item (Dieta):** Botão "Câmera" agora usa `capture="environment"` (abre câmera nativa em mobile). IA analisa todos os alimentos do prato individualmente (`geminiService.analyzeFoodPhotoItems`). Tela de revisão exibe cada item com macros; usuário pode remover itens antes de salvar todos de uma vez. Galeria mantém fluxo de item único.
- **Rastreador de Água (Premium):** Removido scroll horizontal. Copos em `flex-wrap`. Exibe litros consumidos vs. meta (L) e quanto falta. Barra de progresso animada. Layout de cartão vertical com header/stats/grid.
- **Câmera In-App (Fix crítico):** `capture="environment"` causava reload do WebView em dispositivos com pouca RAM (foto nunca chegava ao `onChange`). Substituído por câmera in-app via `navigator.mediaDevices.getUserMedia`. Preview de vídeo dentro do modal, botão "Capturar" congela o frame, canvas converte para blob e envia para a IA — sem sair do app, sem reload.
- **Imagens de Exercícios (Fix + Fonte Nova):** Todos os exercícios mostravam a mesma imagem de fallback (Unsplash) pois o pipeline ExerciseDB/corsproxy falhava. `exerciseMediaService.ts` foi reescrito: pipeline passa a usar `yuhonas/free-exercise-db` (800+ exercícios, GitHub CDN direto, sem API key) como fonte primária com fuzzy matching por nome. Supabase Storage removido do pipeline (URLs diretas armazenadas no DB cache). ExerciseDB free API mantido como último fallback. Limpar tabela `exercise_media` no Supabase remove entradas inválidas do cache antigo.
