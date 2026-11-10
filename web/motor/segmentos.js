// Segmentos (F1-05): los datos de un día de AW → tramos continuos que cubren el rango entero (arquitectura §6.7 y §7).
//
// Un segmento es un tramo [inicio, fin) con un solo estado (estudio, ia, neutral, distraccion, sin-clasificar,
// afk o sin-pc) y una sola actividad (app, título y, en los navegadores, la URL). La forma exacta está en el
// @typedef Segmento de tipos.js.
//
// Cómo se arma (segmentar):
//   1. Los eventos de ventana (que ya vienen sin AFK y con su categoría) se recortan al rango, se ordenan y se les
//      quitan los solapes: manda el que empezó antes.
//   2. A cada evento de un navegador se le copia la URL de la pestaña que más tiempo coincidió con él.
//   3. Los huecos entre eventos se rellenan: 'afk' si la PC estaba encendida sin uso, 'sin-clasificar' si se estaba
//      usando pero no hay ventana, y 'sin-pc' si no hay datos (apagada o suspendida).
//   4. Se unen los segmentos iguales que se tocan.
//
// Todas las funciones son puras: no modifican lo que reciben y devuelven objetos nuevos.
// Los instantes son milisegundos enteros: las duraciones de AW (segundos con decimales) se redondean al milisegundo,
// así "este segmento termina donde empieza el otro" se puede comprobar con ===.

import { ESTADOS, CLASE_DE_AW, SIN_AREA, REGEX_APP_NAVEGADOR } from './tipos.js';
import { regexDeAW } from './regex.js';
import { categorizar } from './clasificador.js';

const MS_SEG = 1000;

/** Categoría de AW de lo que no reconoce ninguna regla. */
const SIN_CATEGORIA = 'Uncategorized';

/** Las regex de REGEX_APP_NAVEGADOR, compiladas una sola vez (al cargar el módulo). */
const REGEX_NAVEGADORES = Object.values(REGEX_APP_NAVEGADOR).map((texto) => regexDeAW(texto));

// ── Ayudantes exportados ──

/**
 * ¿La app es un navegador? (alguna regex de REGEX_APP_NAVEGADOR, como hace aw-webui).
 * @param {string|null|undefined} app  nombre del proceso, por ejemplo 'chrome.exe'
 * @returns {boolean}
 */
export function esNavegador(app) {
  if (typeof app !== 'string' || app === '') return false;
  return REGEX_NAVEGADORES.some((regex) => regex.test(app));
}

/**
 * Dominio de una URL, en minúsculas y sin "www." ('https://www.YouTube.com/watch?v=1' → 'youtube.com').
 * @param {string|null|undefined} url
 * @returns {string|null}  null si no hay URL, no se entiende o no tiene dominio (about:blank, file:///…)
 */
export function dominioDe(url) {
  if (typeof url !== 'string' || url.trim() === '') return null;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    // Sin protocolo ("youtube.com/watch"): se prueba como si fuera http.
    try { host = new URL('http://' + url).hostname; } catch { return null; }
  }
  host = host.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  return host === '' ? null : host;
}

/**
 * Duración de un segmento en segundos.
 * @param {{inicio: number, fin: number}} segmento
 * @returns {number}
 */
export function duracionSeg(segmento) {
  return (segmento.fin - segmento.inicio) / MS_SEG;
}

// ── Ayudantes internos ──

/** Texto o null (para app, título y url). */
function textoONull(valor) {
  return typeof valor === 'string' ? valor : null;
}

/** [inicio, fin) en milisegundos enteros de un evento de AW. Con una marca de tiempo inválida, inicio = NaN. */
function tramoDeEvento(evento) {
  const marca = evento?.timestamp;
  const inicio = typeof marca === 'number' ? marca : Date.parse(marca);
  const duracion = Number(evento?.duration);
  return { inicio, fin: inicio + Math.round((Number.isFinite(duracion) ? duracion : 0) * MS_SEG) };
}

/**
 * Eventos de AW → tramos recortados a [desde, hasta), ordenados por inicio.
 * Los que quedan vacíos (duración 0, fuera del rango o con marca de tiempo inválida) se descartan.
 * Con el mismo inicio va primero el más largo; si también empatan, el que llegó antes en la lista.
 */
function tramosRecortados(eventos, desde, hasta) {
  const tramos = [];
  (eventos ?? []).forEach((evento, indice) => {
    const { inicio, fin } = tramoDeEvento(evento);
    const a = Math.max(inicio, desde);
    const b = Math.min(fin, hasta);
    if (b > a) tramos.push({ inicio: a, fin: b, data: evento.data ?? {}, indice }); // con NaN, b > a es false
  });
  return tramos.sort((x, y) => x.inicio - y.inicio || y.fin - x.fin || x.indice - y.indice);
}

