// Ayudantes para leer datos-ejemplo/ en las pruebas (F1-08).
//
// Uso en una prueba:
//   import { eventosEjemplo, planEjemplo, verdadDelDia } from './ayudantes/ejemplo.js';
//   const ventana = eventosEjemplo('aw-watcher-window_ejemplo');
//
// Cada función devuelve una COPIA nueva: una prueba puede modificar lo que recibe sin afectar a otra.
// Este archivo no termina en .test.js, así que `npm test` no lo corre como prueba.

import { readFileSync, readdirSync } from 'node:fs';

const CARPETA = new URL('../../datos-ejemplo/', import.meta.url);
const leidos = new Map(); // nombre de archivo → contenido (se lee del disco una sola vez)

function leerJSON(nombre) {
  if (!leidos.has(nombre)) leidos.set(nombre, JSON.parse(readFileSync(new URL(nombre, CARPETA), 'utf8')));
  return structuredClone(leidos.get(nombre));
}

/** Hostname de los datos de ejemplo. */
export const HOST_EJEMPLO = 'ejemplo';

/** Las 14 fechas de los datos de ejemplo (5 al 18 de octubre de 2026). */
export const FECHAS_EJEMPLO = Array.from({ length: 14 }, (_, i) => `2026-10-${String(5 + i).padStart(2, '0')}`);

/**
 * Todos los buckets de ejemplo, con el formato de "Export bucket" de AW: { "<id>": { id, type, client, hostname, events } }.
 * Junta los archivos aw-bucket-export-*.json y rastreador-*_ejemplo.json.
 */
export function bucketsEjemplo() {
  const buckets = {};
  for (const archivo of readdirSync(CARPETA)) {
    if (!/^(aw-bucket-export-.*|rastreador-.*_ejemplo)\.json$/.test(archivo)) continue;
    Object.assign(buckets, leerJSON(archivo).buckets);
  }
  return buckets;
}

/** Eventos de un bucket, ordenados del más viejo al más nuevo (las exportaciones de AW vienen al revés). */
export function eventosEjemplo(idBucket) {
  const bucket = bucketsEjemplo()[idBucket];
  if (!bucket) throw new Error(`No hay un bucket de ejemplo llamado ${idBucket}`);
  return bucket.events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** El plan de ejemplo (datos-ejemplo/plan-ejemplo.json), sin el campo "nota". */
export function planEjemplo() {
  const { nota, ...plan } = leerJSON('plan-ejemplo.json');
  return plan;
}

/** verdad.json completo: { semilla, zona, dias: [...] }. */
export function verdadEjemplo() {
  return leerJSON('verdad.json');
}

/** La entrada de verdad.json de una fecha (casos, segmentos, minutos por intención y por clase y área). */
export function verdadDelDia(fecha) {
  const dia = verdadEjemplo().dias.find((d) => d.fecha === fecha);
  if (!dia) throw new Error(`verdad.json no tiene la fecha ${fecha}`);
  return dia;
}
