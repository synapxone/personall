# niume 💪

Aplicativo de fitness pessoal com IA — treinos, nutrição, gamificação e acompanhamento de evolução. (Antigo Personall)

> **v1.9.0** — Substituição de IA por Lógica Determinística: Transição da geração de treinos, cardápios, busca de alimentos e sugestão de unidades da Edge Function para lógicas locais baseadas em dados. Redução drástica de latência e custos, com eliminação de alucinações em dados estruturais.
>
> **v1.8.1** — Experiência Assistida & Mascot 2.0: Feedback visual dinâmico com o Mascote animado e mensagens humoradas durante o processamento de IA. Alertas proativos mais inteligentes com interface aprimorada e botões de resposta rápida (Quick Replies) no chat do Pers.
>
> **v1.8.0** — Apoio Nutricional Positivo: Remoção de alertas de "meta batida" e substituição por mensagens motivacionais quando o limite calórico é excedido. O gráfico agora assume tons suaves para reduzir sentimentos de culpa e focar na consistência a longo prazo.
>
> **v1.7.2** — Precisão Nutricional: correção no cálculo de unidades Individuais (ex: biscoitos, bombons) com estimativa de peso unitário via IA e feedback visual no log de dieta. Nova coluna `unit_weight` no banco de dados.
>
> **v1.7.1** — Foto de perfil com moderação por IA: upload de avatar na tela de perfil; Gemini Vision verifica se a imagem é apropriada antes de salvar (bloqueia nudez, violência, conteúdo perturbador).
>
> **v1.7.0** — Comunidade Social: feed de progresso, seguir/ser seguido (mútuo), reações (👏 Parabéns / 🔥 Arrasou / 💪 Não desista), explorar usuários. Menu hamburguer no topo do app.
>
> **v1.6.0** — Refatoração de Segurança (Edge Functions), IA Backend, Gamificação Centralizada e Dashboard Real-Time.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Mobile | Capacitor 8 (iOS & Android) |
| OTA (Updates) | Capgo (Ninja Mode / Self-Hosted) |
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
  -- v1.4.0: categorias
  category text default 'musculacao', -- 'musculacao' | 'cardio' | 'modalidade'
  plan_type text default 'ai',        -- 'ai' | 'custom' | 'template'
  modality_id uuid references modalities(id),
  split_type text,
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
  quantity numeric(8,2),
  unit text,
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
- **Flexibilidade total**: Capacidade de redefinir treinos individuais ou a semana inteira.
- **Dia de Descanso**: Botão "Quero treinar hoje" em dias de repouso, acionando a IA para gerar um treino sob demanda que evita repetir exercícios já realizados nos outros dias da mesma semana.
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
- **Cálculo de Evolução Inteligente**: Ao registrar evolução, a IA analisa os últimos 30 dias. Ganhe +25 XP base, +25 XP por cada treino realizado e +15 XP por cada dia dentro da meta calórica ideal.
- Streak de dias consecutivos com bônus
- Loja de recompensas (chocolate, pizza, hambúrguer, dia livre de dieta…)
- Histórico de treinos concluídos

### Assistente IA (Pers)
- Chat flutuante com contexto dos últimos 15 dias (treinos, refeições, gamificação)
- **Central de Notificações Inteligente**: Todos os alertas (água, metas, treino) agora emanam da bolinha assistente através de balões de chat proativos com CTAs automáticos.
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
- **Gerenciamento de Conta**: Botão Reset para reiniciar do zero (Onboarding) limpando todos os dados.

---

## Desenvolvimento

```bash
npm install
npm run dev           # Rodar versão Web
npm run app:build     # Build Web + Sync Capacitor
npm run app:open:ios  # Abrir Xcode
npm run app:open:android # Abrir Android Studio
npm run app:bundle:ota # Gerar .zip para atualização em tempo real
```

---

## Solução de Problemas

### Erro: `command 'claude-vscode.editor.openLast' not found`
Este erro ocorre quando a extensão **Claude Code** no VS Code falha ao iniciar corretamente (comum em versões recentes no Windows).

**Como resolver:**
1. **Atualize a extensão:** Verifique se há atualizações para a extensão "Claude Code" no Marketplace. Versões 2.1.52+ corrigem este bug.
2. **Downgrade (se necessário):** Se a atualização não resolver, clique na engrenagem da extensão → "Install Another Version..." → selecione **2.1.49**.
3. **Recarregue o VS Code:** Abra o Command Palette (`Ctrl+Shift+P`) e execute `Developer: Reload Window`.
4. **Limpe o cache:** Se persistir, desinstale a extensão e apague a pasta `%APPDATA%\Code\User\globalStorage\anthropic.claude-code` antes de reinstalar.

