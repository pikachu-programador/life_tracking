// Transformaciones de eventos del AW falso (H-01): las funciones del lenguaje de consultas de AW que usa
// la consulta canónica (web/js/consultas.js), escritas en JS con la misma semántica que aw-core
// (aw_transform/*.py) y aw-server-rust.
//
// Por dentro, un evento es { id?, inicio, fin, data } con inicio y fin en milisegundos (enteros).
// Comparar números es más rápido y simple que comparar fechas en texto. aEventoAW() lo pasa a la forma de
// AW ({ id, timestamp, duration, data }) solo al responder.
//
// Ninguna función modifica los eventos que recibe: devuelven eventos nuevos (los `data` se comparten
// cuando no cambian, y se copian cuando cambian).

import { categorizarEventos } from '../../web/motor/clasificador.js';

// ── Conversión ──

/** Texto ISO 8601 como lo escribe AW: "2026-10-05T11:55:00.000000+00:00". */
export function isoDeAW(ms) {
  return new Date(ms).toISOString().slice(0, 23) + '000+00:00';
}

/**
 * Evento de AW → evento interno. Los instantes se redondean al milisegundo.
 * @param {{id?: number, timestamp: string, duration?: number, data?: object}} evento
 * @returns {{id?: number, inicio: number, fin: number, data: object}}
 * @throws {Error} si el timestamp o la duración no son válidos
 */
export function aInterno(evento) {
  const inicio = Date.parse(evento?.timestamp);
  if (!Number.isFinite(inicio)) throw new Error(`timestamp inválido: ${JSON.stringify(evento?.timestamp)}`);
  const duracion = evento.duration ?? 0;
  if (typeof duracion !== 'number' || !Number.isFinite(duracion) || duracion < 0) {
    throw new Error(`duration inválida: ${JSON.stringify(evento.duration)}`);
  }
  const data = evento.data && typeof evento.data === 'object' && !Array.isArray(evento.data) ? evento.data : {};
  const interno = { inicio, fin: inicio + Math.round(duracion * 1000), data };
  if (evento.id !== undefined && evento.id !== null) interno.id = evento.id;
  return interno;
}

/** Evento interno → forma de AW: { id?, timestamp, duration (s), data }. */
export function aEventoAW(evento) {
  const salida = {};
  if (evento.id !== undefined) salida.id = evento.id;
  salida.timestamp = isoDeAW(evento.inicio);
  salida.duration = (evento.fin - evento.inicio) / 1000;
  salida.data = evento.data;
  return salida;
}

// ── Igualdad de datos (como == entre diccionarios de Python) ──

/** ¿Dos valores JSON son iguales? Compara objetos y listas por contenido; el orden de las claves no importa. */
export function igualesJSON(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // En Python, True == 1 y False == 0; aquí se respeta para los booleanos de las consultas.
    if (typeof a === 'boolean' && typeof b === 'number') return Number(a) === b;
    if (typeof a === 'number' && typeof b === 'boolean') return a === Number(b);
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => igualesJSON(x, b[i]));
  const claves = Object.keys(a);
  if (claves.length !== Object.keys(b).length) return false;
  return claves.every((k) => Object.hasOwn(b, k) && igualesJSON(a[k], b[k]));
}

// ── Orden ──

/**
 * Orden por inicio; en empate, el más corto primero. AW no fija el orden de dos eventos con el mismo
 * timestamp (depende de la base de datos); este desempate hace que flood una bien los "parpadeos"
 * (eventos de duración 0) y las marcas de tiempo repetidas.
 */
function porInicio(a, b) {
  return a.inicio - b.inicio || (a.fin - a.inicio) - (b.fin - b.inicio);
}

/** sort_by_timestamp: ordenados por inicio (copia; el sort de JS es estable). */
export function sortByTimestamp(eventos) {
  return [...eventos].sort((a, b) => a.inicio - b.inicio);
}

/** concat: une listas. */
export function concat(...listas) {
  return listas.flat();
}

// ── query_bucket ──

/**
 * query_bucket: eventos que se solapan con [inicio, fin] (bordes incluidos, como AW), recortados al periodo
 * (como el servidor de Rust y el almacén de peewee de Python), del más nuevo al más viejo.
 * @param {Array<{inicio: number, fin: number}>} eventos  ordenados por inicio
 * @param {number} inicio
 * @param {number} fin
 * @param {number} [duracionMaxima=Infinity]  la duración más larga del bucket: acota la búsqueda
 */
