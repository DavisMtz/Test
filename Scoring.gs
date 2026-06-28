/**
 * Scoring.gs
 * ----------------------------------------------------------------------------
 * Motor de puntuación. Convierte respuestas crudas en puntuaciones por escala
 * con interpretación psicométrica:
 *
 *   - Likert directo/inverso  -> media por dominio -> z -> percentil (norma N(μ,σ)).
 *   - Elección forzada        -> conteo ipsativo por dominio -> proporción.
 *   - TRI/IRT 2PL + EAP       -> estimación de habilidad θ (Gf, Gc, g) -> CI (M=100, DE=15).
 *   - SJT (MSCEIT)            -> crédito parcial por consenso -> escala 0-100.
 *   - Stealth                 -> acumulación de señales hacia rasgos (evidencia auxiliar).
 *
 * El resultado es un objeto "profile" consumido por Report.gs y la hoja de cálculo.
 * ----------------------------------------------------------------------------
 */

// Normas ILUSTRATIVAS (media y desviación en la métrica cruda de cada escala).
// Likert 1-5 -> media teórica neutra 3.0. Likert 1-7 -> 4.0. Ajustar con muestra real.
var NORMS = {
  personality_mean: 3.0, personality_sd: 0.62,
  teique_mean: 4.0,      teique_sd: 0.85
};

/**
 * Función principal del servidor: recibe el payload del cliente y devuelve el
 * perfil completo puntuado.
 * @param {Object} payload { participant:{...}, responses:{itemId:value}, meta:{rt:{...}, durationMs} }
 */
function scoreAssessment(payload) {
  var bank = indexBank_(getFullBank_());
  var responses = payload.responses || {};
  var rt = (payload.meta && payload.meta.rt) || {};

  var profile = {
    participant: payload.participant || {},
    completedAt: new Date(),
    durationMs: (payload.meta && payload.meta.durationMs) || null,
    personality: scorePersonality_(bank, responses),
    cognitive: scoreCognitive_(bank, responses, rt),
    emotional: scoreEmotional_(bank, responses),
    stealth: scoreStealth_(bank, responses, rt)
  };

  // Integración: las señales sigilosas refuerzan/atenúan los rasgos auto-reportados.
  integrateStealthSignals_(profile);
  profile.summary = buildSummaryIndices_(profile);
  return profile;
}

function indexBank_(bank) {
  var idx = {};
  bank.forEach(function (it) { idx[it.id] = it; });
  return idx;
}

/* ------------------------------------------------------------------ Likert */

/** Recodifica un valor Likert según el keying y la escala. */
function recodeLikert_(value, keyed, scale) {
  var v = Number(value);
  if (isNaN(v)) return null;
  return keyed === -1 ? (scale + 1 - v) : v;
}

