/**
 * Code.gs
 * ----------------------------------------------------------------------------
 * Punto de entrada de la aplicación web (Google Apps Script) y orquestación con
 * Google Sheets. Responsabilidades:
 *
 *   - doGet(): sirve la interfaz HTML del test.
 *   - getInstrumentForClient(): entrega el banco de ítems al frontend.
 *   - submitAssessment(): puntúa, persiste en la hoja vinculada y devuelve el informe.
 *   - Gestión del Spreadsheet: usa el contenedor activo si existe; si no, crea
 *     (una sola vez) un Spreadsheet y guarda su ID en las propiedades del script.
 *   - ensureStructure(): crea las hojas y encabezados si no existen; si existen,
 *     solo escribe datos (idempotente).
 * ----------------------------------------------------------------------------
 */

var SHEET_NAMES = {
  summary: 'Resumen',     // una fila por participante (formato ancho)
  scales:  'Escalas',     // formato largo: una fila por escala puntuada
  items:   'Items',       // formato largo: una fila por ítem respondido
  meta:    'Metadatos'    // configuración / registro del instrumento
};

var PROP_SHEET_ID = 'ASSESSMENT_SPREADSHEET_ID';

/** Sirve la aplicación web. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Evaluación de Perfil Integral')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Permite incluir parciales HTML (CSS/JS) dentro de Index.html. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** El cliente llama esto al cargar para obtener el instrumento (sin claves). */
function getInstrumentForClient() {
  return getInstrument();
}

/**
 * Recibe el envío del cliente, puntúa, persiste y devuelve el informe.
 * @param {Object} payload { participant, responses, meta }
 * @return {Object} { ok, report, summary, spreadsheetUrl }
 */
function submitAssessment(payload) {
  try {
    var profile = scoreAssessment(payload);
    var report = buildReport(profile);
    var ss = getSpreadsheet_();
    ensureStructure_(ss);
    var recordId = persistProfile_(ss, profile, payload);
    return {
      ok: true,
      recordId: recordId,
      report: report,
      summary: profile.summary,
      spreadsheetUrl: ss.getUrl()
    };
  } catch (err) {
    return { ok: false, error: String(err && err.stack || err) };
  }
}

/* ----------------------------------------------------- Gestión Spreadsheet */

/**
 * Devuelve el Spreadsheet a usar:
 *  1) el contenedor activo (script vinculado a una hoja), o
 *  2) el guardado por ID en propiedades del script, o
 *  3) uno nuevo creado al vuelo (y se guarda su ID).
 */
function getSpreadsheet_() {
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active) return active;

  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SHEET_ID);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* id inválido: recrear */ }
  }
  var created = SpreadsheetApp.create('Resultados — Evaluación de Perfil Integral');
  props.setProperty(PROP_SHEET_ID, created.getId());
  return created;
}

