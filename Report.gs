/**
 * Report.gs
 * ----------------------------------------------------------------------------
 * Genera un informe extenso, estructurado y casi personalizado a partir del
 * perfil puntuado (Scoring.gs). Devuelve un objeto con secciones de texto que
 * el cliente renderiza al finalizar.
 *
 * El texto se construye combinando: nivel por escala, descripciones por banda,
 * interacciones entre rasgos (p. ej., alta Apertura + alta Responsabilidad),
 * y recomendaciones de desarrollo. No usa IA externa: todo es determinista y
 * trazable a la teoría (HEXACO/Big Five, CHC, TEIQue/MSCEIT, evaluación sigilosa).
 * ----------------------------------------------------------------------------
 */

function buildReport(profile) {
  var name = (profile.participant && profile.participant.name) || 'Participante';
  return {
    title: 'Perfil integral de ' + name,
    generatedAt: profile.completedAt,
    intro: reportIntro_(profile, name),
    archetype: buildArchetype_(profile),       // arquetipo memorable (titular humano)
    headline: buildHeadline_(profile, name),   // resumen en lenguaje natural
    snapshot: buildSnapshot_(profile),         // tarjetas escaneables con lo esencial
    highlights: buildHighlights_(profile),     // fortalezas + zonas de crecimiento
    metrics: buildMetrics_(profile),
    sections: [
      personalitySection_(profile),
      cognitiveSection_(profile),
      emotionalSection_(profile),
      stealthSection_(profile),
      integrativeSection_(profile),
      recommendationsSection_(profile)
    ],
    disclaimer: 'Este informe tiene fines de autoconocimiento y demostración. ' +
      'No constituye un diagnóstico clínico ni una medida de selección. Los baremos ' +
      'son ilustrativos y deben calibrarse con una muestra normativa antes de cualquier uso aplicado.'
  };
}

/**
 * Datos numéricos compactos para los gráficos animados del informe (cliente).
 */
function buildMetrics_(profile) {
  var d = profile.personality.domains;
  var order = ['H', 'E', 'X', 'A', 'C', 'O'];
  var palette = { H: '#7c9cff', E: '#ff7ab8', X: '#ffb648', A: '#33d6a6', C: '#5b8cff', O: '#9a6bff' };
  var hexaco = order.map(function (k) {
    var x = d[k];
    var pct = (x.percentileAdjusted != null) ? x.percentileAdjusted : x.percentile;
    return { code: k, name: x.name, percentile: pct, basePercentile: x.percentile,
             level: x.level, ocean: x.ocean, oceanName: x.oceanName, color: palette[k] };
  });
  var c = profile.cognitive;
  var cognitive = [
    { key: 'g',  label: 'Capacidad general (g)',     iq: c.g.iq,  percentile: c.g.percentile,  level: c.g.level,  color: '#5b8cff' },
    { key: 'Gf', label: 'Razonamiento fluido (Gf)',  iq: c.Gf.iq, percentile: c.Gf.percentile, level: c.Gf.level, color: '#33d6a6' },
    { key: 'Gc', label: 'Conocimiento (Gc)',         iq: c.Gc.iq, percentile: c.Gc.percentile, level: c.Gc.level, color: '#9a6bff' }
  ];
  var tf = profile.emotional.trait.factors;
  var eiTrait = Object.keys(tf).map(function (k) {
    return { name: tf[k].name, percentile: tf[k].percentile, level: tf[k].level };
  });
  var br = profile.emotional.ability.branches;
  var eiAbility = Object.keys(br).filter(function (k) { return br[k].score100 != null; })
    .map(function (k) { return { name: br[k].name, score100: br[k].score100 }; });

  return {
    hexaco: hexaco,
    cognitive: cognitive,
    eiTraitGlobal: profile.emotional.trait.global.percentile,
    eiTrait: eiTrait,
    eiAbilityGlobal: profile.emotional.ability.global100,
    eiAbility: eiAbility,
    stealthStyle: profile.stealth.deliberationStyle,
    decision: { style: profile.stealth.deliberationStyle, avgMs: profile.stealth.avgDeliberationMs }
  };
}

