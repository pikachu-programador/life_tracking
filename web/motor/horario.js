// Expansor de horario (arquitectura §8, F3-03): del plan (una plantilla semanal) a lo que toca en un
// día lógico concreto, con las horas ya convertidas en instantes (ms desde 1970, UTC).
//
// Reglas (§8):
// - Clases y bloques semanales: solo dentro del ciclo (inicio ≤ fecha ≤ fin) y en sus días de la semana.
// - Bloques únicos: solo en su fecha, aunque caiga fuera del ciclo.
// - Rutinas: según sus días, aunque no haya ciclo.
// - Una hora anterior al inicio del día (04:00) es de la madrugada del día calendario siguiente:
//   "lunes 00:30" es el martes a las 00:30. Si el fin queda antes o igual que el inicio, el fin es
//   del día siguiente (23:30–00:30 dura 1 h). Lima no tiene horario de verano: "el día siguiente a la
//   misma hora" es siempre 24 h después.
// - Excepciones que cubren la fecha: 'cancelar_clases_y_bloques' quita clases y bloques semanales,
//   'cancelar_bloques' quita bloques semanales y 'subir_bloques_a_total' sube todos los bloques a total.
//   Los bloques únicos no se cancelan: tienen una fecha puesta a mano, que es más específica que la
//   excepción (por ejemplo, un repaso agregado en semana de exámenes, o "Empezar bloque ahora" en un feriado).
//   Las rutinas no cambian.

import { normalizarPlan } from './plan.js';
import { esFechaValida, esHoraValida, instanteDelPlan, diaSemana, diasDelRango } from './fechas.js';

const MS_DIA = 24 * 60 * 60 * 1000;

/** ¿Es un objeto "de llaves" ({ … })? */
function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function tieneId(item) {
  return typeof item.id === 'string' && item.id !== '';
}

/** Instantes [inicio, fin) de una franja 'HH:MM'–'HH:MM' del día del plan `fecha`. La duración siempre es > 0. */
function franja(fecha, inicio, fin, inicioDia) {
  const a = instanteDelPlan(fecha, inicio, inicioDia);
  let b = instanteDelPlan(fecha, fin, inicioDia);
  if (b <= a) b += MS_DIA; // cruza la medianoche (o el inicio del día): el fin es del día siguiente
  return [a, b];
}

/** Revisa los parámetros comunes; un error aquí es de programación, por eso se lanza. */
function leerOpciones(opciones, quien) {
  const inicioDia = opciones?.inicioDia ?? '04:00';
  if (!esHoraValida(inicioDia)) throw new TypeError(`${quien}: inicioDia ${JSON.stringify(inicioDia)} no es una hora HH:MM.`);
  return inicioDia;
}

function revisarFecha(fecha, quien) {
  if (!esFechaValida(fecha)) throw new TypeError(`${quien}: la fecha ${JSON.stringify(fecha)} no es válida (usa AAAA-MM-DD).`);
}

