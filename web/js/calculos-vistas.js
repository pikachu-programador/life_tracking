// Cálculos de las vistas (funciones PURAS, con pruebas en pruebas/calculos-vistas.test.js).
// Aquí va lo que una vista calcula a partir de los resúmenes y segmentos del motor y que conviene probar sin navegador.

import { agruparPor } from '../motor/agrupar.js';
import { CLASES } from '../motor/tipos.js';

/** Estados de cumplimiento que entran al % (§9). */
export const MEDIDOS = ['cumplido', 'parcial', 'fallido'];

/**
 * Estado de un día para el calendario, según su % (§9): cumplido si llega al umbral de "día cumplido";
 * parcial si llega a la mitad de ese umbral; si no, fallido. Sin nada medible → null.
 */
export function estadoDelDia(porcentaje, umbralDia) {
  if (porcentaje === null || porcentaje === undefined) return null;
  if (porcentaje >= umbralDia) return 'cumplido';
  return porcentaje >= umbralDia / 2 ? 'parcial' : 'fallido';
}

/** Estado de un foco promedio con los umbrales del plan. */
export function estadoDeFoco(foco, umbrales) {
  if (foco >= umbrales.foco_cumplido) return 'cumplido';
  return foco >= umbrales.foco_parcial ? 'parcial' : 'fallido';
}

/**
 * Junta los bloques medidos del período por bloque del plan: cuántas veces ocurrió, cómo salió y su foco promedio.
 * @param {import('../../motor/tipos.js').ResumenDia[]} resumenes
 * @returns {Array<{bloqueId: string, curso: string, tipo: string, veces: number, cumplido: number, parcial: number,
 *                  fallido: number, foco: number|null, retrasoMin: number|null}>}  foco null en los de papel
 */
export function focoPorBloque(resumenes) {
  const grupos = new Map();
  for (const resumen of resumenes) {
    for (const b of resumen.bloques ?? []) {
      if (!MEDIDOS.includes(b.estado)) continue;
      if (!grupos.has(b.bloqueId)) {
        grupos.set(b.bloqueId, { bloqueId: b.bloqueId, curso: b.curso, tipo: b.tipo, veces: 0, cumplido: 0, parcial: 0, fallido: 0, focos: [], retrasos: [] });
      }
      const g = grupos.get(b.bloqueId);
      g.veces += 1;
      g[b.estado] += 1;
      if (typeof b.foco === 'number') g.focos.push(b.foco);
      if (typeof b.retrasoMin === 'number') g.retrasos.push(b.retrasoMin);
    }
  }
  const promedio = (lista) => (lista.length ? lista.reduce((a, x) => a + x, 0) / lista.length : null);
  return [...grupos.values()].map(({ focos, retrasos, ...g }) => ({ ...g, foco: promedio(focos), retrasoMin: promedio(retrasos) }));
}

/**
 * Cada rutina en el período: cómo salió cada día y cuántos días medidos cumplió (F5-05).
 * Un día en que la rutina no tocaba (o no hay resumen) va con estado null.
 * @param {import('../motor/tipos.js').ResumenDia[]} resumenes  en orden de fecha
 * @returns {Array<{rutinaId: string, nombre: string, medicion: string, medidos: number, cumplido: number, parcial: number,
 *                  fallido: number, dias: Array<{fecha: string, estado: string|null}>}>}  en el orden en que aparecen
 */
export function rutinasDelPeriodo(resumenes) {
  const porId = new Map();
  for (const resumen of resumenes) {
    for (const r of resumen.rutinas ?? []) {
      if (!porId.has(r.rutinaId)) porId.set(r.rutinaId, { rutinaId: r.rutinaId, nombre: r.nombre, medicion: r.medicion, medidos: 0, cumplido: 0, parcial: 0, fallido: 0, porFecha: new Map() });
      const g = porId.get(r.rutinaId);
      g.porFecha.set(resumen.fecha, r.estado);
      if (MEDIDOS.includes(r.estado)) {
        g.medidos += 1;
        g[r.estado] += 1;
      }
    }
  }
  return [...porId.values()].map(({ porFecha, ...g }) => ({
    ...g,
    dias: resumenes.map((resumen) => ({ fecha: resumen.fecha, estado: porFecha.get(resumen.fecha) ?? null })),
  }));
}

