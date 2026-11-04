// Día lógico (F2-01, con los check-ins de F5-02): de despertar a dormir, no de 00:00 a 00:00 (arquitectura §10 y §6.7).
//
// Idea: cada noche hay varias horas seguidas sin actividad en la PC (se duerme). Ese "hueco" separa un día del
// siguiente. Para cada inicio de día de AW S (las 04:00 de una fecha) se busca el hueco que hace de noche: su borde
// izquierdo es el fin del día anterior y su borde derecho, el inicio del día. Así la actividad de la 1:00 a. m. es
// del día anterior, y una trasnoche que sigue hasta las 04:30 también. Los check-ins de despertar y dormir mandan
// sobre esta estimación.
//
// Vocabulario:
//   actividad = segmentos de las 5 clases (estudio, ia, neutral, distraccion, sin-clasificar); AFK y Sin PC no cuentan.
//   hueco     = racha sin actividad. Antes de la primera actividad conocida empieza en −∞. Después de la última termina
//               en +∞ ("abierto": la persona todavía no vuelve), pero solo si ya pasaron huecoMin desde ella; si no,
//               ese hueco todavía no existe (la persona puede seguir activa).
//   límite de S = de los huecos de al menos huecoMin que tocan [S − 8 h, S + 8 h]: el que contiene S; si ninguno lo
//               contiene, el más cercano a S; si empatan, el más largo.
//
// Todo es puro: "ahora" entra por parámetro (ms). Con ahora = Infinity (el valor por defecto) se calcula un día pasado
// con todos sus datos.

import { CLASES } from './tipos.js';
import { esFechaValida, esHoraValida, inicioDelDia, sumarDias } from './fechas.js';
import { instanteDeCheckin, ultimoCheckin } from './checkins.js';

const MS_MIN = 60 * 1000;
const MS_HORA = 60 * MS_MIN;
const MS_DIA = 24 * MS_HORA;
/** Medio ancho de la ventana donde se busca el límite de un inicio de día: [S − 8 h, S + 8 h]. */
const VENTANA_MS = 8 * MS_HORA;

// ── Huecos ──

/** Intervalos de actividad [inicio, fin), cortados en `ahora`, ordenados y unidos (los que se tocan forman uno). */
function intervalosDeActividad(segmentos, ahora) {
  const tramos = [];
  for (const s of segmentos ?? []) {
    if (!s || !CLASES.includes(s.clase)) continue;
    const fin = Math.min(s.fin, ahora);
    if (fin > s.inicio) tramos.push({ inicio: s.inicio, fin });
  }
  tramos.sort((a, b) => a.inicio - b.inicio);
  const unidos = [];
  for (const t of tramos) {
    const ultimo = unidos.at(-1);
    if (ultimo && t.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, t.fin);
    else unidos.push({ ...t });
  }
  return unidos;
}

/**
 * Huecos entre las actividades (ordenadas y unidas): {inicio, fin, abierto}.
 * El primero empieza en −∞; el último (abierto, fin = +∞) solo existe si ya pasaron `huecoMs` desde la última actividad.
 * Sin ninguna actividad hay un solo hueco, de −∞ a +∞.
 */
function huecosEntre(actividad, ahora, huecoMs) {
  const huecos = [];
  let anterior = -Infinity; // fin de la actividad anterior
  for (const a of actividad) {
    if (a.inicio > anterior) huecos.push({ inicio: anterior, fin: a.inicio, abierto: false });
    anterior = Math.max(anterior, a.fin);
  }
  if (ahora - anterior >= huecoMs) huecos.push({ inicio: anterior, fin: Infinity, abierto: true });
  return huecos;
}

/** Datos del hueco para comparar candidatos: si contiene S, a qué distancia está de S y cuánto dura. */
function medir(hueco, S) {
  const contiene = hueco.inicio <= S && S < hueco.fin;
  const distancia = contiene ? 0 : (hueco.fin <= S ? S - hueco.fin : hueco.inicio - S);
  return { hueco, contiene, distancia, largo: hueco.fin - hueco.inicio };
}

/** ¿El candidato a es mejor límite que b? Contiene S > más cercano > más largo (si todo empata, se queda el primero). */
function esMejor(a, b) {
  if (a.contiene !== b.contiene) return a.contiene;
  if (a.distancia !== b.distancia) return a.distancia < b.distancia;
  return a.largo > b.largo;
}

/** Elige el límite de S entre los huecos ya calculados (ver limiteDeDia). */
function elegirLimite(huecos, S, huecoMs) {
  let mejor = null;
  for (const hueco of huecos) {
    if (hueco.fin - hueco.inicio < huecoMs) continue;                       // muy corto
    if (hueco.inicio > S + VENTANA_MS || hueco.fin < S - VENTANA_MS) continue; // no toca la ventana
    const candidato = medir(hueco, S);
    if (mejor === null || esMejor(candidato, mejor)) mejor = candidato;
  }
  if (mejor === null) return null;
  const { inicio, fin, abierto } = mejor.hueco;
  return {
    finAnterior: inicio,
    inicioSiguiente: fin,
    hueco: { inicio, fin, abierto, seg: (fin - inicio) / 1000 },
  };
}