/** Lo que hace expandirDia, con un plan ya normalizado (expandirRango normaliza una sola vez). */
function expandirNormalizado(plan, fecha, inicioDia) {
  const { ciclo } = plan;
  const enCiclo = esFechaValida(ciclo.inicio) && esFechaValida(ciclo.fin) && ciclo.inicio <= fecha && fecha <= ciclo.fin;
  const dia = diaSemana(fecha);

  // Las fechas 'AAAA-MM-DD' se pueden comparar como texto: el orden alfabético es el de las fechas.
  const excepciones = plan.excepciones
    .filter((e) => esObjeto(e) && esFechaValida(e.desde) && esFechaValida(e.hasta) && e.desde <= fecha && fecha <= e.hasta)
    .map((e) => ({ ...e })); // copias: cada día tiene las suyas
  const efectos = new Set(excepciones.map((e) => e.efecto));
  const sinClases = efectos.has('cancelar_clases_y_bloques');
  const sinSemanales = sinClases || efectos.has('cancelar_bloques');
  const aTotal = efectos.has('subir_bloques_a_total');

  // Solo se expande lo que tiene id y horas válidas; lo demás lo reporta validarPlan.
  const usable = (item) => esObjeto(item) && tieneId(item) && esHoraValida(item.inicio) && esHoraValida(item.fin);
  const toca = (dias) => Array.isArray(dias) && dias.includes(dia);

  const clases = (enCiclo && !sinClases ? plan.clases : [])
    .filter((c) => usable(c) && toca(c.dias))
    .map((c) => {
      const [inicio, fin] = franja(fecha, c.inicio, c.fin, inicioDia);
      return {
        id: `${c.id}@${fecha}`, claseId: c.id, curso: c.curso, tipo: c.tipo,
        inicio, fin, lugar: c.lugar ?? '', usaPc: c.usa_pc === true,
      };
    });

  const bloques = plan.bloques
    .filter((b) => {
      if (!usable(b) || !esObjeto(b.repeticion)) return false;
      if (b.repeticion.tipo === 'unica') return b.repeticion.fecha === fecha;
      return b.repeticion.tipo === 'semanal' && enCiclo && !sinSemanales && toca(b.repeticion.dias);
    })
    .map((b) => {
      const [inicio, finPlan] = franja(fecha, b.inicio, b.fin, inicioDia);
      let fin = finPlan;
      let terminadoAntes = null;
      // Si se terminó antes ese día, manda la hora real (si hay varios registros, el último).
      const t = (b.terminados_antes ?? []).findLast((x) => esObjeto(x) && x.fecha === fecha && esHoraValida(x.fin));
      if (t) {
        fin = instanteDelPlan(fecha, t.fin, inicioDia);
        if (fin < inicio) fin += MS_DIA;
        fin = Math.min(fin, finPlan); // nunca después del fin planificado (validarPlan lo marca como error)
        terminadoAntes = { fin, motivo: t.motivo ?? '' };
      }
      return {
        id: `${b.id}@${fecha}`, bloqueId: b.id, tipo: b.tipo, curso: b.curso,
        inicio, fin, finPlan,
        nivel: aTotal ? 'total' : b.nivel,
        subidoPorExcepcion: aTotal,
        objetivo: b.objetivo ?? '', porQue: b.por_que ?? '',
        terminadoAntes,
      };
    });

  const rutinas = plan.rutinas
    .filter((r) => esObjeto(r) && tieneId(r) && toca(r.dias))
    .map((r) => {
      let inicio = null;
      let fin = null;
      if (r.medicion === 'dia_logico') {
        // Despertar y dormir: inicio = fin = la hora objetivo ("dormir 01:00" es la madrugada siguiente).
        if (esHoraValida(r.inicio)) inicio = fin = instanteDelPlan(fecha, r.inicio, inicioDia);
      } else if (esHoraValida(r.inicio) && esHoraValida(r.fin)) {
        [inicio, fin] = franja(fecha, r.inicio, r.fin, inicioDia);
      } // sin franja: null y null (cuenta en todo el día lógico)
      return {
        id: `${r.id}@${fecha}`, rutinaId: r.id, nombre: r.nombre ?? '', medicion: r.medicion,
        evento: r.medicion === 'dia_logico' ? (r.evento ?? null) : null,
        inicio, fin,
        categoria: Array.isArray(r.categoria) ? [...r.categoria] : null,
        minutosMeta: Number.isFinite(r.minutos_meta) ? r.minutos_meta : null,
        toleranciaMin: Number.isFinite(r.tolerancia_min) ? r.tolerancia_min : 0,
      };
    });

  // sort es estable: con el mismo inicio, queda el orden del plan.
  const porInicio = (x, y) => x.inicio - y.inicio;
  return { fecha, enCiclo, excepciones, bloques: bloques.sort(porInicio), clases: clases.sort(porInicio), rutinas };
}

/**
 * Lo planificado para el día lógico `fecha` (§8): clases y bloques semanales dentro del ciclo, bloques
 * únicos de esa fecha, "terminados antes" y excepciones; las rutinas, según sus días. No modifica el plan.
 *
 * - Normaliza el plan adentro, así que acepta planes viejos o incompletos (lo que no se puede
 *   expandir, por ejemplo un bloque con una hora inválida, se salta).
 * - ids del día: '<id>@<fecha>' ('b-bd1-lun@2026-10-05'). Bloques y clases ordenados por inicio;
 *   las rutinas, en el orden del plan.
 * - BloqueDia.fin es la hora real si ese día se terminó antes (y terminadoAntes = {fin, motivo});
 *   finPlan siempre es el planificado.
 * - RutinaDia: con franja → inicio y fin; sin franja → null y null; en 'dia_logico' → inicio = fin = la hora objetivo.
 *
 * @param {import('./tipos.js').Plan} plan
 * @param {string} fecha  'AAAA-MM-DD' (si no es válida, lanza TypeError)
 * @param {{inicioDia?: string}} [opciones]  startOfDay de AW, '04:00' por defecto
 * @returns {import('./tipos.js').ItemsDelDia}
 */
