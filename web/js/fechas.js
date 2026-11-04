// Fechas del dashboard (funciones puras: sin DOM, red ni reloj; "ahora" entra por parámetro).
//
// Un "día de AW" va de `startOfDay` (04:00 por defecto) a la misma hora del día siguiente, en hora de Lima.
// Ejemplo: el día "2026-10-31" va del 31-oct 04:00 al 1-nov 04:00 (hora Lima), así la actividad de la
// 1:00 a. m. cuenta para el día anterior. El día lógico de verdad (de despertar a dormir) llega en F2-01.
//
// Las fechas se manejan como texto "AAAA-MM-DD": es fácil de guardar en la dirección (#/hoy?fecha=...)
// y de comparar (el orden alfabético es el orden de las fechas).

// (F1-09) Las funciones puras se mudaron a web/motor/fechas.js para que el motor y el agente las usen;
// aquí se reexportan, así los módulos del dashboard las siguen importando desde este archivo.
export * from '../motor/fechas.js';

/** "2026-10-31" → "sáb, 31 oct" (para listas y tablas). */
export function fechaCorta(fecha) {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(fecha + 'T12:00:00Z'))
    .replace(/\./g, ''); // algunos sistemas escriben "sáb." y "oct."
}

/** "2026-10-31" → "sábado, 31 de octubre de 2026" (en español). */
export function fechaLegible(fecha) {
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(fecha + 'T12:00:00Z'));
}

/** "2026-10-05" → "5 oct" (ejes de gráficos). */
export function fechaMuyCorta(fecha) {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(fecha + 'T12:00:00Z'))
    .replace(/\./g, '');
}

/** "2026-10-05" → "octubre de 2026". */
export function mesLegible(fecha) {
  return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(fecha + 'T12:00:00Z'));
}

/**
 * Texto de un período (V-04): "lunes, 5 de octubre de 2026" · "5 – 11 oct 2026" · "octubre de 2026" · "28 sep – 4 oct 2026".
 * @param {{tipo: string, desde: string, hasta: string}} periodo
 */
export function periodoLegible({ tipo, desde, hasta }) {
  if (tipo === 'dia' || desde === hasta) return fechaLegible(desde);
  if (tipo === 'mes') return mesLegible(desde);
  const anio = hasta.slice(0, 4);
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  const ini = mismoMes ? String(Number(desde.slice(8))) : fechaMuyCorta(desde) + (desde.slice(0, 4) !== anio ? ' ' + desde.slice(0, 4) : '');
  return `${ini} – ${fechaMuyCorta(hasta)} ${anio}`;
}
