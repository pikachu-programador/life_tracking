// POST /query/ del AW falso (H-01).
//
// El AW falso NO interpreta el lenguaje de consultas de AW. Reconoce la FORMA de la consulta canónica que
// arma consultaCanonica() en web/js/consultas.js (sentencia por sentencia), saca de ella lo que cambia
// (ids de los buckets, regex de cada navegador, si suma el audio, las reglas de categorize y qué devuelve
// RETURN), comprueba que es idéntica a la que arma consultaCanonica() con esos mismos datos y la resuelve
// en JS con transformaciones.js. Cualquier otra consulta recibe un error 400 claro.

import { regexDeAW } from '../../web/motor/regex.js';
import { compilarReglas } from '../../web/motor/clasificador.js';
import { REGEX_APP_NAVEGADOR } from '../../web/motor/tipos.js';
import { consultaCanonica } from '../../web/js/consultas.js';
import { leerTexto, leerLiteralCompleto, saltarEspacios } from './literales.js';
import {
  aEventoAW, categorize, concat, filterKeyvals, filterKeyvalsRegex, filterPeriodIntersect, flood,
  periodUnion, sortByTimestamp, splitUrlEvents,
} from './transformaciones.js';

const SOLO_CANONICA = 'el AW falso solo entiende la consulta canónica de web/js/consultas.js';

/** Error de una consulta (el servidor lo responde con su código HTTP y {message}). */
export class ErrorConsulta extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.name = 'ErrorConsulta';
    this.estado = estado;
  }
}

// ── 1. Partir el texto en sentencias ──

/**
 * Parte la consulta en sentencias por los ";" que no están dentro de un texto.
 * AW une la lista de sentencias sin separador; aquí se unen con un salto de línea (da lo mismo).
 * @param {string|string[]} consulta
 * @returns {string[]} sentencias sin el ";" y sin espacios en los bordes
 */
export function partirSentencias(consulta) {
  const texto = Array.isArray(consulta) ? consulta.join('\n') : String(consulta ?? '');
  const sentencias = [];
  let desde = 0;
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '"' || c === "'") { i = leerTexto(texto, i).fin; continue; }
    if (c === ';') { sentencias.push(texto.slice(desde, i).trim()); desde = i + 1; }
    i++;
  }
  sentencias.push(texto.slice(desde).trim());
  return sentencias.filter((s) => s !== '');
}

// ── 2. Reconocer cada sentencia ──

// Plantillas de las sentencias. «T» es un texto entre comillas (se lee con las reglas de AW) y «V» el
// nombre de un navegador en una variable (events_chrome, window_chrome…). Los espacios son flexibles.
const TEXTO = `("(?:[^"]|(?<=\\\\)")*"|'(?:[^']|(?<=\\\\)')*')`;
function plantilla(forma) {
  const fuente = forma
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')               // los símbolos de la forma son literales
    .replace(/ /g, '')
    .replace(/(\\\(|\\\)|\\\[|\\\]|,|=)/g, '\\s*$1\\s*')  // espacios libres alrededor de ( ) [ ] , =
    .replace(/«T»/g, TEXTO)
    .replace(/«V»/g, '([A-Za-z0-9_]+)');
  return new RegExp(`^${fuente}$`);
}

const P = {
  ventana: plantilla('events = flood(query_bucket(«T»))'),
  noAfk: plantilla('not_afk = flood(query_bucket(«T»))'),
  noAfkEstado: plantilla('not_afk = filter_keyvals(not_afk, "status", ["not-afk"])'),
  afk: plantilla('afk = flood(query_bucket(«T»))'),
  afkEstado: plantilla('afk = filter_keyvals(afk, "status", ["afk"])'),
  navegadorVacio: plantilla('browser_events = []'),
  navBucket: plantilla('events_«V» = flood(query_bucket(«T»))'),
  navVentana: plantilla('window_«V» = filter_keyvals_regex(events, "app", «T»)'),
  navCruce: plantilla('events_«V» = filter_period_intersect(events_«V», window_«V»)'),
  navUrl: plantilla('events_«V» = split_url_events(events_«V»)'),
  navUnir: plantilla('browser_events = concat(browser_events, events_«V»)'),
  navOrden: plantilla('browser_events = sort_by_timestamp(browser_events)'),
  audible: plantilla('audible_events = filter_keyvals(browser_events, "audible", [true])'),
  audibleUnion: plantilla('not_afk = period_union(not_afk, audible_events)'),
  cruceAfk: plantilla('events = filter_period_intersect(events, not_afk)'),
};
const CATEGORIZE = /^events\s*=\s*categorize\(\s*events\s*,([\s\S]*)\)$/;
const RETURN = /^RETURN\s*=\s*\{([\s\S]*)\}$/;
const PAR_RETURN = /\s*("(?:[^"]|(?<=\\)")*"|'(?:[^']|(?<=\\)')*')\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*(,|$)/y;

