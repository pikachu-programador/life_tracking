// Resumen de un día y de un período (V-01, V-02, V-03; visualizaciones §1 y §3).
//
// Idea (visualizaciones §1): un período (semana, mes, rango) se calcula SUMANDO resúmenes diarios, nunca
// releyendo eventos. resumirDia junta todas las métricas de un día lógico en un objeto pequeño (ResumenDia)
// y agregarPeriodo suma, promedia y compara esos objetos.
//
// resumirDia COMPONE funciones de otros módulos del motor: expandirDia (horario.js), asignarContexto
// (contexto.js), evaluarBloque y evaluarRutina (cumplimiento.js) y porcentajeDia, porcentajeVarios,
// horasPorCurso y horasPorArea (porcentajes.js). Lo que sale directo de los segmentos (porEstado, porHora,
// tramos…) está aquí, cada parte como función exportada para probarla por separado.
//
// Unidades (§6.7): instantes en ms (UTC), duraciones en segundos. Por dentro se suman milisegundos y se
// pasa a segundos al final: sumar enteros no acumula los errores de redondeo de los decimales.

import { CLASES, ESTADOS, NOMBRE_ESTADO, DIAS_SEMANA, SIN_AREA, PESO_ESTADO } from './tipos.js';
import {
  DESFASE_LIMA_MIN, minutosLocales, fechaLocal, diasEntre, diasDelRango, diaSemana, esFechaValida,
  inicioMes, finMes, periodoAnterior,
} from './fechas.js';
import { agruparPor } from './agrupar.js';
import { expandirDia } from './horario.js';
import { asignarContexto } from './contexto.js';
import { evaluarBloque, evaluarRutina } from './cumplimiento.js';
import { porcentajeDia, porcentajeVarios, horasPorCurso, horasPorArea } from './porcentajes.js';
import { UMBRALES_INICIALES } from './plan.js';

const MS_MIN = 60 * 1000;
const MS_HORA = 60 * MS_MIN;
const MS_DIA = 24 * MS_HORA;
/** Largo de un tramo de la franja de 24 h (Día típico, visualizaciones §4.3). */
const MS_TRAMO = 15 * MS_MIN;
/** Tramos de 15 min en un día: 24 × 4 = 96. */
export const TRAMOS_POR_DIA = MS_DIA / MS_TRAMO;
/** Un corte de otra cosa más corto que esto no rompe el foco más largo (visualizaciones §3). */
export const CORTE_FOCO_SEG = 2 * 60;

const ES_ACTIVIDAD = new Set(CLASES);

// ── Ayudantes ──

/** {clave: 0} para cada clave de la lista. */
function ceros(claves) {
  return Object.fromEntries(claves.map((c) => [c, 0]));
}

/** Copia de un objeto con cada valor pasado de ms a segundos. */
function aSegundos(objeto) {
  return Object.fromEntries(Object.entries(objeto).map(([clave, ms]) => [clave, ms / 1000]));
}

/** Suma `cantidad` en objeto[clave] (si no existe, empieza en 0). */
function sumarEn(objeto, clave, cantidad) {
  objeto[clave] = (objeto[clave] ?? 0) + cantidad;
}

/** Duración de [inicio, fin) en ms (0 si está al revés). */
function duracionMs(inicio, fin) {
  return Math.max(0, fin - inicio);
}

/** Estado de un segmento; uno desconocido cuenta como 'sin-clasificar' (así las sumas no pierden tiempo). */
function estadoDe(segmento) {
  return ESTADOS.includes(segmento.clase) ? segmento.clase : 'sin-clasificar';
}

/** Promedio de una lista de números; null si está vacía. */
function promedio(numeros) {
  return numeros.length === 0 ? null : numeros.reduce((a, b) => a + b, 0) / numeros.length;
}