// ── Simulador (F4-07) ──

/**
 * Objetivo de una intervención en texto: 'web:youtube.com' → 'youtube.com (web)'; 'app:Discord.exe' → 'Discord.exe (app)'.
 * Lo que no tenga ese prefijo se devuelve igual.
 */
export function textoObjetivo(objetivo) {
  const m = /^(web|app):(.*)$/.exec(String(objetivo ?? ''));
  return m ? `${m[2] || 'desconocido'} (${m[1]})` : String(objetivo ?? '');
}

// ── Diario (F5-01) ──

/**
 * Lo que se puede marcar con un check-in en un día: las rutinas con check-in, los bloques de estudio en papel
 * y las clases de ese día, cada uno con el valor que tiene ahora (el último check-in registrado, o null).
 * El `refId` es el id del plan (rutina, bloque o clase), que es lo que usa el motor (§12).
 * @param {import('../motor/tipos.js').ItemsDelDia} items
 * @param {import('../motor/tipos.js').Checkin[]} checkins  los del día
 * @returns {Array<{tipo: ('rutina'|'papel'|'asistencia'), refId: string, item: object, valor: string|null,
 *                  opciones: [string, string]}>}  en el orden: rutinas, bloques de papel, clases
 */
export function marcablesDelDia(items, checkins) {
  // El que manda es el último registrado (mayor instante), igual que en el motor.
  const actual = (tipo, refId) => {
    let elegido = null;
    for (const c of checkins ?? []) {
      if (c.tipo !== tipo || c.refId !== refId) continue;
      if (elegido === null || c.instante >= elegido.instante) elegido = c;
    }
    return elegido?.valor ?? null;
  };
  const hecho = ['hecho', 'no_hecho'];
  return [
    ...(items?.rutinas ?? []).filter((r) => r.medicion === 'checkin')
      .map((r) => ({ tipo: 'rutina', refId: r.rutinaId, item: r, valor: actual('rutina', r.rutinaId), opciones: hecho })),
    ...(items?.bloques ?? []).filter((b) => b.tipo === 'estudio_papel')
      .map((b) => ({ tipo: 'papel', refId: b.bloqueId, item: b, valor: actual('papel', b.bloqueId), opciones: hecho })),
    ...(items?.clases ?? [])
      .map((c) => ({ tipo: 'asistencia', refId: c.claseId, item: c, valor: actual('asistencia', c.claseId), opciones: ['asistio', 'falto'] })),
  ];
}

/**
 * Los check-ins que valen: de cada cosa (despertar, dormir, o una rutina, un bloque de papel o una clase concreta),
 * el último registrado. Los demás quedaron reemplazados (F5-04).
 * @param {import('../motor/tipos.js').Checkin[]} checkins  los de un día
 * @returns {Set<import('../motor/tipos.js').Checkin>}  los mismos objetos de la lista
 */
export function checkinsVigentes(checkins) {
  const ultimos = new Map();
  for (const c of checkins ?? []) {
    // En despertar y dormir el refId no importa (§6.7).
    const clave = c.tipo === 'despertar' || c.tipo === 'dormir' ? c.tipo : `${c.tipo}:${c.refId}`;
    const previo = ultimos.get(clave);
    if (!previo || c.instante >= previo.instante) ultimos.set(clave, c);
  }
  return new Set(ultimos.values());
}

// ── Ajustes (F4-09) ──

/**
 * Los valores de los niveles que se pueden cambiar en Ajustes (§11), en el orden en que se muestran.
 * `afloja`: qué cambio es más permisivo (y por eso queda para mañana). `ruta` es la del ajuste rastreador-niveles.
 */