function scorePersonality_(bank, responses) {
  var acc = {}; // domain -> {sum, n}
  Object.keys(HEXACO_DOMAINS).forEach(function (d) { acc[d] = { sum: 0, n: 0 }; });

  // 2a) Ítems Likert
  PERSONALITY_ITEMS.forEach(function (it) {
    if (responses[it.id] == null) return;
    var r = recodeLikert_(responses[it.id], it.keyed, it.scale);
    if (r == null) return;
    acc[it.domain].sum += r;
    acc[it.domain].n += 1;
  });

  // 2b) Elección forzada (ipsativa): +2 al "más", -2 al "menos" (centrado en 0).
  var ips = {};
  Object.keys(HEXACO_DOMAINS).forEach(function (d) { ips[d] = 0; });
  FORCED_CHOICE_BLOCKS.forEach(function (block) {
    var resp = responses[block.id]; // {most:index, least:index}
    if (!resp) return;
    if (resp.most != null && block.options[resp.most]) {
      var mo = block.options[resp.most];
      ips[mo.domain] += 2 * (mo.keyed || 1);
    }
    if (resp.least != null && block.options[resp.least]) {
      var lo = block.options[resp.least];
      ips[lo.domain] -= 2 * (lo.keyed || 1);
    }
  });

  var domains = {};
  Object.keys(HEXACO_DOMAINS).forEach(function (d) {
    var meta = HEXACO_DOMAINS[d];
    var mean = acc[d].n ? acc[d].sum / acc[d].n : NORMS.personality_mean;
    var z = (mean - NORMS.personality_mean) / NORMS.personality_sd;
    // El componente ipsativo ajusta levemente el z normativo (peso 0.15 por punto).
    z += 0.15 * ips[d];
    domains[d] = {
      code: d,
      name: meta.name,
      ocean: meta.ocean,
      oceanName: meta.oceanName,
      rawMean: round2_(mean),
      ipsative: ips[d],
      z: round2_(z),
      percentile: zToPercentile_(z),
      level: bandFromPercentile_(zToPercentile_(z)),
      nItems: acc[d].n
    };
  });

  // Mapeo explícito Big Five (OCEAN) reusando dominios HEXACO equivalentes.
  var ocean = {};
  Object.keys(HEXACO_DOMAINS).forEach(function (d) {
    var o = HEXACO_DOMAINS[d].ocean;
    if (o) ocean[o] = { code: o, name: HEXACO_DOMAINS[d].oceanName, percentile: domains[d].percentile, level: domains[d].level };
  });

  return { framework: 'HEXACO + Big Five (IPIP)', domains: domains, ocean: ocean };
}

/* --------------------------------------------------------------- Cognitivo */

function scoreCognitive_(bank, responses, rt) {
  var byStratum = { Gf: [], Gc: [] };
  var detail = [];
  COGNITIVE_ITEMS.forEach(function (it) {
    var resp = responses[it.id];
    var correct = (resp != null && Number(resp) === it.answer) ? 1 : 0;
    if (resp != null) byStratum[it.stratum].push({ a: it.irt.a, b: it.irt.b, u: correct });
    detail.push({ id: it.id, stratum: it.stratum, narrow: it.narrow, correct: correct, rtMs: rt[it.id] || null });
  });

  var gf = eapTheta_(byStratum.Gf);
  var gc = eapTheta_(byStratum.Gc);
  // g: combinación de todos los ítems cognitivos (carga general).
  var g = eapTheta_(byStratum.Gf.concat(byStratum.Gc));

  return {
    framework: 'CHC (Cattell-Horn-Carroll) + TRI/IRT 2PL (EAP)',
    Gf: thetaToScores_('Inteligencia fluida (Gf)', gf, byStratum.Gf.length),
    Gc: thetaToScores_('Inteligencia cristalizada (Gc)', gc, byStratum.Gc.length),
    g:  thetaToScores_('Capacidad general (g)', g, byStratum.Gf.length + byStratum.Gc.length),
    detail: detail
  };
}

/**
 * Estimación EAP (Expected A Posteriori) de θ sobre una rejilla con prior N(0,1).
 * @param {Array} items [{a,b,u}]  u = 1 acierto / 0 error
 * @return {Object} { theta, se, n }
 */
function eapTheta_(items) {
  if (!items.length) return { theta: 0, se: 1, n: 0, informative: false };
  var num = 0, den = 0, num2 = 0;
  for (var theta = -4; theta <= 4.0001; theta += 0.1) {
    var prior = normalPdf_(theta, 0, 1);
    var like = 1;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var p = 1 / (1 + Math.exp(-it.a * (theta - it.b))); // 2PL
      p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
      like *= it.u ? p : (1 - p);
    }
    var post = prior * like;
    num += theta * post;
    num2 += theta * theta * post;
    den += post;
  }
  var theta = den ? num / den : 0;
  var variance = den ? (num2 / den - theta * theta) : 1;
  return { theta: theta, se: Math.sqrt(Math.max(variance, 1e-6)), n: items.length, informative: true };
}