/**
 * Límite del inicio de día de AW `S`: el hueco que separa el día anterior del día que empieza en S.
 * De los huecos de al menos `huecoMin` minutos que tocan [S − 8 h, S + 8 h]: el que contiene S; si ninguno lo
 * contiene, el más cercano a S; si empatan, el más largo.
 * @param {import('./tipos.js').Segmento[]} segmentos  ordenados o no; solo cuentan los de actividad
 * @param {number} S  instante (ms) del inicio de día de AW
 * @param {{huecoMin?: number, ahora?: number}} [opciones]  huecoMin en minutos (180)
 * @returns {{finAnterior: number, inicioSiguiente: number,
 *            hueco: {inicio: number, fin: number, abierto: boolean, seg: number}} | null}
 *   finAnterior = fin de la última actividad antes del hueco (−∞ si no la hay); inicioSiguiente = inicio de la
 *   primera actividad después (+∞ si el hueco sigue abierto). hueco.seg = duración en segundos (Infinity si un borde
 *   es infinito). null si ningún hueco sirve.
 */
export function limiteDeDia(segmentos, S, { huecoMin = 180, ahora = Infinity } = {}) {
  const huecoMs = huecoMin * MS_MIN;
  return elegirLimite(huecosEntre(intervalosDeActividad(segmentos, ahora), ahora, huecoMs), S, huecoMs);
}

/**
 * ¿La elección del límite de S ya no puede cambiar con datos nuevos? Los datos nuevos solo llegan después de la
 * última actividad conocida (`ultimaFin`), así que los huecos futuros empiezan ahí o más tarde.
 */
function limiteEstable(limite, S, ultimaFin, ahora) {
  if (limite === null) return ultimaFin > S + VENTANA_MS;   // un hueco futuro ya no tocaría la ventana
  const { hueco } = limite;
  if (hueco.abierto) {
    // Si empieza después de S, ya es el más cercano y los futuros quedan más lejos. Si empieza antes, contiene S
    // mientras no se cierre antes de S, y eso solo puede pasar si todavía no llegamos a S.
    return hueco.inicio > S || ahora >= S;
  }
  if (hueco.inicio <= S && S < hueco.fin) return true;      // contiene S: ninguno le puede ganar
  if (hueco.inicio > S) return true;                         // está después de S y los futuros, más lejos
  return ultimaFin - S > S - hueco.fin;                      // está antes de S: un futuro quedaría más lejos
}

// ── Día lógico ──

/** ¿Hay actividad en [desde, hasta)? */
function hayActividad(actividad, desde, hasta) {
  return actividad.some((a) => a.inicio < hasta && a.fin > desde);
}

/**
 * Día lógico de `fecha` (§10 y el algoritmo de §6.7).
 * - Inicio: check-in de despertar de la fecha → límite de S(fecha), si su inicioSiguiente cae antes de S(fecha + 1)
 *   → S(fecha) ('inicio_dia'). El check-in de despertar manda aunque haya actividad antes.
 * - Fin: check-in de dormir de la fecha (el primer instante con esa hora después del inicio) → límite de
 *   S(fecha + 1).finAnterior → si el día sigue en curso (ahora < S(fecha + 1)): ahora → S(fecha + 1) ('inicio_dia').
 * - Sin datos: si no queda actividad en [inicio, fin) (o fin ≤ inicio): sinDatos, fuenteFin 'sin_datos' e
 *   inicio = fin = S(fecha), o la hora del check-in de despertar si lo hay. Si el inicio cayó en S, la actividad
 *   anterior al borde izquierdo del límite de S no cuenta: es del día anterior (así dos días seguidos no se pisan).
 * - Siempre inicio ≤ fin ≤ inicio + 24 h; despiertoSeg = (fin − inicio) / 1000.
 * - cerrado: el inicio y el fin ya no cambian con datos nuevos de AW (un check-in nuevo sí los cambia).
 * Si hay varios check-ins del mismo tipo y fecha, manda el último registrado; los que no tienen una hora 'HH:MM'
 * válida se ignoran. Los check-ins de otras fechas no se usan.
 * @param {{fecha: string, segmentos: import('./tipos.js').Segmento[], checkins?: import('./tipos.js').Checkin[],
 *          inicioDia?: string, huecoMin?: number, ahora?: number}} entrada
 *   segmentos: los de los días de AW fecha − 1, fecha y fecha + 1 (los que existan), unidos (unirSegmentos).
 *   huecoMin en minutos: plan.umbrales.hueco_sueno_h × 60.
 * @returns {import('./tipos.js').DiaLogico}
 * @throws {Error} si la fecha no es 'AAAA-MM-DD'
 */