export function recortarAlPeriodo(eventos, inicio, fin, duracionMaxima = Infinity) {
  // Búsqueda binaria: el primer evento que puede llegar a `inicio` empieza, como muy pronto, en
  // inicio − duracionMaxima. Así no se recorre todo el bucket por cada día.
  const desde = Number.isFinite(duracionMaxima) ? primeroDesde(eventos, inicio - duracionMaxima) : 0;
  const salida = [];
  for (let i = desde; i < eventos.length && eventos[i].inicio <= fin; i++) {
    const e = eventos[i];
    if (e.fin < inicio) continue;
    salida.push({ ...e, inicio: Math.max(e.inicio, inicio), fin: Math.min(e.fin, fin) });
  }
  return salida.reverse();
}

/** Índice del primer evento con inicio ≥ t (eventos ordenados por inicio). */
export function primeroDesde(eventos, t) {
  let bajo = 0;
  let alto = eventos.length;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1;
    if (eventos[medio].inicio < t) bajo = medio + 1;
    else alto = medio;
  }
  return bajo;
}

// ── flood ──

/**
 * flood (aw-core/aw_transform/flood.py): rellena los huecos chicos entre eventos seguidos.
 *   - Hueco de hasta `pulsetime` s (o solape menor que 0,1 s): el evento más largo se estira hasta tocar al
 *     otro; si los dos tienen los mismos datos, se unen en uno.
 *   - Solape con los mismos datos: se unen.
 *   - Al final se descartan los eventos de duración 0.
 * @param {Array<{inicio: number, fin: number, data: object}>} eventos
 * @param {number} [pulsetime=5]  segundos
 */
export function flood(eventos, pulsetime = 5) {
  const lista = eventos.map((e) => ({ ...e })).sort(porInicio);
  const pulso = pulsetime * 1000;
  const solapeTolerado = 100; // ms: un solape más chico que esto se trata como hueco 0

  for (let i = 0; i + 1 < lista.length; i++) {
    const e1 = lista[i];
    const e2 = lista[i + 1];
    const hueco = e2.inicio - e1.fin;
    if (hueco === 0) continue;
    const mismos = igualesJSON(e1.data, e2.data);

    if (hueco < 0 && mismos) {
      // Se solapan con los mismos datos: e1 cubre a los dos y e2 queda en duración 0 (se descarta al final).
      const inicio = Math.min(e1.inicio, e2.inicio);
      const fin = Math.max(e1.fin, e2.fin);
      e1.inicio = inicio; e1.fin = fin;
      e2.inicio = fin; e2.fin = fin;
    } else if (-solapeTolerado < hueco && hueco <= pulso) {
      if (e1.fin - e1.inicio >= e2.fin - e2.inicio) {
        // Manda el más largo (e1).
        if (mismos) { e1.fin = e2.fin; e2.inicio = e2.fin; }
        else e1.fin = e2.inicio;
      } else if (mismos) {
        // Manda e2: empieza donde empezaba e1, y e1 queda en duración 0.
        e2.inicio = e1.inicio; e1.fin = e1.inicio;
      } else {
        e2.inicio = e1.fin;
      }
    }
    // Un solape con datos distintos no se toca (AW solo avisa en el registro).
  }
  return lista.filter((e) => e.fin > e.inicio);
}

// ── Filtros ──

/** filter_keyvals: los eventos cuyo data[clave] es uno de `valores`. */
export function filterKeyvals(eventos, clave, valores) {
  return eventos.filter((e) => Object.hasOwn(e.data, clave) && valores.some((v) => igualesJSON(v, e.data[clave])));
}

/** filter_keyvals_regex: los eventos cuyo data[clave] es un texto en el que se encuentra `regex`. */
export function filterKeyvalsRegex(eventos, clave, regex) {
  return eventos.filter((e) => typeof e.data[clave] === 'string' && regex.test(e.data[clave]));
}

/**
 * filter_period_intersect: las partes de cada evento que caen dentro de algún periodo de `filtro`.
 * Un evento que cruza varios periodos da varias partes (cada una con los datos y el id del evento).
 * Los periodos del filtro que se solapan se unen antes, para no contar dos veces el mismo tiempo.
 * @returns eventos ordenados por inicio
 */
export function filterPeriodIntersect(eventos, filtro) {
  const periodos = unirSolapados(filtro);
  const salida = [];
  for (const e of [...eventos].sort((a, b) => a.inicio - b.inicio)) {
    // Primer periodo que termina después de que empieza el evento.
    let bajo = 0;
    let alto = periodos.length;
    while (bajo < alto) {
      const medio = (bajo + alto) >> 1;
      if (periodos[medio].fin <= e.inicio) bajo = medio + 1;
      else alto = medio;
    }
    for (let j = bajo; j < periodos.length && periodos[j].inicio < e.fin; j++) {
      const inicio = Math.max(e.inicio, periodos[j].inicio);
      const fin = Math.min(e.fin, periodos[j].fin);
      if (fin > inicio) salida.push({ ...e, inicio, fin });
    }
  }
  return salida;
}