/** Convierte θ (escala N(0,1)) a CI (M=100, DE=15) y percentil. */
function thetaToScores_(label, est, nItems) {
  var iq = Math.round(100 + 15 * est.theta);
  iq = Math.min(Math.max(iq, 55), 145); // recorte sensato para pocos ítems
  return {
    label: label,
    theta: round2_(est.theta),
    se: round2_(est.se),
    iq: iq,
    percentile: zToPercentile_(est.theta),
    level: bandFromPercentile_(zToPercentile_(est.theta)),
    nItems: nItems,
    informative: est.informative !== false
  };
}

/* ---------------------------------------------------------------- Emocional */

function scoreEmotional_(bank, responses) {
  // Rasgo (TEIQue): media por factor en escala 1-7 -> percentil.
  var acc = {};
  Object.keys(TEIQUE_FACTORS).forEach(function (f) { acc[f] = { sum: 0, n: 0 }; });
  EI_TRAIT_ITEMS.forEach(function (it) {
    if (responses[it.id] == null) return;
    var r = recodeLikert_(responses[it.id], it.keyed, it.scale);
    if (r == null) return;
    acc[it.factor].sum += r;
    acc[it.factor].n += 1;
  });

  var factors = {}, allSum = 0, allN = 0;
  Object.keys(TEIQUE_FACTORS).forEach(function (f) {
    var mean = acc[f].n ? acc[f].sum / acc[f].n : NORMS.teique_mean;
    var z = (mean - NORMS.teique_mean) / NORMS.teique_sd;
    allSum += acc[f].sum; allN += acc[f].n;
    factors[f] = {
      code: f, name: TEIQUE_FACTORS[f].name,
      rawMean: round2_(mean), z: round2_(z),
      percentile: zToPercentile_(z), level: bandFromPercentile_(zToPercentile_(z))
    };
  });
  var globalMean = allN ? allSum / allN : NORMS.teique_mean;
  var globalZ = (globalMean - NORMS.teique_mean) / NORMS.teique_sd;

  // Habilidad (MSCEIT/SJT): crédito parcial por consenso -> 0-100.
  var branchAcc = {};
  Object.keys(MSCEIT_BRANCHES).forEach(function (b) { branchAcc[b] = { got: 0, max: 0, n: 0 }; });
  EI_ABILITY_ITEMS.forEach(function (it) {
    if (responses[it.id] == null) return;
    var idx = Number(responses[it.id]);
    var w = (it.key[idx] != null) ? it.key[idx] : 0;
    var maxW = Math.max.apply(null, it.key);
    branchAcc[it.branch].got += w;
    branchAcc[it.branch].max += maxW;
    branchAcc[it.branch].n += 1;
  });
  var branches = {}, abGot = 0, abMax = 0;
  Object.keys(MSCEIT_BRANCHES).forEach(function (b) {
    var pct = branchAcc[b].max ? (branchAcc[b].got / branchAcc[b].max) * 100 : null;
    abGot += branchAcc[b].got; abMax += branchAcc[b].max;
    branches[b] = {
      code: b, name: MSCEIT_BRANCHES[b].name,
      score100: pct == null ? null : Math.round(pct),
      n: branchAcc[b].n
    };
  });
  var abilityGlobal = abMax ? Math.round((abGot / abMax) * 100) : null;

  return {
    framework: 'Rasgo: TEIQue (Petrides) · Habilidad: MSCEIT (Mayer-Salovey-Caruso)',
    trait: {
      factors: factors,
      global: { rawMean: round2_(globalMean), z: round2_(globalZ),
                percentile: zToPercentile_(globalZ), level: bandFromPercentile_(zToPercentile_(globalZ)) }
    },
    ability: { branches: branches, global100: abilityGlobal,
               level: abilityGlobal == null ? null : bandFromScore100_(abilityGlobal) }
  };
}