export function calcularDiaLogico({ fecha, segmentos, checkins = [], inicioDia = '04:00', huecoMin = 180, ahora = Infinity }) {
  if (!esFechaValida(fecha)) throw new Error(`La fecha del día lógico no es válida: ${fecha}`);
  const huecoMs = huecoMin * MS_MIN;
  const S0 = inicioDelDia(fecha, inicioDia);                 // inicio del día de AW de la fecha
  const S1 = inicioDelDia(sumarDias(fecha, 1), inicioDia);   // y del siguiente

  const actividad = intervalosDeActividad(segmentos, ahora);
  const huecos = huecosEntre(actividad, ahora, huecoMs);
  const ultimaFin = actividad.length > 0 ? actividad.at(-1).fin : -Infinity;
  const limiteInicio = elegirLimite(huecos, S0, huecoMs);
  const limiteFin = elegirLimite(huecos, S1, huecoMs);

  // Check-ins de esta fecha con una hora válida; entre varios, el último registrado.
  const conHora = (checkins ?? []).filter((c) => esHoraValida(c?.valor));
  const despertar = ultimoCheckin(conHora, 'despertar', fecha);
  const dormir = ultimoCheckin(conHora, 'dormir', fecha);

  // ── Inicio ──
  let inicio;
  let fuenteInicio;
  let inicioFijo; // ¿ya no cambia con datos nuevos?
  if (despertar) {
    inicio = instanteDeCheckin(despertar, inicioDia);
    fuenteInicio = 'checkin';
    inicioFijo = true;
  } else if (limiteInicio && limiteInicio.inicioSiguiente < S1) {
    inicio = limiteInicio.inicioSiguiente;
    fuenteInicio = 'actividad';
    inicioFijo = limiteEstable(limiteInicio, S0, ultimaFin, ahora);
  } else {
    // Sin límite, o el hueco del límite pasa de S(fecha + 1) (no hay actividad propia, o sigue abierto).
    inicio = S0;
    fuenteInicio = 'inicio_dia';
    // Un hueco abierto puede cerrarse antes de S(fecha + 1) y entonces el inicio sería esa vuelta.
    inicioFijo = limiteInicio?.hueco.abierto ? ahora >= S1 : limiteEstable(limiteInicio, S0, ultimaFin, ahora);
  }

  // ── Fin ──
  let fin;
  let fuenteFin;
  let finFijo;
  if (dormir) {
    fin = instanteDeCheckin(dormir, inicioDia, { despuesDe: inicio });
    fuenteFin = 'checkin';
    finFijo = true;
  } else if (limiteFin) {
    fin = limiteFin.finAnterior; // puede quedar ≤ inicio (por ejemplo, −∞): entonces es un día sin datos
    fuenteFin = 'actividad';
    finFijo = limiteEstable(limiteFin, S1, ultimaFin, ahora);
  } else if (ahora < S1) {
    // Hoy, sin hueco que cierre el día. (Si ya pasaron huecoMin desde la última actividad, el hueco abierto que
    // empieza en ella contiene S(fecha + 1) y salió arriba como límite: el fin ya es esa última actividad.)
    fin = ahora;
    fuenteFin = 'ahora';
    finFijo = false;
  } else {
    fin = S1;
    fuenteFin = 'inicio_dia';
    finFijo = limiteEstable(null, S1, ultimaFin, ahora);
  }

  const cerrado = inicioFijo && finFijo;

  // ── Sin datos ──
  // Lo que hay antes del borde izquierdo del límite de S es del día anterior (su fin sale de ese mismo límite). Importa
  // cuando el inicio cayó en S: por ejemplo, una trasnoche hasta las 07:00 seguida de un hueco que todavía sigue
  // abierto no es actividad de este día. (Con check-in de despertar, el check-in manda.)
  const desde = fuenteInicio === 'inicio_dia' && limiteInicio ? Math.max(inicio, limiteInicio.finAnterior) : inicio;
  if (!(fin > desde) || !hayActividad(actividad, desde, fin)) {
    const inicioSinDatos = despertar ? inicio : S0;
    return {
      fecha,
      inicio: inicioSinDatos,
      fin: inicioSinDatos,
      fuenteInicio: despertar ? 'checkin' : 'inicio_dia',
      fuenteFin: 'sin_datos',
      cerrado,
      sinDatos: true,
      despiertoSeg: 0,
    };
  }

  fin = Math.min(fin, inicio + MS_DIA); // el día nunca dura más de 24 h
  return {
    fecha,
    inicio,
    fin,
    fuenteInicio,
    fuenteFin,
    cerrado,
    sinDatos: false,
    despiertoSeg: (fin - inicio) / 1000,
  };
}