/* ===========================================================================
 * Capa narrativa — convierte los números en un relato humano y escaneable.
 * Todo es determinista y trazable a la teoría (sin IA externa): el arquetipo
 * surge de combinaciones de percentiles; el titular y las tarjetas resumen lo
 * esencial en lenguaje sencillo; las fortalezas/crecimiento ordenan las facetas.
 * ========================================================================= */

/** Percentil efectivo (ajustado por evaluación sigilosa si existe). */
function pAdj_(x) { return (x && x.percentileAdjusted != null) ? x.percentileAdjusted : (x ? x.percentile : 0); }
function cap_(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s; }

// Catálogo de arquetipos: el primero cuya condición se cumple gana.
var ARCHETYPES_ = [
  { emoji: '🚀', name: 'Innovador disciplinado', tagline: 'Ideas que sí se ejecutan',
    test: function (g) { return g.O >= 65 && g.C >= 65; },
    blurb: 'Combinas una mente abierta y curiosa con la disciplina para llevar las ideas hasta el final. No solo imaginas: construyes.' },
  { emoji: '🤝', name: 'Conector empático', tagline: 'Tu fuerza está en las personas',
    test: function (g) { return g.X >= 60 && (g.eiTrait >= 60 || g.A >= 60); },
    blurb: 'Te mueves con naturalidad entre la gente, lees el ambiente y construyes relaciones con facilidad. Las personas confían en ti.' },
  { emoji: '🧭', name: 'Estratega sereno', tagline: 'Cabeza fría, rumbo claro',
    test: function (g) { return g.C >= 60 && g.selfcontrol >= 60; },
    blurb: 'Mantienes la calma bajo presión y planificas con cabeza. Cuando todo se acelera, tú marcas el rumbo.' },
  { emoji: '🔭', name: 'Explorador curioso', tagline: 'Aprender es tu superpoder',
    test: function (g) { return g.O >= 60 && g.Gf >= 60; },
    blurb: 'Te fascina entender cómo funcionan las cosas y aprendes rápido. La novedad te energiza en lugar de intimidarte.' },
  { emoji: '🛡️', name: 'Aliado confiable', tagline: 'Integridad y cooperación',
    test: function (g) { return g.H >= 60 && g.A >= 60; },
    blurb: 'Juegas limpio y priorizas la armonía. Eres la persona en quien los demás saben que pueden apoyarse.' },
  { emoji: '💗', name: 'Alma sensible', tagline: 'Sientes hondo y conectas',
    test: function (g) { return g.E >= 60 && g.emotionality >= 60; },
    blurb: 'Percibes matices emocionales que a otros se les escapan y empatizas con facilidad. Tu sensibilidad es una forma de inteligencia.' },
  { emoji: '📚', name: 'Mente metódica', tagline: 'Conocimiento que aplicas bien',
    test: function (g) { return g.C >= 60 && g.Gc >= 60; },
    blurb: 'Acumulas conocimiento y lo aplicas con orden y constancia. Tu base sólida te hace fiable y eficaz.' }
];

// Arquetipo de reserva según el rasgo HEXACO más alto.
var TRAIT_ARCHETYPE_ = {
  H: { emoji: '🕊️', name: 'Espíritu íntegro', tagline: 'La honestidad como brújula', blurb: 'La sinceridad y la modestia guían tu forma de estar en el mundo.' },
  E: { emoji: '🌊', name: 'Corazón sensible', tagline: 'Emoción a flor de piel', blurb: 'Vives las emociones con intensidad y valoras la conexión cercana.' },
  X: { emoji: '☀️', name: 'Energía social', tagline: 'Brillas entre la gente', blurb: 'La interacción te recarga y disfrutas del protagonismo.' },
  A: { emoji: '🤲', name: 'Espíritu conciliador', tagline: 'Tiendes puentes', blurb: 'Priorizas la armonía y perdonas con facilidad.' },
  C: { emoji: '🎯', name: 'Mente organizada', tagline: 'Orden y constancia', blurb: 'Planificas, te enfocas y persigues la excelencia.' },
  O: { emoji: '🎨', name: 'Mente abierta', tagline: 'Curiosidad sin límites', blurb: 'Las ideas, el arte y lo nuevo te atraen de forma natural.' }
};

