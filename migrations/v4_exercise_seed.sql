-- v4_exercise_seed.sql
-- Seeds community_exercises with a comprehensive exercise library
-- Run in Supabase SQL editor

-- PEITO
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Supino Reto com Barra', 'musculacao', 'Peito', 'Barra', 'Deite no banco. Segure a barra na largura dos ombros. Desça até o peito e empurre de volta.'),
('Supino Inclinado com Barra', 'musculacao', 'Peito', 'Barra', 'Banco inclinado a 30-45 graus. Desça a barra até a parte superior do peito.'),
('Supino Declinado com Barra', 'musculacao', 'Peito', 'Barra', 'Banco declinado. Foca na parte inferior do peitoral.'),
('Supino Reto com Halteres', 'musculacao', 'Peito', 'Halteres', 'Movimento livre permite maior amplitude. Desça os halteres alinhados ao peito.'),
('Supino Inclinado com Halteres', 'musculacao', 'Peito', 'Halteres', 'Banco inclinado. Trabalha a cabeca clavicular do peitoral.'),
('Crucifixo com Halteres', 'musculacao', 'Peito', 'Halteres', 'Bracos semi-estendidos, abra e feche no arco amplo como um abraco.'),
('Crucifixo Inclinado', 'musculacao', 'Peito', 'Halteres', 'Banco inclinado. Enfatiza a parte superior do peitoral.'),
('Crossover com Cabo', 'musculacao', 'Peito', 'Cabo', 'Puxe os cabos diagonalmente a frente do corpo, cruzando as maos.'),
('Peck Deck / Voador', 'musculacao', 'Peito', 'Maquina', 'Cotovelos semiflexionados. Una os bracos a frente do peito.'),
('Flexao de Bracos', 'musculacao', 'Peito', 'Livre', 'Maos na largura dos ombros. Desca o peito ate proximo ao chao e empurre.'),
('Flexao Diamante', 'musculacao', 'Peito', 'Livre', 'Maos juntas formando um diamante. Foca em triceps e peitoral interno.'),
('Flexao Inclinada', 'musculacao', 'Peito', 'Livre', 'Maos elevadas (banco). Trabalha o peitoral inferior.'),
('Flexao Declinada', 'musculacao', 'Peito', 'Livre', 'Pes elevados. Foca na parte superior do peitoral.'),
('Pullover com Halter', 'musculacao', 'Peito', 'Halter', 'Deite transversalmente no banco. Segure o halter e faca arco atras da cabeca.'),
('Press no Cabo Baixo Inclinado', 'musculacao', 'Peito', 'Cabo', 'Cabos na posicao baixa. Empurre diagonalmente para cima.')
ON CONFLICT DO NOTHING;

-- COSTAS
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Barra Fixa Pronada', 'musculacao', 'Costas', 'Barra Fixa', 'Pegada pronada, largura dos ombros. Puxe o queixo acima da barra.'),
('Barra Fixa Supinada (Chin-up)', 'musculacao', 'Costas', 'Barra Fixa', 'Pegada supinada. Trabalha mais biceps e parte medial do dorsal.'),
('Remada Curvada com Barra', 'musculacao', 'Costas', 'Barra', 'Tronco inclinado a 45 graus. Puxe a barra ate o abdomen.'),
('Remada Unilateral com Halter', 'musculacao', 'Costas', 'Halter', 'Apoie o joelho no banco. Puxe o halter ate o quadril.'),
('Remada no Cabo Baixo (Polia)', 'musculacao', 'Costas', 'Cabo', 'Sente-se. Puxe o triangulo ate o abdomen, mantendo o tronco ereto.'),
('Puxada na Polia Alta (Lat Pulldown)', 'musculacao', 'Costas', 'Cabo', 'Puxe a barra ate abaixo do queixo, cotovelos apontando para baixo.'),
('Puxada Neutro (Paralela)', 'musculacao', 'Costas', 'Cabo', 'Pegada neutra (palmas se encarando). Foca no redondo maior.'),
('Levantamento Terra', 'musculacao', 'Costas', 'Barra', 'Pes na largura dos quadris. Coluna neutra. Empurre o chao e estenda os quadris.'),
('Levantamento Terra Romeno', 'musculacao', 'Costas', 'Barra', 'Joelhos semiflexionados. Incline o tronco mantendo costas retas.'),
('Remada Alta com Barra', 'musculacao', 'Costas', 'Barra', 'Puxe a barra ate o queixo, cotovelos acima dos ombros.'),
('Remada Maquina', 'musculacao', 'Costas', 'Maquina', 'Apoie o peito. Puxe as alcas ate o tronco.'),
('Face Pull', 'musculacao', 'Costas', 'Cabo', 'Polia alta. Puxe para o rosto, cotovelos alinhados aos ombros.'),
('Puxada Frente Maquina', 'musculacao', 'Costas', 'Maquina', 'Puxe a barra ate o queixo mantendo o tronco levemente inclinado.'),
('Remada T-bar', 'musculacao', 'Costas', 'Barra', 'Fixe a barra num canto. Puxe com as duas maos ate o abdomen.'),
('Superman (Extensao de Coluna)', 'musculacao', 'Costas', 'Livre', 'Deite de brucos. Eleve simultaneamente bracos e pernas.')
ON CONFLICT DO NOTHING;

