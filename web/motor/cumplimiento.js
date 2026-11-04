// Cumplimiento de cada bloque y de cada rutina (F4-02, con lo de F5-03: estudio en papel y rutinas con check-in).
//
// Reglas de la arquitectura §9 (umbrales en §8):
//
// | Tipo                    | Cumplido                                   | Parcial                          | Fallido                                  |
// |-------------------------|--------------------------------------------|----------------------------------|------------------------------------------|
// | Estudio en PC y examen  | A tiempo, foco ≥ 70 %, sin salida de emerg. | Foco 40–70 % o empieza tarde     | Foco < 40 %, no empieza o salida de emerg. |
// | Estudio en papel        | Check-in "hecho" y sin distracción en la PC | "Hecho", con distracción en la PC | "No hecho" o sin check-in                |
// | Rutina pc               | Llega a sus minutos dentro de la ventana   | Al menos el 50 %                 | Menos del 50 %                           |
// | Rutina checkin          | "Hecho"                                    | —                                | "No hecho" o sin check-in                |
// | Despertar y dormir      | Hora real ≤ objetivo + tolerancia          | Hasta el doble de la tolerancia  | Más tarde                                |
//
// Además, según "ahora": lo que todavía no empieza está 'pendiente' y lo que está ocurriendo, 'en_curso'.
// Solo cumplido, parcial y fallido entran al % del día (porcentajes.js).
//
// Todo es puro: "ahora" entra por parámetro (por defecto Infinity = el día ya pasó) y no se modifican las entradas.
// Los instantes van en ms y los tiempos que se devuelven, en segundos (tipos.js).

import { horaLocal } from './fechas.js';

const MS_MIN = 60 * 1000;
const MS_HORA = 60 * MS_MIN;
const MS_DIA = 24 * MS_HORA;

/** Estudio en papel: tiempo que se espera el check-in después del fin del bloque antes de darlo por fallido. */
const ESPERA_CHECKIN_PAPEL_MS = 12 * MS_HORA;
/** Estudio en papel: desde cuántos segundos de Distracción en la PC el bloque pasa a parcial (menos es un roce). */
const DISTRACCION_PAPEL_MIN_SEG = 60;
/** Rutina con check-in sin franja horaria: peso fijo en el % del día. */
const PESO_CHECKIN_SIN_FRANJA_SEG = 30 * 60;

/** Margen para comparar números con decimales (0,7 guardado en binario no es exacto). */
const EPSILON = 1e-9;

// ── Ayudantes ──

/** 'b-bd1-lun@2026-10-12' → '2026-10-12'; sin '@', `porDefecto`. */
function fechaDeId(id, porDefecto = null) {
  const i = typeof id === 'string' ? id.indexOf('@') : -1;
  return i >= 0 ? id.slice(i + 1) : porDefecto;
}

/**
 * Último check-in ('hecho' o 'no_hecho') de un tipo, una referencia y una fecha.
 * Si hay varios (por ejemplo, una corrección), manda el más reciente; en empate, el que va después en la lista.
 */
function ultimoCheckin(checkins, tipo, refId, fecha) {
  let ultimo = null;
  for (const c of checkins ?? []) {
    if (c.tipo !== tipo || c.refId !== refId || c.fecha !== fecha) continue;
    if (c.valor !== 'hecho' && c.valor !== 'no_hecho') continue; // valor desconocido: se ignora
    if (ultimo === null || c.instante >= ultimo.instante) ultimo = c;
  }
  return ultimo;
}

/** 0.623 → '62 %'. Se redondea hacia abajo para no mostrar "70 %" cuando en realidad es 69,9 %. */
function textoPorcentaje(proporcion) {
  return `${Math.floor(proporcion * 100 + EPSILON)} %`;
}