/** Periodos (afk o no_afk) → intervalos [inicio, fin) dentro de [desde, hasta), ordenados y unidos (sin solapes). */
function unionDePeriodos(eventos, desde, hasta) {
  const unidos = [];
  for (const { inicio, fin } of tramosRecortados(eventos, desde, hasta)) {
    const ultimo = unidos.at(-1);
    if (ultimo && inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, fin);
    else unidos.push({ inicio, fin });
  }
  return unidos;
}

/**
 * Etiqueta todo [desde, hasta) sin mirar las ventanas: 'afk' dentro de un periodo AFK, 'sin-clasificar' dentro de un
 * periodo no AFK y 'sin-pc' en el resto. Si un instante está en los dos tipos de periodo, gana AFK.
 * Recorre las dos listas una sola vez (como el "merge" de mergesort): O(n).
 */
function fondoDelRango(afk, noAfk, desde, hasta) {
  const piezas = [];
  let i = 0;
  let j = 0;
  let t = desde;
  while (t < hasta) {
    while (i < afk.length && afk[i].fin <= t) i++;      // periodos que ya terminaron
    while (j < noAfk.length && noAfk[j].fin <= t) j++;
    const proximoAfk = i < afk.length ? afk[i].inicio : Infinity;
    const proximoNoAfk = j < noAfk.length ? noAfk[j].inicio : Infinity;
    let clase;
    let fin;
    if (proximoAfk <= t) {
      clase = 'afk';
      fin = afk[i].fin;
    } else if (proximoNoAfk <= t) {
      clase = 'sin-clasificar';
      fin = Math.min(noAfk[j].fin, proximoAfk);           // si empieza un AFK, manda el AFK
    } else {
      clase = 'sin-pc';
      fin = Math.min(proximoAfk, proximoNoAfk);
    }
    fin = Math.min(fin, hasta);
    piezas.push({ inicio: t, fin, clase });
    t = fin;
  }
  return piezas;
}

/** Segmento sin ventana: un hueco 'afk', 'sin-pc' o 'sin-clasificar' (PC en uso sin evento de ventana). */
function segmentoSinVentana(inicio, fin, clase) {
  return {
    inicio,
    fin,
    clase,
    categoria: clase === 'sin-clasificar' ? [SIN_CATEGORIA] : null,
    area: null,
    app: null,
    titulo: null,
    url: null,
    dominio: null,
    audible: false,
    incognito: false,
  };
}

/** Clase de una categoría de AW. Lo desconocido (o una lista vacía) es 'sin-clasificar'. */
function claseDe(categoria) {
  const primera = categoria[0];
  // Object.hasOwn: así un nombre como "constructor" no devuelve algo heredado de Object.
  return Object.hasOwn(CLASE_DE_AW, primera) ? CLASE_DE_AW[primera] : 'sin-clasificar';
}

/**
 * Tramo de ventana (+ evento web elegido, o null) → Segmento.
 * Con `reglas` y una URL, la categoría se vuelve a calcular con app, título y URL (así una regla de URL como
 * "youtube.com/shorts/" sí cuenta, igual que en el agente). Sin URL o sin reglas, vale la categoría que puso AW.
 */
function segmentoDeVentana(tramo, web, reglas = null) {
  const { data } = tramo;
  const datosWeb = web?.data ?? null;
  const url = typeof datosWeb?.url === 'string' && datosWeb.url !== '' ? datosWeb.url : null;
  let categoria = Array.isArray(data.$category) && data.$category.length > 0
    ? data.$category.map(String)
    : [SIN_CATEGORIA];
  if (url !== null && reglas) {
    categoria = categorizar({ app: textoONull(data.app) ?? '', title: textoONull(data.title) ?? '', url }, reglas);
  }
  const clase = claseDe(categoria);
  return {
    inicio: tramo.inicio,
    fin: tramo.fin,
    clase,
    categoria,
    area: clase === 'estudio' ? (categoria[1] ?? SIN_AREA) : null,
    app: textoONull(data.app),
    titulo: textoONull(data.title),
    url,
    dominio: dominioDe(url),
    audible: datosWeb?.audible === true,
    incognito: datosWeb?.incognito === true,
  };
}

/**
 * Eventos de ventana → segmentos ordenados y sin solapes, con los datos web en los navegadores.
 * Solapes: manda el que empezó antes; el otro empieza donde termina el primero (o se descarta si queda vacío).
 */
