// Textos del plan para mostrar (funciones puras): nombres de tipos, días y franjas.
// Los usan Horario, Cumplimiento, Simulador, Diario y Ajustes.

import { DIAS_SEMANA, NOMBRE_DIA } from '../motor/tipos.js';
import { fechaCorta, esFechaValida } from './fechas.js';

export const NOMBRE_TIPO_CLASE = { teoria: 'Teoría', laboratorio: 'Laboratorio' };
export const NOMBRE_PRIORIDAD = { alta: 'Alta', media: 'Media', baja: 'Baja' };
export const NOMBRE_MEDICION = { pc: 'En la PC', checkin: 'Con check-in', dia_logico: 'Hora del día' };
export const NOMBRE_EVENTO = { despertar: 'Despertar', dormir: 'Dormir' };
export const NOMBRE_TIPO_EXCEPCION = { feriado: 'Feriado', examenes: 'Exámenes', libre: 'Libre' };
export const NOMBRE_EFECTO = {
  cancelar_clases_y_bloques: 'Cancela clases y bloques',
  subir_bloques_a_total: 'Sube los bloques a total',
  cancelar_bloques: 'Cancela los bloques',
};
export const NOMBRE_TIPO_CHECKIN = { despertar: 'Despertar', dormir: 'Dormir', rutina: 'Rutina', papel: 'Estudio en papel', asistencia: 'Asistencia' };
export const NOMBRE_VALOR_CHECKIN = { hecho: 'Hecho', no_hecho: 'No hecho', asistio: 'Asistí', falto: 'Falté' };
export const NOMBRE_ACCION = {
  aviso: 'Aviso', friccion: 'Fricción', bloqueo: 'Bloqueo', pase: 'Pase',
  escalamiento: 'Escalamiento a fricción', salida_emergencia: 'Salida de emergencia',
};
export const NOMBRE_MOTIVO = {
  fuera_de_bloque: 'Fuera de un bloque', nivel_ninguno: 'El bloque no tiene nivel', protegido: 'Protegido (dashboard, AW o el sistema)',
  ia: 'IA: no se bloquea', nunca_bloquear: 'Está en "nunca bloquear"', pase_vigente: 'Tenía un pase vigente',
  no_bloqueable: 'No se puede bloquear', distraccion: 'Distracción dentro de un bloque', patron_url: 'Coincide con un patrón de URL extra',
  sin_clasificar: 'Sin clasificar (nivel total)', sin_extension: 'Navegador sin la extensión (nivel total)',
};

/** 'lun' → 'lun', 'mie' → 'mié', 'sab' → 'sáb' (tres letras, en minúsculas). */
export function diaCorto(dia) {
  return (NOMBRE_DIA[dia] ?? String(dia)).slice(0, 3).toLowerCase();
}

/**
 * Lista de días en texto: todos → "todos los días"; lun a vie → "lun a vie"; sáb y dom → "sáb y dom";
 * otros → "lun, mié y vie". Siempre en el orden de la semana. Lista vacía → "—".
 * @param {string[]} dias
 */
export function textoDias(dias) {
  const orden = DIAS_SEMANA.filter((d) => (dias ?? []).includes(d));
  if (orden.length === 0) return '—';
  if (orden.length === 7) return 'todos los días';
  // ¿Son días seguidos (por ejemplo lun a vie)? Entonces se escribe el primero y el último.
  const indices = orden.map((d) => DIAS_SEMANA.indexOf(d));
  const seguidos = indices.every((n, i) => i === 0 || n === indices[i - 1] + 1);
  if (seguidos && orden.length >= 3) return `${diaCorto(orden[0])} a ${diaCorto(orden.at(-1))}`;
  const cortos = orden.map(diaCorto);
  return cortos.length === 1 ? cortos[0] : `${cortos.slice(0, -1).join(', ')} y ${cortos.at(-1)}`;
}

/** "15:00 – 17:00"; si falta alguna hora, "todo el día". */
export function textoFranja(inicio, fin) {
  if (!inicio || !fin) return 'todo el día';
  return inicio === fin ? inicio : `${inicio} – ${fin}`;
}

/** ['Estudio', 'Inglés'] → 'Estudio > Inglés' (acepta también el texto ya unido). */
export function textoCategoria(categoria) {
  return Array.isArray(categoria) ? categoria.join(' > ') : String(categoria ?? '');
}

/** Cuándo ocurre un bloque del plan: "lun y mié · 15:00 – 17:00" o "sáb, 17 oct · 14:00 – 17:00". */
export function textoRepeticion(bloque) {
  const rep = bloque.repeticion ?? {};
  const cuando = rep.tipo === 'unica' ? (esFechaValida(rep.fecha) ? fechaCorta(rep.fecha) : 'sin fecha') : textoDias(rep.dias);
  return `${cuando} · ${textoFranja(bloque.inicio, bloque.fin)}`;
}

/** Nombre del curso con ese id (o el id, si ya no existe). */
export function nombreCurso(plan, id) {
  return plan?.cursos?.find((c) => c.id === id)?.nombre ?? id ?? '';
}

/** Color del curso ('curso-3'), o undefined. */
export function colorCurso(plan, id) {
  return plan?.cursos?.find((c) => c.id === id)?.color;
}