export const CAMPOS_NIVELES = Object.freeze([
  { ruta: 'aviso.permiso_min', nivel: 'aviso', nombre: 'Permiso tras un aviso', unidad: 'min', tipo: 'numero', afloja: 'Subirlo afloja' },
  { ruta: 'escalamiento.avisos_para_friccion', nivel: 'aviso', nombre: 'Avisos en un bloque antes de pasar a fricción', unidad: 'avisos', tipo: 'numero', minimo: 1, afloja: 'Subirlo afloja' },
  { ruta: 'friccion.espera_s', nivel: 'friccion', nombre: 'Espera antes de pedir un pase', unidad: 's', tipo: 'numero', afloja: 'Bajarlo afloja' },
  { ruta: 'friccion.pase_min', nivel: 'friccion', nombre: 'Duración de un pase', unidad: 'min', tipo: 'numero', afloja: 'Subirlo afloja' },
  { ruta: 'friccion.comodines_semana', nivel: 'friccion', nombre: 'Comodines por semana', unidad: 'comodines', tipo: 'numero', afloja: 'Subirlo afloja' },
  { ruta: 'total.espera_salida_min', nivel: 'total', nombre: 'Espera de la salida de emergencia', unidad: 'min', tipo: 'numero', afloja: 'Bajarlo afloja' },
  { ruta: 'total.frase_salida', nivel: 'total', nombre: 'Frase de la salida de emergencia', tipo: 'texto', afloja: 'Cambiarla cuenta como aflojar' },
  { ruta: 'total.bloquear_sin_clasificar', nivel: 'total', nombre: 'Bloquear también lo Sin clasificar', tipo: 'booleano', afloja: 'Desactivarlo afloja' },
]);

/** Valor de una ruta con puntos dentro de la configuración: 'friccion.pase_min' → config.friccion.pase_min. */
export function valorDeRuta(config, ruta) {
  if (ruta.startsWith('bloques.')) return config?.bloques?.[ruta.slice('bloques.'.length)];
  return ruta.split('.').reduce((actual, parte) => (actual === null || actual === undefined ? undefined : actual[parte]), config);
}

/**
 * Un cambio pendiente de los niveles en una frase: qué cambia y a qué valor.
 * @param {{ruta: string, valor: *}} cambio
 * @param {{nombreBloque?: (id: string) => string, nombreNivel?: Object<string, string>}} [opciones]
 * @returns {string}
 */
export function textoDeCambio(cambio, { nombreBloque = (id) => id, nombreNivel = {} } = {}) {
  const { ruta, valor } = cambio;
  if (ruta.startsWith('bloques.')) return `Nivel del bloque ${nombreBloque(ruta.slice('bloques.'.length))}: ${nombreNivel[valor] ?? valor}`;
  if (ruta === 'patrones_url') return `Patrones de URL extra: ${valor.length ? valor.join(' · ') : 'ninguno'}`;
  if (ruta === 'nunca_bloquear') return `Nunca bloquear: ${valor.length ? valor.join(' · ') : 'nada'}`;
  const campo = CAMPOS_NIVELES.find((c) => c.ruta === ruta);
  if (!campo) return `${ruta}: ${JSON.stringify(valor)}`;
  if (campo.tipo === 'booleano') return `${campo.nombre}: ${valor ? 'sí' : 'no'}`;
  if (campo.tipo === 'texto') return `${campo.nombre}: "${valor}"`;
  return `${campo.nombre}: ${valor} ${campo.unidad}`;
}

// ── Clasificación (F2-07) ──

/** Clase con más tiempo en un grupo de agruparPor (en empate, la primera en el orden de CLASES). */
function claseDominante(porEstado) {
  let mejor = CLASES[0];
  for (const clase of CLASES) if ((porEstado[clase] ?? 0) > (porEstado[mejor] ?? 0)) mejor = clase;
  return mejor;
}