-- OMBROS
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Desenvolvimento Militar com Barra', 'musculacao', 'Ombros', 'Barra', 'Em pe ou sentado. Empurre a barra do peito para cima ate estender os bracos.'),
('Desenvolvimento com Halteres', 'musculacao', 'Ombros', 'Halteres', 'Segure os halteres na altura dos ombros. Empurre para cima.'),
('Elevacao Lateral', 'musculacao', 'Ombros', 'Halteres', 'Bracos levemente flexionados. Eleve lateralmente ate a altura dos ombros.'),
('Elevacao Frontal', 'musculacao', 'Ombros', 'Halteres', 'Eleve os halteres a frente ate a altura dos ombros.'),
('Arnold Press', 'musculacao', 'Ombros', 'Halteres', 'Comece com palmas para voce. Gire e empurre os halteres para cima.'),
('Passaro / Elevacao Posterior', 'musculacao', 'Ombros', 'Halteres', 'Incline o tronco. Eleve os halteres lateralmente, foca no deltoide posterior.'),
('Remada Alta com Halteres', 'musculacao', 'Ombros', 'Halteres', 'Puxe os halteres ate o queixo, cotovelos acima dos ombros.'),
('Elevacao Lateral no Cabo', 'musculacao', 'Ombros', 'Cabo', 'Polia baixa. Eleve o braco lateralmente ate a altura do ombro.'),
('Encolhimento de Ombros', 'musculacao', 'Ombros', 'Barra', 'Eleve os ombros em direcao as orelhas. Trabalha o trapezio.'),
('Encolhimento com Halteres', 'musculacao', 'Ombros', 'Halteres', 'Halteres ao lado do corpo. Eleve os ombros.')
ON CONFLICT DO NOTHING;

-- BICEPS
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Rosca Direta com Barra', 'musculacao', 'Biceps', 'Barra', 'Segure a barra com pegada supinada. Flexione os cotovelos sem balancar o tronco.'),
('Rosca Alternada com Halteres', 'musculacao', 'Biceps', 'Halteres', 'Alterne os bracos. Gire o pulso no topo do movimento.'),
('Rosca Martelo', 'musculacao', 'Biceps', 'Halteres', 'Pegada neutra (polegar para cima). Trabalha o braquial e braquiorradial.'),
('Rosca Concentrada', 'musculacao', 'Biceps', 'Halter', 'Apoie o cotovelo na face interna da coxa. Flexione completamente.'),
('Rosca no Cabo (Polia Baixa)', 'musculacao', 'Biceps', 'Cabo', 'Tensao constante no cabo. Flexione os cotovelos ate o queixo.'),
('Rosca Scott (Preacher Curl)', 'musculacao', 'Biceps', 'Barra', 'Apoie os triceps no banco inclinado. Impede o balanco do corpo.'),
('Rosca Inversa', 'musculacao', 'Biceps', 'Barra', 'Pegada pronada. Foca no braquiorradial e antebraco.'),
('Rosca 21', 'musculacao', 'Biceps', 'Barra', '7 reps meio arco inferior + 7 meio arco superior + 7 arco completo.'),
('Chin-up (Rosca na Barra Fixa)', 'musculacao', 'Biceps', 'Barra Fixa', 'Pegada supinada. Puxe o queixo acima da barra ativando biceps.')
ON CONFLICT DO NOTHING;