---

## Publicação Mobile & OTA Ninja

O niume utiliza **Capacitor** para rodar nativamente em iOS e Android. Para manter o custo R$ 0,00 e permitir atualizações em tempo real, implementamos o **OTA Ninja Mode**:

### Como atualizar o App sem as Lojas (OTA):
1. **Gere o Bundle**: `npm run app:bundle:ota`.
2. **Suba o Zip**: Pegue o arquivo em `updates/ota_bundle.zip` e suba no seu servidor/bucket.
3. **Atualize o Manifesto**: Edite `updates/manifest.json` com a nova versão e a URL direta do zip.
4. **Pronto**: O app buscará essa informação automaticamente ao iniciar e se atualizará sozinho.

**Configuração Técnica:**
- Lógica manual implementada no `App.tsx` usando `@capgo/capacitor-updater`.
- `autoUpdate: false` no `capacitor.config.ts` para controle total via código.
- URL do Manifesto: `https://synapx.cloud/niume/manifest.json`.

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

### v1.9.0 — Substituição de IA por Lógica Determinística
- **Otimização de Custos e Latência**: Funções core (Treino, Dieta, Busca) agora rodam localmente sem depender do LLM, economizando recursos e eliminando os >5s de espera.
- **Gerador de Dieta Determinístico**: Algoritmo matemático que calcula macros via TDEE e distribui em refeições predefinidas baseadas nas preferências do usuário.
- **Gerador de Treinos Baseado em Templates**: Lógica de fatias capilares (PPL, Full Body, etc) que seleciona exercícios reais do repositório mantendo gifs funcionais e IDs precisos.
- **Busca de Alimentos Otimizada**: Busca direta no `food_database` local via `ilike`, garantindo rapidez e veracidade dos dados nutricionais exibidos.
- **Sugestão de Unidades Local**: Unidades de medida agora são retornadas instantaneamente (g, ml, unidade, etc) sem consulta externa.
- **Moderação Heurística**: Filtro anti-spam e fallback de blocklist local para nomes personalizados de itens e exercícios.

### v1.8.1 — Experiência Assistida & Mascot 2.0
- **Mascote Animado**: O Pers agora exibe poses variadas (neutral, happy, thinking) de forma mais integrada.
- **Loading Humorado**: Mensagens rotativas de carregamento ("Consultando os deuses da hipertrofia...", etc) para as análises de IA no Chat e no Log de Nutrição por foto.
- **Alertas Proativos Golden Zone**: Lógica refinada para premiar usuários que atingem a meta com precisão cirúrgica e alertas sutis de déficit de proteína.
- **Quick Replies**: Botões de acesso rápido ao abrir o chat para dúvidas comuns (treino, macros, desempenho).

### v1.8.0 — Apoio Nutricional & Mindset Positivo
- **Mensagens Motivacionais**: Introduzido sistema de frases de apoio quando o usuário excede a meta calórica, focando em consistência e equilíbrio em vez de culpa.
- **Design Suave**: O gráfico de calorias agora adota um visual "opaco e clarinho" (redução de contraste e tons de alerta) ao ultrapassar o limite, removendo o ícone de alerta e a mensagem "Meta Batida" de excesso.
- **Remoção de Veredito**: Substituição do feedback de "erro" por uma perspectiva de progresso contínuo ("Um dia calórico não é um veredito").

### v1.7.2 — Precisão Nutricional & Unidades
- **Lógica de Unidades**: Correção do erro de sobrepeso calórico em produtos (ex: biscoitos). O sistema agora estima o peso de uma unidade individual através da IA em vez de assumir 100g ou o pacote todo.
- **Feedback Visual**: Adicionado indicador visual no formulário de dieta: "(1 unidade considerada como Xg)", dando transparência ao cálculo.
- **Banco de Dados**: Nova coluna `unit_weight` na tabela `meals` para persistência e edição precisa de porções.
- **Scanner OFF**: Melhoria na extração de gramatura de servir (`serving_quantity`) da API do Open Food Facts.

### v1.7.1 — Moderação & Branding
- **Branding PNG**: Padronização de todos os ícones e favicon para formato PNG (removido SVG para maior compatibilidade).
- **Cores de Treino**: Atualização das cores das categorias (Musculação/Verde, Cardio/Amarelo, Modalidade/Azul) para facilitar a distinção visual.

