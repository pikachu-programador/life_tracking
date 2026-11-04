// Consulta canónica categorizada (F1-04): los eventos de un periodo, como los ve la vista Actividad de AW.
//
// Es una traducción de `canonicalEvents` y `browserEvents` de aw-webui (src/queries.ts):
//   1. Eventos de ventana, "inundados" (flood: rellena huecos pequeños entre eventos).
//   2. Solo el tiempo NO AFK. Las pestañas con audio cuentan como actividad (igual que AW por defecto).
//   3. Categorizados con las reglas de `classes` (arquitectura §7).
//   4. Además, los eventos del navegador (con URL) mientras el navegador era la ventana activa.
//
// Las funciones que arman el texto de la consulta son puras (sin red): se prueban en pruebas/consultas.test.js.
// Solo `eventosCategorizados()` habla con AW, a través del cliente de aw.js.

// REGEX_APP_NAVEGADOR (nombres de proceso de cada navegador) vive ahora en web/motor/tipos.js,
// porque el motor también lo usa (F1-09). Se reexporta para no cambiar a quien lo importa desde aquí.
import { REGEX_APP_NAVEGADOR } from '../motor/tipos.js';
export { REGEX_APP_NAVEGADOR };

/**
 * Pasa un valor a texto para meterlo en una consulta de AW.
 * JSON.stringify duplica las barras invertidas ("\." → "\\."), pero el lenguaje de consultas de AW
 * espera una sola: sin este arreglo, una regla como `warp\.exe$` nunca coincide. aw-webui hace lo mismo.
 */
export function aTextoDeConsulta(valor) {
  return JSON.stringify(valor).replace(/\\\\/g, '\\');
}

/**
 * Convierte el ajuste `classes` de AW al formato que espera `categorize`: [[nombre, regla], ...].
 * Igual que `classes_for_query` de aw-webui: una regex vacía se manda como 'none' (nunca coincide).
 */
export function reglasParaConsulta(classes) {
  return classes
    .filter((c) => c.rule && c.rule.type !== null)
    .map((c) => {
      const regexVacia = c.rule.type === 'regex' && !(c.rule.regex ?? '').trim();
      return [c.name, regexVacia ? { type: 'none' } : c.rule];
    });
}

/**
 * Elige los buckets de navegador de este equipo (tipo 'web.tab.current').
 * Como aw-webui: primero los del hostname; si no hay ninguno, los de hostname "unknown".
 * @returns {Array<{navegador: string, id: string}>} un bucket por navegador conocido.
 */
export function bucketsDeNavegador(buckets, hostname) {
  const web = Object.values(buckets).filter((b) => b.type === 'web.tab.current');
  let propios = web.filter((b) => b.hostname === hostname);
  if (propios.length === 0) propios = web.filter((b) => b.hostname === 'unknown');
  const elegidos = [];
  for (const navegador of Object.keys(REGEX_APP_NAVEGADOR)) {
    const bucket = propios.find((b) => b.id.includes(navegador));
    if (bucket) elegidos.push({ navegador, id: bucket.id });
  }
  return elegidos;
}

/**
 * Arma la consulta canónica (lista de sentencias).
 * Devuelve (RETURN) un objeto con:
 *   eventos    → eventos de ventana activos, cada uno con data.$category
 *   navegador  → eventos web (url, title, $domain…) mientras el navegador era la ventana activa
 *   no_afk     → periodos en que se estaba usando la PC
 *   afk        → periodos AFK (PC encendida sin uso); con ellos el motor distingue AFK de Sin PC (F1-09)
 */
export function consultaCanonica({ bucketVentana, bucketAfk, navegadores = [], reglas, incluirAudible = true }) {
  const c = (texto) => aTextoDeConsulta(texto);
  const s = [];

  s.push(`events = flood(query_bucket(${c(bucketVentana)}));`);
  s.push(`not_afk = flood(query_bucket(${c(bucketAfk)}));`);
  s.push('not_afk = filter_keyvals(not_afk, "status", ["not-afk"]);');
  s.push(`afk = flood(query_bucket(${c(bucketAfk)}));`);
  s.push('afk = filter_keyvals(afk, "status", ["afk"]);');

  // Eventos del navegador: solo mientras su ventana estaba enfocada.
  s.push('browser_events = [];');
  for (const { navegador, id } of navegadores) {
    const v = navegador.replace(/[^a-z0-9_]/gi, ''); // nombre seguro para una variable
    s.push(`events_${v} = flood(query_bucket(${c(id)}));`);
    s.push(`window_${v} = filter_keyvals_regex(events, "app", ${c(REGEX_APP_NAVEGADOR[navegador])});`);
    s.push(`events_${v} = filter_period_intersect(events_${v}, window_${v});`);
    s.push(`events_${v} = split_url_events(events_${v});`);
    s.push(`browser_events = concat(browser_events, events_${v});`);
    s.push('browser_events = sort_by_timestamp(browser_events);');
  }
  if (incluirAudible) {
    s.push('audible_events = filter_keyvals(browser_events, "audible", [true]);');
    s.push('not_afk = period_union(not_afk, audible_events);');
  }

  s.push('events = filter_period_intersect(events, not_afk);');
  s.push(`events = categorize(events, ${c(reglas)});`);
  s.push('RETURN = {"eventos": events, "navegador": browser_events, "no_afk": not_afk, "afk": afk};');
  return s;
}

/**
 * Pide a AW los eventos categorizados de uno o varios periodos.
 * AW cachea las consultas de días terminados, así que conviene pedir un periodo por día (§14).
 * @param {object} aw  cliente de aw.js
 * @param {Array<[Date, Date]>} periodos
 * @returns {Promise<Array<{eventos: object[], navegador: object[], no_afk: object[], afk: object[]}>>} uno por periodo
 */
export async function eventosCategorizados(aw, periodos) {
  const [info, buckets, classes] = await Promise.all([aw.info(), aw.buckets(), aw.ajuste('classes')]);
  const host = info.hostname;
  const consulta = consultaCanonica({
    bucketVentana: `aw-watcher-window_${host}`,
    bucketAfk: `aw-watcher-afk_${host}`,
    navegadores: bucketsDeNavegador(buckets, host),
    reglas: reglasParaConsulta(classes),
  });
  return aw.consulta(periodos, consulta);
}
