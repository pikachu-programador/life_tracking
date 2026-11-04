// Check-ins (F2-01, con lo de F5-02): eventos del bucket rastreador-checkins_<host> → objetos Checkin (arquitectura §12).
//
// Un check-in es algo que la persona anota a mano: a qué hora despertó o se durmió, si hizo una rutina, si estudió
// en papel o si fue a una clase. En AW se guarda como un evento con duración 0; su `data` trae tipo, ref_id, valor,
// nota y, a veces, la fecha del día lógico al que se refiere (si falta, se usa el día de AW del momento en que se
// registró). La forma normalizada está en el @typedef Checkin de tipos.js.
//
// Si hay varios check-ins del mismo tipo y fecha (por ejemplo, la persona corrigió la hora de despertar), manda el
// último registrado, es decir, el de mayor `instante`: ver ultimoCheckin.

import { TIPOS_CHECKIN } from './tipos.js';
import { diaDe, esFechaValida, esHoraValida, fechaLocal, inicioDelDia, instanteLocal } from './fechas.js';

const MS_DIA = 24 * 60 * 60 * 1000;

/** "9:05" → "09:05" (las horas de despertar y dormir se guardan siempre con dos cifras). Lo demás queda igual. */
function normalizarHora(valor) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valor);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : valor;
}

/**
 * Eventos del bucket rastreador-checkins → check-ins ordenados por instante (del más viejo al más nuevo).
 * - fecha = data.fecha si es una fecha válida; si no, el día de AW del timestamp (diaDe, con `inicioDia`).
 * - refId = data.ref_id (si es un texto no vacío) o, si falta, el tipo (así despertar y dormir tienen refId).
 * - valor = data.valor como texto; en despertar y dormir, "9:05" se guarda como "09:05". nota = data.nota o ''.
 * - id = evento.id (para poder borrarlo en AW) o null.
 * - Se descartan los eventos con un tipo que no está en TIPOS_CHECKIN o con un timestamp que no se entiende.
 * - Con el mismo instante se ordenan por id y, si no hay id, quedan en el orden en que llegaron.
 * @param {import('./tipos.js').EventoAW[]} eventos
 * @param {string} [inicioDia="04:00"]  el `startOfDay` de AW
 * @returns {import('./tipos.js').Checkin[]}
 */
export function normalizarCheckins(eventos, inicioDia = '04:00') {
  const lista = [];
  (eventos ?? []).forEach((evento, orden) => {
    const data = evento?.data ?? {};
    const tipo = data.tipo;
    if (!TIPOS_CHECKIN.includes(tipo)) return;
    const marca = evento.timestamp;
    const instante = typeof marca === 'number' ? marca : Date.parse(marca);
    if (!Number.isFinite(instante)) return;

    let valor = data.valor === undefined || data.valor === null ? '' : String(data.valor);
    if (tipo === 'despertar' || tipo === 'dormir') valor = normalizarHora(valor);

    const checkin = {
      id: evento.id ?? null,
      instante,
      fecha: esFechaValida(data.fecha) ? data.fecha : diaDe(instante, inicioDia),
      tipo,
      refId: typeof data.ref_id === 'string' && data.ref_id !== '' ? data.ref_id : tipo,
      valor,
      nota: typeof data.nota === 'string' ? data.nota : '',
    };
    lista.push({ checkin, orden });
  });

  const idONada = (c) => (typeof c.id === 'number' ? c.id : null);
  lista.sort((a, b) => {
    if (a.checkin.instante !== b.checkin.instante) return a.checkin.instante - b.checkin.instante;
    const ia = idONada(a.checkin);
    const ib = idONada(b.checkin);
    if (ia !== null && ib !== null && ia !== ib) return ia - ib;
    return a.orden - b.orden;
  });
  return lista.map((x) => x.checkin);
}

/**
 * Instante (ms) de la hora de un check-in de despertar o dormir (valor 'HH:MM', hora de Lima).
 * - despertar: esa hora del día calendario `fecha` (instanteLocal).
 * - dormir: el PRIMER instante con esa hora que viene DESPUÉS de `despuesDe` (el inicio del día lógico); si no se
 *   pasa, después del inicio del día de AW de `fecha`. Ejemplo: dormir '04:30' del 2026-10-18, con el día lógico
 *   empezando a las 10:30, es el 19 a las 04:30; dormir '23:30' es el 18 a las 23:30.
 * @param {import('./tipos.js').Checkin} checkin
 * @param {string} [inicioDia="04:00"]
 * @param {{despuesDe?: number}} [opciones]
 * @returns {number|null}  null si no es despertar ni dormir, o si la fecha o la hora no son válidas
 */
export function instanteDeCheckin(checkin, inicioDia = '04:00', { despuesDe } = {}) {
  if (!checkin || !esFechaValida(checkin.fecha) || !esHoraValida(checkin.valor)) return null;
  if (checkin.tipo === 'despertar') return instanteLocal(checkin.fecha, checkin.valor);
  if (checkin.tipo !== 'dormir') return null;

  const desde = Number.isFinite(despuesDe) ? despuesDe : inicioDelDia(checkin.fecha, inicioDia);
  // Esa hora en el día calendario de `desde`; si no queda después de `desde`, la del día siguiente.
  // (Lima no tiene horario de verano: todos los días duran 24 h.)
  let instante = instanteLocal(fechaLocal(desde), checkin.valor);
  while (instante <= desde) instante += MS_DIA;
  return instante;
}

/**
 * El check-in que manda entre varios del mismo tipo y fecha: el de mayor instante (el último registrado).
 * Con el mismo instante, el que va después en la lista. En despertar y dormir no se filtra por refId.
 * @param {import('./tipos.js').Checkin[]} checkins
 * @param {string} tipo
 * @param {string} fecha
 * @param {string|null} [refId=null]  solo para rutina, papel y asistencia; null = cualquiera
 * @returns {import('./tipos.js').Checkin|null}
 */
export function ultimoCheckin(checkins, tipo, fecha, refId = null) {
  let elegido = null;
  for (const c of checkins ?? []) {
    if (c?.tipo !== tipo || c.fecha !== fecha) continue;
    if (refId !== null && c.refId !== refId) continue;
    if (elegido === null || c.instante >= elegido.instante) elegido = c;
  }
  return elegido;
}