/** Periodos ordenados, con los que se solapan (no los que solo se tocan) unidos en uno. */
function unirSolapados(eventos) {
  const ordenados = eventos.map(({ inicio, fin }) => ({ inicio, fin })).sort((a, b) => a.inicio - b.inicio);
  const unidos = [];
  for (const p of ordenados) {
    const ultimo = unidos.at(-1);
    if (ultimo && p.inicio < ultimo.fin) ultimo.fin = Math.max(ultimo.fin, p.fin);
    else unidos.push(p);
  }
  return unidos;
}

/**
 * period_union: la unión de los periodos de las dos listas, sin solapes. Como en AW, los datos se borran
 * (data = {}) porque no se pueden mantener coherentes al unir; cada periodo conserva el id del primero.
 * Dos periodos que se tocan también se unen.
 */
export function periodUnion(eventos1, eventos2) {
  const ordenados = [...eventos1, ...eventos2].sort((a, b) => a.inicio - b.inicio);
  const unidos = [];
  for (const e of ordenados) {
    const ultimo = unidos.at(-1);
    if (ultimo && e.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, e.fin);
    else unidos.push({ ...e, data: {} });
  }
  return unidos;
}

// ── split_url_events ──

// Esquemas que, en Python, admiten ";parámetros" en la ruta (urllib.parse.uses_params).
const USAN_PARAMETROS = new Set(['', 'ftp', 'hdl', 'prospero', 'http', 'imap', 'https', 'shttp', 'rtsp', 'rtsps', 'rtspu', 'sip', 'sips', 'mms', 'sftp', 'tel']);

/**
 * Parte una URL como urllib.parse.urlparse de Python (que es lo que usa AW).
 * @returns {{esquema: string, red: string, ruta: string, parametros: string, consulta: string, fragmento: string}}
 */
export function partirUrl(url) {
  let resto = url;
  let esquema = '';
  const dosPuntos = resto.indexOf(':');
  if (dosPuntos > 0 && /^[A-Za-z][A-Za-z0-9+.-]*$/.test(resto.slice(0, dosPuntos))) {
    esquema = resto.slice(0, dosPuntos).toLowerCase();
    resto = resto.slice(dosPuntos + 1);
  }
  let red = '';
  if (resto.startsWith('//')) {
    const corte = resto.slice(2).search(/[/?#]/);
    red = corte === -1 ? resto.slice(2) : resto.slice(2, 2 + corte);
    resto = corte === -1 ? '' : resto.slice(2 + corte);
  }
  let fragmento = '';
  const numeral = resto.indexOf('#');
  if (numeral !== -1) { fragmento = resto.slice(numeral + 1); resto = resto.slice(0, numeral); }
  let consulta = '';
  const pregunta = resto.indexOf('?');
  if (pregunta !== -1) { consulta = resto.slice(pregunta + 1); resto = resto.slice(0, pregunta); }
  let parametros = '';
  if (USAN_PARAMETROS.has(esquema) && resto.includes(';')) {
    // Los parámetros van después del último "/" (o en toda la ruta si no hay "/").
    const desde = resto.includes('/') ? resto.lastIndexOf('/') : 0;
    const puntoYComa = resto.indexOf(';', desde);
    if (puntoYComa !== -1) { parametros = resto.slice(puntoYComa + 1); resto = resto.slice(0, puntoYComa); }
  }
  return { esquema, red, ruta: resto, parametros, consulta, fragmento };
}

/**
 * split_url_events: a cada evento con data.url le agrega $protocol, $domain (sin "www."), $path,
 * $params, $options (la parte después de "?") e $identifier (la parte después de "#").
 */
export function splitUrlEvents(eventos) {
  return eventos.map((e) => {
    if (typeof e.data.url !== 'string') return e;
    const p = partirUrl(e.data.url);
    return {
      ...e,
      data: {
        ...e.data,
        $protocol: p.esquema,
        $domain: p.red.startsWith('www.') ? p.red.slice(4) : p.red,
        $path: p.ruta,
        $params: p.parametros,
        $options: p.consulta,
        $identifier: p.fragmento,
      },
    };
  });
}

// ── categorize ──

/** categorize: copia de los eventos con data.$category, con el clasificador del motor (§7). */
export function categorize(eventos, compiladas) {
  return categorizarEventos(eventos, compiladas);
}
