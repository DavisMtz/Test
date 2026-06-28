/**
 * Items.gs
 * ----------------------------------------------------------------------------
 * Banco de ítems del instrumento. Cada módulo se apoya en un marco teórico:
 *
 *  - PERSONALIDAD ......... HEXACO (Ashton & Lee) + mapeo a Big Five / OCEAN.
 *                            Ítems de estilo IPIP (dominio público), formato
 *                            Likert (1-5) y bloques de Elección Forzada (ipsativo).
 *  - COGNITIVO ............ Teoría CHC (Cattell-Horn-Carroll). Estratos:
 *                            Gf (inteligencia fluida) y Gc (cristalizada).
 *                            Ítems con parámetros TRI/IRT 2PL (a = discriminación,
 *                            b = dificultad) para estimación de habilidad por EAP.
 *  - EMOCIONAL (rasgo) .... TEIQue (Petrides). 4 factores: Bienestar,
 *                            Autocontrol, Emocionalidad, Sociabilidad. Likert.
 *  - EMOCIONAL (habilidad)  MSCEIT (Mayer-Salovey-Caruso). Juicio situacional
 *                            (SJT) con clave de consenso y crédito parcial.
 *  - SIGILOSO ............. Evaluación Sigilosa (Shute). Escenarios/retos donde
 *                            se infieren rasgos a partir de elecciones y proceso.
 *
 * NOTA SOBRE NORMAS: los parámetros y baremos incluidos son ilustrativos y
 * suficientes para una demo rigurosa en su lógica. Para uso aplicado real deben
 * recalibrarse con una muestra (ver README, sección "Rigor y limitaciones").
 * ----------------------------------------------------------------------------
 */

// Dominios HEXACO y su equivalencia aproximada con Big Five (OCEAN).
var HEXACO_DOMAINS = {
  H: { name: 'Honestidad-Humildad', ocean: null,  oceanName: '(exclusivo HEXACO)' },
  E: { name: 'Emocionalidad',       ocean: 'N',   oceanName: 'Neuroticismo' },
  X: { name: 'Extraversión',        ocean: 'E',   oceanName: 'Extraversión' },
  A: { name: 'Amabilidad',          ocean: 'A',   oceanName: 'Amabilidad' },
  C: { name: 'Responsabilidad',     ocean: 'C',   oceanName: 'Responsabilidad' },
  O: { name: 'Apertura',            ocean: 'O',   oceanName: 'Apertura a la experiencia' }
};

var TEIQUE_FACTORS = {
  wellbeing:   { name: 'Bienestar' },
  selfcontrol: { name: 'Autocontrol' },
  emotionality:{ name: 'Emocionalidad' },
  sociability: { name: 'Sociabilidad' }
};

var MSCEIT_BRANCHES = {
  perceiving:   { name: 'Percepción emocional' },
  using:        { name: 'Uso/Facilitación emocional' },
  understanding:{ name: 'Comprensión emocional' },
  managing:     { name: 'Gestión emocional' }
};

/**
 * Punto de entrada usado por el cliente y por el motor de puntuación.
 * Devuelve la estructura completa del instrumento (sin claves de respuesta
 * para los ítems con respuesta correcta: esas se resuelven en el servidor).
 */
function getInstrument() {
  return {
    version: '1.0.0',
    modules: [
      { id: 'personality', title: 'Cómo eres', subtitle: 'Rasgos de personalidad (HEXACO / Big Five)' },
      { id: 'cognitive',   title: 'Cómo piensas', subtitle: 'Razonamiento y conocimiento (CHC: Gf / Gc)' },
      { id: 'emotional',   title: 'Cómo sientes', subtitle: 'Inteligencia emocional (TEIQue / MSCEIT)' },
      { id: 'stealth',     title: 'Cómo decides', subtitle: 'Retos situacionales (evaluación sigilosa)' }
    ],
    items: PERSONALITY_ITEMS
      .concat(FORCED_CHOICE_BLOCKS)
      .concat(COGNITIVE_ITEMS)
      .concat(EI_TRAIT_ITEMS)
      .concat(EI_ABILITY_ITEMS)
      .concat(STEALTH_ITEMS)
      .map(stripAnswers_)
  };
}