function buildArchetype_(profile) {
  var d = profile.personality.domains;
  var f = profile.emotional.trait.factors;
  var g = {
    H: pAdj_(d.H), E: pAdj_(d.E), X: pAdj_(d.X), A: pAdj_(d.A), C: pAdj_(d.C), O: pAdj_(d.O),
    Gf: profile.cognitive.Gf.percentile, Gc: profile.cognitive.Gc.percentile,
    eiTrait: profile.emotional.trait.global.percentile,
    selfcontrol: pAdj_(f.selfcontrol), emotionality: pAdj_(f.emotionality)
  };
  for (var i = 0; i < ARCHETYPES_.length; i++) {
    if (ARCHETYPES_[i].test(g)) {
      var a = ARCHETYPES_[i];
      return { emoji: a.emoji, name: a.name, tagline: a.tagline, blurb: a.blurb };
    }
  }
  // Reserva: arquetipo del rasgo dominante.
  var topName = profile.summary.topTraits[0].name;
  var code = 'O';
  Object.keys(d).forEach(function (k) { if (d[k].name === topName) code = k; });
  var t = TRAIT_ARCHETYPE_[code] || TRAIT_ARCHETYPE_.O;
  return { emoji: t.emoji, name: t.name, tagline: t.tagline, blurb: t.blurb };
}

function buildHeadline_(profile, name) {
  var s = profile.summary;
  var t = s.topTraits.map(function (x) { return x.name.toLowerCase(); });
  var cog = profile.cognitive.g.level.toLowerCase();
  return 'En pocas palabras, ' + name + ': destacas por tu ' + t[0] +
    (t[1] ? ' y tu ' + t[1] : '') + ', con una capacidad cognitiva en nivel ' + cog +
    ' y una inteligencia emocional en el percentil ' + s.ei_trait_pct + '. ' +
    'Abajo verás qué significa cada parte —de un vistazo y, si quieres, en profundidad.';
}

function buildSnapshot_(profile) {
  var s = profile.summary;
  var top = s.topTraits[0];
  var tiles = [
    { icon: '🌟', label: 'Tu rasgo más marcado', value: top.name, caption: 'Percentil ' + top.percentile, color: '#7c9cff' },
    { icon: '🧠', label: 'Capacidad general (g)', value: 'CI ' + s.g_iq, caption: profile.cognitive.g.level, color: '#33d6a6' },
    { icon: '💗', label: 'Inteligencia emocional', value: 'P' + s.ei_trait_pct, caption: profile.emotional.trait.global.level, color: '#ff7ab8' }
  ];
  var style = profile.stealth.deliberationStyle;
  if (style) {
    var icon = style === 'reflexivo' ? '🧩' : (style === 'impulsivo' ? '⚡' : '⚖️');
    var cap = profile.stealth.avgDeliberationMs ? ('≈ ' + Math.round(profile.stealth.avgDeliberationMs / 1000) + ' s por reto') : 'Inferido de tus decisiones';
    tiles.push({ icon: icon, label: 'Estilo de decisión', value: cap_(style), caption: cap, color: '#ffb648' });
  }
  if (s.ei_ability_100 != null)
    tiles.push({ icon: '🎯', label: 'Habilidad emocional', value: s.ei_ability_100 + '/100', caption: profile.emotional.ability.level || '', color: '#9a6bff' });
  return tiles;
}

