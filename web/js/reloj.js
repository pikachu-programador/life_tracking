// Reloj del dashboard (H-02).
//
// Normalmente es la hora real. Con ?ahora=AAAA-MM-DDTHH:MM en la dirección (ANTES del "#"), el dashboard
// arranca en esa hora de Lima y desde ahí el reloj sigue corriendo (las cuentas regresivas avanzan).
// Sirve para ver los datos de ejemplo del AW falso (octubre de 2026) como si fuera ese momento:
//   http://localhost:5600/pages/rastreador/?ahora=2026-10-14T16:20#/hoy
//
// El motor nunca lee el reloj: las vistas le pasan reloj.ahora() como parámetro.

import { esFechaValida, esHoraValida, instanteLocal } from './fechas.js';

/**
 * Crea un reloj. Función pura (para las pruebas): no lee `location` ni la hora por su cuenta.
 * @param {string|null} textoAhora  valor de ?ahora= ('AAAA-MM-DDTHH:MM' en hora de Lima), o null
 * @param {() => number} [ahoraReal]  hora real en ms
 * @returns {{ahora: () => number, dePrueba: boolean, inicioPrueba: number|null}}
 */
export function crearReloj(textoAhora, ahoraReal = () => Date.now()) {
  const fijado = leerAhora(textoAhora);
  if (fijado === null) return { ahora: ahoraReal, dePrueba: false, inicioPrueba: null };
  const arranque = ahoraReal();
  return { ahora: () => fijado + (ahoraReal() - arranque), dePrueba: true, inicioPrueba: fijado };
}

/** 'AAAA-MM-DDTHH:MM' (Lima) → ms; cualquier otra cosa → null. */
function leerAhora(texto) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(texto ?? '');
  if (!m || !esFechaValida(m[1]) || !esHoraValida(m[2])) return null;
  return instanteLocal(m[1], m[2]);
}

/** Reloj del dashboard (lee ?ahora= una sola vez, al cargar la página). */
export const reloj = crearReloj(
  typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('ahora'));