### v1.6.0 — Segurança & Arquitetura Pro (Edge Functions)
- **Identidade Visual**: Atualizado o favicon do site e ícone do PWA para o novo SVG oficial.
- **Migração para Backend**: Toda a lógica de IA (Gemini/OpenAI) fora do frontend.
- **Reliability (Contingência)**: Implementado fallback inteligente para OpenAI se o Gemini falhar ou estiver instável.
- **Gamificação Unificada**: Centralização da lógica de ganho de XP, níveis e streaks no `gamificationService.ts`, garantindo consistência entre treinos, dieta e evolução.
- **Dashboard Data-Driven**: O gráfico de "Desempenho Semanal" agora exibe dados reais baseados nas últimas 7 sessões de treino, substituindo o placeholder estático.
- **Evolução Avançada**: Registro de evolução com upload de fotos sincronizado ao Storage e uma nova análise corporal via IA que gera feedbacks bioestatísticos.
- **Polimento UX**: Substituição de alertas de sistema (`confirm`) por modais customizados premium no reset de conta e registros críticos.

### v1.4.0 — Reestruturação Completa de Treino
- **3 Categorias de Treino**: Musculação, Cardio e Modalidade, cada uma com 1 plano ativo simultâneo.
- **Musculação**: 3 fluxos de criação — Treino Pronto (split + IA), Manual (dias + exercícios), IA Completa.
- **Splits disponíveis**: Full Body, A/B, A/B/C, Push/Pull/Legs, Upper/Lower, A/B/C/D/E.
- **Cardio**: Sessão Rápida com timer, distância, resistência e calorias estimadas (MET). Histórico com gráfico de calorias/semana.
- **Modalidade**: Grid comunitário de esportes (Pilates, Boxe, Jump, Karatê, Yoga, etc.). Usuários adicionam novas modalidades que ficam disponíveis para todos.
- **Banco Comunitário**: Exercícios cadastrados são compartilhados entre todos os usuários. IA gera instruções automaticamente no cadastro.
- **Moderação em 2 camadas**: Blocklist local (DB) + validação contextual por IA (Gemini) para conteúdo comunitário.
- **WeeklyPlanView**: Plano semanal navegável com estatísticas (sessões, volume, sequência, sparklines).
- **WorkoutHub**: Hub central com gráfico de atividade dos últimos 7 dias + status de cada categoria.
- **Refinamento de Registro de Nutrientes**:
  - **Lógica de Salvamento Duplo**: Botão "Salvar Agora" (IA em background) vs "Calcular Nutrientes" (análise instantânea antes de salvar).
  - **Sanidade Nutricional**: Bloqueio automático de quantidades extravagantes (ex: 100 ovos) ou suspeitamente baixas (ex: 1g de arroz).
  - **UX Manual**: Campo de quantidade limpa ao clicar; restauração de seletor de unidade e cards de macros.
- **SQL Migration**: `migrations/v2_workout_categories.sql`, `migrations/v3_meal_details.sql`, `migrations/v4_exercise_seed.sql` e `migrations/v5_community.sql` (novas colunas, tabelas e seeds).

**Arquivos criados/modificados**: `WorkoutHub.tsx`, `MusculacaoHub.tsx`, `CardioHub.tsx`, `ModalidadeHub.tsx`, `WeeklyPlanView.tsx`, `CardioSessionTracker.tsx`, `ExercisePicker.tsx`, `moderationService.ts`, `NutritionLog.tsx`

**Status e Versão Atual:** v1.5.0

---

### v1.5.2 — Ajustes de Precisão e Estética na Dieta
- **Precisão Cirúrgica**: Limitada a exibição de macros (Proteínas, Carbos, Gorduras) a apenas uma casa decimal, evitando strings longas de floats.
- **Paleta de Cores Soft**: Cores dos gráficos de progresso e estatísticas de macros atualizadas para tons mais suaves e pastéis, melhorando o conforto visual e a estética premium.
- **Sincronização de Cores**: Atualização consistente dos tokens de cores (Primary, Proteina, Carbos, Gordura) em ambos os modos (Claro e Escuro).

**Arquivos modificados**: `NutritionLog.tsx`, `index.css`, `README.md`

### v1.5.1 — Onboarding Wizard VIP
- **Estética Premium**: Interface do Onboarding Wizard redesenhada com ícones modernos, layouts espaçosos e elementos de design "high-end".
- **Modo Claro Forçado**: O onboarding agora força o tema claro para garantir legibilidade máxima e uma primeira impressão vibrante e profissional.
- **Engenharia de Elite**: Nova seção de geração de plano com feedback visual detalhado sobre os passos da IA (bioestática, periodização, nutrição).
- **Componentes Refinados**: Sliders, botões e seletores customizados para uma experiência de usuário mais suave e "touch-friendly".