-- TRICEPS
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Triceps Testa (Skull Crusher)', 'musculacao', 'Triceps', 'Barra', 'Deite no banco. Flexione os cotovelos abaixando a barra proximo a testa.'),
('Triceps Corda (Puxada no Cabo)', 'musculacao', 'Triceps', 'Cabo', 'Polia alta. Puxe a corda para baixo, separando as maos ao final.'),
('Triceps Banco (Dips)', 'musculacao', 'Triceps', 'Banco', 'Apoie as maos no banco. Desca e empurre usando o triceps.'),
('Triceps Frances com Halter', 'musculacao', 'Triceps', 'Halter', 'Segure o halter acima da cabeca. Flexione os cotovelos para atras.'),
('Supino Fechado', 'musculacao', 'Triceps', 'Barra', 'Pegada estreita no supino. Enfatiza os tres feixes do triceps.'),
('Mergulho em Paralelas (Dips)', 'musculacao', 'Triceps', 'Paralelas', 'Suporte nas paralelas. Desca e empurre com o triceps.'),
('Extensao de Triceps com Halteres', 'musculacao', 'Triceps', 'Halter', 'Em pe ou sentado. Flexione e estenda o cotovelo acima da cabeca.'),
('Kickback de Triceps', 'musculacao', 'Triceps', 'Halter', 'Tronco inclinado. Estenda o braco para tras, mantendo o cotovelo fixo.')
ON CONFLICT DO NOTHING;

-- PERNAS
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Agachamento Livre', 'musculacao', 'Pernas', 'Barra', 'Pes na largura dos ombros. Desca ate as coxas ficarem paralelas ao chao.'),
('Agachamento Sumo', 'musculacao', 'Pernas', 'Barra', 'Pes bem abertos, pontas viradas para fora. Foca adutores e gluteos.'),
('Leg Press 45', 'musculacao', 'Pernas', 'Maquina', 'Pes na largura dos quadris. Desca sem deixar os joelhos ultrapassarem as pontas dos pes.'),
('Extensao de Pernas', 'musculacao', 'Pernas', 'Maquina', 'Sentado. Estenda as pernas completamente.'),
('Flexao de Pernas (Leg Curl)', 'musculacao', 'Pernas', 'Maquina', 'Deitado. Traga os calcanhares em direcao ao gluteo.'),
('Avanco (Lunge) com Halteres', 'musculacao', 'Pernas', 'Halteres', 'De um passo a frente. Desca ate o joelho traseiro quase tocar o chao.'),
('Agachamento Bulgaro', 'musculacao', 'Pernas', 'Halteres', 'Pe traseiro num banco. Agache com o pe dianteiro.'),
('Stiff (Levantamento Terra Rigido)', 'musculacao', 'Pernas', 'Barra', 'Joelhos praticamente estendidos. Incline descendo a barra pelas pernas.'),
('Cadeira Abdutora', 'musculacao', 'Pernas', 'Maquina', 'Afaste as pernas vencendo a resistencia. Trabalha abdutores e gluteos.'),
('Cadeira Adutora', 'musculacao', 'Pernas', 'Maquina', 'Una as pernas vencendo a resistencia. Trabalha adutores e interno da coxa.'),
('Agachamento Hack', 'musculacao', 'Pernas', 'Maquina', 'Costas apoiadas. Agache com os pes a frente do corpo.'),
('Agachamento Goblet', 'musculacao', 'Pernas', 'Halter', 'Segure um halter no peito. Agache com boa profundidade.'),
('Agachamento Frontal', 'musculacao', 'Pernas', 'Barra', 'Barra na frente, nos ombros. Exige mais mobilidade de tornozelo.'),
('Passada Alternada', 'musculacao', 'Pernas', 'Halteres', 'De passos alternados para frente, trabalhando toda a cadeia posterior.')
ON CONFLICT DO NOTHING;

-- GLUTEOS
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Hip Thrust com Barra', 'musculacao', 'Gluteos', 'Barra', 'Costas no banco. Empurre o quadril para cima com a barra na dobra da coxa.'),
('Hip Thrust com Halter', 'musculacao', 'Gluteos', 'Halter', 'Versao com halter do hip thrust. Excelente para gluteo maximo.'),
('Elevacao Pelvica (Ponte de Gluteos)', 'musculacao', 'Gluteos', 'Livre', 'Deitado de costas. Eleve o quadril contraindo os gluteos.'),
('Abducao de Quadril com Elastico', 'musculacao', 'Gluteos', 'Elastico', 'Elastico acima dos joelhos. Abra as pernas resistindo a tensao.'),
('Passada Lateral com Elastico', 'musculacao', 'Gluteos', 'Elastico', 'Elastico nos tornozelos. Ande lateralmente mantendo a tensao.'),
('Kickback no Cabo (Extensao de Quadril)', 'musculacao', 'Gluteos', 'Cabo', 'Estenda a perna para tras no cabo preso ao tornozelo.'),
('Step-up com Halteres', 'musculacao', 'Gluteos', 'Halteres', 'Suba num banco com halteres nas maos. Trabalha gluteo e quadriceps.'),
('Agachamento Sumo com Kettlebell', 'musculacao', 'Gluteos', 'Kettlebell', 'Segure o kettlebell no centro. Pes bem abertos.')
ON CONFLICT DO NOTHING;