function segmentosDeVentana(eventos, navegador, desde, hasta, reglas = null) {
  const limpios = [];
  let cursor = -Infinity; // fin del último tramo aceptado
  for (const tramo of tramosRecortados(eventos, desde, hasta)) {
    const inicio = Math.max(tramo.inicio, cursor);
    if (tramo.fin <= inicio) continue; // tapado entero por uno anterior (por ejemplo, un repetido)
    limpios.push({ ...tramo, inicio });
    cursor = tramo.fin;
  }

  // Datos web: un solo recorrido por las dos listas ordenadas (no se compara cada ventana con cada pestaña).
  // `activos` guarda las pestañas que ya empezaron y todavía pueden solaparse con la ventana actual.
  const web = tramosRecortados(navegador, desde, hasta);
  let siguiente = 0;
  let activos = [];
  return limpios.map((tramo) => {
    if (!esNavegador(tramo.data.app)) return segmentoDeVentana(tramo, null);
    while (siguiente < web.length && web[siguiente].inicio < tramo.fin) activos.push(web[siguiente++]);
    activos = activos.filter((w) => w.fin > tramo.inicio); // las que terminaron antes ya no sirven para ninguna
    let elegido = null;
    let mayorSolape = 0;
    for (const w of activos) {
      const solape = Math.min(w.fin, tramo.fin) - Math.max(w.inicio, tramo.inicio);
      if (solape > mayorSolape) { // con empate se queda la que empezó antes
        mayorSolape = solape;
        elegido = w;
      }
    }
    return segmentoDeVentana(tramo, elegido, reglas);
  });
}

/** ¿Dos listas de categoría son iguales? (null = null) */
function mismaCategoria(a, b) {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((parte, i) => parte === b[i]);
}

/**
 * ¿Se pueden unir dos segmentos seguidos? Mismo estado, categoría, app, título y url (y también mismo audible e
 * incognito, para no perder ese dato al unirlos).
 */
function mismaActividad(a, b) {
  return a.clase === b.clase && a.app === b.app && a.titulo === b.titulo && a.url === b.url
    && a.audible === b.audible && a.incognito === b.incognito && mismaCategoria(a.categoria, b.categoria);
}

/** Copia de un segmento (con su propia lista de categoría). */
function copiar(segmento) {
  return { ...segmento, categoria: segmento.categoria ? [...segmento.categoria] : null };
}

/** Une los segmentos iguales que se tocan (fin === inicio). Recibe una lista ordenada y sin solapes. */
function unirIguales(segmentos) {
  const salida = [];
  for (const s of segmentos) {
    const ultimo = salida.at(-1);
    if (ultimo && ultimo.fin === s.inicio && mismaActividad(ultimo, s)) ultimo.fin = s.fin;
    else salida.push(copiar(s));
  }
  return salida;
}

/** Copia ordenada por inicio (con el mismo inicio, primero el más largo) y sin solapes: manda el que empezó antes. */
function ordenarSinSolapes(segmentos) {
  const ordenados = segmentos
    .filter((s) => s && s.fin > s.inicio)
    .map((s, indice) => ({ s, indice }))
    .sort((x, y) => x.s.inicio - y.s.inicio || y.s.fin - x.s.fin || x.indice - y.indice);
  const salida = [];
  let cursor = -Infinity;
  for (const { s } of ordenados) {
    const inicio = Math.max(s.inicio, cursor);
    if (s.fin <= inicio) continue;
    salida.push(inicio === s.inicio ? s : { ...s, inicio });
    cursor = s.fin;
  }
  return salida;
}

// ── Funciones del contrato (§6.7) ──

/**
 * Datos de un día de AW → segmentos que cubren [inicio, min(fin, ahora)) sin huecos ni solapes.
 * - Se descartan los eventos de duración 0; si dos se solapan, manda el que empezó antes y el otro se recorta
 *   (con la misma marca de tiempo manda el más largo, así los eventos repetidos se descartan).
 * - Clase según el primer nivel de data.$category (lo desconocido o sin categoría → 'sin-clasificar');
 *   área = segundo nivel solo en Estudio (o SIN_AREA).
 * - En un navegador se copian url, dominio, audible e incognito del evento web con más solape (sin evento web:
 *   url y dominio null, audible e incognito false).
 * - Huecos: dentro de `afk` → 'afk'; dentro de `no_afk` sin ventana → 'sin-clasificar' (app null); si no → 'sin-pc'.
 *   Si un hueco está en los dos tipos de periodo, gana 'afk'. Si `afk` o `no_afk` faltan, cuentan como [].
 * - Los segmentos contiguos con el mismo estado, categoría, app, título y url (y audible e incognito) se unen.
 * @param {import('./tipos.js').DatosDiaAW} datos
 * - Con `rango.reglas` (ReglasCompiladas), los segmentos de navegador que tienen URL se vuelven a categorizar con
 *   app, título y URL (§6.7, "Categoría de las webs"): una regla que solo coincide por URL también cuenta.
 * @param {{inicio: number, fin: number, ahora?: number, reglas?: import('./tipos.js').ReglasCompiladas}} rango
 *   instantes en ms (también se aceptan Date)
 * @returns {import('./tipos.js').Segmento[]}  [] si ahora ≤ inicio o el rango está vacío
 */