/** Valor de un texto capturado por «T» (sin comillas y con \" des-escapado, como AW). */
const texto = (capturado) => leerTexto(capturado, 0).valor;

/**
 * Reconoce la consulta canónica.
 * @param {string|string[]} consulta
 * @returns {{bucketVentana: string, bucketAfk: string, bucketAfkAparte: (string|null),
 *            navegadores: Array<{variable: string, bucket: string, regex: string}>, audible: boolean,
 *            reglasTexto: string, retorno: Array<[string, string]>}}
 * @throws {ErrorConsulta} 400 si la consulta tiene otra forma
 */
export function reconocerConsulta(consulta) {
  let s;
  try {
    s = partirSentencias(consulta);
  } catch (error) {
    throw new ErrorConsulta(`${SOLO_CANONICA}: ${error.message}`);
  }
  let i = 0;
  const fallar = (detalle) => {
    const sentencia = s[i] === undefined ? '(fin de la consulta)' : `«${s[i].length > 120 ? s[i].slice(0, 117) + '...' : s[i]}»`;
    throw new ErrorConsulta(`${SOLO_CANONICA}: ${detalle} en la sentencia ${i + 1}: ${sentencia}`);
  };
  const tomar = (patron, detalle) => {
    const m = s[i] === undefined ? null : patron.exec(s[i]);
    if (!m) fallar(detalle);
    i++;
    return m;
  };
  const opcional = (patron) => {
    const m = s[i] === undefined ? null : patron.exec(s[i]);
    if (m) i++;
    return m;
  };

  const plan = { navegadores: [], audible: false, bucketAfkAparte: null };
  plan.bucketVentana = texto(tomar(P.ventana, 'se esperaba events = flood(query_bucket("<bucket de ventana>"))')[1]);
  plan.bucketAfk = texto(tomar(P.noAfk, 'se esperaba not_afk = flood(query_bucket("<bucket AFK>"))')[1]);
  tomar(P.noAfkEstado, 'se esperaba el filtro "not-afk"');
  const afk = opcional(P.afk);
  if (afk) {
    plan.bucketAfkAparte = texto(afk[1]);
    tomar(P.afkEstado, 'se esperaba el filtro "afk"');
  }
  tomar(P.navegadorVacio, 'se esperaba browser_events = []');

  // Un grupo de 6 sentencias por navegador.
  let nav;
  while ((nav = opcional(P.navBucket))) {
    const v = nav[1];
    const ventana = tomar(P.navVentana, `se esperaba window_${v} = filter_keyvals_regex(events, "app", ...)`);
    const cruce = tomar(P.navCruce, `se esperaba el cruce de events_${v} con window_${v}`);
    const url = tomar(P.navUrl, `se esperaba split_url_events(events_${v})`);
    const unir = tomar(P.navUnir, `se esperaba concat(browser_events, events_${v})`);
    tomar(P.navOrden, 'se esperaba sort_by_timestamp(browser_events)');
    if (![ventana[1], cruce[1], cruce[2], cruce[3], url[1], url[2], unir[1]].every((x) => x === v)) {
      i--; fallar(`las variables del navegador "${v}" no coinciden`);
    }
    plan.navegadores.push({ variable: v, bucket: texto(nav[2]), regex: texto(ventana[2]) });
  }

  if (opcional(P.audible)) {
    tomar(P.audibleUnion, 'se esperaba not_afk = period_union(not_afk, audible_events)');
    plan.audible = true;
  }
  tomar(P.cruceAfk, 'se esperaba events = filter_period_intersect(events, not_afk)');
  plan.reglasTexto = tomar(CATEGORIZE, 'se esperaba events = categorize(events, [...reglas...])')[1].trim();

  const ret = tomar(RETURN, 'se esperaba RETURN = {...}')[1];
  const variables = new Set(['events', 'not_afk', 'browser_events', ...(afk ? ['afk'] : [])]);
  plan.retorno = [];
  PAR_RETURN.lastIndex = 0;
  let resto = saltarEspacios(ret, 0);
  while (resto < ret.length) {
    PAR_RETURN.lastIndex = resto;
    const par = PAR_RETURN.exec(ret);
    if (!par || !variables.has(par[2])) { i--; fallar('RETURN solo puede devolver events, not_afk, afk o browser_events'); }
    plan.retorno.push([texto(par[1]), par[2]]);
    resto = saltarEspacios(ret, PAR_RETURN.lastIndex);
  }
  if (plan.retorno.length === 0) { i--; fallar('RETURN está vacío'); }
  if (i < s.length) fallar('sobran sentencias');
  compararConCanonica(s, plan);
  return plan;
}

