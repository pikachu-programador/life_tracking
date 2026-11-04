// Servicio de datos del dashboard (F2-09; arquitectura §6.7).
//
// Es lo ÚNICO que usan las vistas para leer y guardar. Junta el cliente de AW (aw.js), el almacén de días
// con su caché (almacen.js, F2-08), el reloj (reloj.js, H-02) y el motor (web/motor/):
//
//   días de AW (D−1, D, D+1) → segmentar → unir → día lógico → recortar → plan del día → contexto → resumen
//
// Cachés (solo en la memoria del navegador; §6.1):
// - Días de AW terminados: los guarda el almacén de F2-08.
// - Días completos (día lógico, segmentos y resumen): solo los días terminados cuyo día lógico está cerrado.
//   Se vacía al guardar el plan, los niveles o un check-in, porque cambian el resultado.

import { aw as clienteAW } from './aw.js';
import { almacen as almacenAW } from './almacen.js';
import { reloj } from './reloj.js';
import { diaDe, sumarDias, diasDelRango, periodoDelDia, diaTerminado } from './fechas.js';
import { segmentar, unirSegmentos, recortarSegmentos } from '../motor/segmentos.js';
import { normalizarCheckins } from '../motor/checkins.js';
import { calcularDiaLogico } from '../motor/dia-logico.js';
import { normalizarPlan, validarPlan, planVacio } from '../motor/plan.js';
import { expandirDia } from '../motor/horario.js';
import { asignarContexto } from '../motor/contexto.js';
import { resumirDia } from '../motor/resumen.js';
import { NIVELES_INICIALES, configuracionVigente } from '../motor/niveles.js';
import { compilarReglas } from '../motor/clasificador.js';

/** Error al guardar un plan inválido: trae la lista de errores de validarPlan. */
export class ErrorPlan extends Error {
  constructor(errores) {
    super('El plan tiene errores: ' + errores.map((e) => e.mensaje).join(' · '));
    this.name = 'ErrorPlan';
    this.errores = errores;
  }
}

/**
 * Crea el servicio. Se exporta la fábrica para poder probarlo con un AW falso y un reloj fijo.
 * @param {{aw: object, almacen: object, ahora: () => number}} dependencias
 */
