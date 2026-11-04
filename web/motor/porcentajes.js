// % del día y de varios días, horas por curso y por área (F4-03, arquitectura §9).
//
// % del día = Σ(peso × duración) ÷ Σ(duración), con peso 1 (cumplido), 0,5 (parcial) y 0 (fallido).
// - Duración: la planificada en los bloques (duracionPlanSeg) y pesoSeg en las rutinas.
// - Solo entran bloques y rutinas medibles: 'pendiente', 'en_curso' y 'no_medible' no cuentan. Las clases no entran.
// - El % de la semana (o de cualquier período) es la misma fórmula con todos sus bloques y rutinas juntos;
//   NO es el promedio de los % diarios (un día con un solo bloque de 30 min no pesa lo mismo que uno con 6 h).
//
// Horas por curso = Estudio dentro de los bloques de ese curso (el bloque sabe su curso). Fuera de los bloques solo
// hay horas por área, porque dos cursos pueden compartir área (por ejemplo, BD I y DBP son de Programación).

import { PESO_ESTADO, SIN_AREA, CLASES } from './tipos.js';
import { asignarContexto } from './contexto.js';
import { evaluarBloque } from './cumplimiento.js';

/** Margen para comparar números con decimales (0,8 guardado en binario no es exacto). */
const EPSILON = 1e-9;

/**
 * % ponderado del día (§9).
 * @param {import('./tipos.js').EstadoBloque[]} bloques
 * @param {import('./tipos.js').EstadoRutina[]} rutinas
 * @param {import('./tipos.js').Umbrales} umbrales  usa dia_cumplido
 * @returns {import('./tipos.js').PorcentajeDia}  porcentaje y cumplido en null si no hay nada medible
 */
export function porcentajeDia(bloques, rutinas, umbrales) {
  let pesoTotal = 0;   // Σ duración de lo medible (segundos)
  let pesoLogrado = 0; // Σ peso del estado × duración
  let medibles = 0;
  const sumar = (estado, duracion) => {
    // Object.hasOwn y no "in": "toString" in PESO_ESTADO también daría true (viene del prototipo de Object).
    if (!Object.hasOwn(PESO_ESTADO, estado)) return; // pendiente, en_curso, no_medible
    if (!Number.isFinite(duracion) || duracion <= 0) return; // sin duración no pesa
    pesoTotal += duracion;
    pesoLogrado += PESO_ESTADO[estado] * duracion;
    medibles++;
  };
  for (const b of bloques ?? []) sumar(b.estado, b.duracionPlanSeg);
  for (const r of rutinas ?? []) sumar(r.estado, r.pesoSeg);

  const porcentaje = pesoTotal > 0 ? pesoLogrado / pesoTotal : null;
  return {
    porcentaje,
    cumplido: porcentaje === null ? null : porcentaje >= umbrales.dia_cumplido - EPSILON,
    pesoSeg: pesoTotal,
    medibles,
  };
}

/**
 * La misma fórmula con varios días (semana, mes o rango): junta todos sus bloques y rutinas.
 * @param {Array<{bloques: import('./tipos.js').EstadoBloque[], rutinas: import('./tipos.js').EstadoRutina[]}>} dias
 * @param {import('./tipos.js').Umbrales} umbrales
 * @returns {import('./tipos.js').PorcentajeDia}
 */
export function porcentajeVarios(dias, umbrales) {
  const bloques = [];
  const rutinas = [];
  for (const d of dias ?? []) {
    bloques.push(...(d?.bloques ?? []));
    rutinas.push(...(d?.rutinas ?? []));
  }
  return porcentajeDia(bloques, rutinas, umbrales);
}

/**
 * Horas de cada curso en un día.
 * - bloquesSeg: Estudio dentro de los bloques del curso (segmentos con contexto 'bloque' y ese cursoId; la IA no cuenta).
 * - papelSeg: en los bloques estudio_papel del curso con check-in "hecho", su duración real (de inicio a fin)
 *   MENOS el tiempo de actividad en la PC dentro del bloque (las 5 clases de CLASES; AFK y Sin PC no restan).
 *   Ejemplo (10-16): 90 min de papel con 20 min de redes en medio → 70 min. Así estudioTotalSeg (Estudio en PC +
 *   papel) no cuenta dos veces un rato de Estudio en la PC durante el papel, ni cuenta como papel el rato en redes.
 * Incluye con 0 los cursos de los bloques del día. Si los segmentos no traen contexto, se calcula con `items`.
 * @param {import('./tipos.js').SegmentoConContexto[]} segmentos  del día
 * @param {import('./tipos.js').ItemsDelDia} items
 * @param {import('./tipos.js').Checkin[]} checkins  del día
 * @returns {Object<string, {bloquesSeg: number, papelSeg: number}>}
 */
export function horasPorCurso(segmentos, items, checkins) {
  const lista = segmentos ?? [];
  const conContexto = lista.every((s) => s.contexto !== undefined) ? lista : asignarContexto(lista, items);
  const bloquesMs = {}; // curso → ms (se suma en ms, que son enteros, y se pasa a segundos al final)
  const papelMs = {};
  const curso = (id) => {
    bloquesMs[id] ??= 0; // ??= asigna solo si todavía no tiene valor
    papelMs[id] ??= 0;
  };

  for (const b of items?.bloques ?? []) curso(b.curso);
  for (const s of conContexto) {
    if (s.clase !== 'estudio' || s.contexto !== 'bloque' || s.cursoId == null || !(s.fin > s.inicio)) continue;
    curso(s.cursoId);
    bloquesMs[s.cursoId] += s.fin - s.inicio;
  }
  for (const b of items?.bloques ?? []) {
    if (b.tipo !== 'estudio_papel' || !(b.fin > b.inicio)) continue;
    // evaluarBloque ya sabe qué check-in manda (el de ese bloque y esa fecha, el más reciente): se reutiliza.
    // Los umbrales no hacen falta para leer el check-in, por eso va {}.
    if (evaluarBloque(b, [], checkins, {}).checkin !== 'hecho') continue;
    // Actividad en la PC dentro del bloque: los segmentos de este bloque (por contexto), recortados a sus bordes.
    let activoMs = 0;
    for (const s of conContexto) {
      if (s.bloqueId !== b.id || !CLASES.includes(s.clase)) continue;
      const desde = Math.max(s.inicio, b.inicio);
      const hasta = Math.min(s.fin, b.fin);
      if (hasta > desde) activoMs += hasta - desde;
    }
    papelMs[b.curso] += Math.max(0, b.fin - b.inicio - activoMs);
  }

  const resultado = {};
  for (const id of Object.keys(bloquesMs)) resultado[id] = { bloquesSeg: bloquesMs[id] / 1000, papelSeg: papelMs[id] / 1000 };
  return resultado;
}

/**
 * Estudio por área, dentro y fuera de los bloques (todo el Estudio de los segmentos).
 * @param {import('./tipos.js').Segmento[]} segmentos
 * @returns {Object<string, number>}  área → segundos; solo las áreas que aparecen
 */
export function horasPorArea(segmentos) {
  const ms = {};
  for (const s of segmentos ?? []) {
    if (s.clase !== 'estudio' || !(s.fin > s.inicio)) continue;
    const area = s.area ?? s.categoria?.[1] ?? SIN_AREA;
    ms[area] = (ms[area] ?? 0) + (s.fin - s.inicio);
  }
  return Object.fromEntries(Object.entries(ms).map(([area, total]) => [area, total / 1000]));
}
