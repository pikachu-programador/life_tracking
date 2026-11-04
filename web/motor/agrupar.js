// Agrupar y filtrar segmentos (V-01, V-08): "¿cuánto tiempo hubo en cada app, dominio, categoría…?"
// y "dame solo los segmentos de YouTube".
//
// Solo cuenta la ACTIVIDAD (las 5 clases de CLASES): AFK y Sin PC no tienen app ni título.
// Los segmentos no se modifican: las funciones devuelven listas u objetos nuevos.

import { CLASES, ESTADOS } from './tipos.js';

/** Las claves por las que se puede agrupar. */
export const CLAVES_AGRUPAR = ['app', 'dominio', 'url', 'titulo', 'categoria', 'area'];

/** Los tipos de consulta de filtrarSegmentos. */
export const TIPOS_FILTRO = ['categoria', 'app', 'dominio', 'palabra'];

/** Separador de la ruta de una categoría: ['Distracción', 'Video'] → 'Distracción > Video'. */
const SEPARADOR = ' > ';

// Un Set responde "¿está?" de una vez, sin recorrer la lista (como std::unordered_set en C++).
const ES_ACTIVIDAD = new Set(CLASES);

/** ¿El segmento es actividad (no AFK ni Sin PC)? */
function esActividad(segmento) {
  return ES_ACTIVIDAD.has(segmento.clase);
}

/** Duración de un segmento en segundos (los instantes están en ms). */
function segundosDe(segmento) {
  return Math.max(0, segmento.fin - segmento.inicio) / 1000;
}

/** Texto vacío, null o undefined → null; si no, el mismo texto. */
function textoONull(texto) {
  return typeof texto === 'string' && texto !== '' ? texto : null;
}

/** Valor de la clave de agrupación en un segmento (null si no tiene). */
function valorDeClave(segmento, clave) {
  switch (clave) {
    case 'app': return textoONull(segmento.app);
    case 'dominio': return textoONull(segmento.dominio);
    case 'url': return textoONull(segmento.url);
    case 'titulo': return textoONull(segmento.titulo);
    case 'area': return textoONull(segmento.area);
    case 'categoria':
      return Array.isArray(segmento.categoria) && segmento.categoria.length > 0 ? segmento.categoria.join(SEPARADOR) : null;
    default: return null;
  }
}

/**
 * Tiempo de actividad por 'app', 'dominio', 'url', 'titulo', 'categoria' (ruta unida con ' > ') o 'area',
 * de mayor a menor. Se ignoran los segmentos de AFK y Sin PC y los que no tienen esa clave.
 * @param {import('./tipos.js').Segmento[]} segmentos
 * @param {('app'|'dominio'|'url'|'titulo'|'categoria'|'area')} clave
 * @param {{filtro?: (segmento: import('./tipos.js').Segmento) => boolean}} [opciones]  filtro: solo cuentan los que devuelven true
 * @returns {Array<{clave: string, segundos: number, porEstado: Object<string, number>}>}
 *   porEstado tiene las 7 claves de ESTADOS (AFK y Sin PC siempre en 0). En empate de segundos, orden alfabético.
 * @throws {Error} si la clave no es una de CLAVES_AGRUPAR
 */
export function agruparPor(segmentos, clave, { filtro } = {}) {
  if (!CLAVES_AGRUPAR.includes(clave)) {
    throw new Error(`No se puede agrupar por "${clave}": las claves válidas son ${CLAVES_AGRUPAR.join(', ')}`);
  }
  // Un Map guarda pares clave → valor y recuerda el orden en que se agregaron (como std::map, pero sin ordenar).
  const grupos = new Map();
  for (const segmento of segmentos ?? []) {
    if (!esActividad(segmento)) continue;
    if (filtro && !filtro(segmento)) continue;
    const valor = valorDeClave(segmento, clave);
    if (valor === null) continue;
    if (!grupos.has(valor)) {
      // Object.fromEntries arma un objeto a partir de pares [clave, valor]: {estudio: 0, ia: 0, …}.
      grupos.set(valor, { clave: valor, segundos: 0, porEstado: Object.fromEntries(ESTADOS.map((e) => [e, 0])) });
    }
    const grupo = grupos.get(valor);
    const seg = segundosDe(segmento);
    grupo.segundos += seg;
    grupo.porEstado[segmento.clase] += seg;
  }
  // sort recibe una función que compara dos elementos: negativo = a va antes que b.
  return [...grupos.values()].sort((a, b) => b.segundos - a.segundos || (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0));
}