/** ¿Es un número de verdad? (no null, undefined, NaN ni Infinity) */
function esNumero(valor) {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * Reparte [inicio, fin) en casillas de `tamano` ms de la hora LOCAL (Lima) y llama a cada(indice, ms) por
 * cada pedazo. Con tamano = 1 h, el índice es la hora (0 a 23); con 15 min, el tramo (0 a 95).
 * Ejemplo: de 10:50 a 11:20 en horas → cada(10, 10 min) y cada(11, 20 min).
 */
function repartir(inicio, fin, tamano, cada) {
  const desfase = DESFASE_LIMA_MIN * MS_MIN;
  const minutosPorCasilla = tamano / MS_MIN;
  let t = inicio;
  while (t < fin) {
    // Siguiente borde de casilla en hora local: se pasa a "hora de Lima", se redondea hacia arriba y se vuelve.
    const borde = (Math.floor((t + desfase) / tamano) + 1) * tamano - desfase;
    const hasta = Math.min(fin, borde);
    cada(Math.floor(minutosLocales(t) / minutosPorCasilla), hasta - t);
    t = hasta;
  }
}

/** Lista de agruparPor → objeto {clave: segundos}, que conserva el orden de mayor a menor. */
function aObjeto(grupos) {
  return Object.fromEntries(grupos.map((g) => [g.clave, g.segundos]));
}

/** Copia del objeto con las claves ordenadas de mayor a menor valor (en empate, orden alfabético). */
function ordenarObjeto(objeto) {
  return Object.fromEntries(Object.entries(objeto).sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)));
}

/** Une intervalos que se superponen: [[1,3],[2,5],[7,8]] → [[1,5],[7,8]]. Así no se cuenta dos veces lo mismo. */
function unirIntervalos(intervalos) {
  const ordenados = intervalos.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const unidos = [];
  for (const [a, b] of ordenados) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else unidos.push([a, b]);
  }
  return unidos;
}

// ── Partes del resumen que salen de los segmentos ──

/**
 * Segundos por estado, con las 7 claves de ESTADOS. Con los segmentos de un día lógico, suman despiertoSeg.
 * @param {import('./tipos.js').Segmento[]} segmentos
 * @returns {Object<string, number>}
 */
export function porEstado(segmentos) {
  const ms = ceros(ESTADOS);
  for (const s of segmentos ?? []) ms[estadoDe(s)] += duracionMs(s.inicio, s.fin);
  return aSegundos(ms);
}

/**
 * Reparto por hora LOCAL (0 a 23). Un segmento que cruza horas se reparte entre ellas.
 * - estados: las 7 claves de ESTADOS.
 * - areas: Estudio por área (SIN_AREA si el segmento no trae área).
 * - cursos: Estudio dentro de los bloques de cada curso (contexto 'bloque'); fuera de los bloques no hay curso (§9).
 * Con un día lógico (≤ 24 h, sin solapes) ninguna hora pasa de 3600 s.
 * @param {import('./tipos.js').SegmentoConContexto[]} segmentos
 * @returns {Array<{estados: Object<string, number>, areas: Object<string, number>, cursos: Object<string, number>}>}  24 entradas
 */
export function porHora(segmentos) {
  // Array.from({length: 24}, fn) crea 24 elementos llamando a fn cada vez (cada hora con SUS objetos, no compartidos).
  const horas = Array.from({ length: 24 }, () => ({ estados: ceros(ESTADOS), areas: {}, cursos: {} }));
  for (const s of segmentos ?? []) {
    const estado = estadoDe(s);
    const area = estado === 'estudio' ? (s.area ?? SIN_AREA) : null;
    const curso = estado === 'estudio' && s.contexto === 'bloque' && s.cursoId ? s.cursoId : null;
    repartir(s.inicio, s.fin, MS_HORA, (h, ms) => {
      horas[h].estados[estado] += ms;
      if (area !== null) sumarEn(horas[h].areas, area, ms);
      if (curso !== null) sumarEn(horas[h].cursos, curso, ms);
    });
  }
  return horas.map((h) => ({ estados: aSegundos(h.estados), areas: aSegundos(h.areas), cursos: aSegundos(h.cursos) }));
}

/**
 * Franja de 96 tramos de 15 min por hora local (Día típico, visualizaciones §4.3). Cada tramo es:
 * - 'clase' si las clases que cuentan para el tiempo en clases cubren al menos la mitad del tramo (7,5 min);
 * - si no, el estado con más segundos en el tramo. Lo que el día lógico no cubre cuenta como 'sin-pc'.
 *   En empate gana el que va primero en ESTADOS.
 * Si el día lógico cruza la medianoche, cada tramo junta lo de esa hora en las dos fechas.
 * @param {import('./tipos.js').Segmento[]} segmentos  los del día lógico
 * @param {import('./tipos.js').ClaseDia[]} [clases]   las que cuentan (clasesContadas)
 * @returns {string[]}  96 valores: 'clase' o un Estado
 */
