// Disposición del planificador semanal (F3-05): función PURA que convierte lo planificado para cada día
// (ItemsDelDia del motor) en cajas con posición, listas para dibujar. La vista está en vistas/horario-semana.js.
//
// Los minutos se cuentan desde el inicio del día de AW (04:00): un bloque "lunes 23:30 – 00:30" va de 1170 a 1230,
// y uno de madrugada ("lunes 00:30") cae al final de la columna del lunes, como en el día lógico (§8).

import { inicioDelDia, minutosDeHora, horaDeMinutos } from '../motor/fechas.js';

const MS_MIN = 60 * 1000;

/**
 * @typedef {Object} CajaPlan
 * @property {('bloque'|'clase'|'rutina'|'marca')} tipo   marca = rutina de despertar o dormir (una hora, sin duración)
 * @property {object} item        BloqueDia, ClaseDia o RutinaDia
 * @property {number} desdeMin    minutos desde el inicio del día de AW
 * @property {number} hastaMin    > desdeMin (en una marca, igual a desdeMin)
 * @property {number} columna     0, 1, 2… dentro de su grupo de cajas que se solapan
 * @property {number} columnas    cuántas columnas tiene ese grupo (el ancho de la caja es 1 / columnas)
 */

/**
 * Reparte en columnas las cajas que se solapan (como un calendario): cada caja va a la primera columna libre,
 * y todas las de un mismo grupo (cajas encadenadas por solapes) comparten el número de columnas.
 * MODIFICA las cajas (les pone columna y columnas); se usa solo con cajas recién creadas.
 */
function repartirColumnas(cajas) {
  cajas.sort((a, b) => a.desdeMin - b.desdeMin || b.hastaMin - a.hastaMin);
  let grupo = [];
  let finGrupo = -Infinity;
  let finColumnas = []; // fin de la última caja de cada columna del grupo
  const cerrar = () => { for (const caja of grupo) caja.columnas = finColumnas.length; };
  for (const caja of cajas) {
    if (caja.desdeMin >= finGrupo) { // no toca al grupo anterior: empieza uno nuevo
      cerrar();
      grupo = [];
      finColumnas = [];
      finGrupo = -Infinity;
    }
    let columna = finColumnas.findIndex((fin) => fin <= caja.desdeMin);
    if (columna === -1) columna = finColumnas.length;
    finColumnas[columna] = caja.hastaMin;
    caja.columna = columna;
    grupo.push(caja);
    finGrupo = Math.max(finGrupo, caja.hastaMin);
  }
  cerrar();
  return cajas;
}

/**
 * Cajas de cada día y el tramo de horas que hay que mostrar.
 * - Bloques (con su fin planificado), clases y rutinas con franja son cajas; las rutinas de despertar y dormir son
 *   marcas; las rutinas sin franja no se dibujan (van en `sinFranja`, para listarlas aparte).
 * - El tramo va, como mínimo, de `desdePorDefecto` a `hastaPorDefecto`, y se amplía (a horas enteras) si algo queda fuera.
 * @param {import('../motor/tipos.js').ItemsDelDia[]} dias  por ejemplo, expandirRango(plan, lunes, domingo)
 * @param {{inicioDia?: string, desdePorDefecto?: string, hastaPorDefecto?: string}} [opciones]
 * @returns {{dias: Array<{fecha: string, items: object, cajas: CajaPlan[], marcas: CajaPlan[], sinFranja: object[]}>,
 *            desdeMin: number, hastaMin: number}}
 */
export function disponerSemana(dias, { inicioDia = '04:00', desdePorDefecto = '07:00', hastaPorDefecto = '23:00' } = {}) {
  const base = minutosDeHora(inicioDia);
  const relativo = (hora) => (minutosDeHora(hora) - base + 1440) % 1440;
  let desdeMin = relativo(desdePorDefecto);
  let hastaMin = relativo(hastaPorDefecto);

  const salida = (dias ?? []).map((items) => {
    const S = inicioDelDia(items.fecha, inicioDia);
    const min = (instante) => Math.round((instante - S) / MS_MIN);
    const cajas = [];
    const marcas = [];
    const sinFranja = [];
    for (const bloque of items.bloques ?? []) cajas.push({ tipo: 'bloque', item: bloque, desdeMin: min(bloque.inicio), hastaMin: min(bloque.finPlan ?? bloque.fin) });
    for (const clase of items.clases ?? []) cajas.push({ tipo: 'clase', item: clase, desdeMin: min(clase.inicio), hastaMin: min(clase.fin) });
    for (const rutina of items.rutinas ?? []) {
      if (rutina.inicio === null || rutina.inicio === undefined) sinFranja.push(rutina);
      else if (rutina.medicion === 'dia_logico' || !(rutina.fin > rutina.inicio)) {
        marcas.push({ tipo: 'marca', item: rutina, desdeMin: min(rutina.inicio), hastaMin: min(rutina.inicio), columna: 0, columnas: 1 });
      } else cajas.push({ tipo: 'rutina', item: rutina, desdeMin: min(rutina.inicio), hastaMin: min(rutina.fin) });
    }
    const validas = cajas.filter((c) => c.hastaMin > c.desdeMin);
    repartirColumnas(validas);
    for (const caja of [...validas, ...marcas]) {
      desdeMin = Math.min(desdeMin, Math.floor(caja.desdeMin / 60) * 60);
      hastaMin = Math.max(hastaMin, Math.ceil(caja.hastaMin / 60) * 60);
    }
    return { fecha: items.fecha, items, cajas: validas, marcas, sinFranja };
  });
  return { dias: salida, desdeMin: Math.max(0, desdeMin), hastaMin: Math.max(hastaMin, desdeMin + 60) };
}

/** Hora ('HH:MM') de un minuto contado desde el inicio del día de AW: 660 → '15:00' (con inicio 04:00). */
export function horaDeRelativo(minutos, inicioDia = '04:00') {
  return horaDeMinutos(((minutosDeHora(inicioDia) + Math.round(minutos)) % 1440 + 1440) % 1440);
}

/**
 * Hora de un clic en la columna de un día, redondeada hacia abajo a `paso` minutos, y la hora de fin propuesta.
 * @param {number} minutos  minutos desde el inicio del día de AW
 * @returns {{inicio: string, fin: string}}
 */
export function franjaDeClic(minutos, { inicioDia = '04:00', paso = 30, duracionMin = 90 } = {}) {
  const desde = Math.max(0, Math.floor(minutos / paso) * paso);
  return { inicio: horaDeRelativo(desde, inicioDia), fin: horaDeRelativo(desde + duracionMin, inicioDia) };
}
