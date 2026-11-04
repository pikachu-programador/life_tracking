// Niveles de bloqueo (F4-04): el ajuste `rastreador-niveles` de AW y la regla de asimetría (§11).
//
// El ajuste guarda una configuración `base` y una lista de `cambios`. Cada cambio dice desde qué día
// lógico vale (`aplica_desde`). Nadie "activa" los cambios: la configuración vigente de una fecha se
// calcula sumando a la base los cambios que ya empezaron. Así el dashboard y el agente nunca se pisan
// escribiendo el mismo ajuste.
//
// Asimetría: endurecer (ser más estricto) vale desde hoy; aflojar (ser más permisivo) vale desde el día
// lógico siguiente. La idea: en un momento de debilidad no se puede bajar la guardia en el acto.
//
// Rutas: un cambio apunta a un campo con una "ruta con puntos", como en JS se escribiría config.friccion.pase_min:
//   'aviso.permiso_min', 'friccion.comodines_semana', 'patrones_url' (la lista nueva entera),
//   'bloques.<id del bloque del plan>' (por ejemplo 'bloques.b-bd1-lun').

import { NIVELES } from './tipos.js';
import { esFechaValida, sumarDias } from './fechas.js';
import { regexDeAW } from './regex.js';

/**
 * Congela un objeto y todo lo que tiene dentro (Object.freeze solo congela el primer nivel).
 * Un objeto congelado no se puede modificar: en un módulo ES (modo estricto), intentarlo lanza un TypeError.
 */
function congelar(objeto) {
  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object') congelar(valor);
  }
  return Object.freeze(objeto);
}

/**
 * Valores iniciales de §11 y ningún cambio. Está congelado: para modificarlo hay que copiarlo
 * (structuredClone), así nadie lo cambia por accidente.
 * @type {import('./tipos.js').Niveles}
 */
export const NIVELES_INICIALES = congelar({
  version: 1,
  base: {
    aviso: { permiso_min: 5 },
    friccion: { espera_s: 60, pase_min: 10, comodines_semana: 5 },
    total: {
      espera_salida_min: 10,
      frase_salida: 'Elijo dejar este bloque y acepto que cuente como fallido',
      bloquear_sin_clasificar: true,
    },
    escalamiento: { avisos_para_friccion: 3 },
    patrones_url: [],
    nunca_bloquear: [],
    bloques: {},
  },
  cambios: [],
});

// ── Campos que se pueden cambiar ──
// tipo: qué valor acepta. afloja: hacia dónde el cambio es más permisivo (§11).
//   'subir' = un número más grande afloja (más minutos de permiso, más comodines…)
//   'bajar' = un número más chico afloja (menos espera)
//   'quitar' / 'agregar' = en una lista, quitar o agregar elementos afloja
const CAMPOS = {
  'aviso.permiso_min': { tipo: 'numero', afloja: 'subir' },
  'friccion.espera_s': { tipo: 'numero', afloja: 'bajar' },
  'friccion.pase_min': { tipo: 'numero', afloja: 'subir' },
  'friccion.comodines_semana': { tipo: 'numero', afloja: 'subir' },
  'total.espera_salida_min': { tipo: 'numero', afloja: 'bajar' },
  'total.frase_salida': { tipo: 'texto' },
  'total.bloquear_sin_clasificar': { tipo: 'booleano' }, // pasar a false afloja
  'escalamiento.avisos_para_friccion': { tipo: 'numero', afloja: 'subir', minimo: 1 },
  'patrones_url': { tipo: 'lista', afloja: 'quitar' },    // menos patrones = se bloquea menos
  'nunca_bloquear': { tipo: 'lista', afloja: 'agregar' }, // más excepciones = se bloquea menos
};

/** Descripción del campo de una ruta, o null si la ruta no existe. */
function campoDe(ruta) {
  if (typeof ruta !== 'string') return null;
  if (ruta.startsWith('bloques.') && ruta.length > 'bloques.'.length) return { tipo: 'nivel' };
  return CAMPOS[ruta] ?? null;
}

/** 'friccion.pase_min' → ['friccion', 'pase_min']. En 'bloques.<id>' el id va entero (aunque tenga puntos). */
function partes(ruta) {
  if (ruta.startsWith('bloques.')) return ['bloques', ruta.slice('bloques.'.length)];
  return ruta.split('.');
}