/** Quita información sensible (clave correcta / pesos) antes de enviar al cliente. */
function stripAnswers_(item) {
  var clone = JSON.parse(JSON.stringify(item));
  delete clone.answer;
  delete clone.irt;
  delete clone.key;
  if (clone.options) {
    clone.options = clone.options.map(function (o) {
      var c = JSON.parse(JSON.stringify(o));
      delete c.signals;     // pesos stealth
      delete c.weight;      // crédito parcial SJT
      delete c.domain;      // keying ipsativo
      delete c.keyed;
      return c;
    });
  }
  delete clone.keyed;
  delete clone.domain;
  delete clone.model;
  delete clone.facet;
  delete clone.stratum;
  delete clone.narrow;
  delete clone.factor;
  delete clone.branch;
  return clone;
}

/** Devuelve el banco COMPLETO (con claves) para uso interno del servidor. */
function getFullBank_() {
  return PERSONALITY_ITEMS
    .concat(FORCED_CHOICE_BLOCKS)
    .concat(COGNITIVE_ITEMS)
    .concat(EI_TRAIT_ITEMS)
    .concat(EI_ABILITY_ITEMS)
    .concat(STEALTH_ITEMS);
}

/* ===========================================================================
 * 1) PERSONALIDAD — Likert HEXACO/IPIP (escala 1-5)
 *    keyed: +1 directo, -1 inverso (se recodifica en Scoring).
 * ========================================================================= */