export function crearServicioDatos({ aw, almacen, ahora }) {
  let planGuardado = null;      // Plan normalizado
  let nivelesGuardados = null;  // Niveles
  let infoAW = null;            // {hostname, version…}
  const diasCompletos = new Map(); // fecha → DiaCompleto (solo días terminados y cerrados)

  const inicioDia = () => almacen.inicioDia();
  async function hoy() { return diaDe(ahora(), await inicioDia()); }
  async function info() { return (infoAW ??= await aw.info()); }
  async function bucketPropio(nombre) { return `rastreador-${nombre}_${(await info()).hostname}`; }

  function vaciarCache() { diasCompletos.clear(); }

  /** Fechas del rango que no son futuras (un período puede terminar después de hoy: la semana en curso). */
  async function fechasHastaHoy(desde, hasta) {
    const fechaHoy = await hoy();
    return diasDelRango(desde, hasta < fechaHoy ? hasta : fechaHoy);
  }

  // ── Plan y niveles (ajustes de AW) ──

  async function plan() {
    if (!planGuardado) {
      const crudo = await aw.ajuste('rastreador-plan').catch(() => null);
      planGuardado = normalizarPlan(crudo && typeof crudo === 'object' ? crudo : planVacio());
    }
    return planGuardado;
  }

  /** Valida y guarda el plan. Lanza ErrorPlan si tiene errores; devuelve los avisos. */
  async function guardarPlan(nuevo) {
    const normalizado = normalizarPlan(nuevo);
    const { valido, errores, avisos } = validarPlan(normalizado);
    if (!valido) throw new ErrorPlan(errores);
    await aw.guardarAjuste('rastreador-plan', normalizado);
    planGuardado = normalizado;
    vaciarCache();
    return avisos;
  }

  async function niveles() {
    if (!nivelesGuardados) {
      const crudo = await aw.ajuste('rastreador-niveles').catch(() => null);
      nivelesGuardados = crudo && typeof crudo === 'object' ? crudo : structuredClone(NIVELES_INICIALES);
    }
    return nivelesGuardados;
  }

  async function guardarNiveles(nuevos) {
    await aw.guardarAjuste('rastreador-niveles', nuevos);
    nivelesGuardados = nuevos;
    vaciarCache();
  }

  // ── Check-ins e intervenciones (buckets propios, §12) ──

  /** Eventos de un bucket propio entre dos fechas lógicas (con un día de margen a cada lado). */
  async function eventosPropios(nombre, desde, hasta) {
    const ini = await inicioDia();
    const [inicio] = periodoDelDia(sumarDias(desde, -1), ini);
    // Hasta "ahora" como mínimo: un check-in de un día pasado (con su `fecha`) se registra con la hora actual.
    const fin = new Date(Math.max(periodoDelDia(sumarDias(hasta, 1), ini)[1].getTime(), ahora()));
    try {
      return await aw.eventos(await bucketPropio(nombre), { inicio, fin });
    } catch (error) {
      if (error.estado === 404) return []; // el bucket todavía no existe: no hay registros
      throw error;
    }
  }

  async function checkins(desde, hasta = desde) {
    const lista = normalizarCheckins(await eventosPropios('checkins', desde, hasta), await inicioDia());
    return lista.filter((c) => c.fecha >= desde && c.fecha <= hasta);
  }

  /** Registra un check-in ({tipo, refId, valor, nota, fecha}). Crea el bucket si no existe. */
  async function registrarCheckin({ tipo, refId = tipo, valor, nota = '', fecha }) {
    const id = await bucketPropio('checkins');
    await aw.crearBucket(id, { tipo: 'rastreador.checkin', hostname: (await info()).hostname });
    await aw.insertarEventos(id, {
      timestamp: new Date(ahora()), duration: 0,
      data: { tipo, ref_id: refId, valor, nota, fecha: fecha ?? diaDe(ahora(), await inicioDia()) },
    });
    vaciarCache();
  }

  async function borrarCheckin(idEvento) {
    await aw.borrarEvento(await bucketPropio('checkins'), idEvento);
    vaciarCache();
  }

  /** Intervenciones reales (las escribe el agente desde la fase 6). Sin agente, la lista está vacía. */
  async function intervenciones(desde, hasta = desde) {
    const ini = await inicioDia();
    return (await eventosPropios('intervenciones', desde, hasta))
      .map((e) => ({
        instante: Date.parse(e.timestamp), bloqueId: e.data.bloque_id ?? null, claseId: e.data.clase_id ?? null,
        nivel: e.data.nivel, accion: e.data.accion, objetivo: e.data.objetivo ?? '', app: e.data.app ?? null,
        url: e.data.url ?? null, titulo: e.data.titulo ?? null, motivo: e.data.motivo ?? '',
      }))
      .filter((i) => { const f = diaDe(i.instante, ini); return f >= desde && f <= hasta; })
      .sort((a, b) => a.instante - b.instante);
  }

  // ── Días completos ──

  /**
   * Arma los días completos de una lista de fechas pidiendo a AW, de una sola vez, todos los días de AW
   * que hacen falta (cada fecha necesita la anterior y la siguiente para su día lógico).
   */
  async function construir(fechas) {
    const ini = await inicioDia();
    const t = ahora();
    const fechaHoy = diaDe(t, ini);
    const faltan = fechas.filter((f) => !diasCompletos.has(f));
    const nuevos = new Map(); // los de esta llamada (incluidos los que no se pueden guardar en caché)
    if (faltan.length) {
      const necesarias = [...new Set(faltan.flatMap((f) => [sumarDias(f, -1), f, sumarDias(f, 1)]))]
        .filter((f) => f <= fechaHoy).sort();
      const [datosAW, p, n, cks, ints] = await Promise.all([
        necesarias.length ? almacen.rango(necesarias[0], necesarias.at(-1)) : [],
        plan(), niveles(),
        checkins(sumarDias(faltan[0], -1), sumarDias(faltan.at(-1), 1)),
        intervenciones(faltan[0], faltan.at(-1)),
      ]);
      // Segmentos de cada día de AW (de 04:00 a 04:00), recortados en "ahora" si es hoy.
      const segmentosAW = new Map();
      for (const { fecha, datos } of datosAW) {
        const [inicio, fin] = periodoDelDia(fecha, ini);
        segmentosAW.set(fecha, segmentar(datos, { inicio: inicio.getTime(), fin: fin.getTime(), ahora: t }));
      }
      for (const fecha of faltan) {
        const alrededor = [sumarDias(fecha, -1), fecha, sumarDias(fecha, 1)].map((f) => segmentosAW.get(f) ?? []);
        const todos = unirSegmentos(...alrededor);
        const checkinsDia = cks.filter((c) => c.fecha === fecha);
        const dia = calcularDiaLogico({
          fecha, segmentos: todos, checkins: cks, inicioDia: ini,
          huecoMin: (p.umbrales.hueco_sueno_h ?? 3) * 60, ahora: t,
        });
        const segmentosDia = recortarSegmentos(todos, dia.inicio, dia.fin);
        const items = expandirDia(p, fecha, { inicioDia: ini });
        const intervencionesDia = ints.filter((i) => i.instante >= dia.inicio && i.instante < dia.fin);
        const completo = {
          fecha,
          esHoy: fecha === fechaHoy,
          dia,
          segmentos: asignarContexto(segmentosDia, items),
          items,
          resumen: resumirDia(segmentosDia, p, checkinsDia, dia, { ahora: t, inicioDia: ini, intervenciones: intervencionesDia }),
          checkins: checkinsDia,
          intervenciones: intervencionesDia,
          plan: p,
          config: configuracionVigente(n, fecha),
        };
        nuevos.set(fecha, completo);
        // Solo se guarda un día terminado cuyo día lógico ya no puede cambiar.
        if (dia.cerrado && diaTerminado(fecha, t, ini)) diasCompletos.set(fecha, completo);
      }
    }
    return fechas.map((f) => diasCompletos.get(f) ?? nuevos.get(f));
  }

  return {
    /** Fecha del día lógico actual según el reloj. */
    hoy,
    /** @returns {Promise<import('../motor/tipos.js').DiaCompleto>} */
    async dia(fecha) { return (await construir([fecha]))[0]; },
    /** Días completos de un rango (ambos extremos incluidos; los días futuros no se incluyen). */
    async dias(desde, hasta) { return construir(await fechasHastaHoy(desde, hasta)); },
    /** @returns {Promise<import('../motor/tipos.js').ResumenDia[]>} uno por día del rango, sin días futuros */
    async resumenes(desde, hasta) { return (await construir(await fechasHastaHoy(desde, hasta))).map((d) => d.resumen); },
    /** Segmentos (con contexto) de cada día lógico del rango, sin días futuros. */
    async segmentos(desde, hasta) {
      return (await construir(await fechasHastaHoy(desde, hasta))).map(({ fecha, segmentos }) => ({ fecha, segmentos }));
    },
    plan, guardarPlan, niveles, guardarNiveles,
    checkins, registrarCheckin, borrarCheckin, intervenciones,
    /** Reglas de categorías de AW y las que no compilan en JS. */
    async reglas() {
      const classes = (await aw.ajuste('classes').catch(() => null)) ?? [];
      return { classes, compiladas: compilarReglas(classes) };
    },
    /** Estado de AW para Ajustes y el pie del menú. */
    async estadoAW() {
      try {
        const [i, buckets] = await Promise.all([aw.info(), aw.buckets()]);
        return { conectado: true, version: i.version, hostname: i.hostname, buckets: Object.values(buckets) };
      } catch (error) {
        return { conectado: false, error: error.message, buckets: [] };
      }
    },
    inicioDia,
    vaciarCache,
  };
}

/** Servicio listo para el dashboard. */
export const datos = crearServicioDatos({ aw: clienteAW, almacen: almacenAW, ahora: () => reloj.ahora() });