export function tramos(segmentos, clases = []) {
  const porTramo = Array.from({ length: TRAMOS_POR_DIA }, () => ceros(ESTADOS));
  for (const s of segmentos ?? []) {
    const estado = estadoDe(s);
    repartir(s.inicio, s.fin, MS_TRAMO, (i, ms) => { porTramo[i][estado] += ms; });
  }
  const enClase = new Array(TRAMOS_POR_DIA).fill(0);
  const intervalos = unirIntervalos((clases ?? []).map((c) => [c.inicio, c.fin]));
  for (const [a, b] of intervalos) repartir(a, b, MS_TRAMO, (i, ms) => { enClase[i] += ms; });

  return porTramo.map((ms, i) => {
    if (enClase[i] >= MS_TRAMO / 2) return 'clase';
    // Lo que no cubre ningún segmento (fuera del día lógico) es 'sin-pc'.
    const cubierto = ESTADOS.reduce((t, e) => t + ms[e], 0);
    const conSinPc = { ...ms, 'sin-pc': ms['sin-pc'] + Math.max(0, MS_TRAMO - cubierto) };
    let mejor = ESTADOS[0];
    for (const e of ESTADOS) if (conSinPc[e] > conSinPc[mejor]) mejor = e; // ">" estricto: en empate se queda el primero
    return mejor;
  });
}

/**
 * Franja del plan en 96 tramos de 15 min: 'bloque', 'clase' o 'rutina' si eso cubre MÁS de la mitad del tramo
 * (si varios lo cumplen, gana bloque > clase > rutina); si no, 'libre'.
 * Solo cuentan las rutinas con franja horaria (no las de todo el día ni despertar/dormir, que son una hora suelta).
 * @param {import('./tipos.js').ItemsDelDia} items
 * @returns {string[]}  96 valores
 */
export function tramosPlan(items) {
  const rutinasConFranja = (items?.rutinas ?? []).filter((r) => r.medicion !== 'dia_logico' && r.inicio != null && r.fin != null);
  const tipos = [
    ['bloque', items?.bloques ?? []],
    ['clase', items?.clases ?? []],
    ['rutina', rutinasConFranja],
  ];
  const cobertura = tipos.map(([tipo, lista]) => {
    const ms = new Array(TRAMOS_POR_DIA).fill(0);
    for (const [a, b] of unirIntervalos(lista.map((x) => [x.inicio, x.fin]))) repartir(a, b, MS_TRAMO, (i, d) => { ms[i] += d; });
    return [tipo, ms];
  });
  return Array.from({ length: TRAMOS_POR_DIA }, (_, i) => {
    const ganador = cobertura.find(([, ms]) => ms[i] > MS_TRAMO / 2);
    return ganador ? ganador[0] : 'libre';
  });
}

/**
 * Veces que cambia la app entre segmentos de actividad seguidos. Se saltan AFK, Sin PC y los segmentos
 * sin app (huecos sin ventana): "VS Code → AFK → VS Code" no es un cambio.
 * @param {import('./tipos.js').Segmento[]} segmentos  ordenados
 * @returns {number}
 */
export function cambiosApp(segmentos) {
  let cambios = 0;
  let anterior = null;
  for (const s of segmentos ?? []) {
    if (!ES_ACTIVIDAD.has(s.clase) || s.app == null) continue;
    if (anterior !== null && s.app !== anterior) cambios++;
    anterior = s.app;
  }
  return cambios;
}

/**
 * El tramo continuo de Estudio más largo. Una interrupción de otra cosa (o un hueco) de menos de 2 min no lo
 * corta, pero tampoco suma: `seg` cuenta solo el Estudio. Una de 2 min o más lo corta.
 * En empate, el que empezó antes.
 * @param {import('./tipos.js').Segmento[]} segmentos
 * @returns {{inicio: number, fin: number, seg: number}|null}  null si no hubo Estudio
 */
export function focoMasLargo(segmentos) {
  const estudio = (segmentos ?? []).filter((s) => s.clase === 'estudio' && s.fin > s.inicio).sort((a, b) => a.inicio - b.inicio);
  let mejor = null;
  let actual = null;
  const cerrar = () => { if (actual && (mejor === null || actual.ms > mejor.ms)) mejor = actual; };
  for (const s of estudio) {
    // La interrupción es el tiempo entre el fin del Estudio anterior y el inicio de este.
    if (actual && s.inicio - actual.fin < CORTE_FOCO_SEG * 1000) {
      actual.fin = Math.max(actual.fin, s.fin);
      actual.ms += duracionMs(s.inicio, s.fin);
    } else {
      cerrar();
      actual = { inicio: s.inicio, fin: s.fin, ms: duracionMs(s.inicio, s.fin) };
    }
  }
  cerrar();
  return mejor && { inicio: mejor.inicio, fin: mejor.fin, seg: mejor.ms / 1000 };
}

