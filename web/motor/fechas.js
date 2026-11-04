// Fechas y horas del motor (funciones puras: sin DOM, red ni reloj; "ahora" entra por parámetro).
// Las usan el dashboard (web/js/fechas.js las reexporta) y, más adelante, el agente.
//
// Un "día de AW" va de `startOfDay` (04:00 por defecto) a la misma hora del día siguiente, en hora de Lima.
// Ejemplo: el día "2026-10-31" va del 31-oct 04:00 al 1-nov 04:00 (hora Lima), así la actividad de la
// 1:00 a. m. cuenta para el día anterior. El día lógico de verdad (de despertar a dormir) está en dia-logico.js.
//
// Las fechas se manejan como texto "AAAA-MM-DD": es fácil de guardar en la dirección (#/hoy?fecha=...)
// y de comparar (el orden alfabético es el orden de las fechas).
// Los instantes pueden llegar como Date o como número (milisegundos desde 1970, UTC).

import { DIAS_SEMANA } from './tipos.js';

/** Diferencia de Lima con UTC, en minutos (UTC−5, sin horario de verano; arquitectura §10). */
export const DESFASE_LIMA_MIN = -5 * 60;

const MS_MIN = 60 * 1000;
const MS_DIA = 24 * 60 * MS_MIN;

/** Date, número (ms) o texto ISO 8601 (el timestamp de un evento de AW) → milisegundos. */
function ms(instante) {
  if (typeof instante === 'number') return instante;
  if (typeof instante === 'string') return Date.parse(instante);
  return instante.getTime();
}

/** "04:00" → 240 (minutos desde la medianoche). */
export function minutosDeHora(hora = '04:00') {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** 240 → "04:00". Acepta minutos fuera de 0–1439 (da la vuelta al día). */
export function horaDeMinutos(minutos) {
  const m = ((Math.round(minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** ¿Es un texto "AAAA-MM-DD" válido? */
export function esFechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto ?? '')) return false;
  const d = new Date(texto + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** ¿Es un texto "HH:MM" válido, de 00:00 a 23:59? */
export function esHoraValida(texto) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(texto ?? '');
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

/** Inicio del día de AW `fecha` en ms (lo mismo que periodoDelDia(fecha)[0], pero como número, que es lo que usa el motor). */
export function inicioDelDia(fecha, inicioDia = '04:00') {
  return periodoDelDia(fecha, inicioDia)[0].getTime();
}

/** Día de AW ("AAAA-MM-DD") al que pertenece un instante. */
export function diaDe(instante, inicioDia = '04:00') {
  const corrido = ms(instante) + (DESFASE_LIMA_MIN - minutosDeHora(inicioDia)) * MS_MIN;
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
  return periodoDelDia(fecha, inicioDia)[1].getTime() <= ms(ahora);
}

// ── Hora local de Lima ──

/** Día calendario en Lima ("AAAA-MM-DD") de un instante (sin el corte de las 04:00). */
export function fechaLocal(instante) {
  return new Date(ms(instante) + DESFASE_LIMA_MIN * MS_MIN).toISOString().slice(0, 10);
}

/** Minutos desde la medianoche en Lima (0 a 1439). */
export function minutosLocales(instante) {
  const corrido = ms(instante) + DESFASE_LIMA_MIN * MS_MIN;
  return Math.floor((((corrido % MS_DIA) + MS_DIA) % MS_DIA) / MS_MIN);
}

/** "HH:MM" en Lima. */
export function horaLocal(instante) {
  return horaDeMinutos(minutosLocales(instante));
}

/** Hora local (0 a 23) de un instante. */
export function horaDelDia(instante) {
  return Math.floor(minutosLocales(instante) / 60);
}

/** Instante de la hora "HH:MM" del día calendario `fecha`, en Lima. */
export function instanteLocal(fecha, hora) {
  return Date.parse(fecha + 'T00:00:00Z') + (minutosDeHora(hora) - DESFASE_LIMA_MIN) * MS_MIN;
}

/**
 * Instante de una hora del plan (§8): las horas pertenecen al día del plan, y una hora anterior al
 * `startOfDay` (04:00) es de la madrugada del día calendario siguiente.
 * Ejemplo: "lunes 00:30" es el martes a las 00:30.
 */
export function instanteDelPlan(fecha, hora, inicioDia = '04:00') {
  const dia = minutosDeHora(hora) < minutosDeHora(inicioDia) ? sumarDias(fecha, 1) : fecha;
  return instanteLocal(dia, hora);
}

// ── Días de la semana, semanas y meses ──

/** "2026-10-05" → "lun" (claves de DIAS_SEMANA). */
export function diaSemana(fecha) {
  const d = new Date(fecha + 'T12:00:00Z').getUTCDay(); // 0 = domingo
  return DIAS_SEMANA[(d + 6) % 7];
}

/** Lunes de la semana de `fecha` (las semanas van de lunes a domingo). */
export function inicioSemana(fecha) {
  return sumarDias(fecha, -DIAS_SEMANA.indexOf(diaSemana(fecha)));
}

/** Primer día del mes. */
export function inicioMes(fecha) {
  return fecha.slice(0, 8) + '01';
}

/** Último día del mes. */
export function finMes(fecha) {
  const [a, m] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // día 0 del mes siguiente
}

/** Días de `desde` a `hasta` (hasta − desde; 0 si son la misma fecha). */
export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / MS_DIA);
}

// ── Períodos (V-04): Día · Semana (lunes a domingo) · Mes · Rango ──

/**
 * @typedef {Object} Periodo
 * @property {('dia'|'semana'|'mes'|'rango')} tipo
 * @property {string} desde
 * @property {string} hasta   incluida
 */

export const TIPOS_PERIODO = ['dia', 'semana', 'mes', 'rango'];

/**
 * Período de un tipo que contiene `fecha`. En 'rango' se usan `fecha` y `hasta` tal cual (ordenadas).
 * @returns {Periodo}
 */
export function periodoDe(tipo, fecha, hasta = fecha) {
  switch (tipo) {
    case 'dia': return { tipo, desde: fecha, hasta: fecha };
    case 'semana': { const lunes = inicioSemana(fecha); return { tipo, desde: lunes, hasta: sumarDias(lunes, 6) }; }
    case 'mes': return { tipo, desde: inicioMes(fecha), hasta: finMes(fecha) };
    case 'rango': return fecha <= hasta ? { tipo, desde: fecha, hasta } : { tipo, desde: hasta, hasta: fecha };
    default: throw new Error(`Tipo de período desconocido: ${tipo}`);
  }
}

/** Cantidad de días del período. */
export function largoPeriodo({ desde, hasta }) {
  return diasEntre(desde, hasta) + 1;
}

/** Período anterior del mismo largo (en 'mes', el mes anterior completo). */
export function periodoAnterior(periodo) {
  if (periodo.tipo === 'mes') return periodoDe('mes', sumarDias(periodo.desde, -1));
  const n = largoPeriodo(periodo);
  return { tipo: periodo.tipo, desde: sumarDias(periodo.desde, -n), hasta: sumarDias(periodo.hasta, -n) };
}

/** Período siguiente del mismo largo (en 'mes', el mes siguiente completo). */
export function periodoSiguiente(periodo) {
  if (periodo.tipo === 'mes') return periodoDe('mes', sumarDias(periodo.hasta, 1));
  const n = largoPeriodo(periodo);
  return { tipo: periodo.tipo, desde: sumarDias(periodo.desde, n), hasta: sumarDias(periodo.hasta, n) };
}