/** Quita los espacios que no están dentro de un texto (para comparar sentencias sin que importen). */
function sinEspacios(sentencia) {
  let salida = '';
  let i = 0;
  while (i < sentencia.length) {
    const c = sentencia[i];
    if (c === '"' || c === "'") {
      const { fin } = leerTexto(sentencia, i);
      salida += sentencia.slice(i, fin);
      i = fin;
    } else {
      if (!/\s/.test(c)) salida += c;
      i++;
    }
  }
  return salida;
}

/**
 * Segunda comprobación: con los datos extraídos (buckets, navegadores, audio) se arma la consulta con
 * consultaCanonica() de web/js/consultas.js y se compara sentencia por sentencia con la recibida
 * (sin contar espacios). Así, si consultas.js cambia un detalle y el AW falso no se actualiza, responde
 * un error claro en vez de devolver otra cosa en silencio. Las reglas de categorize no se comparan como
 * texto: se leen como valor (compilarReglasDeConsulta).
 * @throws {ErrorConsulta}
 */
function compararConCanonica(recibidas, plan) {
  for (const { variable } of plan.navegadores) {
    if (!Object.hasOwn(REGEX_APP_NAVEGADOR, variable)) {
      throw new ErrorConsulta(`${SOLO_CANONICA}: navegador desconocido «${variable}» (conocidos: ${Object.keys(REGEX_APP_NAVEGADOR).join(', ')})`);
    }
  }
  const esperadas = partirSentencias(consultaCanonica({
    bucketVentana: plan.bucketVentana,
    bucketAfk: plan.bucketAfk,
    navegadores: plan.navegadores.map(({ variable, bucket }) => ({ navegador: variable, id: bucket })),
    reglas: [],
    incluirAudible: plan.audible,
  }));
  const esCategorize = (sentencia) => CATEGORIZE.test(sentencia);
  const largo = Math.max(esperadas.length, recibidas.length);
  for (let k = 0; k < largo; k++) {
    const esperada = esperadas[k];
    const recibida = recibidas[k];
    if (esperada !== undefined && recibida !== undefined && esCategorize(esperada) && esCategorize(recibida)) continue;
    if (esperada === undefined || recibida === undefined || sinEspacios(esperada) !== sinEspacios(recibida)) {
      const corto = (x) => (x === undefined ? '(nada)' : `«${x.length > 100 ? x.slice(0, 97) + '...' : x}»`);
      throw new ErrorConsulta(`${SOLO_CANONICA}: la sentencia ${k + 1} no coincide con consultaCanonica(); `
        + `se esperaba ${corto(esperada)} y llegó ${corto(recibida)}`);
    }
  }
}

// ── 3. Reglas de categorize ──

// Las reglas casi nunca cambian entre consultas: se compilan una vez por texto (las regex son lo caro).
const reglasCompiladas = new Map(); // texto del literal → ReglasCompiladas
const MAX_REGLAS_EN_CACHE = 20;

/**
 * Lee y compila el literal de categorize: [[["Estudio", "Inglés"], {type, regex, ignore_case…}], ...].
 * @returns {import('../../web/motor/tipos.js').ReglasCompiladas}
 * @throws {ErrorConsulta} si el literal no tiene esa forma
 */
export function compilarReglasDeConsulta(textoLiteral) {
  const guardadas = reglasCompiladas.get(textoLiteral);
  if (guardadas) return guardadas;

  let pares;
  try {
    pares = leerLiteralCompleto(textoLiteral);
  } catch (error) {
    throw new ErrorConsulta(`No se pudieron leer las reglas de categorize: ${error.message}`);
  }
  const forma = Array.isArray(pares) && pares.every((p) => Array.isArray(p) && p.length === 2
    && Array.isArray(p[0]) && p[1] && typeof p[1] === 'object' && !Array.isArray(p[1]));
  if (!forma) throw new ErrorConsulta('categorize espera una lista de pares [nombre, regla], como reglasParaConsulta()');

  const compiladas = compilarReglas(pares.map(([name, rule]) => ({ name, rule })));
  if (reglasCompiladas.size >= MAX_REGLAS_EN_CACHE) reglasCompiladas.delete(reglasCompiladas.keys().next().value);
  reglasCompiladas.set(textoLiteral, compiladas);
  return compiladas;
}