/**
 * Segundos de actividad por app, de mayor a menor.
 * @param {import('./tipos.js').Segmento[]} segmentos  @returns {Object<string, number>}
 */
export function porApp(segmentos) {
  return aObjeto(agruparPor(segmentos, 'app'));
}

/**
 * Segundos de actividad por dominio web (sin "www."), de mayor a menor.
 * @param {import('./tipos.js').Segmento[]} segmentos  @returns {Object<string, number>}
 */
export function porDominio(segmentos) {
  return aObjeto(agruparPor(segmentos, 'dominio'));
}

/**
 * Segundos de actividad por categoría completa ('Distracción > Video'), de mayor a menor.
 * @param {import('./tipos.js').Segmento[]} segmentos  @returns {Object<string, number>}
 */
export function porCategoria(segmentos) {
  return aObjeto(agruparPor(segmentos, 'categoria'));
}

// ── Tiempo en clases (V-03) ──

/**
 * Clases del día que cuentan como asistidas. expandirDia ya quitó las canceladas por excepciones (feriado…).
 * La asistencia va clase por clase (§6.7): una clase con check-in 'falto' de esa fecha no cuenta; con
 * 'asistio' o sin check-in, sí (refId = id de la clase del plan). Si una clase tiene varias marcas, vale la
 * de mayor instante (la corrección más reciente).
 * @param {import('./tipos.js').ItemsDelDia} items
 * @param {import('./tipos.js').Checkin[]} [checkins]
 * @returns {import('./tipos.js').ClaseDia[]}
 */
export function clasesContadas(items, checkins = []) {
  const ultima = new Map(); // id de la clase del plan → su check-in de asistencia más reciente
  for (const c of checkins ?? []) {
    if (c.tipo !== 'asistencia' || (items?.fecha != null && c.fecha !== items.fecha)) continue;
    const previa = ultima.get(c.refId);
    if (!previa || c.instante >= previa.instante) ultima.set(c.refId, c);
  }
  return (items?.clases ?? []).filter((clase) => ultima.get(clase.claseId)?.valor !== 'falto');
}

/**
 * Tiempo en clases de un día (visualizaciones §3): Σ duración de las clases del plan, menos las canceladas
 * por excepciones y las marcadas "falto" con un check-in de asistencia.
 * @param {import('./tipos.js').ItemsDelDia} items     de expandirDia
 * @param {import('./tipos.js').Checkin[]} [checkins]  se usan los de asistencia de items.fecha
 * @returns {number}  segundos
 */
export function tiempoEnClases(items, checkins = []) {
  return clasesContadas(items, checkins).reduce((t, c) => t + duracionMs(c.inicio, c.fin), 0) / 1000;
}

// ── Resumen de un día (V-01) ──

/**
 * Todas las métricas de un día lógico (visualizaciones §3).
 * @param {import('./tipos.js').Segmento[]} segmentos  los del día lógico: cubren [dia.inicio, dia.fin) sin huecos ni solapes
 * @param {import('./tipos.js').Plan} plan             normalizado (normalizarPlan)
 * @param {import('./tipos.js').Checkin[]} checkins    se usan los de dia.fecha (pueden venir los de más días)
 * @param {import('./tipos.js').DiaLogico} dia
 * @param {{ahora?: number, inicioDia?: string, intervenciones?: import('./tipos.js').Intervencion[],
 *          items?: import('./tipos.js').ItemsDelDia}} [opciones]
 *   ahora: para hoy (lo que todavía no pasa queda pendiente); por defecto, el día ya terminó.
 *   items: lo planificado del día si ya se calculó (así no se repite expandirDia).
 * @returns {import('./tipos.js').ResumenDia}
 */