-- ABDOMEN
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Abdominal Supra', 'musculacao', 'Abdomen', 'Livre', 'Deitado, joelhos dobrados. Eleve o tronco em direcao aos joelhos.'),
('Abdominal Infra (Elevacao de Pernas)', 'musculacao', 'Abdomen', 'Livre', 'Deitado. Eleve as pernas retas ate 90 graus e desca lentamente.'),
('Prancha (Plank)', 'musculacao', 'Abdomen', 'Livre', 'Apoio nos antebracos e pontas dos pes. Mantenha o corpo alinhado.'),
('Prancha Lateral', 'musculacao', 'Abdomen', 'Livre', 'Apoio num antebraco e pe lateral. Eleve o quadril.'),
('Russian Twist', 'musculacao', 'Abdomen', 'Halter', 'Sentado, tronco inclinado. Gire o tronco de lado a lado.'),
('Crunch na Polia', 'musculacao', 'Abdomen', 'Cabo', 'Ajoelhado. Contraia o abdomen puxando a polia alta.'),
('Mountain Climber', 'musculacao', 'Abdomen', 'Livre', 'Posicao de flexao. Alterne trazendo os joelhos ao peito rapidamente.'),
('Abdominal em V (V-up)', 'musculacao', 'Abdomen', 'Livre', 'Eleve simultaneamente pernas e tronco formando um V.'),
('Hollow Body Hold', 'musculacao', 'Abdomen', 'Livre', 'Deitado. Eleve levemente bracos e pernas e segure com o core contraido.'),
('Dead Bug', 'musculacao', 'Abdomen', 'Livre', 'Deitado. Estenda braco e perna opostos mantendo a lombar colada ao chao.'),
('Flutter Kick', 'musculacao', 'Abdomen', 'Livre', 'Deitado, pernas elevadas. Alterne movimentos de perna rapidos.'),
('Roda Abdominal (Ab Wheel)', 'musculacao', 'Abdomen', 'Roda', 'Ajoelhado. Role a roda para frente e retorne usando o core.')
ON CONFLICT DO NOTHING;

-- CARDIO
INSERT INTO community_exercises (name, category, muscle_group, equipment, instructions) VALUES
('Burpee', 'cardio', 'Cardio', 'Livre', 'Agache, salte para prancha, faca flexao, volte e salte com os bracos acima da cabeca.'),
('Jump Squat', 'cardio', 'Cardio', 'Livre', 'Agache e salte explosivamente. Absorva o impacto ao pousar com os joelhos dobrados.'),
('Jumping Jack', 'cardio', 'Cardio', 'Livre', 'Salte abrindo pernas e bracos simultaneamente e volte.'),
('High Knees (Corrida no Lugar)', 'cardio', 'Cardio', 'Livre', 'Corra elevando os joelhos acima do quadril em ritmo acelerado.'),
('Box Jump', 'cardio', 'Cardio', 'Livre', 'Salte sobre uma caixa ou banco e desca controlado.'),
('Corda Naval (Battle Rope)', 'cardio', 'Cardio', 'Corda', 'Segure as cordas e faca ondas alternadas com os bracos com ritmo intenso.'),
('Sprint 20m', 'cardio', 'Cardio', 'Livre', 'Corra em velocidade maxima por 20 metros. Recupere e repita.'),
('Shuttle Run', 'cardio', 'Cardio', 'Livre', 'Corra entre dois cones. Toque o chao em cada ponto de virada.'),
('Skipping (Salto com Corda)', 'cardio', 'Cardio', 'Corda', 'Salte sobre a corda em ritmo continuo, mantendo os pes proximos ao chao.'),
('Stair Climbing', 'cardio', 'Cardio', 'Livre', 'Suba e desca escadas repetidamente em ritmo aerobico.'),
('Polichinelo', 'cardio', 'Cardio', 'Livre', 'Variacao do jumping jack. Coordenacao de bracos e pernas.')
ON CONFLICT DO NOTHING;