/**
 * Texto para buscar "sin distinguir mayúsculas ni tildes": 'Inglés' → 'ingles'.
 * normalize('NFD') separa cada letra de su tilde ('é' → 'e' + '´') y la regex borra las tildes sueltas (\p{M}).
 */
function sinTildes(texto) {
  return String(texto).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** 'Estudio > Inglés' → ['Estudio', 'Inglés'] (también acepta la ruta ya como lista). */
function rutaDe(valor) {
  const partes = Array.isArray(valor) ? valor : String(valor).split('>');
  return partes.map((p) => String(p).trim()).filter((p) => p !== '');
}

/** Dominio escrito por la persona → comparable con Segmento.dominio (minúsculas y sin "www."). */
function dominioDe(valor) {
  return String(valor).trim().toLowerCase().replace(/^www\./, '');
}

/**
 * Prueba que decide si un segmento coincide con la consulta.
 * @returns {((segmento: import('./tipos.js').Segmento) => boolean)|null}  null si el valor está vacío
 */
function pruebaDe({ tipo, valor } = {}) {
  switch (tipo) {
    case 'categoria': {
      const ruta = rutaDe(valor ?? '');
      if (ruta.length === 0) return null;
      // Coincide si la categoría del segmento EMPIEZA con esa ruta: 'Estudio' coincide con ['Estudio', 'Inglés'].
      return (s) => Array.isArray(s.categoria) && s.categoria.length >= ruta.length && ruta.every((parte, i) => s.categoria[i] === parte);
    }
    case 'app': {
      const app = String(valor ?? '').trim().toLowerCase();
      if (app === '') return null;
      return (s) => typeof s.app === 'string' && s.app.toLowerCase() === app;
    }
    case 'dominio': {
      const dominio = dominioDe(valor ?? '');
      if (dominio === '') return null;
      // El mismo dominio o un subdominio: 'youtube.com' coincide con 'm.youtube.com', pero no con 'noyoutube.com'.
      return (s) => {
        if (typeof s.dominio !== 'string') return false;
        const d = s.dominio.toLowerCase();
        return d === dominio || d.endsWith('.' + dominio);
      };
    }
    case 'palabra': {
      const palabra = sinTildes(String(valor ?? '').trim());
      if (palabra === '') return null;
      return (s) => [s.titulo, s.url].some((texto) => typeof texto === 'string' && sinTildes(texto).includes(palabra));
    }
    default: throw new Error(`Tipo de consulta desconocido: "${tipo}" (válidos: ${TIPOS_FILTRO.join(', ')})`);
  }
}

/**
 * Segmentos de actividad que coinciden con una consulta del explorador (V-08):
 * - {tipo: 'categoria', valor: 'Estudio > Inglés'}: la categoría empieza con esa ruta.
 * - {tipo: 'app', valor: 'Code.exe'}: la misma app, sin distinguir mayúsculas.
 * - {tipo: 'dominio', valor: 'youtube.com'}: ese dominio o un subdominio (m.youtube.com).
 * - {tipo: 'palabra', valor: 'inglés'}: aparece en el título o en la URL, sin distinguir mayúsculas ni tildes.
 * Un valor vacío no coincide con nada (devuelve []).
 * @param {import('./tipos.js').Segmento[]} segmentos
 * @param {{tipo: ('categoria'|'app'|'dominio'|'palabra'), valor: string}} consulta
 * @returns {import('./tipos.js').Segmento[]}  los mismos objetos (no copias), en el mismo orden
 * @throws {Error} si el tipo no es uno de TIPOS_FILTRO
 */
export function filtrarSegmentos(segmentos, consulta) {
  const prueba = pruebaDe(consulta);
  if (prueba === null) return [];
  return (segmentos ?? []).filter((s) => esActividad(s) && prueba(s));
}