export function resumirDia(segmentos, plan, checkins, dia, { ahora = Infinity, inicioDia = '04:00', intervenciones = [], items: dados } = {}) {
  const umbrales = plan?.umbrales ?? UMBRALES_INICIALES;
  const delDia = (checkins ?? []).filter((c) => c.fecha === dia.fecha);
  const items = dados ?? expandirDia(plan, dia.fecha, { inicioDia });
  const conContexto = asignarContexto(segmentos ?? [], items);

  const estados = porEstado(conContexto);
  const activoSeg = CLASES.reduce((t, c) => t + estados[c], 0);

  // Cumplimiento (§9): cada bloque y cada rutina con su estado; el % del día los pondera.
  const bloques = items.bloques.map((b) => evaluarBloque(b, conContexto, delDia, umbrales, { ahora, intervenciones }));
  const rutinas = items.rutinas.map((r) => evaluarRutina(r, conContexto, delDia, dia, umbrales, { ahora }));
  const retrasos = bloques.map((b) => b.retrasoMin).filter(esNumero);

  // Horas por curso: todos los cursos del plan, con 0 si no hubo nada.
  const porCurso = {};
  for (const curso of plan?.cursos ?? []) porCurso[curso.id] = { bloquesSeg: 0, papelSeg: 0 };
  for (const [id, horas] of Object.entries(horasPorCurso(conContexto, items, delDia))) {
    porCurso[id] = { bloquesSeg: horas.bloquesSeg ?? 0, papelSeg: horas.papelSeg ?? 0 };
  }
  const papelSeg = Object.values(porCurso).reduce((t, c) => t + c.papelSeg, 0);

  const cambios = cambiosApp(conContexto);
  return {
    fecha: dia.fecha,
    dia,
    sinDatos: dia.sinDatos,
    despiertoSeg: dia.despiertoSeg,
    activoSeg,
    porEstado: estados,
    porArea: horasPorArea(conContexto),
    porCategoria: porCategoria(conContexto),
    porCurso,
    clasesSeg: tiempoEnClases(items, delDia),
    papelSeg,
    estudioTotalSeg: estados.estudio + papelSeg,
    porHora: porHora(conContexto),
    tramos: tramos(conContexto, clasesContadas(items, delDia)),
    tramosPlan: tramosPlan(items),
    cambiosApp: cambios,
    cambiosPorHora: activoSeg > 0 ? cambios / (activoSeg / 3600) : null,
    focoMasLargo: focoMasLargo(conContexto),
    bloques,
    rutinas,
    cumplimiento: porcentajeDia(bloques, rutinas, umbrales),
    retrasoMedioMin: promedio(retrasos),
    porApp: porApp(conContexto),
    porDominio: porDominio(conContexto),
  };
}

// ── Métricas de un período (V-02) ──

/**
 * Minutos locales de un instante contados desde la medianoche de `fecha`: 07:30 del mismo día → 450;
 * 01:00 del día siguiente → 1500 (1440 + 60); 23:00 del día anterior → −60.
 * Así promediar "me dormí a la 1:00 y a las 23:30" da 00:15 y no 12:15.
 */
function minutosDesde(fecha, instante) {
  return minutosLocales(instante) + 1440 * diasEntre(fecha, fechaLocal(instante));
}

/** Métrica de tiempo: se suma en el período. */
function deTiempo(nombre, valor) {
  return Object.freeze({ nombre, unidad: 'seg', tipo: 'suma', valor });
}

/**
 * Métricas que agregarPeriodo resume para cada período. clave → {nombre, unidad, tipo, valor(resumen)}:
 * - unidad: 'seg' | 'proporcion' (0 a 1) | 'min' | 'numero'.
 * - tipo 'suma': el período se mide con su total (horas de estudio); 'promedio': con su promedio (hora de despertar).
 * - valor: número o null (null = ese día no se puede medir; no cuenta en los estadísticos).
 * Las claves son las de CLAVES_METRICAS (tipos.js), en el mismo orden. En 'cumplimiento', el Estadistico
 * describe los % de cada día (mediana, mejor y peor día…); el % del período es el ponderado de
 * ResumenPeriodo.cumplimiento, que es el que usa compararPeriodos.
 * Object.freeze impide modificarlas por accidente.
 */
