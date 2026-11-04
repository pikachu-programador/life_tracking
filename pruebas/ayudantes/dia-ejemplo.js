// Ayudante para las pruebas del motor (H-01): los DatosDiaAW de un día de ejemplo, tal como los devolvería
// AW con la consulta canónica (web/js/consultas.js) y las reglas de datos-ejemplo/clases-ejemplo.json.
//
// Uso en una prueba:
//   import { datosDiaEjemplo } from './ayudantes/dia-ejemplo.js';
//   const datos = datosDiaEjemplo('2026-10-05');   // {eventos, navegador, no_afk, afk}
//
// Por dentro usa lo mismo que el AW falso (herramientas/aw-falso/): arma la consulta con consultaCanonica()
// y la resuelve con ejecutarConsulta(), sin servidor ni red. Lo que se carga y lo que se calcula queda en
// caché (otras pruebas lo llaman muchas veces); cada llamada devuelve una COPIA nueva.
// Este archivo no termina en .test.js, así que `npm test` no lo corre como prueba.

import { readFileSync } from 'node:fs';
import { crearAlmacen } from '../../herramientas/aw-falso/almacen.js';
import { ejecutarConsulta } from '../../herramientas/aw-falso/consulta.js';
import { consultaCanonica, reglasParaConsulta, bucketsDeNavegador } from '../../web/js/consultas.js';
import { periodoDelDia } from '../../web/motor/fechas.js';

const CARPETA = new URL('../../datos-ejemplo/', import.meta.url);

let almacen = null;      // se crea al primer uso
let consulta = null;     // sentencias de la consulta canónica de ejemplo
const dias = new Map();  // fecha → DatosDiaAW

/** Las reglas de ejemplo (datos-ejemplo/clases-ejemplo.json), como copia. */
export function clasesEjemplo() {
  return JSON.parse(readFileSync(new URL('clases-ejemplo.json', CARPETA), 'utf8'));
}

/** El almacén del AW falso con los datos de ejemplo (compartido: no escribir en él). */
function almacenEjemplo() {
  almacen ??= crearAlmacen({ carpetaDatos: CARPETA });
  return almacen;
}

/** La consulta canónica (lista de sentencias) para el host de ejemplo, con las reglas de ejemplo. */
export function consultaEjemplo() {
  if (!consulta) {
    const a = almacenEjemplo();
    consulta = consultaCanonica({
      bucketVentana: `aw-watcher-window_${a.hostname}`,
      bucketAfk: `aw-watcher-afk_${a.hostname}`,
      navegadores: bucketsDeNavegador(a.listaBuckets(), a.hostname),
      reglas: reglasParaConsulta(clasesEjemplo()),
    });
  }
  return [...consulta];
}

/**
 * Datos del día de AW `fecha` (de 04:00 a 04:00 en Lima), con la forma de §6.7.
 * @param {string} fecha  'AAAA-MM-DD'
 * @param {string} [inicioDia='04:00']
 * @returns {import('../../web/motor/tipos.js').DatosDiaAW}  {eventos, navegador, no_afk, afk}
 */
export function datosDiaEjemplo(fecha, inicioDia = '04:00') {
  const clave = `${fecha}|${inicioDia}`;
  if (!dias.has(clave)) {
    const [inicio, fin] = periodoDelDia(fecha, inicioDia);
    const [resultado] = ejecutarConsulta(
      { timeperiods: [`${inicio.toISOString()}/${fin.toISOString()}`], query: consultaEjemplo() },
      almacenEjemplo(),
    );
    dias.set(clave, resultado);
  }
  return structuredClone(dias.get(clave));
}