/**
 * Lo más usado por app, dominio, título o URL, con su clase dominante.
 * @param {import('../motor/tipos.js').Segmento[]} segmentos
 * @param {('app'|'dominio'|'titulo'|'url')} clave
 * @param {{clase?: string|null, limite?: number, filtro?: (s: object) => boolean}} [opciones]
 *   clase: solo los segmentos de esa clase ('estudio', 'distraccion'…); null o 'todas' = todas
 * @returns {{filas: Array<{nombre: string, segundos: number, clase: string, porEstado: Object<string, number>}>,
 *            total: number, otros: number}}  total: segundos de todos los grupos; otros: los que no entraron en `limite`
 */
export function masUsados(segmentos, clave, { clase = null, limite = 15, filtro } = {}) {
  const porClase = clase && clase !== 'todas' ? (s) => s.clase === clase : null;
  const grupos = agruparPor(segmentos, clave, {
    filtro: (s) => (!porClase || porClase(s)) && (!filtro || filtro(s)),
  });
  const total = grupos.reduce((suma, g) => suma + g.segundos, 0);
  const filas = grupos.slice(0, limite).map((g) => ({ nombre: g.clave, segundos: g.segundos, clase: claseDominante(g.porEstado), porEstado: g.porEstado }));
  return { filas, total, otros: total - filas.reduce((suma, f) => suma + f.segundos, 0) };
}

/**
 * Árbol de tiempo por categoría de AW, para un gráfico de rectángulos (treemap): primer nivel = la clase
 * (Estudio, Distracción…), debajo sus subcategorías. Solo cuenta la actividad.
 * @param {import('../motor/tipos.js').Segmento[]} segmentos
 * @returns {Array<{nombre: string, clase: string, segundos: number, hijos: Array<{nombre: string, ruta: string, segundos: number}>}>}
 *   de mayor a menor (también los hijos)
 */
export function arbolDeCategorias(segmentos) {
  const raices = new Map();
  for (const grupo of agruparPor(segmentos, 'categoria')) {
    const partes = grupo.clave.split(' > ');
    const nombre = partes[0] === 'Uncategorized' ? 'Sin clasificar' : partes[0];
    if (!raices.has(nombre)) raices.set(nombre, { nombre, clase: claseDominante(grupo.porEstado), segundos: 0, hijos: [] });
    const raiz = raices.get(nombre);
    raiz.segundos += grupo.segundos;
    raiz.hijos.push({ nombre: partes.length > 1 ? partes.slice(1).join(' > ') : `${nombre} (sin subcategoría)`, ruta: grupo.clave, segundos: grupo.segundos });
  }
  return [...raices.values()].sort((a, b) => b.segundos - a.segundos);
}

/**
 * Qué se bloquea en cada nivel con una configuración (§11), en frases para mostrar.
 * @param {import('../motor/tipos.js').ConfigNiveles} config
 * @returns {{aviso: string[], friccion: string[], total: string[], nunca: string[]}}
 */
export function queBloquea(config) {
  const patrones = config.patrones_url ?? [];
  const base = ['La clase Distracción (todas sus subcategorías)'];
  if (patrones.length) base.push(`${patrones.length === 1 ? 'El patrón de URL extra' : `Los ${patrones.length} patrones de URL extra`}: ${patrones.join(' · ')}`);
  const total = [...base];
  if (config.total?.bloquear_sin_clasificar !== false) total.push('Lo Sin clasificar');
  total.push('Los navegadores sin la extensión');
  const nunca = ['La IA', 'El dashboard y las páginas de bloqueo', 'ActivityWatch y el agente', 'Los procesos del sistema'];
  for (const patron of config.nunca_bloquear ?? []) nunca.push(`"${patron}" (lista "nunca bloquear")`);
  return { aviso: [...base], friccion: [...base], total, nunca };
}