// Frases de crecimiento (constructivas) por faceta de personalidad/EI.
var GROWTH_HINT_ = {
  H: 'Cuidar la transparencia en los detalles reforzará la confianza que otros depositan en ti.',
  E: 'Aprender a sostener la calma en los momentos de tensión te dará más estabilidad.',
  X: 'Tomar, a tu ritmo, algo más de iniciativa social puede abrirte oportunidades.',
  A: 'Practicar la flexibilidad y el perdón puede suavizar tus relaciones.',
  C: 'Reforzar pequeños hábitos de orden y planificación multiplicará tus resultados.',
  O: 'Abrirte a ideas y experiencias nuevas enriquecerá tu perspectiva.',
  wellbeing: 'Cultivar el optimismo y reconocer tus logros elevará tu bienestar.',
  selfcontrol: 'Incorporar técnicas de regulación (respiración, pausa) te ayudará con el estrés.',
  emotionality: 'Nombrar y expresar lo que sientes fortalecerá tu conexión con otros.',
  sociability: 'Practicar la asertividad en entornos seguros reforzará tu soltura social.'
};

function buildHighlights_(profile) {
  var d = profile.personality.domains, f = profile.emotional.trait.factors;
  var facets = [];
  Object.keys(d).forEach(function (k) {
    facets.push({ name: d[k].name, p: pAdj_(d[k]), kind: 'personality', code: k });
  });
  Object.keys(f).forEach(function (k) {
    facets.push({ name: f[k].name, p: pAdj_(f[k]), kind: 'ei', code: k });
  });
  var high = facets.slice().sort(function (a, b) { return b.p - a.p; });
  var low = facets.slice().sort(function (a, b) { return a.p - b.p; });

  function strongText(x) {
    return x.kind === 'personality' ? DOMAIN_TEXT[x.code].high : EI_FACTOR_TEXT[x.code].high;
  }
  var strengths = high.slice(0, 3).map(function (x) {
    return { icon: '✨', title: x.name, sub: 'Percentil ' + x.p, text: strongText(x) };
  });
  var growth = low.slice(0, 2).map(function (x) {
    return { icon: '🌱', title: x.name, sub: 'Percentil ' + x.p, text: GROWTH_HINT_[x.code] || '' };
  });
  return { strengths: strengths, growth: growth };
}

function reportIntro_(profile, name) {
  var s = profile.summary;
  var top = s.topTraits.map(function (t) { return t.name + ' (P' + t.percentile + ')'; }).join(', ');
  return 'Hola ' + name + '. Este informe integra cuatro dimensiones de tu perfil: ' +
    'cómo eres (personalidad), cómo piensas (capacidad cognitiva), cómo sientes ' +
    '(inteligencia emocional) y cómo decides (patrones situacionales). ' +
    'Tus rasgos más prominentes fueron: ' + top + '. ' +
    'Tu índice de capacidad general estimado fue ' + s.g_iq + ' (escala M=100, DE=15), ' +
    'con inteligencia emocional rasgo en el percentil ' + s.ei_trait_pct + '. ' +
    'A continuación encontrarás el detalle por área con interpretaciones y sugerencias de desarrollo.';
}

/* --------------------------------------------------------- Personalidad */