/** 20 → '20 min'; 80 → '1 h 20 min'; 120 → '2 h'. */
function textoMin(minutos) {
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  const horas = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/** ¿Empieza `categoria` con `prefijo`? ['Estudio', 'Inglés', 'Lectura'] empieza con ['Estudio', 'Inglés']. */
function empiezaCon(categoria, prefijo) {
  if (!Array.isArray(categoria) || categoria.length < prefijo.length) return false;
  return prefijo.every((parte, i) => categoria[i] === parte);
}

/** ¿Es un intervalo válido (números finitos y fin > inicio)? */
function esIntervalo(inicio, fin) {
  return Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio;
}

// ── Bloques ──

/**
 * Tiempo por clase y primer Estudio dentro de [bloque.inicio, min(bloque.fin, hasta)).
 * Si un segmento trae contexto (asignarContexto), solo cuenta si es de este bloque (mismo bloqueId); así, cuando dos
 * bloques se superponen, cada minuto cuenta para uno solo. Si no trae contexto, se cuenta por tiempo.
 * `ms.conPc` es el tiempo con datos de la PC (todo menos 'sin-pc'; AFK cuenta: la PC estaba encendida).
 */
function medirBloque(bloque, segmentos, hasta) {
  const desde = bloque.inicio;
  const fin = Math.min(bloque.fin, hasta);
  const ms = { estudio: 0, ia: 0, distraccion: 0, conPc: 0 };
  let primerEstudio = null;
  for (const s of segmentos ?? []) {
    if (s.contexto !== undefined && s.bloqueId !== bloque.id) continue;
    const a = Math.max(s.inicio, desde); // parte del segmento que cae dentro del bloque
    const b = Math.min(s.fin, fin);
    if (b <= a) continue;
    if (s.clase === 'estudio' || s.clase === 'ia' || s.clase === 'distraccion') ms[s.clase] += b - a;
    if (s.clase !== 'sin-pc') ms.conPc += b - a;
    if (s.clase === 'estudio' && (primerEstudio === null || a < primerEstudio)) primerEstudio = a;
  }
  return { ms, primerEstudio };
}

/**
 * Estado de un bloque del día según §9.
 * - Cuenta lo que cae dentro de [bloque.inicio, bloque.fin) (fin real si terminó antes) y antes de `ahora`.
 * - Estudio en PC y examen: foco = Estudio ÷ duración PLANIFICADA (terminar antes baja el foco); la IA no cuenta.
 *   retrasoMin = minutos del inicio al primer Estudio dentro del bloque (0 si ya se venía estudiando).
 * - Estudio en papel: según el check-in 'papel' del bloque (refId = id del bloque del plan, fecha = la del bloque)
 *   y la Distracción en la PC dentro del bloque (desde 60 s cuenta). Sin check-in queda 'pendiente' hasta 12 h
 *   después del fin del bloque; después, fallido.
 * - Según `ahora`: antes del inicio, 'pendiente'; entre el inicio y el fin, 'en_curso' (foco hasta ahora, informativo).
 * @param {import('./tipos.js').BloqueDia} bloque
 * @param {import('./tipos.js').SegmentoConContexto[]} segmentos  del día (con o sin contexto)
 * @param {import('./tipos.js').Checkin[]} checkins  del día
 * @param {import('./tipos.js').Umbrales} umbrales
 * @param {{ahora?: number, intervenciones?: import('./tipos.js').Intervencion[]}} [opciones]
 *   intervenciones: las del día; una con accion 'salida_emergencia' y este bloqueId deja el bloque fallido
 * @returns {import('./tipos.js').EstadoBloque}
 */
export function evaluarBloque(bloque, segmentos, checkins, umbrales, { ahora = Infinity, intervenciones = [] } = {}) {
  const finPlan = bloque.finPlan ?? bloque.fin;
  const duracionPlanMs = Math.max(0, finPlan - bloque.inicio);
  const esPapel = bloque.tipo === 'estudio_papel';
  const { ms, primerEstudio } = medirBloque(bloque, segmentos, ahora);
  const salidaEmergencia = (intervenciones ?? []).some((i) => i.accion === 'salida_emergencia' && i.bloqueId === bloque.id);
  const checkin = esPapel ? ultimoCheckin(checkins, 'papel', bloque.bloqueId, fechaDeId(bloque.id)) : null;

  const foco = esPapel || duracionPlanMs === 0 ? null : Math.min(1, ms.estudio / duracionPlanMs);
  const retrasoMin = esPapel || primerEstudio === null ? null : (primerEstudio - bloque.inicio) / MS_MIN;

  const base = {
    id: bloque.id,
    bloqueId: bloque.bloqueId,
    tipo: bloque.tipo,
    curso: bloque.curso,
    inicio: bloque.inicio,
    fin: bloque.fin,
    duracionPlanSeg: duracionPlanMs / 1000,
    estado: 'no_medible',
    foco,
    estudioSeg: ms.estudio / 1000,
    iaSeg: ms.ia / 1000,
    distraccionSeg: ms.distraccion / 1000,
    retrasoMin,
    salidaEmergencia,
    checkin: checkin?.valor ?? null,
    motivo: '',
  };
  /** Devuelve una copia de `base` con el estado, el motivo y los cambios que hagan falta. */
  const resultado = (estado, motivo, cambios = {}) => ({ ...base, ...cambios, estado, motivo });

  // Datos que no se pueden evaluar.
  if (!['estudio_pc', 'examen', 'estudio_papel'].includes(bloque.tipo)) {
    return resultado('no_medible', `Tipo de bloque desconocido: ${bloque.tipo}`);
  }
  if (duracionPlanMs === 0 || !(bloque.fin > bloque.inicio)) {
    return resultado('no_medible', 'El bloque no tiene duración');
  }

  // Según el momento: todavía no empieza, o está ocurriendo.
  if (ahora < bloque.inicio) {
    return resultado('pendiente', `Empieza a las ${horaLocal(bloque.inicio)}`, { foco: null });
  }
  if (ahora < bloque.fin) {
    if (esPapel) return resultado('en_curso', `En curso hasta las ${horaLocal(bloque.fin)}`);
    // En minutos y no en %: el foco se divide entre la duración planificada, así que a mitad de un bloque
    // perfecto valdría 50 % y "foco 50 %" se leería como que va mal.
    const extra = salidaEmergencia ? '; usó la salida de emergencia' : '';
    return resultado('en_curso', `En curso: ${textoMin(Math.floor(ms.estudio / MS_MIN))} de estudio de ${textoMin(duracionPlanMs / MS_MIN)}${extra}`);
  }

  // El bloque ya terminó: estado final.
  if (esPapel) {
    const distraccionMin = ms.distraccion / MS_MIN;
    if (checkin?.valor === 'hecho') {
      if (ms.distraccion / 1000 >= DISTRACCION_PAPEL_MIN_SEG) {
        return resultado('parcial', `Hecho, pero con ${textoMin(distraccionMin)} de distracción en la PC`);
      }
      return resultado('cumplido', 'Hecho, sin distracción en la PC');
    }
    if (checkin?.valor === 'no_hecho') return resultado('fallido', 'Marcado como no hecho');
    if (ahora < bloque.fin + ESPERA_CHECKIN_PAPEL_MS) return resultado('pendiente', 'Falta el check-in');
    return resultado('fallido', 'Sin check-in');
  }

  // Estudio en PC y examen.
  const tolerancia = umbrales.tolerancia_inicio_min;
  if (salidaEmergencia) return resultado('fallido', 'Usó la salida de emergencia');
  // Sin datos de la PC en todo el bloque (apagada, o un día sin datos: §6.7, reglas entre módulos): no empezó.
  if (ms.conPc === 0) return resultado('fallido', 'No empezó (sin datos de la PC)');
  if (ms.estudio === 0) return resultado('fallido', 'No hubo estudio en el bloque');
  if (foco < umbrales.foco_parcial - EPSILON) {
    return resultado('fallido', `Foco ${textoPorcentaje(foco)} (mínimo ${textoPorcentaje(umbrales.foco_parcial)})`);
  }
  const aTiempo = retrasoMin <= tolerancia + EPSILON;
  const focoAlto = foco >= umbrales.foco_cumplido - EPSILON;
  if (aTiempo && focoAlto) return resultado('cumplido', `Foco ${textoPorcentaje(foco)}, empezó a tiempo`);

  const partes = [];
  // Math.ceil: 10 min y 30 s con tolerancia de 10 min se muestra como "11 min tarde", no "10".
  if (!aTiempo) partes.push(`Empezó ${textoMin(Math.ceil(retrasoMin - EPSILON))} tarde (tolerancia ${tolerancia} min)`);
  if (!focoAlto) partes.push(`${partes.length ? 'foco' : 'Foco'} ${textoPorcentaje(foco)} (meta ${textoPorcentaje(umbrales.foco_cumplido)})`);
  return resultado('parcial', partes.join(' y '));
}

// ── Rutinas ──

/**
 * Ventana en la que se mide una rutina: su franja o, si no tiene, el día lógico.
 * terminada: ya pasó la franja (o el día lógico se cerró; un día dura como máximo 24 h, §6.7).
 */
function ventanaDe(rutina, dia, ahora) {
  if (esIntervalo(rutina.inicio, rutina.fin)) {
    return { inicio: rutina.inicio, fin: rutina.fin, franja: true, empezada: ahora >= rutina.inicio, terminada: ahora >= rutina.fin };
  }
  if (!dia) return null;
  return {
    inicio: dia.inicio,
    fin: dia.fin,
    franja: false,
    empezada: ahora >= dia.inicio,
    terminada: Boolean(dia.cerrado) || ahora >= dia.inicio + MS_DIA,
  };
}

/** 'despertar' o 'dormir': el de la rutina o, si falta, deducido del id o del nombre (§8). */
function eventoDe(rutina) {
  if (rutina.evento === 'despertar' || rutina.evento === 'dormir') return rutina.evento;
  const texto = `${rutina.rutinaId ?? ''} ${rutina.nombre ?? ''}`;
  if (/dorm/i.test(texto)) return 'dormir';
  if (/despert/i.test(texto)) return 'despertar';
  return null;
}

/**
 * Estado de una rutina del día según §9.
 * - pc: tiempo de los segmentos cuya categoría empieza con la de la rutina, dentro de su franja (o del día lógico
 *   si no tiene). Llegar a la meta → cumplido (aunque la franja siga); al terminar: ≥ 50 % parcial, < 50 % fallido.
 * - checkin: check-in 'rutina' con refId = id de la rutina y la fecha del día. Sin check-in, 'pendiente' hasta que
 *   se cierre el día lógico (se puede marcar después de la franja); después, fallido.
 * - dia_logico: hora real (inicio del día lógico al despertar, fin al dormir) contra la hora objetivo (rutina.inicio).
 *   No medible si el día no tiene datos o si esa hora es solo el inicio de día de AW (no se sabe la real).
 * @param {import('./tipos.js').RutinaDia} rutina
 * @param {import('./tipos.js').SegmentoConContexto[]} segmentos  del día
 * @param {import('./tipos.js').Checkin[]} checkins  del día
 * @param {import('./tipos.js').DiaLogico} dia
 * @param {import('./tipos.js').Umbrales} umbrales
 * @param {{ahora?: number}} [opciones]
 * @returns {import('./tipos.js').EstadoRutina}
 */
export function evaluarRutina(rutina, segmentos, checkins, dia, umbrales, { ahora = Infinity } = {}) {
  const base = {
    id: rutina.id,
    rutinaId: rutina.rutinaId,
    nombre: rutina.nombre,
    medicion: rutina.medicion,
    estado: 'no_medible',
    pesoSeg: 0,
    logradoSeg: null,
    metaSeg: null,
    horaReal: null,
    horaObjetivo: null,
    motivo: '',
  };
  const resultado = (estado, motivo, cambios = {}) => ({ ...base, ...cambios, estado, motivo });
  const fecha = fechaDeId(rutina.id, dia?.fecha ?? null);

  switch (rutina.medicion) {
    case 'pc': return rutinaPc(rutina, segmentos, dia, ahora, resultado);
    case 'checkin': return rutinaCheckin(rutina, checkins, dia, fecha, ahora, resultado);
    case 'dia_logico': return rutinaDiaLogico(rutina, dia, umbrales, resultado);
    default: return resultado('no_medible', `Medición desconocida: ${rutina.medicion}`);
  }
}

/** Rutina medida en la PC: minutos de una categoría dentro de su ventana. */
function rutinaPc(rutina, segmentos, dia, ahora, resultado) {
  const metaMs = (rutina.minutosMeta ?? 0) * MS_MIN;
  const peso = { pesoSeg: metaMs / 1000, metaSeg: metaMs / 1000 };
  if (!Array.isArray(rutina.categoria) || rutina.categoria.length === 0 || !(metaMs > 0)) {
    return resultado('no_medible', 'La rutina no tiene categoría o minutos de meta', peso);
  }
  const ventana = ventanaDe(rutina, dia, ahora);
  if (!ventana) return resultado('no_medible', 'Sin día lógico', peso);
  if (!ventana.empezada) {
    const cuando = ventana.franja ? `Empieza a las ${horaLocal(ventana.inicio)}` : 'Todavía no empieza el día';
    return resultado('pendiente', cuando, { ...peso, logradoSeg: 0 });
  }

  // Tiempo de la categoría dentro de [ventana.inicio, min(ventana.fin, ahora)).
  const hasta = Math.min(ventana.fin, ahora);
  let logradoMs = 0;
  for (const s of segmentos ?? []) {
    if (!empiezaCon(s.categoria, rutina.categoria)) continue;
    const a = Math.max(s.inicio, ventana.inicio);
    const b = Math.min(s.fin, hasta);
    if (b > a) logradoMs += b - a;
  }
  const datos = { ...peso, logradoSeg: logradoMs / 1000 };
  // Math.floor: 29,5 min de 30 se muestra "29 min de 30 min", no "30 de 30".
  const avance = `${textoMin(Math.floor(logradoMs / MS_MIN))} de ${textoMin(metaMs / MS_MIN)}`;

  if (logradoMs >= metaMs) return resultado('cumplido', avance, datos);
  if (!ventana.terminada) return resultado('en_curso', `${avance} hasta ahora`, datos);
  // Día sin datos ya terminado: lo que se mide en la PC es fallido ("no empezó"), §6.7.
  if (dia?.sinDatos && logradoMs === 0) return resultado('fallido', 'No empezó (sin datos de la PC)', datos);
  if (logradoMs * 2 >= metaMs) return resultado('parcial', `${avance} (al menos la mitad)`, datos);
  return resultado('fallido', `${avance} (menos de la mitad)`, datos);
}

/** Rutina con check-in: "hecho" o "no hecho". */
function rutinaCheckin(rutina, checkins, dia, fecha, ahora, resultado) {
  const franja = esIntervalo(rutina.inicio, rutina.fin);
  const peso = { pesoSeg: franja ? (rutina.fin - rutina.inicio) / 1000 : PESO_CHECKIN_SIN_FRANJA_SEG };
  const checkin = ultimoCheckin(checkins, 'rutina', rutina.rutinaId, fecha);
  if (checkin?.valor === 'hecho') return resultado('cumplido', 'Hecho', peso);
  if (checkin?.valor === 'no_hecho') return resultado('fallido', 'Marcado como no hecho', peso);
  // Sin check-in: se espera hasta que se cierre el día lógico, aunque ya pasó la franja (Dremy puede marcarlo
  // un rato después). Un día dura como máximo 24 h, así que con "ahora" pasado ese tope también se da por cerrado.
  const diaAbierto = dia && !dia.cerrado && ahora < dia.inicio + MS_DIA;
  if (diaAbierto) return resultado('pendiente', 'Falta el check-in', peso);
  return resultado('fallido', 'Sin check-in', peso);
}

/** Despertar o dormir: hora real del día lógico contra la hora objetivo. */
function rutinaDiaLogico(rutina, dia, umbrales, resultado) {
  const peso = { pesoSeg: umbrales.peso_despertar_dormir_min * 60 };
  const evento = eventoDe(rutina);
  const objetivo = rutina.inicio;
  if (!evento || !Number.isFinite(objetivo)) return resultado('no_medible', 'Falta el evento o la hora objetivo', peso);
  if (!dia) return resultado('no_medible', 'Sin día lógico', peso);
  const conObjetivo = { ...peso, horaObjetivo: objetivo };

  // No medible si la hora sale de 'inicio_dia' o 'sin_datos' (no se sabe la real; §6.7, reglas entre módulos).
  // Con un check-in sí se mide, aunque el día no tenga actividad en la PC.
  const sinHoraReal = (fuente) => fuente === 'inicio_dia' || fuente === 'sin_datos' || (dia.sinDatos && fuente !== 'checkin');
  let horaReal;
  if (evento === 'despertar') {
    if (sinHoraReal(dia.fuenteInicio)) {
      // Hoy (día no cerrado) todavía puede llegar la actividad o el check-in.
      if (!dia.cerrado) return resultado('pendiente', 'Todavía no hay actividad ni check-in de despertar', conObjetivo);
      return resultado('no_medible', 'No se sabe a qué hora despertó (sin check-in ni actividad)', conObjetivo);
    }
    horaReal = dia.inicio;
  } else {
    // El fin de un día que no se cerró (hoy) todavía puede cambiar.
    if (!dia.cerrado || dia.fuenteFin === 'ahora') return resultado('pendiente', 'El día todavía no termina', conObjetivo);
    if (sinHoraReal(dia.fuenteFin)) {
      return resultado('no_medible', 'No se sabe a qué hora se durmió (sin check-in ni actividad)', conObjetivo);
    }
    horaReal = dia.fin;
  }

  const tolerancia = rutina.toleranciaMin ?? 0;
  const retrasoMin = (horaReal - objetivo) / MS_MIN; // negativo = antes de la hora objetivo
  const verbo = evento === 'despertar' ? 'Despertó' : 'Se durmió';
  const motivo = retrasoMin > 0
    ? `${verbo} a las ${horaLocal(horaReal)}: ${textoMin(Math.ceil(retrasoMin - EPSILON))} después de la meta ${horaLocal(objetivo)} (tolerancia ${tolerancia} min)`
    : `${verbo} a las ${horaLocal(horaReal)} (meta ${horaLocal(objetivo)})`;
  const datos = { ...conObjetivo, horaReal };

  if (retrasoMin <= tolerancia + EPSILON) return resultado('cumplido', motivo, datos);
  if (retrasoMin <= 2 * tolerancia + EPSILON) return resultado('parcial', motivo, datos);
  return resultado('fallido', motivo, datos);
}