export const METRICAS = Object.freeze({
  estudio: deTiempo('Estudio en la PC', (r) => r.porEstado.estudio),
  estudioTotal: deTiempo('Estudio total', (r) => r.estudioTotalSeg),
  papel: deTiempo('Estudio en papel', (r) => r.papelSeg),
  clases: deTiempo('Tiempo en clases', (r) => r.clasesSeg),
  ia: deTiempo(NOMBRE_ESTADO.ia, (r) => r.porEstado.ia),
  neutral: deTiempo(NOMBRE_ESTADO.neutral, (r) => r.porEstado.neutral),
  distraccion: deTiempo(NOMBRE_ESTADO.distraccion, (r) => r.porEstado.distraccion),
  sinClasificar: deTiempo(NOMBRE_ESTADO['sin-clasificar'], (r) => r.porEstado['sin-clasificar']),
  activo: deTiempo('Tiempo activo', (r) => r.activoSeg),
  afk: deTiempo(NOMBRE_ESTADO.afk, (r) => r.porEstado.afk),
  sinPc: deTiempo(NOMBRE_ESTADO['sin-pc'], (r) => r.porEstado['sin-pc']),
  despierto: deTiempo('Horas despierto', (r) => r.despiertoSeg),
  cumplimiento: Object.freeze({ nombre: 'Cumplimiento', unidad: 'proporcion', tipo: 'promedio', valor: (r) => r.cumplimiento?.porcentaje ?? null }),
  retraso: Object.freeze({ nombre: 'Retraso al empezar', unidad: 'min', tipo: 'promedio', valor: (r) => r.retrasoMedioMin ?? null }),
  cambiosPorHora: Object.freeze({ nombre: 'Cambios de app por hora', unidad: 'numero', tipo: 'promedio', valor: (r) => r.cambiosPorHora ?? null }),
  // Un día con datos y sin Estudio tiene un foco más largo de 0 (no null): sí se midió.
  focoMasLargo: Object.freeze({ nombre: 'Foco más largo', unidad: 'seg', tipo: 'promedio', valor: (r) => r.focoMasLargo?.seg ?? 0 }),
  despertar: Object.freeze({ nombre: 'Hora de despertar', unidad: 'min', tipo: 'promedio', valor: (r) => minutosDesde(r.fecha, r.dia.inicio) }),
  dormir: Object.freeze({ nombre: 'Hora de dormir', unidad: 'min', tipo: 'promedio', valor: (r) => minutosDesde(r.fecha, r.dia.fin) }),
});

/**
 * Estadísticos de una métrica (visualizaciones §3).
 * @param {Array<{fecha: string, valor: (number|null)}>} entradas  una por día con datos, en orden de fecha
 * @param {number} vacios  días del período sin datos
 * @param {('suma'|'promedio')} tipo
 * @returns {import('./tipos.js').Estadistico}
 */
function estadistico(entradas, vacios, tipo) {
  const validas = entradas.filter((e) => esNumero(e.valor));
  const valores = validas.map((e) => e.valor);
  const n = valores.length;
  const total = valores.reduce((a, b) => a + b, 0);
  const media = n === 0 ? null : total / n;
  // En las métricas de suma, un día sin datos cuenta como 0; en las de promedio no tiene sentido (¿despertar a las 0:00?).
  const conVacios = tipo === 'suma' ? (n + vacios > 0 ? total / (n + vacios) : null) : media;

  let mediana = null;
  if (n > 0) {
    const orden = [...valores].sort((a, b) => a - b);
    const medio = Math.floor(n / 2);
    mediana = n % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
  }
  // Máximo y mínimo con su fecha; en empate, la primera fecha (por eso ">" y "<" estrictos).
  let max = null;
  let min = null;
  for (const { fecha, valor } of validas) {
    if (max === null || valor > max.valor) max = { valor, fecha };
    if (min === null || valor < min.valor) min = { valor, fecha };
  }
  // Desviación estándar poblacional: raíz del promedio de los cuadrados de (valor − media).
  const desviacion = n === 0 ? null : Math.sqrt(valores.reduce((t, v) => t + (v - media) ** 2, 0) / n);

  return { total, promedio: media, promedioConVacios: conVacios, mediana, max, min, desviacion };
}

/**
 * Racha a partir de una lista en orden de fecha: true = cumplido, false = no cumplido, null = nada medible
 * (no corta ni suma).
 * @param {Array<boolean|null>} dias
 * @returns {import('./tipos.js').Racha}
 */
function racha(dias) {
  let mejor = 0;
  let seguidos = 0;
  for (const d of dias) {
    if (d === true) mejor = Math.max(mejor, ++seguidos);
    else if (d === false) seguidos = 0;
  }
  // La actual se cuenta hacia atrás desde el último día (`hasta`) hasta el primer día no cumplido.
  let actual = 0;
  for (let i = dias.length - 1; i >= 0 && dias[i] !== false; i--) if (dias[i] === true) actual++;
  return { actual, mejor };
}

/** ¿Un estado de cumplimiento entra al % (cumplido, parcial o fallido)? */
function esMedible(estado) {
  return estado in PESO_ESTADO;
}

/** ¿Desde y hasta son un mes calendario completo (del 1 al último día)? */
function esMesCompleto(desde, hasta) {
  return desde === inicioMes(desde) && hasta === finMes(desde);
}