var DOMAIN_TEXT = {
  H: {
    high: 'Tiendes a la sinceridad, la modestia y el juego limpio. Evitas manipular a los demás y te incomoda el estatus por el estatus.',
    mid:  'Equilibras la honestidad con el pragmatismo: eres íntegro/a, aunque sabes cuándo proteger tus intereses.',
    low:  'Eres estratégico/a y orientado/a a resultados; puedes priorizar tu beneficio y disfrutar del reconocimiento y el estatus.'
  },
  E: {
    high: 'Experimentas las emociones con intensidad, eres sensible al riesgo y valoras el apoyo y la conexión cercana.',
    mid:  'Sientes las emociones de forma moderada: te afectan, pero rara vez te desbordan.',
    low:  'Mantienes la calma bajo presión, toleras bien la incertidumbre y rara vez te dejas llevar por el miedo o la ansiedad.'
  },
  X: {
    high: 'Eres sociable, enérgico/a y disfrutas el protagonismo y la interacción con grupos.',
    mid:  'Te mueves con comodidad entre lo social y lo reservado según el contexto.',
    low:  'Prefieres entornos tranquilos y la reflexión individual; tu energía social es selectiva.'
  },
  A: {
    high: 'Eres tolerante, conciliador/a y tiendes a perdonar; priorizas la armonía sobre el conflicto.',
    mid:  'Combinas cooperación con firmeza: colaboras, pero defiendes tu posición cuando hace falta.',
    low:  'Eres crítico/a y directo/a; no temes el desacuerdo y mantienes tus estándares aunque generen fricción.'
  },
  C: {
    high: 'Eres organizado/a, disciplinado/a y orientado/a al logro; planificas y persigues la excelencia.',
    mid:  'Equilibras estructura y flexibilidad: cumples, pero también te adaptas e improvisas.',
    low:  'Eres espontáneo/a y flexible; prefieres la libertad a la planificación rígida.'
  },
  O: {
    high: 'Eres curioso/a, imaginativo/a y atraído/a por las ideas, el arte y lo no convencional.',
    mid:  'Aprecias lo nuevo sin renunciar a lo práctico y lo conocido.',
    low:  'Eres práctico/a y centrado/a en lo concreto; prefieres lo probado a lo experimental.'
  }
};

function bandKey_(level) {
  if (level === 'Muy alto' || level === 'Alto') return 'high';
  if (level === 'Muy bajo' || level === 'Bajo') return 'low';
  return 'mid';
}

function personalitySection_(profile) {
  var d = profile.personality.domains;
  var bullets = [];
  Object.keys(d).forEach(function (k) {
    var dom = d[k];
    var txt = DOMAIN_TEXT[k][bandKey_(dom.level)];
    var oceanNote = dom.ocean ? (' Equivale a ' + dom.oceanName + ' en el modelo Big Five.') : ' Es un rasgo exclusivo del modelo HEXACO.';
    var adj = (dom.percentileAdjusted != null && dom.percentileAdjusted !== dom.percentile)
      ? (' Tu conducta en los retos situacionales ajustó esta estimación al percentil ' + dom.percentileAdjusted + '.')
      : '';
    bullets.push({
      heading: dom.name + ' — ' + dom.level + ' (percentil ' + dom.percentile + ')',
      body: txt + oceanNote + adj
    });
  });
  return {
    id: 'personality',
    title: '1. Cómo eres — Personalidad (HEXACO / Big Five)',
    intro: 'Tu personalidad se describe con seis dominios del modelo HEXACO, cinco de los cuales ' +
      'corresponden al modelo de los Cinco Grandes (OCEAN). Los ítems provienen del banco IPIP y se ' +
      'combinaron respuestas tipo Likert con bloques de elección forzada (ipsativa) para reducir sesgos de respuesta.',
    bullets: bullets,
    interplay: personalityInterplay_(d)
  };
}

function personalityInterplay_(d) {
  var notes = [];
  if (d.O.percentile >= 65 && d.C.percentile >= 65)
    notes.push('La combinación de alta Apertura y alta Responsabilidad sugiere un perfil de "innovador disciplinado": generas ideas y además las ejecutas.');
  if (d.X.percentile >= 65 && d.A.percentile >= 65)
    notes.push('Tu Extraversión y Amabilidad elevadas apuntan a un fuerte capital social: conectas y mantienes relaciones con facilidad.');
  if (d.E.percentile >= 65 && d.C.percentile >= 65)
    notes.push('Tu sensibilidad emocional unida a tu autodisciplina te hace meticuloso/a y consciente del impacto de tus decisiones.');
  if (d.H.percentile >= 65 && d.A.percentile >= 65)
    notes.push('Alta Honestidad-Humildad con alta Amabilidad describe un perfil notablemente cooperativo y confiable.');
  if (!notes.length)
    notes.push('Tu perfil muestra un equilibrio entre dominios, sin combinaciones extremas marcadas.');
  return notes;
}