var LIKERT_5 = { type: 'likert', scale: 5,
  anchors: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo'] };

var PERSONALITY_ITEMS = [
  // Honestidad-Humildad (H)
  li_('P_H1', 'No fingiría agradarle a alguien solo para obtener un favor.', 'H', +1),
  li_('P_H2', 'Si pudiera quedarme con algo de valor que no es mío sin que nadie lo notara, lo haría.', 'H', -1),
  li_('P_H3', 'Quiero que la gente sepa que soy una persona importante de alto estatus.', 'H', -1),
  li_('P_H4', 'Me incomoda recibir elogios que no merezco.', 'H', +1),
  // Emocionalidad (E ~ Neuroticismo)
  li_('P_E1', 'Me preocupo menos que la mayoría de la gente.', 'E', -1),
  li_('P_E2', 'A veces no puedo evitar preocuparme por cosas pequeñas.', 'E', +1),
  li_('P_E3', 'Necesito apoyo emocional de otras personas cuando estoy bajo presión.', 'E', +1),
  li_('P_E4', 'Rara vez siento miedo, incluso en situaciones peligrosas.', 'E', -1),
  // Extraversión (X)
  li_('P_X1', 'Disfruto siendo el centro de atención en reuniones sociales.', 'X', +1),
  li_('P_X2', 'En grupos grandes suelo ser quien inicia las conversaciones.', 'X', +1),
  li_('P_X3', 'Me siento con poca energía la mayor parte del tiempo.', 'X', -1),
  li_('P_X4', 'Prefiero pasar el tiempo solo antes que en fiestas concurridas.', 'X', -1),
  // Amabilidad (A)
  li_('P_A1', 'Tiendo a perdonar con facilidad a quienes me han tratado mal.', 'A', +1),
  li_('P_A2', 'Me cuesta controlar mi temperamento cuando algo me molesta.', 'A', -1),
  li_('P_A3', 'Suelo ser flexible y llegar a acuerdos en los desacuerdos.', 'A', +1),
  li_('P_A4', 'Tengo opiniones críticas fuertes sobre cómo deberían actuar los demás.', 'A', -1),
  // Responsabilidad / Conciencia (C)
  li_('P_C1', 'Planifico mis tareas con anticipación y rara vez improviso.', 'C', +1),
  li_('P_C2', 'A menudo dejo mis cosas desordenadas.', 'C', -1),
  li_('P_C3', 'Me esfuerzo por alcanzar la excelencia en todo lo que hago.', 'C', +1),
  li_('P_C4', 'Pospongo las decisiones difíciles más de lo que debería.', 'C', -1),
  // Apertura (O)
  li_('P_O1', 'Me fascina aprender sobre temas abstractos o filosóficos.', 'O', +1),
  li_('P_O2', 'Rara vez me detengo a contemplar el arte o la naturaleza.', 'O', -1),
  li_('P_O3', 'Disfruto imaginando escenarios y posibilidades poco convencionales.', 'O', +1),
  li_('P_O4', 'Prefiero la rutina conocida antes que probar cosas nuevas.', 'O', -1)
];

function li_(id, text, domain, keyed) {
  return {
    id: id, module: 'personality', type: 'likert', scale: 5,
    anchors: LIKERT_5.anchors, text: text,
    domain: domain, model: ['HEXACO', 'BigFive'], keyed: keyed
  };
}

/* ===========================================================================
 * 2) PERSONALIDAD — Elección Forzada (ipsativa)
 *    Cada bloque presenta 4 frases de dominios distintos; el usuario elige
 *    la MÁS y la MENOS parecida a sí mismo. Reduce sesgo de aquiescencia.
 * ========================================================================= */
var FORCED_CHOICE_BLOCKS = [
  fc_('FC1', [
    { text: 'Me aseguro de que todo quede ordenado y planificado.', domain: 'C' },
    { text: 'Busco conocer gente nueva siempre que puedo.',         domain: 'X' },
    { text: 'Me conmueven con facilidad las emociones de otros.',    domain: 'E' },
    { text: 'Me niego a sacar ventaja injusta de los demás.',        domain: 'H' }
  ]),
  fc_('FC2', [
    { text: 'Me gusta explorar ideas nuevas y poco convencionales.', domain: 'O' },
    { text: 'Perdono rápido y evito los conflictos.',                domain: 'A' },
    { text: 'Mantengo la calma incluso bajo mucha presión.',         domain: 'E', keyed: -1 },
    { text: 'Trabajo duro para destacar y lograr metas altas.',      domain: 'C' }
  ]),
  fc_('FC3', [
    { text: 'Disfruto liderar y hablar frente a grupos.',            domain: 'X' },
    { text: 'Evito presumir mis logros o estatus.',                  domain: 'H' },
    { text: 'Me cuesta dejar de pensar en mis preocupaciones.',      domain: 'E' },
    { text: 'Aprecio profundamente el arte, la música o las ideas.', domain: 'O' }
  ])
];

function fc_(id, options) {
  return {
    id: id, module: 'personality', type: 'forced_choice',
    prompt: 'Elige la frase MÁS parecida y la MENOS parecida a ti.',
    options: options.map(function (o) {
      return { text: o.text, domain: o.domain, keyed: (o.keyed === -1 ? -1 : 1) };
    })
  };
}

/* ===========================================================================
 * 3) COGNITIVO — CHC: Gf (fluida) y Gc (cristalizada)
 *    irt: { a: discriminación, b: dificultad } modelo logístico 2PL.
 *    answer: índice de la opción correcta.
 * ========================================================================= */
var COGNITIVE_ITEMS = [
  // --- Gf: razonamiento inductivo / cuantitativo (series, matrices, analogías) ---
  cog_('G_F1', 'Gf', 'I', 'Completa la serie: 2, 4, 8, 16, ?',
       ['24', '32', '20', '64'], 1, { a: 1.1, b: -1.0 }),
  cog_('G_F2', 'Gf', 'I', 'Completa la serie: 1, 1, 2, 3, 5, 8, ?',
       ['11', '12', '13', '10'], 2, { a: 1.3, b: -0.2 }),
  cog_('G_F3', 'Gf', 'RQ', 'Si 3 máquinas tardan 3 minutos en fabricar 3 piezas, ¿cuánto tardan 100 máquinas en fabricar 100 piezas?',
       ['100 minutos', '3 minutos', '33 minutos', '300 minutos'], 1, { a: 1.6, b: 0.4 }),
  cog_('G_F4', 'Gf', 'I', 'PÁJARO es a BANDADA como LOBO es a:',
       ['Jauría', 'Establo', 'Rebaño', 'Enjambre'], 0, { a: 1.2, b: 0.1 }),
  cog_('G_F5', 'Gf', 'I', 'Matriz: si ▲→▼ y ◀→▶, entonces ◣→?',
       ['◤', '◥', '◢', '◣'], 1, { a: 1.4, b: 0.9 }),
  cog_('G_F6', 'Gf', 'RQ', 'Un estanque se cubre de nenúfares que duplican su área cada día. Si tarda 48 días en cubrirse, ¿qué día estaba cubierto a la mitad?',
       ['Día 24', 'Día 47', 'Día 46', 'Día 12'], 1, { a: 1.8, b: 1.2 }),
  // --- Gc: conocimiento verbal / léxico / cultural ---
  cog_('G_C1', 'Gc', 'VL', 'Sinónimo de "EFÍMERO":',
       ['Eterno', 'Pasajero', 'Sólido', 'Brillante'], 1, { a: 1.2, b: -0.6 }),
  cog_('G_C2', 'Gc', 'VL', '¿Qué significa "IDIOSINCRASIA"?',
       ['Enfermedad rara', 'Rasgos propios de un individuo o grupo', 'Falta de lógica', 'Idea fija'], 1, { a: 1.5, b: 0.6 }),
  cog_('G_C3', 'Gc', 'KO', '¿Qué científica recibió dos premios Nobel en disciplinas distintas?',
       ['Rosalind Franklin', 'Marie Curie', 'Ada Lovelace', 'Lise Meitner'], 1, { a: 1.1, b: -0.1 }),
  cog_('G_C4', 'Gc', 'VL', 'Antónimo de "PROLIJO":',
       ['Detallado', 'Escaso', 'Cuidadoso', 'Abundante'], 1, { a: 1.3, b: 0.7 }),
  cog_('G_C5', 'Gc', 'KO', 'El término "entropía" pertenece originalmente a:',
       ['La economía', 'La termodinámica', 'La gramática', 'La pintura'], 1, { a: 1.2, b: 0.2 })
];

function cog_(id, stratum, narrow, text, options, answer, irt) {
  return {
    id: id, module: 'cognitive', type: 'mcq',
    stratum: stratum, narrow: narrow, text: text,
    options: options.map(function (t) { return { text: t }; }),
    answer: answer, irt: irt, timed: true
  };
}

/* ===========================================================================
 * 4) EMOCIONAL (rasgo) — TEIQue (Likert 1-7)
 * ========================================================================= */
var EI_TRAIT_ITEMS = [
  tei_('T_W1', 'En general, me siento satisfecho/a con mi vida.', 'wellbeing', +1),
  tei_('T_W2', 'Creo que tengo muchas cualidades positivas.', 'wellbeing', +1),
  tei_('T_W3', 'Frecuentemente veo el futuro con pesimismo.', 'wellbeing', -1),
  tei_('T_S1', 'Soy capaz de manejar el estrés con eficacia.', 'selfcontrol', +1),
  tei_('T_S2', 'Tiendo a explotar cuando estoy enfadado/a.', 'selfcontrol', -1),
  tei_('T_S3', 'Cuando me presionan, suelo mantener la cabeza fría.', 'selfcontrol', +1),
  tei_('T_E1', 'Me resulta fácil ponerme en el lugar de otra persona.', 'emotionality', +1),
  tei_('T_E2', 'Me cuesta expresar lo que siento a las personas cercanas.', 'emotionality', -1),
  tei_('T_E3', 'Comprendo bien las emociones de quienes me rodean.', 'emotionality', +1),
  tei_('T_O1', 'Me considero hábil para influir en las emociones de otros.', 'sociability', +1),
  tei_('T_O2', 'Me cuesta defender mis derechos ante los demás.', 'sociability', -1),
  tei_('T_O3', 'Soy capaz de relacionarme con personas muy distintas a mí.', 'sociability', +1)
];

function tei_(id, text, factor, keyed) {
  return {
    id: id, module: 'emotional', submodule: 'trait', type: 'likert', scale: 7,
    anchors: ['Totalmente en desacuerdo', '', '', 'Neutral', '', '', 'Totalmente de acuerdo'],
    text: text, factor: factor, keyed: keyed
  };
}

/* ===========================================================================
 * 5) EMOCIONAL (habilidad) — MSCEIT / Juicio Situacional con crédito parcial.
 *    key: pesos de consenso (0..1) por opción. La puntuación es la suma
 *    ponderada de las opciones marcadas / máximo posible.
 * ========================================================================= */
var EI_ABILITY_ITEMS = [
  sjt_('A_M1', 'managing',
    'Un compañero de equipo está visiblemente frustrado porque su idea fue rechazada en una reunión. ¿Qué tan eficaz es cada acción para mejorar la situación? (elige la MÁS eficaz)',
    [
      { text: 'Reconocer su esfuerzo en privado y proponer integrar parte de su idea.', weight: 1.0 },
      { text: 'Decirle que no se lo tome personal y siga adelante.',                    weight: 0.3 },
      { text: 'Ignorarlo para no incomodarlo más.',                                     weight: 0.1 },
      { text: 'Defender públicamente la decisión para zanjar el tema.',                 weight: 0.2 }
    ]),
  sjt_('A_U1', 'understanding',
    'Una persona pasa de la "anticipación" a la "sorpresa" y luego a la "decepción". ¿Qué situación explica mejor esa secuencia?',
    [
      { text: 'Esperaba un ascenso, le dieron uno inesperado a otro y resultó peor de lo que creía.', weight: 1.0 },
      { text: 'Recibió justo lo que esperaba sin novedad.',                                            weight: 0.1 },
      { text: 'Estuvo enojada todo el tiempo sin cambios.',                                            weight: 0.0 },
      { text: 'Sintió alegría creciente y sostenida.',                                                  weight: 0.1 }
    ]),
  sjt_('A_P1', 'perceiving',
    'En una foto, una persona sonríe pero sus cejas están tensas y sus hombros encogidos. ¿Qué es lo más probable que sienta?',
    [
      { text: 'Alegría plena y relajación.',                       weight: 0.1 },
      { text: 'Cordialidad que oculta tensión o incomodidad.',     weight: 1.0 },
      { text: 'Enojo abierto.',                                    weight: 0.2 },
      { text: 'Aburrimiento total.',                               weight: 0.1 }
    ]),
  sjt_('A_F1', 'using',
    'Vas a realizar una lluvia de ideas creativa para un proyecto nuevo. ¿Qué estado de ánimo facilita MÁS esa tarea?',
    [
      { text: 'Un estado positivo y ligeramente elevado.',  weight: 1.0 },
      { text: 'Un estado de enojo intenso.',                weight: 0.2 },
      { text: 'Tristeza profunda.',                          weight: 0.1 },
      { text: 'Miedo agudo.',                                weight: 0.1 }
    ])
];

function sjt_(id, branch, text, options) {
  return {
    id: id, module: 'emotional', submodule: 'ability', type: 'sjt',
    branch: branch, text: text,
    options: options.map(function (o) { return { text: o.text, weight: o.weight }; }),
    key: options.map(function (o) { return o.weight; })
  };
}

/* ===========================================================================
 * 6) EVALUACIÓN SIGILOSA (Shute) — escenarios interactivos.
 *    Cada opción emite "signals": pesos hacia rasgos (HEXACO o EI). Además
 *    se captura el tiempo de respuesta como evidencia de proceso (deliberación
 *    vs. impulsividad). No hay respuesta "correcta".
 * ========================================================================= */
var STEALTH_ITEMS = [
  st_('S1',
    'Estás a punto de entregar un proyecto importante y descubres un error que casi nadie notaría. Faltan 10 minutos. ¿Qué haces?',
    [
      { text: 'Lo corrijo aunque entregue un poco tarde; quiero que esté bien hecho.', signals: { C: 1.0, H: 0.5 } },
      { text: 'Lo entrego a tiempo; el error es menor y cumplir el plazo importa más.', signals: { C: 0.3, X: 0.3 } },
      { text: 'Aviso del error y negocio una pequeña prórroga.',                        signals: { H: 1.0, A: 0.5 } },
      { text: 'Lo entrego y, si alguien lo nota, improviso una explicación.',           signals: { H: -0.5, C: -0.3 } }
    ]),
  st_('S2',
    'En un juego de equipo puedes quedarte con una recompensa grande para ti solo, o repartir una recompensa total mayor entre todos. ¿Qué eliges?',
    [
      { text: 'Reparto: el grupo gana más en conjunto.',                 signals: { A: 1.0, H: 1.0 } },
      { text: 'Me quedo con la recompensa grande para mí.',              signals: { H: -1.0, A: -0.5 } },
      { text: 'Propongo una regla de reparto y dejo que el grupo vote.', signals: { O: 0.5, A: 0.7, X: 0.5 } }
    ]),
  st_('S3',
    'Un amigo te cuenta, muy nervioso, que cometió un error grave en su trabajo. ¿Cuál es tu primera reacción?',
    [
      { text: 'Le pregunto cómo se siente antes de hablar de soluciones.', signals: { emotionality: 1.0, A: 0.5 } },
      { text: 'Le doy de inmediato una lista de pasos para resolverlo.',    signals: { C: 0.7, emotionality: 0.2 } },
      { text: 'Le digo que no es para tanto para calmarlo.',               signals: { emotionality: -0.3, selfcontrol: 0.3 } },
      { text: 'Le ayudo a respirar y ordenar sus ideas con calma.',        signals: { selfcontrol: 1.0, emotionality: 0.6 } }
    ])
];

function st_(id, text, options) {
  return {
    id: id, module: 'stealth', type: 'scenario', text: text,
    options: options.map(function (o) { return { text: o.text, signals: o.signals }; }),
    captureTime: true
  };
}