/** Crea hojas y encabezados si faltan. Idempotente. */
function ensureStructure_(ss) {
  // Resumen (ancho)
  var summaryHeaders = ['Marca temporal', 'ID Registro', 'Nombre', 'Edad', 'Género', 'Duración (s)',
    // Personalidad (percentiles HEXACO)
    'H Honestidad', 'E Emocionalidad', 'X Extraversión', 'A Amabilidad', 'C Responsabilidad', 'O Apertura',
    // Cognitivo
    'Gf (CI)', 'Gc (CI)', 'g (CI)',
    // Emocional
    'EI rasgo (pct)', 'EI habilidad (0-100)',
    // Stealth
    'Estilo decisión', 'Rasgos top'];
  ensureSheetWithHeaders_(ss, SHEET_NAMES.summary, summaryHeaders);

  ensureSheetWithHeaders_(ss, SHEET_NAMES.scales,
    ['Marca temporal', 'ID Registro', 'Módulo', 'Escala', 'Puntuación cruda', 'z', 'Percentil', 'Nivel', 'N ítems']);

  ensureSheetWithHeaders_(ss, SHEET_NAMES.items,
    ['Marca temporal', 'ID Registro', 'Ítem', 'Módulo', 'Respuesta', 'Tiempo (ms)', 'Correcto']);

  var metaSheet = ensureSheetWithHeaders_(ss, SHEET_NAMES.meta,
    ['Clave', 'Valor']);
  if (metaSheet.getLastRow() < 2) {
    metaSheet.getRange(2, 1, 4, 2).setValues([
      ['Instrumento', 'Evaluación de Perfil Integral'],
      ['Versión', getInstrument().version],
      ['Marcos', 'HEXACO/BigFive · IPIP · CHC(Gf/Gc) · TEIQue · MSCEIT · IRT · Evaluación Sigilosa'],
      ['Creado', new Date()]
    ]);
  }

  // Elimina la hoja por defecto "Hoja 1"/"Sheet1" si quedó vacía y sobran hojas.
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

function ensureSheetWithHeaders_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0b1f3a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

/* --------------------------------------------------------- Persistencia */

function persistProfile_(ss, profile, payload) {
  var ts = profile.completedAt;
  var recordId = Utilities.getUuid().slice(0, 8);
  var p = profile.participant || {};
  var d = profile.personality.domains;
  var dur = profile.durationMs ? Math.round(profile.durationMs / 1000) : '';

  // 1) Resumen (una fila)
  ss.getSheetByName(SHEET_NAMES.summary).appendRow([
    ts, recordId, p.name || '', p.age || '', p.gender || '', dur,
    d.H.percentile, d.E.percentile, d.X.percentile, d.A.percentile, d.C.percentile, d.O.percentile,
    profile.cognitive.Gf.iq, profile.cognitive.Gc.iq, profile.cognitive.g.iq,
    profile.emotional.trait.global.percentile, profile.emotional.ability.global100,
    profile.stealth.deliberationStyle || '',
    profile.summary.topTraits.map(function (t) { return t.name; }).join(', ')
  ]);

  // 2) Escalas (formato largo)
  var scaleRows = [];
  Object.keys(d).forEach(function (k) {
    scaleRows.push([ts, recordId, 'Personalidad', d[k].name, d[k].rawMean, d[k].z, d[k].percentile, d[k].level, d[k].nItems]);
  });
  ['Gf', 'Gc', 'g'].forEach(function (k) {
    var c = profile.cognitive[k];
    scaleRows.push([ts, recordId, 'Cognitivo', c.label, c.iq, c.theta, c.percentile, c.level, c.nItems]);
  });
  var tf = profile.emotional.trait.factors;
  Object.keys(tf).forEach(function (k) {
    scaleRows.push([ts, recordId, 'EI rasgo', tf[k].name, tf[k].rawMean, tf[k].z, tf[k].percentile, tf[k].level, '']);
  });
  var br = profile.emotional.ability.branches;
  Object.keys(br).forEach(function (k) {
    if (br[k].score100 != null)
      scaleRows.push([ts, recordId, 'EI habilidad', br[k].name, br[k].score100, '', '', '', br[k].n]);
  });
  if (scaleRows.length) {
    var ssh = ss.getSheetByName(SHEET_NAMES.scales);
    ssh.getRange(ssh.getLastRow() + 1, 1, scaleRows.length, scaleRows[0].length).setValues(scaleRows);
  }

  // 3) Items (formato largo) — respuestas crudas + tiempo + acierto cuando aplica.
  var responses = payload.responses || {};
  var rt = (payload.meta && payload.meta.rt) || {};
  var bank = indexBank_(getFullBank_());
  var itemRows = [];
  Object.keys(responses).forEach(function (id) {
    var it = bank[id];
    if (!it) return;
    var val = responses[id];
    var correct = '';
    if (it.module === 'cognitive') correct = (Number(val) === it.answer) ? 'Sí' : 'No';
    itemRows.push([ts, recordId, id, it.module, JSON.stringify(val), rt[id] || '', correct]);
  });
  if (itemRows.length) {
    var ish = ss.getSheetByName(SHEET_NAMES.items);
    ish.getRange(ish.getLastRow() + 1, 1, itemRows.length, itemRows[0].length).setValues(itemRows);
  }

  return recordId;
}

/* ------------------------------------------------------------- Utilidades */

/**
 * Ejecutar manualmente una vez desde el editor para inicializar la hoja y
 * conceder permisos. Devuelve la URL del Spreadsheet de resultados.
 */
function setup() {
  var ss = getSpreadsheet_();
  ensureStructure_(ss);
  Logger.log('Spreadsheet listo: ' + ss.getUrl());
  return ss.getUrl();
}

/** Prueba de humo: puntúa un envío sintético y registra el resultado. */
function selfTest_() {
  var payload = { participant: { name: 'Prueba', age: 30, gender: 'NA' }, responses: {}, meta: { rt: {}, durationMs: 60000 } };
  PERSONALITY_ITEMS.forEach(function (it) { payload.responses[it.id] = 4; });
  FORCED_CHOICE_BLOCKS.forEach(function (b) { payload.responses[b.id] = { most: 0, least: 1 }; });
  COGNITIVE_ITEMS.forEach(function (it) { payload.responses[it.id] = it.answer; });
  EI_TRAIT_ITEMS.forEach(function (it) { payload.responses[it.id] = 6; });
  EI_ABILITY_ITEMS.forEach(function (it) { payload.responses[it.id] = 0; });
  STEALTH_ITEMS.forEach(function (it) { payload.responses[it.id] = 0; payload.meta.rt[it.id] = 7000; });
  var res = submitAssessment(payload);
  Logger.log(JSON.stringify(res.summary));
  return res;
}