/* ------------------------------------------------------------- Cognitivo */

function cognitiveSection_(profile) {
  var c = profile.cognitive;
  var bullets = [
    { heading: c.Gf.label + ' — CI ' + c.Gf.iq + ' (percentil ' + c.Gf.percentile + ', ' + c.Gf.level + ')',
      body: 'La inteligencia fluida es tu capacidad para razonar, detectar patrones y resolver problemas nuevos sin ' +
            'apoyarte en conocimiento previo. Se estimó con Teoría de Respuesta al Ítem (modelo 2PL) mediante EAP, ' +
            'ponderando la dificultad y discriminación de cada reto. Error estándar ≈ ' + c.Gf.se + '.' },
    { heading: c.Gc.label + ' — CI ' + c.Gc.iq + ' (percentil ' + c.Gc.percentile + ', ' + c.Gc.level + ')',
      body: 'La inteligencia cristalizada refleja el conocimiento verbal y cultural acumulado. Combina vocabulario, ' +
            'comprensión y cultura general. Error estándar ≈ ' + c.Gc.se + '.' },
    { heading: c.g.label + ' — CI ' + c.g.iq + ' (percentil ' + c.g.percentile + ', ' + c.g.level + ')',
      body: 'El factor g integra ambas capacidades como índice general de eficiencia cognitiva.' }
  ];
  var balance;
  var diff = c.Gf.iq - c.Gc.iq;
  if (diff >= 8) balance = 'Tu razonamiento fluido supera a tu conocimiento cristalizado: destacas resolviendo problemas nuevos y aprendes rápido, y puedes beneficiarte de ampliar tu base de conocimientos.';
  else if (diff <= -8) balance = 'Tu conocimiento cristalizado supera a tu razonamiento fluido: tienes una base sólida de información y experiencia que aplicas con eficacia.';
  else balance = 'Tus capacidades fluida y cristalizada están equilibradas, lo que sugiere un desarrollo cognitivo armónico.';

  return {
    id: 'cognitive',
    title: '2. Cómo piensas — Capacidad cognitiva (CHC: Gf / Gc)',
    intro: 'Siguiendo la teoría Cattell-Horn-Carroll (CHC), se evaluaron dos grandes capacidades: ' +
      'inteligencia fluida (Gf) y cristalizada (Gc). Las puntuaciones se obtuvieron con TRI/IRT, que estima tu ' +
      'habilidad latente θ y la traduce a una escala tipo CI (media 100, desviación 15).',
    bullets: bullets,
    interplay: [balance,
      'Importante: con un número reducido de ítems estas estimaciones son orientativas (nota el error estándar). ' +
      'Un valor más alto del error indica mayor incertidumbre.']
  };
}

/* ------------------------------------------------------------- Emocional */