// ── 4. Resolver ──

/**
 * Resuelve la consulta canónica reconocida para un periodo, como lo haría AW.
 * @param {ReturnType<typeof reconocerConsulta>} plan
 * @param {{inicio: number, fin: number}} periodo  ms
 * @param {object} almacen  el de almacen.js
 * @returns {Object<string, Array<{id?: number, timestamp: string, duration: number, data: object}>>}
 *          por ejemplo {eventos, navegador, no_afk, afk}
 */
export function resolverConsulta(plan, { inicio, fin }, almacen) {
  const consultarBucket = (id) => {
    if (!almacen.existeBucket(id)) throw new ErrorConsulta(`No existe el bucket «${id}» (query_bucket)`);
    return almacen.eventos(id, { inicio, fin });
  };
  const compiladas = compilarReglasDeConsulta(plan.reglasTexto);

  const ventana = flood(consultarBucket(plan.bucketVentana));
  let noAfk = filterKeyvals(flood(consultarBucket(plan.bucketAfk)), 'status', ['not-afk']);
  const afk = plan.bucketAfkAparte === null ? []
    : filterKeyvals(flood(consultarBucket(plan.bucketAfkAparte)), 'status', ['afk']);

  let navegador = [];
  for (const { bucket, regex } of plan.navegadores) {
    let regexApp;
    try {
      regexApp = regexDeAW(regex);
    } catch (error) {
      throw new ErrorConsulta(`La regex del navegador no compila: ${error.message}`);
    }
    let web = flood(consultarBucket(bucket));
    web = filterPeriodIntersect(web, filterKeyvalsRegex(ventana, 'app', regexApp));
    web = splitUrlEvents(web);
    navegador = sortByTimestamp(concat(navegador, web));
  }

  // Las pestañas con audio cuentan como actividad (igual que AW por defecto).
  if (plan.audible) noAfk = periodUnion(noAfk, filterKeyvals(navegador, 'audible', [true]));

  const eventos = categorize(filterPeriodIntersect(ventana, noAfk), compiladas);

  const variables = { events: eventos, not_afk: noAfk, afk, browser_events: navegador };
  // structuredClone: algunos `data` todavía son los objetos del almacén; la copia evita que quien reciba
  // el resultado (sin pasar por HTTP, como pruebas/ayudantes/dia-ejemplo.js) los modifique por error.
  return structuredClone(Object.fromEntries(plan.retorno.map(([clave, variable]) => [clave, variables[variable].map(aEventoAW)])));
}

/**
 * POST /query/ completo: valida el cuerpo, reconoce la consulta y la resuelve para cada periodo.
 * @param {{timeperiods: string[], query: string[]|string}} cuerpo
 * @param {object} almacen
 * @returns {object[]} un resultado por periodo
 * @throws {ErrorConsulta}
 */
export function ejecutarConsulta(cuerpo, almacen) {
  if (!cuerpo || typeof cuerpo !== 'object') throw new ErrorConsulta('El cuerpo debe ser {timeperiods, query}');
  const { timeperiods, query } = cuerpo;
  if (!Array.isArray(timeperiods) || timeperiods.length === 0) throw new ErrorConsulta('Falta timeperiods (lista de "inicio/fin")');
  if (!(Array.isArray(query) || typeof query === 'string')) throw new ErrorConsulta('Falta query (lista de sentencias)');

  const periodos = timeperiods.map((p) => {
    const [a, b] = typeof p === 'string' ? p.split('/') : [];
    const inicio = Date.parse(a);
    const fin = Date.parse(b);
    if (!Number.isFinite(inicio) || !Number.isFinite(fin)) throw new ErrorConsulta(`Periodo inválido: ${JSON.stringify(p)} (se espera "inicio/fin" en ISO 8601)`);
    if (fin < inicio) throw new ErrorConsulta(`Periodo al revés: ${p}`);
    return { inicio, fin };
  });

  const plan = reconocerConsulta(query);
  return periodos.map((periodo) => resolverConsulta(plan, periodo, almacen));
}