/** Métricas y totales de [desde, hasta] (sin cumplimiento ni comparación). */
function calcular(porFecha, desde, hasta) {
  const fechas = diasDelRango(desde, hasta);
  const conDatos = fechas.map((f) => porFecha.get(f)).filter((r) => r && !r.sinDatos);
  const fechasSinDatos = fechas.filter((f) => !porFecha.get(f) || porFecha.get(f).sinDatos);

  const metricas = {};
  for (const [clave, m] of Object.entries(METRICAS)) {
    metricas[clave] = estadistico(conDatos.map((r) => ({ fecha: r.fecha, valor: m.valor(r) })), fechasSinDatos.length, m.tipo);
  }
  return { fechas, conDatos, fechasSinDatos, metricas };
}

/** Suma, día por día, los totales del período (solo días con datos, como los totales de las métricas). */
function sumarTotales(resumenes) {
  const porEstado = ceros(ESTADOS);
  const porArea = {};
  const porCurso = {};
  const porCategoria = {};
  const porApp = {};
  const porDominio = {};
  let clasesSeg = 0;
  let papelSeg = 0;
  for (const r of resumenes) {
    for (const e of ESTADOS) porEstado[e] += r.porEstado?.[e] ?? 0;
    for (const [destino, origen] of [[porArea, r.porArea], [porCategoria, r.porCategoria], [porApp, r.porApp], [porDominio, r.porDominio]]) {
      for (const [clave, seg] of Object.entries(origen ?? {})) sumarEn(destino, clave, seg);
    }
    for (const [id, c] of Object.entries(r.porCurso ?? {})) {
      porCurso[id] ??= { bloquesSeg: 0, papelSeg: 0 }; // ??= asigna solo si todavía no existe
      porCurso[id].bloquesSeg += c.bloquesSeg ?? 0;
      porCurso[id].papelSeg += c.papelSeg ?? 0;
    }
    clasesSeg += r.clasesSeg ?? 0;
    papelSeg += r.papelSeg ?? 0;
  }
  return {
    porEstado,
    porArea: ordenarObjeto(porArea),
    porCurso,
    porCategoria: ordenarObjeto(porCategoria),
    porApp: ordenarObjeto(porApp),
    porDominio: ordenarObjeto(porDominio),
    clasesSeg,
    papelSeg,
  };
}

/** ¿El día todavía está en curso (hoy)? Un día en curso no corta rachas: puede que aún se cumpla. */
function enCurso(resumen) {
  return resumen?.dia?.cerrado === false;
}

/** Valor de un día para la racha: si el día sigue en curso, un "no cumplido" todavía no cuenta (null). */
function valorDeRacha(resumen, cumplido) {
  return cumplido === false && enCurso(resumen) ? null : cumplido;
}

/** El período [desde, hasta] ya validado y ordenado, sin la comparación. */
function agregar(porFecha, desde, hasta, umbrales) {
  const { fechas, conDatos, fechasSinDatos, metricas } = calcular(porFecha, desde, hasta);
  // Los días con resumen, con o sin datos: los de sinDatos entran al % del período y a las rachas (§6.7).
  const conResumen = fechas.map((f) => porFecha.get(f)).filter(Boolean);

  // Día de la semana promedio.
  const porDiaSemana = {};
  for (const dia of DIAS_SEMANA) {
    const deEseDia = conDatos.filter((r) => diaSemana(r.fecha) === dia);
    porDiaSemana[dia] = {};
    for (const [clave, m] of Object.entries(METRICAS)) porDiaSemana[dia][clave] = promedio(deEseDia.map(m.valor).filter(esNumero));
  }

  // Rachas: un valor por día del período (true, false o null).
  const diaCumplido = racha(fechas.map((f) => {
    const r = porFecha.get(f);
    const p = r?.cumplimiento;
    return p && esNumero(p.porcentaje) ? valorDeRacha(r, p.cumplido === true) : null;
  }));
  const idsRutinas = [...new Set(conResumen.flatMap((r) => (r.rutinas ?? []).map((x) => x.rutinaId)))];
  const rutinas = {};
  for (const id of idsRutinas) {
    rutinas[id] = racha(fechas.map((f) => {
      const r = porFecha.get(f);
      const medibles = (r?.rutinas ?? []).filter((x) => x.rutinaId === id && esMedible(x.estado));
      return medibles.length === 0 ? null : valorDeRacha(r, medibles.every((x) => x.estado === 'cumplido'));
    }));
  }

  return {
    desde,
    hasta,
    dias: fechas.length,
    diasConDatos: conDatos.length,
    fechasSinDatos,
    metricas,
    totales: sumarTotales(conDatos),
    porDiaSemana,
    rachas: { diaCumplido, rutinas },
    cumplimiento: porcentajeVarios(conResumen.map((r) => ({ bloques: r.bloques ?? [], rutinas: r.rutinas ?? [] })), umbrales),
    comparacion: null,
  };
}

