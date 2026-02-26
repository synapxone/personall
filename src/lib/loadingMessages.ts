export const LOADING_MESSAGES = [
    "Pers está consultando os deuses da hipertrofia...",
    "Calculando se isso brota músculo ou barriga...",
    "Analisando se esse prato merece um 'cheat day'...",
    "Contando as calorias... 1, 2, 3... são muitas!",
    "Verificando se tem proteína o suficiente para esse bíceps...",
    "Escaneando o prato... detectando níveis perigosos de delícia.",
    "Quase lá! Só mais um segundo enquanto eu julgo sua dieta (brincadeira!).",
    "Pers está verificando se o frango com batata doce está em dia...",
    "Procurando por macros escondidos...",
    "Avaliando o potencial anabólico desse registro...",
    "Consultando a tabela nutricional universal...",
    "Pers está fazendo os cálculos... sem usar os dedos desta vez!"
];

export const getRandomLoadingMessage = () => {
    return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
};
