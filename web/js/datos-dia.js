// Datos por día, con caché (F2-08).
//
// - Cada día se pide a AW como un periodo propio (AW cachea las consultas de días terminados; §14).
// - Los días TERMINADOS se guardan en memoria: volver a uno ya visto es instantáneo y no consulta a AW.
// - Hoy (o cualquier día que no haya terminado) se pide siempre de nuevo.
// - La caché vive mientras la página está abierta. Si cambian las categorías en AW, basta recargar.
//   No se guarda en el disco del navegador: así los títulos y URLs no quedan copiados en otro lugar.

import { periodoDelDia, diaTerminado, diasDelRango } from './fechas.js';

/**
 * Crea un almacén de días.
 * @param {object} opciones
 * @param {(periodos: Array<[Date, Date]>) => Promise<any[]>} opciones.pedirPeriodos
 *   pide a AW los datos de varios periodos (uno por día) y devuelve un resultado por periodo.
 * @param {() => Promise<string>|string} [opciones.inicioDia]  el `startOfDay` de AW ("04:00").
 * @param {() => (number|Date)} [opciones.ahora]  reloj en ms o Date (en las pruebas se pasa uno fijo; en el dashboard, reloj.js).
 */
export function crearAlmacenDias({ pedirPeriodos, inicioDia = () => '04:00', ahora = () => new Date() }) {
  const cache = new Map();      // fecha → datos (solo días terminados)
  const enCamino = new Map();   // fecha → promesa (para no pedir dos veces el mismo día a la vez)
  let inicioDiaCache = null;

  async function obtenerInicioDia() {
    if (inicioDiaCache === null) inicioDiaCache = await inicioDia();
    return inicioDiaCache;
  }

  /**
   * Datos de varios días, en el mismo orden. Pide a AW solo los que faltan, en una sola consulta.
   * @returns {Promise<Array<{fecha: string, datos: any, desdeCache: boolean}>>}
   */
  async function dias(fechas) {
    const inicio = await obtenerInicioDia();
    const faltan = fechas.filter((f) => !cache.has(f) && !enCamino.has(f));

    if (faltan.length > 0) {
      const promesa = pedirPeriodos(faltan.map((f) => periodoDelDia(f, inicio)));
      faltan.forEach((f, i) => {
        enCamino.set(f, promesa.then((resultados) => resultados[i]).finally(() => enCamino.delete(f)));
      });
    }

    return Promise.all(fechas.map(async (f) => {
      if (cache.has(f)) return { fecha: f, datos: cache.get(f), desdeCache: true };
      const datos = await enCamino.get(f);
      if (diaTerminado(f, ahora(), inicio)) cache.set(f, datos); // hoy NO se guarda
      return { fecha: f, datos, desdeCache: false };
    }));
  }

  return {
    /** Datos de un día. */
    async dia(fecha) {
      return (await dias([fecha]))[0];
    },
    /** Datos de cada día del rango (ambos extremos incluidos). */
    rango(desde, hasta) {
      return dias(diasDelRango(desde, hasta));
    },
    /** ¿Ese día ya está en caché? */
    enCache: (fecha) => cache.has(fecha),
    /** Vacía la caché (por ejemplo, si cambian las categorías). */
    vaciar: () => cache.clear(),
    inicioDia: obtenerInicioDia,
  };
}