**Arquivos modificados**: `OnboardingWizard.tsx`, `index.css`, `App.tsx`, `README.md`

### v1.5.0 — Refatoração de Nutrição & Barcode Scanner
- **Nova Interface Tabulada**: Modal de adição redesenhado com abas dedicadas para **Buscar** (IA/DB), **Histórico** (Itens frequentes), **Direto** (Registro manual), **Barras** (Scanner) e **Foto**.
- **Barcode Scanner Nativo**: Integração com `html5-qrcode` para escaneamento instantâneo.
- **Open Food Facts**: Consumo da API global de produtos para preenchimento automático via código de barras.
- **Aba Histórico**: Exibe os 10 itens mais consumidos nos últimos 30 dias para registro rápido com 1 clique.
- **Registro Direto (Quick Entry)**: Formulário simplificado para inserção rápida de nome e calorias/macros sem necessidade de busca ou IA.
- **Prioridade de Dados**: Fluxo de busca prioriza o banco de dados local (TACO) antes de recorrer à IA Generativa, garantindo maior precisão.
- **Melhorias de Estabilidade**: Correção no encerramento da câmera ao trocar de aba, reset de formulário consistente e melhor feedback visual ("via Open Food Facts").

**Arquivos modificados**: `NutritionLog.tsx`, `aiService.ts`, `BarcodeScanner.tsx`, `README.md`

### v1.2.9
- Estética: Modo Claro definido como padrão do sistema.
- Tema: Persistência de tema (Claro/Escuro) sincronizada com o perfil do usuário no Supabase.
- Performance: Melhoria na inicialização do app para evitar "flash" de tema escuro.

### v1.2.8
- Otimização de busca local: Resultados do banco de dados (TACO) agora priorizados na busca manual.
- Correção de animação do Mascote: Propriedades de variantes unificadas para evitar erros de renderização.
- Estabilidade da API Gemini: Implementação de retentativas e tratamento de erros aprimorado.
- Melhoria no log nutricional: Seleção de porções e unidades agora mais intuitiva via IA.
- **Busca Otimizada**: Desativado o auto-complete por IA para priorizar 100% o banco de dados local (TACO), economizando recursos e aumentando a velocidade.
- **Correção Visual (Mascote)**: Corrigido o erro de renderização SVG (`attribute d: undefined`) nas animações do Pers.
- **Estabilidade de IA**: Atualizado o endpoint e a lista de modelos do Google Gemini para evitar erros 404 e garantir fallback robusto.
- **Base de Dados**: Adicionadas variações comuns como "bolacha", "biscoito", "cerveja" e "vinho" ao banco de dados local.

### Versão 1.2.7
- **Auto-complete com TACO**: Implementada sugestão em tempo real vinda diretamente do banco de dados local.
- **Priorização de Dados Estruturados**: O app agora tenta encontrar o alimento no banco local antes de consultar a IA.
- **Ajustes PWA**: Aumentado o limite de cache do Service Worker para suportar assets maiores.
- Adicionado suporte a debouncing inteligente para evitar sobrecarga de consultas ao banco.
- **Banco de Dados Local e Scanner (v1.2.6):**
  - Implementado banco de dados local com dados da **TACO** (Tabela Brasileira de Composição de Alimentos).
  - Integrado **Leitor de Código de Barras** (Scanner) via `html5-qrcode` com consulta à API mundial **Open Food Facts**.
  - Sistema de busca inteligante: Prioriza resultados locais e baseados em código de barras, usando a IA apenas como *fallback* para novos alimentos ou análise de fotos.
  - Otimização de custos e performance: Busca instantânea para alimentos básicos brasileiros.
- **Correção da Análise Nutricional (v1.2.5):**
  - Resolvido o problema onde os nutrientes (calorias, macros) retornavam como **zero** após a análise de fotos de comida.
  - Otimização dos *prompts* de IA (Gemini e OpenAI) para forçar estimativas realistas fundamentadas em tabelas nutricionais.
  - Implementado sistema de tratamento e *casting* numérico no `parseSafeJSON` para garantir que valores retornados como strings (ex: "120 kcal") sejam convertidos corretamente para inteiros antes de salvar no banco.
  - Adicionadas regras de validação para garantir valores maiores que zero em pratos com alimento visível.