/** Valor de una ruta dentro de un objeto (undefined si no está). */
function leer(objeto, ruta) {
  let actual = objeto;
  for (const parte of partes(ruta)) {
    if (actual === null || typeof actual !== 'object') return undefined;
    actual = actual[parte];
  }
  return actual;
}

/** Escribe un valor en una ruta, creando los objetos intermedios. MODIFICA `objeto`: solo se usa con copias propias. */
function escribir(objeto, ruta, valor) {
  const lista = partes(ruta);
  let actual = objeto;
  for (const parte of lista.slice(0, -1)) {
    if (actual[parte] === null || typeof actual[parte] !== 'object') actual[parte] = {};
    actual = actual[parte];
  }
  actual[lista.at(-1)] = valor;
}

/**
 * Por qué un valor no sirve para una ruta (texto en español), o null si sirve.
 * Con `regex: true` también comprueba que cada patrón de una lista compile (al guardar un cambio).
 */
function errorDeValor(ruta, valor, { regex = false } = {}) {
  const campo = campoDe(ruta);
  if (!campo) return `Ruta de niveles desconocida: ${ruta}`;
  switch (campo.tipo) {
    case 'numero': {
      const minimo = campo.minimo ?? 0;
      if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < minimo) {
        return `${ruta} tiene que ser un número mayor o igual a ${minimo}`;
      }
      return null;
    }
    case 'texto':
      return typeof valor === 'string' && valor.trim() !== '' ? null : `${ruta} no puede quedar vacío`;
    case 'booleano':
      return typeof valor === 'boolean' ? null : `${ruta} tiene que ser verdadero o falso`;
    case 'nivel':
      return NIVELES.includes(valor) ? null : `Nivel desconocido: ${valor} (se espera ${NIVELES.join(', ')})`;
    case 'lista': {
      if (!Array.isArray(valor)) return `${ruta} tiene que ser una lista`;
      for (const patron of valor) {
        if (typeof patron !== 'string' || patron.trim() === '') return `${ruta} tiene un patrón vacío`;
        if (regex) {
          try {
            regexDeAW(patron, { ignorarMayusculas: true });
          } catch (error) {
            return `El patrón "${patron}" no sirve: ${error.message}`;
          }
        }
      }
      return null;
    }
    default:
      return `Ruta de niveles desconocida: ${ruta}`;
  }
}

/** La base del ajuste, completada con NIVELES_INICIALES en lo que falte o tenga un tipo equivocado. */
function completarBase(base) {
  const config = structuredClone(NIVELES_INICIALES.base);
  for (const ruta of Object.keys(CAMPOS)) {
    const valor = leer(base, ruta);
    if (valor !== undefined && errorDeValor(ruta, valor) === null) escribir(config, ruta, structuredClone(valor));
  }
  const bloques = base?.bloques;
  if (bloques && typeof bloques === 'object') {
    for (const [id, nivel] of Object.entries(bloques)) {
      if (NIVELES.includes(nivel)) config.bloques[id] = nivel;
    }
  }
  return config;
}

/**
 * Cambios bien formados, ordenados como se aplican: por aplica_desde y, en el mismo día, por `creado`
 * (el más nuevo va después y gana). Si todo empata, se respeta el orden en que están guardados.
 */
function cambiosOrdenados(niveles) {
  const cambios = Array.isArray(niveles?.cambios) ? niveles.cambios : [];
  return cambios
    .map((cambio, indice) => ({ cambio, indice }))
    .filter(({ cambio }) => cambio && typeof cambio.aplica_desde === 'string' && typeof cambio.ruta === 'string')
    .sort((a, b) =>
      comparar(a.cambio.aplica_desde, b.cambio.aplica_desde)
      || comparar(String(a.cambio.creado ?? ''), String(b.cambio.creado ?? ''))
      || a.indice - b.indice)
    .map(({ cambio }) => cambio);
}