function emotionalSection_(profile) {
  var e = profile.emotional;
  var tf = e.trait.factors;
  var bullets = [];
  Object.keys(tf).forEach(function (k) {
    bullets.push({
      heading: 'Rasgo · ' + tf[k].name + ' — ' + tf[k].level + ' (percentil ' + tf[k].percentile + ')',
      body: EI_FACTOR_TEXT[k][bandKey_(tf[k].level)]
    });
  });
  bullets.push({
    heading: 'Inteligencia emocional global (rasgo TEIQue) — ' + e.trait.global.level + ' (percentil ' + e.trait.global.percentile + ')',
    body: 'Síntesis de tu autopercepción emocional a través de los cuatro factores del TEIQue de Petrides.'
  });
  if (e.ability.global100 != null) {
    var ab = [];
    Object.keys(e.ability.branches).forEach(function (b) {
      var br = e.ability.branches[b];
      if (br.score100 != null) ab.push(br.name + ': ' + br.score100 + '/100');
    });
    bullets.push({
      heading: 'Habilidad emocional (MSCEIT) — ' + e.ability.global100 + '/100 (' + e.ability.level + ')',
      body: 'A diferencia del rasgo (autopercepción), esta parte mide tu desempeño real ante situaciones emocionales, ' +
            'comparado con una clave de consenso. Ramas evaluadas: ' + ab.join(' · ') + '.'
    });
  }
  return {
    id: 'emotional',
    title: '3. Cómo sientes — Inteligencia emocional (TEIQue / MSCEIT)',
    intro: 'La inteligencia emocional se midió desde dos enfoques complementarios: el modelo de RASGO (TEIQue, ' +
      'cómo te percibes) y el modelo de HABILIDAD (MSCEIT, cómo resuelves situaciones emocionales reales). ' +
      'Ambos enfoques aportan información distinta y útil.',
    bullets: bullets,
    interplay: emotionalInterplay_(e)
  };
}

var EI_FACTOR_TEXT = {
  wellbeing: {
    high: 'Mantienes una visión positiva de ti mismo/a y de tu vida; optimismo y autoestima sólidos.',
    mid:  'Tu bienestar es estable, con altibajos normales según las circunstancias.',
    low:  'Puedes ser autocrítico/a o pesimista; trabajar la autocompasión y los logros reforzaría tu bienestar.'
  },
  selfcontrol: {
    high: 'Regulas bien el estrés y los impulsos; conservas la cabeza fría bajo presión.',
    mid:  'Gestionas tus impulsos de forma aceptable, aunque ciertas situaciones te tensionan.',
    low:  'El estrés o el enfado pueden desbordarte; técnicas de regulación emocional te beneficiarían.'
  },
  emotionality: {
    high: 'Percibes y expresas emociones con claridad y empatizas fácilmente con los demás.',
    mid:  'Tu conexión emocional es funcional, con margen para profundizar en la expresión.',
    low:  'Puede costarte identificar o expresar emociones; nombrarlas de forma consciente ayudaría.'
  },
  sociability: {
    high: 'Te desenvuelves con soltura social, influyes en otros y te comunicas con asertividad.',
    mid:  'Tu competencia social es adecuada según el contexto.',
    low:  'Las situaciones sociales o de asertividad pueden resultarte exigentes; practicarlas en entornos seguros ayuda.'
  }
};

function emotionalInterplay_(e) {
  var notes = [];
  var traitP = e.trait.global.percentile;
  var ab = e.ability.global100;
  if (ab != null) {
    if (traitP >= 60 && ab < 50)
      notes.push('Te percibes emocionalmente competente, pero tu desempeño ante situaciones concretas fue más bajo: una oportunidad para contrastar autopercepción con práctica.');
    else if (traitP < 45 && ab >= 65)
      notes.push('Aunque te subvaloras emocionalmente, tu desempeño real fue alto: probablemente eres más hábil de lo que crees.');
    else
      notes.push('Tu autopercepción emocional (rasgo) y tu desempeño real (habilidad) son razonablemente coherentes.');
  }
  return notes;
}

/* --------------------------------------------------------------- Stealth */