/* ------------------------------------------------------------------ Stealth */

function scoreStealth_(bank, responses, rt) {
  var signals = {};   // rasgo -> suma de señales
  var choices = [];
  var times = [];
  STEALTH_ITEMS.forEach(function (it) {
    var idx = responses[it.id];
    if (idx == null) return;
    var opt = it.options[Number(idx)];
    if (!opt) return;
    Object.keys(opt.signals).forEach(function (k) {
      signals[k] = (signals[k] || 0) + opt.signals[k];
    });
    choices.push({ id: it.id, choice: Number(idx) });
    if (rt[it.id]) times.push(rt[it.id]);
  });
  var avgRt = times.length ? times.reduce(function (a, b) { return a + b; }, 0) / times.length : null;
  return {
    framework: 'Evaluación Sigilosa (Shute)',
    signals: signals,
    choices: choices,
    avgDeliberationMs: avgRt,
    deliberationStyle: avgRt == null ? null : (avgRt > 9000 ? 'reflexivo' : (avgRt < 3500 ? 'impulsivo' : 'equilibrado'))
  };
}

/** Las señales sigilosas ajustan ligeramente los percentiles de personalidad/EI. */
function integrateStealthSignals_(profile) {
  var s = profile.stealth.signals || {};
  var domains = profile.personality.domains;
  Object.keys(domains).forEach(function (d) {
    if (s[d] != null) {
      var adjP = clamp_(domains[d].percentile + Math.round(s[d] * 2.5), 1, 99);
      domains[d].percentileAdjusted = adjP;
      domains[d].levelAdjusted = bandFromPercentile_(adjP);
    }
  });
  // Señales de EI rasgo (emotionality / selfcontrol) hacia factores TEIQue.
  var factors = profile.emotional.trait.factors;
  ['emotionality', 'selfcontrol'].forEach(function (f) {
    if (s[f] != null && factors[f]) {
      factors[f].percentileAdjusted = clamp_(factors[f].percentile + Math.round(s[f] * 3), 1, 99);
    }
  });
}

/* ----------------------------------------------------------------- Resumen */

function buildSummaryIndices_(profile) {
  var d = profile.personality.domains;
  return {
    topTraits: Object.keys(d)
      .map(function (k) { return { name: d[k].name, percentile: d[k].percentile }; })
      .sort(function (a, b) { return b.percentile - a.percentile; })
      .slice(0, 3),
    g_iq: profile.cognitive.g.iq,
    gf_iq: profile.cognitive.Gf.iq,
    gc_iq: profile.cognitive.Gc.iq,
    ei_trait_pct: profile.emotional.trait.global.percentile,
    ei_ability_100: profile.emotional.ability.global100
  };
}

/* ------------------------------------------------------- Utilidades stats */

function normalPdf_(x, mu, sd) {
  return Math.exp(-0.5 * Math.pow((x - mu) / sd, 2)) / (sd * Math.sqrt(2 * Math.PI));
}

/** CDF normal estándar vía aproximación de la función error (Abramowitz-Stegun). */
function normalCdf_(z) {
  var t = 1 / (1 + 0.2316419 * Math.abs(z));
  var d = 0.3989423 * Math.exp(-z * z / 2);
  var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function zToPercentile_(z) {
  return clamp_(Math.round(normalCdf_(z) * 100), 1, 99);
}

function bandFromPercentile_(p) {
  if (p >= 85) return 'Muy alto';
  if (p >= 65) return 'Alto';
  if (p >= 35) return 'Medio';
  if (p >= 15) return 'Bajo';
  return 'Muy bajo';
}

function bandFromScore100_(s) {
  if (s >= 85) return 'Muy alto';
  if (s >= 65) return 'Alto';
  if (s >= 45) return 'Medio';
  if (s >= 25) return 'Bajo';
  return 'Muy bajo';
}

function clamp_(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function round2_(v) { return Math.round(v * 100) / 100; }