/** Compara dos textos (las fechas 'AAAA-MM-DD' y los ISO se ordenan bien como texto): −1, 0 o 1. */
function comparar(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Configuración vigente en el día lógico `fecha`: la base más los cambios con aplica_desde ≤ fecha,
 * aplicados en orden (aplica_desde y luego creado). No modifica `niveles`.
 * - `niveles` null o undefined → NIVELES_INICIALES.
 * - Lo que falte en la base (o tenga un tipo equivocado) se completa con la base inicial.
 * - Los cambios con una ruta desconocida o un valor que no sirve se ignoran (un ajuste editado a mano
 *   no debe romper al agente).
 * @param {import('./tipos.js').Niveles|null|undefined} niveles
 * @param {string} fecha  'AAAA-MM-DD' (día lógico)
 * @returns {import('./tipos.js').ConfigNiveles}  objeto nuevo (se puede modificar sin afectar a nadie)
 */
export function configuracionVigente(niveles, fecha) {
  const origen = niveles ?? NIVELES_INICIALES;
  const config = completarBase(origen.base);
  for (const cambio of cambiosOrdenados(origen)) {
    if (!(cambio.aplica_desde <= fecha)) continue;
    if (errorDeValor(cambio.ruta, cambio.valor) !== null) continue;
    escribir(config, cambio.ruta, structuredClone(cambio.valor));
  }
  return config;
}

/**
 * ¿El cambio de `antes` a `despues` endurece, afloja o deja igual? (asimetría de §11)
 * - 'bloques.<id>': ninguno < aviso < friccion < total; bajar afloja. Si `antes` no es un nivel conocido
 *   (el bloque no tenía nivel elegido y no se sabe el del plan), se toma como 'total': así, ante la duda,
 *   todo lo que no sea total cuenta como aflojar y espera al día siguiente.
 * - permiso_min, pase_min, comodines_semana y avisos_para_friccion: subir afloja.
 * - espera_s y espera_salida_min: bajar afloja.
 * - bloquear_sin_clasificar: pasar a false afloja.
 * - patrones_url: quitar alguno afloja (aunque también agregue otros); solo agregar endurece.
 * - nunca_bloquear: agregar alguno afloja; solo quitar endurece.
 * - frase_salida: siempre 'igual' (ni endurece ni afloja).
 * - Mismo valor → 'igual'.
 * @param {string} ruta
 * @param {*} antes    valor vigente
 * @param {*} despues  valor nuevo
 * @returns {'endurece'|'afloja'|'igual'}
 * @throws {Error} si la ruta no existe o `despues` no sirve para esa ruta
 */
export function tipoDeCambio(ruta, antes, despues) {
  const error = errorDeValor(ruta, despues);
  if (error) throw new Error(error);
  const campo = campoDe(ruta);

  switch (campo.tipo) {
    case 'nivel': {
      const indiceAntes = NIVELES.includes(antes) ? NIVELES.indexOf(antes) : NIVELES.length - 1;
      const indiceDespues = NIVELES.indexOf(despues);
      if (indiceDespues === indiceAntes) return 'igual';
      return indiceDespues < indiceAntes ? 'afloja' : 'endurece';
    }
    case 'numero': {
      const previo = typeof antes === 'number' && Number.isFinite(antes) ? antes : leer(NIVELES_INICIALES.base, ruta);
      if (despues === previo) return 'igual';
      const sube = despues > previo;
      return (campo.afloja === 'subir') === sube ? 'afloja' : 'endurece';
    }
    case 'booleano': {
      const previo = typeof antes === 'boolean' ? antes : leer(NIVELES_INICIALES.base, ruta);
      if (despues === previo) return 'igual';
      return despues === false ? 'afloja' : 'endurece';
    }
    case 'texto':
      return 'igual';
    case 'lista': {
      // Se comparan como conjuntos: el orden de los patrones no importa.
      const previos = new Set(Array.isArray(antes) ? antes : []);
      const nuevos = new Set(despues);
      const quita = [...previos].some((patron) => !nuevos.has(patron));
      const agrega = [...nuevos].some((patron) => !previos.has(patron));
      if (campo.afloja === 'quitar') return quita ? 'afloja' : agrega ? 'endurece' : 'igual';
      return agrega ? 'afloja' : quita ? 'endurece' : 'igual';
    }
    default:
      throw new Error(`Ruta de niveles desconocida: ${ruta}`);
  }
}

/**
 * Agrega un cambio al ajuste con la regla de asimetría: endurecer (o un cambio 'igual', como la frase)
 * aplica desde `hoy`; aflojar, desde el día lógico siguiente.
 * - El tipo se compara contra el valor vigente HOY (no contra un cambio pendiente).
 * - Si había un cambio pendiente (aplica_desde > hoy) de la misma ruta, el nuevo lo reemplaza. Así, volver
 *   al valor de hoy cancela lo pendiente.
 * - Si el valor ya es el vigente y no había nada pendiente, no se agrega nada.
 * - En 'bloques.<id>' sin nivel elegido, `cuando.nivelPlan` (el nivel del plan de ese bloque) es el valor de
 *   hoy; si no se pasa, cuenta como desconocido (ver tipoDeCambio).
 * No modifica `niveles`: devuelve una copia nueva.
 * @param {import('./tipos.js').Niveles|null|undefined} niveles
 * @param {string} ruta
 * @param {*} valor
 * @param {{hoy: string, ahora: number, nivelPlan?: string}} cuando  hoy = día lógico actual; ahora en ms
 * @returns {{niveles: import('./tipos.js').Niveles, aplicaDesde: string, inmediato: boolean, tipo: ('endurece'|'afloja'|'igual')}}
 * @throws {Error} si falta hoy o ahora, la ruta no existe o el valor no sirve (por ejemplo, un patrón que no compila)
 */
export function proponerCambio(niveles, ruta, valor, { hoy, ahora, nivelPlan } = {}) {
  if (!esFechaValida(hoy)) throw new Error('Falta la fecha de hoy (AAAA-MM-DD)');
  if (typeof ahora !== 'number' || !Number.isFinite(ahora)) throw new Error('Falta el instante actual (ahora, en ms)');
  const error = errorDeValor(ruta, valor, { regex: true });
  if (error) throw new Error(error);

  const origen = niveles ?? NIVELES_INICIALES;
  let antes = leer(configuracionVigente(origen, hoy), ruta);
  if (campoDe(ruta).tipo === 'nivel' && antes === undefined) antes = nivelPlan;
  const tipo = tipoDeCambio(ruta, antes, valor);
  const aplicaDesde = tipo === 'afloja' ? sumarDias(hoy, 1) : hoy;

  // Copia del ajuste completo (conserva lo que tenga, aunque el motor no lo use).
  const copia = structuredClone(origen);
  if (copia.version === undefined) copia.version = NIVELES_INICIALES.version;
  if (!copia.base || typeof copia.base !== 'object') copia.base = structuredClone(NIVELES_INICIALES.base);
  const previos = Array.isArray(copia.cambios) ? copia.cambios : [];
  const cambios = previos.filter((c) => !(c && c.ruta === ruta && c.aplica_desde > hoy));
  const reemplaza = cambios.length !== previos.length;

  if (reemplaza || JSON.stringify(antes) !== JSON.stringify(valor)) {
    cambios.push({ aplica_desde: aplicaDesde, creado: new Date(ahora).toISOString(), ruta, valor: structuredClone(valor) });
  }
  copia.cambios = cambios;
  return { niveles: copia, aplicaDesde, inmediato: aplicaDesde === hoy, tipo };
}

/**
 * Cambios guardados que todavía no aplican en `fecha` (aplica_desde > fecha), en el orden en que se
 * aplicarán. Sirve para mostrar "se aplica mañana".
 * @param {import('./tipos.js').Niveles|null|undefined} niveles
 * @param {string} fecha  'AAAA-MM-DD'
 * @returns {Array<{aplica_desde: string, creado: string, ruta: string, valor: *}>}  copias
 */
export function cambiosPendientes(niveles, fecha) {
  return cambiosOrdenados(niveles ?? NIVELES_INICIALES)
    .filter((cambio) => cambio.aplica_desde > fecha)
    .map((cambio) => structuredClone(cambio));
}

/**
 * Nivel con el que se vigila un bloque del día:
 * 'total' si una excepción lo subió (gana siempre); si no, el elegido en config.bloques[bloqueId];
 * si no, el del plan. Un nivel desconocido cuenta como 'ninguno'.
 * @param {import('./tipos.js').BloqueDia|null} bloque
 * @param {import('./tipos.js').ConfigNiveles|null} config  configuración vigente
 * @returns {('ninguno'|'aviso'|'friccion'|'total')}
 */
export function nivelDeBloque(bloque, config) {
  if (!bloque) return 'ninguno';
  if (bloque.subidoPorExcepcion) return 'total';
  const elegido = config?.bloques?.[bloque.bloqueId];
  if (NIVELES.includes(elegido)) return elegido;
  return NIVELES.includes(bloque.nivel) ? bloque.nivel : 'ninguno';
}
