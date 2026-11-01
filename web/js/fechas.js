// Fechas del dashboard (funciones puras: sin DOM, red ni reloj; "ahora" entra por parámetro).
//
// Un "día de AW" va de `startOfDay` (04:00 por defecto) a la misma hora del día siguiente, en hora de Lima.
// Ejemplo: el día "2026-10-31" va del 31-oct 04:00 al 1-nov 04:00 (hora Lima), así la actividad de la
// 1:00 a. m. cuenta para el día anterior. El día lógico de verdad (de despertar a dormir) llega en F2-01.
//
// Las fechas se manejan como texto "AAAA-MM-DD": es fácil de guardar en la dirección (#/hoy?fecha=...)
// y de comparar (el orden alfabético es el orden de las fechas).

/** Diferencia de Lima con UTC, en minutos (UTC−5, sin horario de verano; arquitectura §10). */
export const DESFASE_LIMA_MIN = -5 * 60;

const MS_MIN = 60 * 1000;
const MS_DIA = 24 * 60 * MS_MIN;

/** "04:00" → 240 (minutos desde la medianoche). */
export function minutosDeHora(hora = '04:00') {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** ¿Es un texto "AAAA-MM-DD" válido? */
export function esFechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto ?? '')) return false;
  const d = new Date(texto + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/**
 * Periodo [inicio, fin) del día de AW `fecha`.
 * @param {string} fecha "AAAA-MM-DD"
 * @param {string} [inicioDia="04:00"] el `startOfDay` de AW
 * @returns {[Date, Date]}
 */
export function periodoDelDia(fecha, inicioDia = '04:00') {
  // Medianoche de esa fecha en UTC, + hora de inicio, − desfase de Lima (restar −5 h = sumar 5 h).
  const inicio = new Date(Date.parse(fecha + 'T00:00:00Z') + (minutosDeHora(inicioDia) - DESFASE_LIMA_MIN) * MS_MIN);
  return [inicio, new Date(inicio.getTime() + MS_DIA)];
}

/** Día de AW ("AAAA-MM-DD") al que pertenece un instante. */
export function diaDe(instante, inicioDia = '04:00') {
  const corrido = instante.getTime() + (DESFASE_LIMA_MIN - minutosDeHora(inicioDia)) * MS_MIN;
  return new Date(corrido).toISOString().slice(0, 10);
}

/** Suma (o resta) días a una fecha "AAAA-MM-DD". */
export function sumarDias(fecha, dias) {
  return new Date(Date.parse(fecha + 'T00:00:00Z') + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Lista de fechas desde `desde` hasta `hasta`, ambas incluidas. */
export function diasDelRango(desde, hasta) {
  const dias = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f);
  return dias;
}

/** ¿El día ya terminó? (Solo los días terminados se pueden guardar en caché.) */
export function diaTerminado(fecha, ahora, inicioDia = '04:00') {
  return periodoDelDia(fecha, inicioDia)[1].getTime() <= ahora.getTime();
}

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