export function expandirDia(plan, fecha, opciones = {}) {
  const inicioDia = leerOpciones(opciones, 'expandirDia');
  revisarFecha(fecha, 'expandirDia');
  return expandirNormalizado(normalizarPlan(plan), fecha, inicioDia);
}

/**
 * expandirDia de cada día de `desde` a `hasta` (ambos incluidos). Si desde > hasta, [].
 * @param {import('./tipos.js').Plan} plan
 * @param {string} desde
 * @param {string} hasta
 * @param {{inicioDia?: string}} [opciones]
 * @returns {import('./tipos.js').ItemsDelDia[]}
 */
export function expandirRango(plan, desde, hasta, opciones = {}) {
  const inicioDia = leerOpciones(opciones, 'expandirRango');
  revisarFecha(desde, 'expandirRango');
  revisarFecha(hasta, 'expandirRango');
  const normalizado = normalizarPlan(plan); // una sola vez para todo el rango
  return diasDelRango(desde, hasta).map((fecha) => expandirNormalizado(normalizado, fecha, inicioDia));
}

/** Acepta un ItemsDelDia o una lista de ellos. */
function comoLista(items) {
  if (Array.isArray(items)) return items.filter(esObjeto);
  return esObjeto(items) ? [items] : [];
}

/**
 * Lo que ocurre en `instante`. Cada intervalo es [inicio, fin): incluye el inicio y no el fin, así que
 * a la hora exacta del fin ya no está en curso. Si dos se solapan, gana el primero (el que empezó antes).
 * La rutina solo cuenta si tiene franja: las que no tienen, y las de despertar y dormir, nunca están "en curso".
 *
 * @param {import('./tipos.js').ItemsDelDia|import('./tipos.js').ItemsDelDia[]} items  un día, o varios
 *        (por ejemplo ayer y hoy, para ver un bloque de ayer que sigue pasada la medianoche)
 * @param {number} instante  ms
 * @returns {{bloque: import('./tipos.js').BloqueDia|null, clase: import('./tipos.js').ClaseDia|null, rutina: import('./tipos.js').RutinaDia|null}}
 */
export function itemsEnCurso(items, instante) {
  const dias = comoLista(items);
  const buscar = (campo) => {
    for (const dia of dias) {
      for (const item of dia[campo] ?? []) {
        if (item.inicio !== null && item.fin !== null && item.inicio <= instante && instante < item.fin) return item;
      }
    }
    return null;
  };
  return { bloque: buscar('bloques'), clase: buscar('clases'), rutina: buscar('rutinas') };
}

/**
 * Lo primero (bloque o clase) que empieza estrictamente después de `instante`. Si un bloque y una
 * clase empiezan a la vez, gana el bloque. null si no hay nada más.
 *
 * @param {import('./tipos.js').ItemsDelDia[]|import('./tipos.js').ItemsDelDia} dias  uno o varios días seguidos
 * @param {number} instante  ms
 * @returns {{tipo: 'bloque'|'clase', item: (import('./tipos.js').BloqueDia|import('./tipos.js').ClaseDia)}|null}
 */
export function proximoItem(dias, instante) {
  let mejor = null;
  for (const dia of comoLista(dias)) {
    for (const [tipo, lista] of [['bloque', dia.bloques], ['clase', dia.clases]]) {
      for (const item of lista ?? []) {
        if (item.inicio <= instante) continue;
        const antes = mejor === null || item.inicio < mejor.item.inicio
          || (item.inicio === mejor.item.inicio && tipo === 'bloque' && mejor.tipo === 'clase');
        if (antes) mejor = { tipo, item };
      }
    }
  }
  return mejor;
}