- **Aprimoramento Visual e Correção de Mascot (v1.2.3):**
  - Corrigido erro de path SVG `undefined` no mascote durante o estado de espera.
  - Melhorado o algoritmo de deformação do Visualizador 3D: agora ele representa de forma muito mais expressiva variações de gordura (barriga/volume), músculos e quadril (foco feminino).
  - Otimizado sombreamento e materiais do modelo 3D para um visual mais premium.
  - Limpeza de logs e lints no código de visualização.
- **Refatoração do Sistema de Contingência (v1.2.2):**
- **Integração de Fallback OpenAI (v1.2.1):**
  - Implementado sistema de contingência com **GPT-4o-mini**.
  - Fallback automático resiliente: o sistema chaveia para a OpenAI em qualquer erro do Gemini (403, 404, 429).
  - Unificação de serviços no `aiService.ts` para maior estabilidade.
- **Visualizador Corporal 3D Real (v1.2.0):** 
  - Upgrade total do motor de visualização de silhuetas SVG para **Three.js**.
  - Suporte nativo para modelos humanos reais em formato `.glb` (`public/assets/`).
  - Lógica de morfismo baseada em métricas de composição corporal (IMC, muscularidade).
  - Alternador 2D/3D dinâmico na aba de Evolução.
- **Robustez da IA (Gemini):**
  - Implementada detecção de erro HTTP 429 (Cota Excedida).
  - O assistente "Pers" agora informa o usuário de forma amigável quando os limites da API são atingidos, oferecendo feedback claro em vez de falhas genéricas.
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
- **Câmera In-App (Fix crítico):** `capture="environment"` causava reload do WebView. Substituído por câmera in-app via `navigator.mediaDevices.getUserMedia`.
- **Imagens de Exercícios (Fix + Fonte Nova):** Pipeline passa a usar `yuhonas/free-exercise-db` (800+ exercícios, GitHub CDN direto) como fonte primária com fuzzy matching.
- **Gemini JSON Truncado (Fix):** `parseSafeJSON` agora corrige literais de string não terminadas.
- **Temas Light/Dark:** Implementação de variáveis CSS semânticas em todos os componentes (`NutritionLog`, `Dashboard`, `AIAssistant`, `WorkoutDay`).
- **Mobile Capacitor:** Adição de suporte nativo para Android e iOS com geração de ícones e splash screens personalizados.
- **OTA Ninja Mode:** Sistema de atualização Over-the-Air self-hosted integrado, permitindo atualizações de código instantâneas e gratuitas via servidor customizado (`synapx.cloud`).
- **Ajuste de Estilo:** Sobresrita da classe `.pb-8` para `padding-bottom: 1rem` no `index.css`.
- **Persistência de Treinos (Fix):** Implementado utilitário de data local (`src/lib/dateUtils.ts`) para evitar dessincronização de fuso horário. Adicionada coluna `total_load_kg` no Supabase e carregamento de estatísticas corrigido no `WorkoutDay`.
- **Refinamento de UI e Segurança (v1.3.2):**
  - **Correção do Dropdown de Nutrição:** Alterado posicionamento de `absolute` para `relative` no dropdown de sugestões de alimentos para evitar que sobreponha os botões de ação ("Buscar"/"Adicionar").
  - **Legibilidade:** Corrigida a cor do texto das sugestões que estava invisível no tema claro (agora usa `var(--text-main)`).
  - **Segurança de APIs:** Migração completa das chaves de IA (Gemini/OpenAI) para o ambiente seguro das **Supabase Edge Functions**. Chaves não são mais expostas no frontend nem enviadas em commits.
  - **Manutenção:** Atualização das tags de versão em todo o sistema.
- **Refinamento de UI e UX de Nutrição (v1.3.3):**
  - **Hidratação:** Design dos copos de água mais sutil (tons de cinza claro e linhas finas) para um visual mais limpo.
  - **Scanner de Código de Barras (Resiliência):** A câmera agora permanece aberta em caso de produto não encontrado ou erro de leitura, permitindo que o usuário decida se deseja tentar novamente ou fechar manualmente.
  - **Cálculo Local (Hotfix):** Normalização de strings de unidades (g, gramas, oz) para garantir consistência no cálculo de macros instantâneo.
- **Refinamento de Unidades e Edição (v1.3.4):**
  - **Conversão de Unidades Expandida:** Adicionado suporte para "litro", "copo" (200ml), "colher" (15g), "ml" e "porção", com cálculos matemáticos automáticos.
  - **Edição de Quantidade:** Agora é possível editar a quantidade e a unidade de uma refeição já registrada diretamente no modal de detalhes.
  - **Padrão 100g:** O sistema agora inicia com "100 gramas" como padrão para facilitar o registro rápido.