export function segmentar(datos, { inicio, fin, ahora = Infinity, reglas = null } = {}) {
  const desde = Number(inicio);
  const hasta = Math.min(Number(fin), Number(ahora));
  if (!(hasta > desde)) return []; // también descarta NaN

  const fondo = fondoDelRango(
    unionDePeriodos(datos?.afk, desde, hasta),
    unionDePeriodos(datos?.no_afk, desde, hasta),
    desde, hasta);
  const ventana = segmentosDeVentana(datos?.eventos, datos?.navegador, desde, hasta, reglas);

  // Se intercalan las ventanas con los pedazos del fondo que caen entre ellas.
  const salida = [];
  let k = 0; // primer pedazo del fondo que todavía puede servir
  const rellenar = (a, b) => {
    while (k < fondo.length && fondo[k].fin <= a) k++;
    for (let m = k; m < fondo.length && fondo[m].inicio < b; m++) {
      const ini = Math.max(a, fondo[m].inicio);
      const fi = Math.min(b, fondo[m].fin);
      if (fi > ini) salida.push(segmentoSinVentana(ini, fi, fondo[m].clase));
    }
  };
  let t = desde;
  for (const segmento of ventana) {
    rellenar(t, segmento.inicio);
    salida.push(segmento);
    t = segmento.fin;
  }
  rellenar(t, hasta);
  return unirIguales(salida);
}

/**
 * Recorta los segmentos a [inicio, fin) y rellena con 'sin-pc' lo que falte (también si la lista está vacía),
 * para que cubran el rango exacto. Si hubiera solapes, manda el que empezó antes.
 * @param {import('./tipos.js').Segmento[]} segmentos
 * @param {number} inicio
 * @param {number} fin
 * @returns {import('./tipos.js').Segmento[]}  [] si fin ≤ inicio
 */
export function recortarSegmentos(segmentos, inicio, fin) {
  const desde = Number(inicio);
  const hasta = Number(fin);
  if (!(hasta > desde)) return [];
  const salida = [];
  let t = desde;
  for (const s of ordenarSinSolapes(segmentos ?? [])) {
    const a = Math.max(s.inicio, t);
    const b = Math.min(s.fin, hasta);
    if (b <= a) continue;
    if (a > t) salida.push(segmentoSinVentana(t, a, 'sin-pc'));
    salida.push({ ...copiar(s), inicio: a, fin: b });
    t = b;
    if (t >= hasta) break;
  }
  if (t < hasta) salida.push(segmentoSinVentana(t, hasta, 'sin-pc'));
  return unirIguales(salida);
}

/**
 * Une las listas de segmentos de días seguidos (por ejemplo, ayer, hoy y mañana) en una sola lista ordenada, y une
 * los segmentos iguales que se tocan (por ejemplo, un 'sin-pc' que cruza las 04:00).
 * No rellena huecos entre listas que no se tocan (para eso está recortarSegmentos). Si hubiera solapes, manda el
 * que empezó antes.
 * @param {...import('./tipos.js').Segmento[]} listas
 * @returns {import('./tipos.js').Segmento[]}
 */
export function unirSegmentos(...listas) {
  const todos = listas.filter(Array.isArray).flat();
  return unirIguales(ordenarSinSolapes(todos));
}

/**
 * Segundos por estado, con las 7 claves de ESTADOS (las que no aparecen valen 0).
 * @param {import('./tipos.js').Segmento[]} segmentos
 * @returns {Object<string, number>}
 */
export function sumarPorEstado(segmentos) {
  // Se suma en milisegundos (números enteros, sin error de redondeo) y se divide al final.
  const ms = Object.fromEntries(ESTADOS.map((estado) => [estado, 0]));
  for (const s of segmentos ?? []) {
    const clave = Object.hasOwn(ms, s.clase) ? s.clase : 'sin-clasificar';
    ms[clave] += s.fin - s.inicio;
  }
  return Object.fromEntries(ESTADOS.map((estado) => [estado, ms[estado] / MS_SEG]));
}