function stealthSection_(profile) {
  var st = profile.stealth;
  var style = st.deliberationStyle;
  var styleText = {
    reflexivo: 'Tiendes a deliberar: tomas tiempo para sopesar opciones antes de decidir.',
    equilibrado: 'Equilibras rapidez y reflexión al decidir.',
    impulsivo: 'Decides con rapidez, confiando en tu intuición.'
  };
  var signalNotes = [];
  Object.keys(st.signals || {}).forEach(function (k) {
    var label = (HEXACO_DOMAINS[k] && HEXACO_DOMAINS[k].name) ||
                (TEIQUE_FACTORS[k] && TEIQUE_FACTORS[k].name) || k;
    var dir = st.signals[k] > 0 ? 'a favor de' : 'en contra de';
    signalNotes.push('En los retos, tus decisiones apuntaron ' + dir + ' ' + label + '.');
  });
  return {
    id: 'stealth',
    title: '4. Cómo decides — Patrones situacionales (evaluación sigilosa)',
    intro: 'Siguiendo la evaluación sigilosa de Valerie Shute, algunos rasgos no se preguntaron directamente, ' +
      'sino que se infirieron de tus decisiones en escenarios realistas y del tiempo que tardaste en resolverlos. ' +
      'Esto reduce el sesgo de deseabilidad social.',
    bullets: [
      { heading: 'Estilo de decisión: ' + (style || 'no determinado'),
        body: style ? styleText[style] + (st.avgDeliberationMs ? ' (tiempo medio ≈ ' + Math.round(st.avgDeliberationMs / 1000) + ' s por reto).' : '') : '' }
    ],
    interplay: signalNotes.length ? signalNotes : ['No se registraron señales situacionales suficientes.']
  };
}

/* ----------------------------------------------------------- Integrativa */

function integrativeSection_(profile) {
  var s = profile.summary;
  var d = profile.personality.domains;
  var notes = [];
  if (d.O.percentile >= 60 && profile.cognitive.Gf.percentile >= 60)
    notes.push('Tu Apertura intelectual elevada acompaña a un buen razonamiento fluido: un perfil propicio para el aprendizaje continuo y la innovación.');
  if (d.C.percentile >= 60 && s.ei_trait_pct >= 60)
    notes.push('Disciplina y regulación emocional altas suelen predecir buen desempeño sostenido y liderazgo confiable.');
  if (d.X.percentile >= 60 && s.ei_trait_pct >= 60)
    notes.push('Sociabilidad e inteligencia emocional altas favorecen roles de comunicación, ventas o gestión de equipos.');
  if (!notes.length)
    notes.push('Tu perfil integra rasgos, capacidad y emoción de forma equilibrada, sin un patrón dominante único.');
  return {
    id: 'integrative',
    title: '5. Lectura integrada de tu perfil',
    intro: 'Las áreas no actúan por separado. Aquí algunas conexiones entre tu personalidad, tu capacidad cognitiva ' +
      'y tu inteligencia emocional.',
    bullets: [],
    interplay: notes
  };
}

function recommendationsSection_(profile) {
  var recs = [];
  var d = profile.personality.domains;
  if (d.C.percentile < 40) recs.push('Refuerza tus hábitos de planificación: divide metas grandes en pasos pequeños y usa recordatorios.');
  if (d.E.percentile >= 65 || profile.emotional.trait.factors.selfcontrol.percentile < 40)
    recs.push('Incorpora técnicas de regulación (respiración, reencuadre cognitivo) para manejar la activación emocional.');
  if (profile.cognitive.Gc.iq < profile.cognitive.Gf.iq - 8)
    recs.push('Aprovecha tu rapidez de razonamiento ampliando tu base de conocimiento (lectura amplia, vocabulario).');
  if (profile.emotional.trait.factors.sociability.percentile < 40)
    recs.push('Practica la asertividad y la comunicación en contextos de baja presión para fortalecer tu competencia social.');
  if (d.O.percentile >= 65) recs.push('Canaliza tu curiosidad en proyectos concretos para que las ideas se traduzcan en resultados.');
  if (!recs.length) recs.push('Mantén tus fortalezas con práctica deliberada y busca retos que te saquen levemente de tu zona de confort.');
  return {
    id: 'recommendations',
    title: '6. Sugerencias de desarrollo personalizadas',
    intro: 'Recomendaciones derivadas directamente de tu patrón de resultados:',
    bullets: [],
    interplay: recs
  };
}