/**
 * Compara dos períodos cualesquiera (V-05, V-09): por cada clave de METRICAS, {actual, anterior, diferencia}.
 * Las métricas de tipo 'suma' comparan totales y las de 'promedio', promedios; el cumplimiento compara el %
 * ponderado de cada período (ResumenPeriodo.cumplimiento), no el promedio de los % diarios.
 * diferencia = actual − anterior (null si falta alguno de los dos).
 * @param {import('./tipos.js').ResumenPeriodo} actual
 * @param {import('./tipos.js').ResumenPeriodo} anterior
 * @returns {import('./tipos.js').ComparacionPeriodo|null}  desde y hasta son los de `anterior`; null si falta un período
 */
export function compararPeriodos(actual, anterior) {
  if (!actual || !anterior) return null;
  const valor = (periodo, clave) => {
    if (clave === 'cumplimiento') return periodo.cumplimiento?.porcentaje ?? null;
    const campo = METRICAS[clave].tipo === 'suma' ? 'total' : 'promedio';
    return periodo.metricas?.[clave]?.[campo] ?? null;
  };
  const metricas = {};
  for (const clave of Object.keys(METRICAS)) {
    const a = valor(actual, clave);
    const b = valor(anterior, clave);
    metricas[clave] = { actual: a, anterior: b, diferencia: esNumero(a) && esNumero(b) ? a - b : null };
  }
  return { desde: anterior.desde, hasta: anterior.hasta, metricas };
}

/**
 * Suma resúmenes diarios sin releer eventos (visualizaciones §1 y §2).
 * - Usa los resúmenes con fecha en [desde, hasta]; los días del rango sin resumen o con sinDatos van a fechasSinDatos.
 * - metricas: un Estadistico por clave de METRICAS, con los días con datos (sin sinDatos y valor ≠ null).
 * - totales: sumas de los días con datos (un día en curso también entra).
 * - porDiaSemana: 'lun' … 'dom' → clave → promedio de esos días (con datos).
 * - rachas: del día cumplido y de cada rutina. Los días sin nada medible no cortan ni suman; un día en curso
 *   (dia.cerrado === false) no corta; un día sin datos sí puede cortar.
 * - cumplimiento: el % ponderado de §9 con los bloques y rutinas de todos los días del período (porcentajeVarios).
 * - comparacion: compararPeriodos con el período anterior del mismo largo (el mes calendario anterior si
 *   [desde, hasta] es un mes completo), si `resumenes` trae algún día de ese período; si no, null.
 * @param {import('./tipos.js').ResumenDia[]} resumenes  en cualquier orden; puede traer días de fuera del período
 * @param {string} desde  'AAAA-MM-DD'
 * @param {string} hasta  'AAAA-MM-DD', incluida
 * @param {{umbrales?: import('./tipos.js').Umbrales}} [opciones]  umbrales del plan; si faltan, los iniciales (§8)
 * @returns {import('./tipos.js').ResumenPeriodo}
 * @throws {Error} si las fechas no son válidas
 */
export function agregarPeriodo(resumenes, desde, hasta, { umbrales = UMBRALES_INICIALES } = {}) {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    throw new Error(`agregarPeriodo: las fechas tienen que ser 'AAAA-MM-DD' (llegó ${desde} a ${hasta})`);
  }
  if (desde > hasta) [desde, hasta] = [hasta, desde]; // intercambia las dos variables

  // Resúmenes por fecha (si una fecha viene repetida, vale el último).
  const porFecha = new Map();
  for (const r of resumenes ?? []) if (r && typeof r.fecha === 'string') porFecha.set(r.fecha, r);

  const periodo = agregar(porFecha, desde, hasta, umbrales);
  const anterior = periodoAnterior({ tipo: esMesCompleto(desde, hasta) ? 'mes' : 'rango', desde, hasta });
  if (diasDelRango(anterior.desde, anterior.hasta).some((f) => porFecha.has(f))) {
    periodo.comparacion = compararPeriodos(periodo, agregar(porFecha, anterior.desde, anterior.hasta, umbrales));
  }
  return periodo;
}
