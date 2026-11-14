// Modelo del plan (arquitectura §8, F3-01): valores iniciales, normalización y validación.
//
// El plan vive en el ajuste `rastreador-plan` de AW. Este módulo no lo lee ni lo guarda (eso es F3-02):
// solo lo completa (normalizarPlan) y lo revisa (validarPlan). Son funciones puras: nunca modifican
// el plan que reciben, siempre devuelven objetos nuevos.
//
// Las rutas de los errores dicen dónde está el problema, con el id cuando lo hay:
//   'bloques[b-bd1-lun].fin', 'cursos[bd1].area', 'umbrales.foco_parcial', 'excepciones[0].hasta'.
// Si el elemento no tiene id, va su posición en la lista (desde 0): 'clases[2].curso'.

import {
  DIAS_SEMANA, NOMBRE_DIA, NIVELES, TIPOS_BLOQUE, TIPOS_CLASE, MEDICIONES, PRIORIDADES,
  TIPOS_EXCEPCION, EFECTOS_EXCEPCION, COLORES_CURSO,
} from './tipos.js';
import { esFechaValida, esHoraValida, minutosDeHora, diaSemana, diasEntre } from './fechas.js';
import { errorDeRampa } from './rampa.js';

/**
 * Umbrales iniciales de §8. Está congelado (Object.freeze): nadie puede cambiarlo por accidente;
 * normalizarPlan y planVacio usan copias.
 * @type {Readonly<import('./tipos.js').Umbrales>}
 */
export const UMBRALES_INICIALES = Object.freeze({
  tolerancia_inicio_min: 10,
  foco_cumplido: 0.7,
  foco_parcial: 0.4,
  dia_cumplido: 0.8,
  hueco_sueno_h: 3,
  peso_despertar_dormir_min: 30,
});

const LISTAS = ['cursos', 'clases', 'rutinas', 'bloques', 'excepciones'];
const EVENTOS = ['despertar', 'dormir'];
const MIN_DIA = 24 * 60;

// Campos de cada objeto del modelo (los de tipos.js), en el orden en que se guardan.
// normalizarPlan copia SOLO estos: lo demás (por ejemplo el "nota" suelto de plan-ejemplo.json) se quita.
// Lo que sí es parte del modelo se conserva aunque sea opcional (por ejemplo la "nota" de una excepción).
const CAMPOS = {
  ciclo: ['nombre', 'inicio', 'fin'],
  curso: ['id', 'nombre', 'area', 'color', 'meta_horas_semana', 'prioridad'],
  clase: ['id', 'curso', 'tipo', 'dias', 'inicio', 'fin', 'lugar', 'usa_pc'],
  rutina: ['id', 'nombre', 'dias', 'inicio', 'fin', 'medicion', 'evento', 'categoria', 'minutos_meta', 'tolerancia_min'],
  bloque: ['id', 'tipo', 'curso', 'repeticion', 'inicio', 'fin', 'nivel', 'objetivo', 'por_que', 'terminados_antes'],
  terminado: ['fecha', 'fin', 'motivo'],
  excepcion: ['desde', 'hasta', 'tipo', 'efecto', 'nota'],
};

/** Plan sin nada: versión 1, sin ciclo, listas vacías y umbrales iniciales. Cada llamada da un objeto nuevo.
 *  @returns {import('./tipos.js').Plan} */
export function planVacio() {
  return {
    version: 1,
    ciclo: { nombre: '', inicio: '', fin: '' },
    cursos: [],
    clases: [],
    rutinas: [],
    bloques: [],
    excepciones: [],
    umbrales: { ...UMBRALES_INICIALES },
  };
}

// ── Ayudantes ──

/** ¿Es un objeto "de llaves" ({ … })? (null y los arrays también son "object" en JS, por eso se descartan). */
function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

/** ¿Falta el valor? (undefined, null o texto vacío). */
function falta(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

/** Copia profunda de datos JSON (objetos, listas y valores simples), para no compartir nada con la entrada. */
function clonar(valor) {
  if (Array.isArray(valor)) return valor.map(clonar);
  if (esObjeto(valor)) return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, clonar(v)]));
  return valor;
}

/** Copia de `origen` con solo los `campos` que tiene, en ese orden (los undefined no se copian). */
function tomar(origen, campos) {
  const copia = {};
  for (const campo of campos) if (origen[campo] !== undefined) copia[campo] = clonar(origen[campo]);
  return copia;
}

/** Posición de un día en la semana (lun = 0); los días desconocidos van al final. */
function posicionDia(dia) {
  const i = DIAS_SEMANA.indexOf(dia);
  return i === -1 ? DIAS_SEMANA.length : i;
}

/** Id que se le pone a una clase sin id: 'c-<curso>-<días en orden de la semana>-<HHMM>' ('c-bd1-lunmie-0800').
 *  undefined si faltan datos para armarlo (entonces validarPlan avisa lo que falta). */
function idDeClase(clase) {
  if (typeof clase.curso !== 'string' || clase.curso === '') return undefined;
  if (!Array.isArray(clase.dias) || clase.dias.length === 0 || !esHoraValida(clase.inicio)) return undefined;
  const dias = [...clase.dias].sort((a, b) => posicionDia(a) - posicionDia(b)).join('');
  return `c-${clase.curso}-${dias}-${clase.inicio.replace(':', '')}`;
}

/** Evento de una rutina dia_logico sin evento: 'dormir' si el id o el nombre dicen "dormir"; si no, 'despertar'. */
function eventoDeducido(rutina) {
  const texto = `${rutina.id ?? ''} ${rutina.nombre ?? ''}`.toLowerCase();
  return texto.includes('dormir') ? 'dormir' : 'despertar';
}

// ── Normalizar ──

function normalizarCurso(curso) {
  if (!esObjeto(curso)) return clonar(curso); // validarPlan dirá que no es un objeto
  const c = tomar(curso, CAMPOS.curso);
  // El área también se acepta como texto "Estudio > Programación" (así se muestra en §8).
  if (typeof c.area === 'string') c.area = c.area.split('>').map((parte) => parte.trim()).filter(Boolean);
  if (falta(c.color)) delete c.color; // se asigna después, cuando se conocen los colores ya usados
  return c;
}

/** Pone color a los cursos que no tienen: el primero de COLORES_CURSO que nadie usa, en orden.
 *  Si los 8 ya están usados, se repiten según la posición del curso. Cambia la lista que recibe
 *  (es una lista nueva, armada por normalizarPlan). */
function asignarColores(cursos) {
  const usados = new Set(cursos.filter(esObjeto).map((c) => c.color).filter((color) => COLORES_CURSO.includes(color)));
  cursos.forEach((c, i) => {
    if (!esObjeto(c) || c.color !== undefined) return;
    const libre = COLORES_CURSO.find((color) => !usados.has(color));
    c.color = libre ?? COLORES_CURSO[i % COLORES_CURSO.length];
    usados.add(c.color);
  });
}

function normalizarClase(clase) {
  if (!esObjeto(clase)) return clonar(clase);
  const c = tomar(clase, CAMPOS.clase);
  if (falta(c.id)) delete c.id; // el id se pone después, en normalizarClases
  c.lugar ??= ''; // ??= asigna solo si el valor es null o undefined
  c.usa_pc ??= false;
  return c;
}

/**
 * Clases normalizadas, con id para las que no tienen. Si dos clases dan el mismo id, la segunda
 * lleva '-2', la tercera '-3'… en orden de aparición. Los ids que ya venían escritos se respetan
 * y se reservan primero (un id armado nunca choca con uno escrito a mano).
 */
function normalizarClases(clases) {
  const lista = clases.map(normalizarClase);
  const usados = new Set(lista.filter((c) => esObjeto(c) && c.id !== undefined).map((c) => c.id));
  return lista.map((c) => {
    if (!esObjeto(c)) return c;
    if (c.id === undefined) {
      const base = idDeClase(c);
      if (base !== undefined) {
        let id = base;
        for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
        c.id = id;
        usados.add(id);
      }
    }
    return tomar(c, CAMPOS.clase); // otra vez, para dejar las claves en el orden del modelo
  });
}

function normalizarRutina(rutina) {
  if (!esObjeto(rutina)) return clonar(rutina);
  const r = tomar(rutina, CAMPOS.rutina);
  // Los campos opcionales vacíos se quitan: una rutina sin franja no lleva inicio ni fin.
  for (const campo of ['inicio', 'fin', 'evento', 'categoria', 'minutos_meta']) if (falta(r[campo])) delete r[campo];
  if (r.medicion === 'dia_logico' && r.evento === undefined) r.evento = eventoDeducido(r);
  return tomar(r, CAMPOS.rutina);
}

function normalizarTerminado(terminado) {
  if (!esObjeto(terminado)) return clonar(terminado);
  const t = tomar(terminado, CAMPOS.terminado);
  t.motivo ??= '';
  return tomar(t, CAMPOS.terminado);
}

function normalizarBloque(bloque) {
  if (!esObjeto(bloque)) return clonar(bloque);
  const b = tomar(bloque, CAMPOS.bloque);
  if (esObjeto(b.repeticion)) {
    // La repetición semanal lleva días; la única, fecha. Con otro tipo se deja todo para que validarPlan avise.
    const campos = { semanal: ['tipo', 'dias'], unica: ['tipo', 'fecha'] }[b.repeticion.tipo] ?? ['tipo', 'dias', 'fecha'];
    b.repeticion = tomar(b.repeticion, campos);
  }
  b.objetivo ??= '';
  b.por_que ??= '';
  b.terminados_antes = Array.isArray(b.terminados_antes) ? b.terminados_antes.map(normalizarTerminado) : [];
  return tomar(b, CAMPOS.bloque);
}

function normalizarExcepcion(excepcion) {
  if (!esObjeto(excepcion)) return clonar(excepcion);
  const e = tomar(excepcion, CAMPOS.excepcion);
  if (falta(e.hasta) && !falta(e.desde)) e.hasta = e.desde; // excepción de un solo día
  if (falta(e.nota)) delete e.nota;
  return tomar(e, CAMPOS.excepcion);
}

/**
 * Plan completo y con la forma del modelo (§8 y tipos.js). No modifica la entrada.
 *
 * - Sin plan (null, undefined o algo que no es un objeto) → planVacio().
 * - version 1 si falta; ciclo {nombre, inicio, fin} con textos vacíos si falta (= sin ciclo).
 * - Listas que faltan (o que no son listas) → []. Umbrales que faltan → los de UMBRALES_INICIALES.
 * - Cursos sin color → el primer color libre de 'curso-1' … 'curso-8', en orden.
 *   El área se acepta también como texto 'Estudio > Programación' y se pasa a lista.
 * - Clases sin id → 'c-<curso>-<días en orden de la semana, unidos>-<HHMM del inicio>' ('c-bd1-lun-0800');
 *   si dos dan el mismo id, la segunda lleva '-2', la tercera '-3'… (en orden de aparición).
 *   Sin lugar → ''; sin usa_pc → false.
 * - Rutinas dia_logico sin evento → 'dormir' si el id o el nombre contienen "dormir"; si no, 'despertar'.
 *   Los campos opcionales vacíos (inicio, fin, evento, categoria, minutos_meta) se quitan.
 * - Bloques: terminados_antes = [] si falta (y motivo '' en cada uno); objetivo y por_que '' si faltan;
 *   la repetición queda {tipo, dias} (semanal) o {tipo, fecha} (unica).
 * - Excepciones sin "hasta" → "hasta" = "desde" (un solo día).
 * - Solo se copian los campos del modelo, en su orden: lo demás se quita (por ejemplo, el "nota" suelto
 *   del plan de ejemplo). La "nota" de una excepción sí es del modelo y se conserva.
 * - No corrige valores inválidos (una hora "25:00" sigue así): eso lo reporta validarPlan.
 * - Es idempotente: normalizarPlan(normalizarPlan(p)) es igual a normalizarPlan(p).
 *
 * @param {*} plan  el plan tal como viene de AW o de un JSON importado (puede ser de una versión vieja)
 * @returns {import('./tipos.js').Plan}
 */
export function normalizarPlan(plan) {
  if (!esObjeto(plan)) return planVacio();
  const lista = (valor) => (Array.isArray(valor) ? valor : []);

  const cursos = lista(plan.cursos).map(normalizarCurso);
  asignarColores(cursos);

  const umbrales = {};
  for (const [clave, inicial] of Object.entries(UMBRALES_INICIALES)) {
    const valor = esObjeto(plan.umbrales) ? plan.umbrales[clave] : undefined;
    umbrales[clave] = valor ?? inicial; // ?? usa el de la derecha solo si el de la izquierda es null o undefined
  }
  // Rampa del foco (rampa.js): solo se guarda si hay alguna versión; sin rampa, los umbrales quedan como siempre.
  // Si no es una lista se deja tal cual, para que validarPlan lo reporte.
  const rampas = esObjeto(plan.umbrales) ? plan.umbrales.rampas_foco : undefined;
  if (Array.isArray(rampas) ? rampas.length > 0 : rampas != null) umbrales.rampas_foco = structuredClone(rampas);

  return {
    version: typeof plan.version === 'number' ? plan.version : 1,
    ciclo: { nombre: '', inicio: '', fin: '', ...(esObjeto(plan.ciclo) ? tomar(plan.ciclo, CAMPOS.ciclo) : {}) },
    cursos: cursos.map((c) => (esObjeto(c) ? tomar(c, CAMPOS.curso) : c)),
    clases: normalizarClases(lista(plan.clases)),
    rutinas: lista(plan.rutinas).map(normalizarRutina),
    bloques: lista(plan.bloques).map(normalizarBloque),
    excepciones: lista(plan.excepciones).map(normalizarExcepcion),
    umbrales,
  };
}

// ── Validar: ayudantes de los mensajes ──

/** ['a', 'b', 'c'] → 'a, b o c'. */
function listaO(valores) {
  return valores.length <= 1 ? valores.join('') : `${valores.slice(0, -1).join(', ')} o ${valores.at(-1)}`;
}

/** ['a', 'b', 'c'] → 'a, b y c'. */
function listaY(valores) {
  return valores.length <= 1 ? valores.join('') : `${valores.slice(0, -1).join(', ')} y ${valores.at(-1)}`;
}

/** Valor para mostrar en un mensaje: los textos van entre comillas; lo demás, como JSON. */
function mostrar(valor) {
  return typeof valor === 'string' ? `"${valor}"` : JSON.stringify(valor);
}

/** 'lun' → 'lunes'. */
function nombreDia(dia) {
  return (NOMBRE_DIA[dia] ?? dia).toLowerCase();
}

/** Ids: letras (con tildes), números, "-" y "_". Sin espacios, puntos ni "@", porque el id del día
 *  es '<id>@<fecha>' y los cambios de nivel usan rutas con puntos ('bloques.b-bd1-lun'). */
const ID_VALIDO = /^[\p{L}\p{N}_-]+$/u;

const NOMBRES = {
  cursos: { singular: 'Curso', plural: 'cursos', cada: 'cada curso' },
  clases: { singular: 'Clase', plural: 'clases', cada: 'cada clase' },
  rutinas: { singular: 'Rutina', plural: 'rutinas', cada: 'cada rutina' },
  bloques: { singular: 'Bloque', plural: 'bloques', cada: 'cada bloque' },
  excepciones: { singular: 'Excepción', plural: 'excepciones', cada: 'cada excepción' },
};

/** ¿Tiene un id que se puede usar en la ruta y en los mensajes? */
function tieneId(item) {
  return typeof item.id === 'string' && item.id.trim() !== '';
}

/**
 * Revisor de un elemento: junta la ruta base y la etiqueta del mensaje ('Bloque "b-bd1-lun"'),
 * y trae las comprobaciones comunes. Cada comprobación devuelve true si el campo está bien
 * (así se puede seguir revisando lo que depende de él) y, si no, anota el error y devuelve false.
 * En todas, `ruta` (opcional) es dónde se anota el error si no es el mismo nombre del campo.
 */
function crearRevisor(resultado, base, etiqueta) {
  const anotar = (lista) => (campo, texto) => {
    lista.push({ ruta: campo ? `${base}.${campo}` : base, mensaje: `${etiqueta}: ${texto}` });
    return false;
  };
  const error = anotar(resultado.errores);
  return {
    error,
    aviso: anotar(resultado.avisos),
    texto(item, campo, nombre, { obligatorio = true, ruta = campo } = {}) {
      const v = item[campo];
      if (falta(v)) return obligatorio ? error(ruta, `falta ${nombre}.`) : true;
      return typeof v === 'string' ? true : error(ruta, `${nombre} tiene que ser un texto; ahora es ${mostrar(v)}.`);
    },
    opcion(item, campo, nombre, opciones, { ruta = campo } = {}) {
      const v = item[campo];
      if (falta(v)) return error(ruta, `falta ${nombre} (usa ${listaO(opciones)}).`);
      return opciones.includes(v) ? true : error(ruta, `${nombre} ${mostrar(v)} no existe (usa ${listaO(opciones)}).`);
    },
    hora(item, campo, nombre, { ruta = campo, siFalta } = {}) {
      const v = item[campo];
      if (falta(v)) return error(ruta, siFalta ?? `falta ${nombre} (usa HH:MM, de 00:00 a 23:59).`);
      return esHoraValida(v) ? true : error(ruta, `${nombre} ${mostrar(v)} no es válida (usa HH:MM, de 00:00 a 23:59).`);
    },
    fecha(item, campo, nombre, { ruta = campo, siFalta } = {}) {
      const v = item[campo];
      if (falta(v)) return error(ruta, siFalta ?? `falta ${nombre} (usa AAAA-MM-DD, por ejemplo 2026-10-08).`);
      return esFechaValida(v) ? true : error(ruta, `${nombre} ${mostrar(v)} no es válida (usa AAAA-MM-DD, por ejemplo 2026-10-08).`);
    },
    /** Número; min y max van incluidos; con mayorQue, tiene que ser estrictamente mayor. */
    numero(item, campo, nombre, { min, max, mayorQue, ruta = campo, siFalta } = {}) {
      const v = item[campo];
      if (v === undefined || v === null || v === '') return error(ruta, siFalta ?? `falta ${nombre}.`);
      let rango = 'un número';
      if (min !== undefined && max !== undefined) rango = `un número entre ${min} y ${max}`;
      else if (min !== undefined) rango = `un número de ${min} o más`;
      else if (mayorQue !== undefined) rango = `un número mayor que ${mayorQue}`;
      const bien = typeof v === 'number' && Number.isFinite(v)
        && (min === undefined || v >= min) && (max === undefined || v <= max) && (mayorQue === undefined || v > mayorQue);
      return bien ? true : error(ruta, `${nombre} tiene que ser ${rango}; ahora es ${mostrar(v)}.`);
    },
    /** Días de la semana: lista no vacía, sin repetidos, con claves de DIAS_SEMANA. */
    dias(item, campo, { ruta = campo, siVacia = 'elige al menos un día de la semana.' } = {}) {
      const v = item[campo];
      if (v !== undefined && v !== null && !Array.isArray(v)) {
        return error(ruta, `los días tienen que ser una lista, por ejemplo ["lun", "mie"]; ahora es ${mostrar(v)}.`);
      }
      if (!Array.isArray(v) || v.length === 0) return error(ruta, siVacia);
      let bien = true;
      v.forEach((dia, i) => {
        if (!DIAS_SEMANA.includes(dia)) bien = error(ruta, `el día ${mostrar(dia)} no existe (usa ${listaO(DIAS_SEMANA)}).`);
        else if (v.indexOf(dia) !== i) bien = error(ruta, `el día "${dia}" está repetido.`);
      });
      return bien;
    },
  };
}

/** Ruta base y etiqueta de un elemento de una lista. */
function baseYEtiqueta(tipo, item, i) {
  if (tipo === 'excepciones') {
    return { base: `excepciones[${i}]`, etiqueta: esFechaValida(item.desde) ? `Excepción del ${item.desde}` : `Excepción ${i + 1}` };
  }
  const { singular } = NOMBRES[tipo];
  return tieneId(item)
    ? { base: `${tipo}[${item.id}]`, etiqueta: `${singular} "${item.id}"` }
    : { base: `${tipo}[${i}]`, etiqueta: `${singular} ${i + 1}` };
}

/** Recorre una lista: anota los elementos que no son objetos y llama a `revisar(item, revisor)` con los demás. */
function revisarLista(lista, tipo, resultado, revisar) {
  lista.forEach((item, i) => {
    if (!esObjeto(item)) {
      resultado.errores.push({
        ruta: `${tipo}[${i}]`,
        mensaje: `${NOMBRES[tipo].singular} ${i + 1}: tiene que ser un objeto con sus campos (entre llaves { }); ahora es ${mostrar(item)}.`,
      });
      return;
    }
    const { base, etiqueta } = baseYEtiqueta(tipo, item, i);
    revisar(item, crearRevisor(resultado, base, etiqueta));
  });
}

/** Ids que faltan, con caracteres no permitidos o repetidos dentro de la misma lista. */
function revisarIds(lista, tipo, { errores }) {
  const { singular, plural, cada } = NOMBRES[tipo];
  const posiciones = new Map(); // id → posiciones (desde 1) donde aparece
  lista.forEach((item, i) => {
    if (!esObjeto(item)) return;
    if (!tieneId(item)) {
      const pista = tipo === 'clases' ? ' (se pone solo si la clase tiene curso, días y hora de inicio)' : '';
      errores.push({ ruta: `${tipo}[${i}].id`, mensaje: `${singular} ${i + 1}: falta el id${pista}.` });
      return;
    }
    if (!ID_VALIDO.test(item.id)) {
      errores.push({
        ruta: `${tipo}[${item.id}].id`,
        mensaje: `${singular} "${item.id}": el id solo puede tener letras, números, "-" y "_" (sin espacios, puntos ni "@").`,
      });
    }
    posiciones.set(item.id, [...(posiciones.get(item.id) ?? []), i + 1]);
  });
  for (const [id, donde] of posiciones) {
    if (donde.length < 2) continue;
    errores.push({
      ruta: `${tipo}[${id}].id`,
      mensaje: `${singular} "${id}": el id está repetido (${plural} ${listaY(donde.map(String))}); ${cada} necesita uno distinto.`,
    });
  }
}

// ── Validar: cada parte del plan ──

/** ¿El ciclo tiene las dos fechas válidas y en orden? */
function cicloValido(ciclo) {
  return esFechaValida(ciclo.inicio) && esFechaValida(ciclo.fin) && ciclo.inicio <= ciclo.fin;
}

function revisarCiclo(ciclo, resultado) {
  const r = crearRevisor(resultado, 'ciclo', 'Ciclo');
  if (falta(ciclo.inicio) && falta(ciclo.fin)) return; // sin ciclo: se permite (cuentan las rutinas y los bloques únicos)
  r.texto(ciclo, 'nombre', 'el nombre (por ejemplo "2026-2")');
  const inicioBien = r.fecha(ciclo, 'inicio', 'la fecha de inicio');
  const finBien = r.fecha(ciclo, 'fin', 'la fecha de fin');
  if (inicioBien && finBien && ciclo.inicio > ciclo.fin) {
    r.error('fin', `la fecha de inicio (${ciclo.inicio}) es posterior a la de fin (${ciclo.fin}).`);
  }
}

const NOMBRE_UMBRAL = {
  tolerancia_inicio_min: 'la tolerancia de inicio (tolerancia_inicio_min, en minutos)',
  foco_cumplido: 'el foco para "cumplido" (foco_cumplido)',
  foco_parcial: 'el foco para "parcial" (foco_parcial)',
  dia_cumplido: 'el % para "día cumplido" (dia_cumplido)',
  hueco_sueno_h: 'el hueco que cuenta como sueño (hueco_sueno_h, en horas)',
  peso_despertar_dormir_min: 'el peso de despertar y de dormir (peso_despertar_dormir_min, en minutos)',
};

function revisarUmbrales(umbrales, resultado) {
  const r = crearRevisor(resultado, 'umbrales', 'Umbrales');
  const proporcion = (clave) => {
    const v = umbrales[clave];
    // Pista para el error más común: escribir 70 (por ciento) en vez de 0.7.
    if (typeof v === 'number' && v > 1 && v <= 100) {
      return r.error(clave, `${NOMBRE_UMBRAL[clave]} tiene que ser un número entre 0 y 1; ahora es ${v} (para ${v} % escribe ${v / 100}).`);
    }
    return r.numero(umbrales, clave, NOMBRE_UMBRAL[clave], { min: 0, max: 1 });
  };
  r.numero(umbrales, 'tolerancia_inicio_min', NOMBRE_UMBRAL.tolerancia_inicio_min, { min: 0 });
  const cumplidoBien = proporcion('foco_cumplido');
  const parcialBien = proporcion('foco_parcial');
  proporcion('dia_cumplido');
  r.numero(umbrales, 'hueco_sueno_h', NOMBRE_UMBRAL.hueco_sueno_h, { mayorQue: 0 });
  r.numero(umbrales, 'peso_despertar_dormir_min', NOMBRE_UMBRAL.peso_despertar_dormir_min, { min: 0 });
  if (cumplidoBien && parcialBien && umbrales.foco_parcial >= umbrales.foco_cumplido) {
    r.error('foco_parcial', `el foco para "parcial" (${umbrales.foco_parcial}) tiene que ser menor que el foco para "cumplido" (${umbrales.foco_cumplido}).`);
  }
  // Rampa del foco: una lista de versiones {aplica_desde, rampa} (rampa.js).
  const rampas = umbrales.rampas_foco;
  if (rampas === undefined) return;
  if (!Array.isArray(rampas)) {
    r.error('rampas_foco', `la rampa del foco (rampas_foco) tiene que ser una lista; ahora es ${mostrar(rampas)}.`);
    return;
  }
  rampas.forEach((version, i) => {
    const ruta = `rampas_foco[${i}]`;
    if (!esObjeto(version) || !esFechaValida(version.aplica_desde)) {
      r.error(`${ruta}.aplica_desde`, 'cada versión de la rampa del foco necesita la fecha desde la que vale (aplica_desde, AAAA-MM-DD).');
    } else if (version.rampa !== null) {
      const error = errorDeRampa(version.rampa);
      if (error) r.error(`${ruta}.rampa`, error);
    }
  });
}

function revisarCurso(curso, r) {
  r.texto(curso, 'nombre', 'el nombre');
  const ejemplo = 'por ejemplo ["Estudio", "Programación"]';
  if (falta(curso.area)) r.error('area', `falta el área (${ejemplo}).`);
  else if (!Array.isArray(curso.area) || curso.area.length === 0 || curso.area.some((parte) => typeof parte !== 'string' || parte === '')) {
    r.error('area', `el área tiene que ser una lista de textos, ${ejemplo}; ahora es ${mostrar(curso.area)}.`);
  } else if (curso.area[0] !== 'Estudio') {
    r.error('area', `el área tiene que empezar con "Estudio" (${ejemplo}); ahora es "${curso.area.join(' > ')}".`);
  }
  r.opcion(curso, 'color', 'el color', COLORES_CURSO);
  r.numero(curso, 'meta_horas_semana', 'la meta de horas por semana (meta_horas_semana)', { min: 0 });
  r.opcion(curso, 'prioridad', 'la prioridad', PRIORIDADES);
}

/** `curso` tiene que ser el id de un curso que existe. */
function revisarReferenciaCurso(item, r, idsCursos) {
  if (!r.texto(item, 'curso', 'el curso')) return;
  if (!idsCursos.has(item.curso)) r.error('curso', `el curso "${item.curso}" no existe; créalo en Cursos o elige otro.`);
}

/** Inicio y fin obligatorios, válidos y distintos. Devuelve true si los dos están bien. */
function revisarFranja(item, r, queEs) {
  const inicioBien = r.hora(item, 'inicio', 'la hora de inicio');
  const finBien = r.hora(item, 'fin', 'la hora de fin');
  if (inicioBien && finBien && item.inicio === item.fin) {
    return r.error('fin', `empieza y termina a la misma hora (${item.inicio}); cambia la hora de fin (si es más temprano que el inicio, ${queEs} cruza la medianoche).`);
  }
  return inicioBien && finBien;
}

function revisarClase(clase, r, idsCursos) {
  revisarReferenciaCurso(clase, r, idsCursos);
  r.opcion(clase, 'tipo', 'el tipo', TIPOS_CLASE);
  r.dias(clase, 'dias');
  revisarFranja(clase, r, 'la clase');
  r.texto(clase, 'lugar', 'el lugar', { obligatorio: false });
  if (typeof clase.usa_pc !== 'boolean') r.error('usa_pc', `"usa_pc" tiene que ser true (usa la PC) o false; ahora es ${mostrar(clase.usa_pc)}.`);
}

function revisarRutina(rutina, r) {
  r.texto(rutina, 'nombre', 'el nombre');
  r.dias(rutina, 'dias');
  const medicionBien = r.opcion(rutina, 'medicion', 'la medición', MEDICIONES);
  r.numero(rutina, 'tolerancia_min', 'la tolerancia (tolerancia_min, en minutos)', { min: 0 });

  if (medicionBien && rutina.medicion === 'dia_logico') {
    // Despertar y dormir: la hora objetivo es `inicio`; el fin no se usa (puede faltar o ser igual).
    r.hora(rutina, 'inicio', 'la hora objetivo', { siFalta: 'con medición "dia_logico" necesita la hora objetivo en "inicio" (HH:MM).' });
    if (!falta(rutina.fin)) r.hora(rutina, 'fin', 'la hora de fin');
    r.opcion(rutina, 'evento', 'el evento', EVENTOS);
    return;
  }

  // Franja opcional: las dos horas o ninguna (sin franja, la rutina cuenta en todo el día lógico).
  const sinInicio = falta(rutina.inicio);
  const sinFin = falta(rutina.fin);
  if (sinInicio !== sinFin) {
    const [tiene, noTiene] = sinInicio ? ['fin', 'inicio'] : ['inicio', 'fin'];
    r.error(noTiene, `tiene hora de ${tiene} pero no de ${noTiene}; pon las dos o ninguna (sin franja cuenta en todo el día lógico).`);
  } else if (!sinInicio) {
    revisarFranja(rutina, r, 'la rutina');
  }

  if (medicionBien && rutina.medicion === 'pc') {
    const categoria = rutina.categoria;
    const categoriaBien = Array.isArray(categoria) && categoria.length > 0 && categoria.every((parte) => typeof parte === 'string' && parte !== '');
    if (!categoriaBien) r.error('categoria', 'con medición "pc" necesita la categoría de AW que cuenta, por ejemplo ["Estudio", "Inglés"].');
    r.numero(rutina, 'minutos_meta', 'los minutos de meta (minutos_meta)', {
      mayorQue: 0, siFalta: 'con medición "pc" necesita los minutos de meta (minutos_meta, un número mayor que 0).',
    });
  }
}

/** Minutos desde `inicio` hasta `hora` (0 a 1439), contando el cruce de medianoche. */
function minutosDesde(inicio, hora) {
  return (minutosDeHora(hora) - minutosDeHora(inicio) + MIN_DIA) % MIN_DIA;
}

function revisarBloque(bloque, r, idsCursos) {
  r.opcion(bloque, 'tipo', 'el tipo', TIPOS_BLOQUE);
  revisarReferenciaCurso(bloque, r, idsCursos);
  const rep = bloque.repeticion;
  if (!esObjeto(rep)) {
    r.error('repeticion', 'falta la repetición: {"tipo": "semanal", "dias": [...]} o {"tipo": "unica", "fecha": "AAAA-MM-DD"}.');
  } else if (rep.tipo === 'semanal') {
    r.dias(rep, 'dias', { ruta: 'repeticion.dias', siVacia: 'es semanal pero no tiene días; elige al menos un día de la semana.' });
  } else if (rep.tipo === 'unica') {
    r.fecha(rep, 'fecha', 'la fecha', {
      ruta: 'repeticion.fecha', siFalta: 'es un bloque único pero no tiene fecha (usa AAAA-MM-DD, por ejemplo 2026-10-17).',
    });
  } else {
    r.error('repeticion.tipo', `la repetición ${mostrar(rep.tipo)} no existe (usa "semanal" con días o "unica" con fecha).`);
  }
  const franjaBien = revisarFranja(bloque, r, 'el bloque');
  r.opcion(bloque, 'nivel', 'el nivel', NIVELES);
  r.texto(bloque, 'objetivo', 'el objetivo', { obligatorio: false });
  r.texto(bloque, 'por_que', 'el "por qué"', { obligatorio: false });

  // Terminados antes: {fecha, fin, motivo}. La hora real tiene que caer dentro del bloque.
  const vistas = new Set();
  bloque.terminados_antes.forEach((t, i) => {
    const campo = `terminados_antes[${i}]`;
    if (!esObjeto(t)) {
      r.error(campo, `cada "terminado antes" tiene que ser {"fecha", "fin", "motivo"}; ahora es ${mostrar(t)}.`);
      return;
    }
    const fechaBien = r.fecha(t, 'fecha', 'la fecha del "terminado antes"', { ruta: `${campo}.fecha` });
    const finBien = r.hora(t, 'fin', 'la hora real de fin', { ruta: `${campo}.fin` });
    r.texto(t, 'motivo', 'el motivo', { obligatorio: false, ruta: `${campo}.motivo` });
    if (franjaBien && finBien && minutosDesde(bloque.inicio, t.fin) > minutosDesde(bloque.inicio, bloque.fin)) {
      r.error(`${campo}.fin`, `la hora real de fin "${t.fin}"${fechaBien ? ` del ${t.fecha}` : ''} tiene que estar dentro del bloque (de ${bloque.inicio} a ${bloque.fin}).`);
    }
    if (!fechaBien) return;
    if (vistas.has(t.fecha)) r.aviso(`${campo}.fecha`, `hay más de un "terminado antes" para el ${t.fecha}; se usa el último.`);
    vistas.add(t.fecha);
    if (!esObjeto(rep)) return;
    const cae = rep.tipo === 'unica' ? t.fecha === rep.fecha : Array.isArray(rep.dias) && rep.dias.includes(diaSemana(t.fecha));
    if (!cae) {
      r.aviso(`${campo}.fecha`, `el "terminado antes" del ${t.fecha} (${nombreDia(diaSemana(t.fecha))}) cae en un día sin este bloque; no se usa.`);
    }
  });
}

function revisarExcepcion(excepcion, r) {
  const desdeBien = r.fecha(excepcion, 'desde', 'la fecha "desde"');
  const hastaBien = r.fecha(excepcion, 'hasta', 'la fecha "hasta"');
  if (desdeBien && hastaBien && excepcion.desde > excepcion.hasta) {
    r.error('hasta', `"desde" (${excepcion.desde}) es posterior a "hasta" (${excepcion.hasta}); cámbialas de lugar.`);
  }
  r.opcion(excepcion, 'tipo', 'el tipo', TIPOS_EXCEPCION);
  r.opcion(excepcion, 'efecto', 'el efecto', EFECTOS_EXCEPCION);
  r.texto(excepcion, 'nota', 'la nota', { obligatorio: false });
}

// ── Avisos: solapes, bloques únicos fuera del ciclo, cursos sin bloques, plan sin ciclo ──

const MIN_SEMANA = 7 * MIN_DIA;

/**
 * Solapes de bloques entre sí y de bloques con clases.
 *
 * Cada hora se pasa a "minutos del día del plan": como una hora anterior al inicio del día (04:00) es
 * de la madrugada siguiente (§8), "00:30" vale 24:30 = 1470. Un fin menor o igual que el inicio cruza
 * la medianoche (+1440). Así, "lunes 23:30–00:30" y "lunes 00:00–01:00" se ven solapados.
 *
 * - Semanales y clases: se comparan en una semana circular (lunes 0 … domingo 6 × 1440 minutos;
 *   el domingo en la noche toca el lunes).
 * - Un bloque único se compara con los semanales y las clases en el día de la semana de su fecha
 *   (si cae dentro del ciclo, que es cuando ellos existen), y con los otros únicos por fecha.
 */
function avisosDeSolapes(plan, resultado, inicioDia) {
  const minutosInicioDia = minutosDeHora(inicioDia);
  const posicion = (hora) => {
    const m = minutosDeHora(hora);
    return m < minutosInicioDia ? m + MIN_DIA : m;
  };
  const franja = (item) => {
    const a = posicion(item.inicio);
    let b = posicion(item.fin);
    if (b <= a) b += MIN_DIA;
    return [a, b];
  };
  const hayCiclo = cicloValido(plan.ciclo);
  const enCiclo = (fecha) => hayCiclo && plan.ciclo.inicio <= fecha && fecha <= plan.ciclo.fin;
  const usable = (item) => esObjeto(item) && tieneId(item) && esHoraValida(item.inicio) && esHoraValida(item.fin) && item.inicio !== item.fin;
  const diasValidos = (dias) => (Array.isArray(dias) ? [...new Set(dias)].filter((d) => DIAS_SEMANA.includes(d)) : []);

  // Ocurrencias: {tipo, item, cuando (para el mensaje), unica, a, b} en minutos.
  const semana = [];
  const porFecha = []; // solo bloques únicos, en una línea de tiempo de días seguidos
  for (const bloque of plan.bloques.filter(usable)) {
    const [a, b] = franja(bloque);
    const rep = esObjeto(bloque.repeticion) ? bloque.repeticion : {};
    if (rep.tipo === 'semanal') {
      for (const dia of diasValidos(rep.dias)) {
        const base = DIAS_SEMANA.indexOf(dia) * MIN_DIA;
        semana.push({ tipo: 'bloque', item: bloque, cuando: `el ${nombreDia(dia)}`, unica: false, a: base + a, b: base + b });
      }
    } else if (rep.tipo === 'unica' && esFechaValida(rep.fecha)) {
      const dia = diaSemana(rep.fecha);
      const cuando = `el ${nombreDia(dia)} ${rep.fecha}`;
      if (enCiclo(rep.fecha)) {
        const base = DIAS_SEMANA.indexOf(dia) * MIN_DIA;
        semana.push({ tipo: 'bloque', item: bloque, cuando, unica: true, a: base + a, b: base + b });
      }
      const base = diasEntre('2000-01-01', rep.fecha) * MIN_DIA;
      porFecha.push({ tipo: 'bloque', item: bloque, cuando, unica: true, a: base + a, b: base + b });
    }
  }
  for (const clase of plan.clases.filter(usable)) {
    const [a, b] = franja(clase);
    for (const dia of diasValidos(clase.dias)) {
      const base = DIAS_SEMANA.indexOf(dia) * MIN_DIA;
      semana.push({ tipo: 'clase', item: clase, cuando: `el ${nombreDia(dia)}`, unica: false, a: base + a, b: base + b });
    }
  }

  // [a, b) y [c, d) se solapan si a < d y c < b. En la semana circular se prueba también una semana antes y después.
  const solapan = (x, y, vueltas) => vueltas.some((k) => x.a < y.b + k && y.a + k < x.b);
  const pares = new Map(); // "bloque i | bloque j" → {x, y, cuandos}
  const anotar = (x, y) => {
    const clave = `${x.tipo}:${x.item.id}|${y.tipo}:${y.item.id}`;
    if (!pares.has(clave)) pares.set(clave, { x, y, cuandos: [] });
    const par = pares.get(clave);
    if (!par.cuandos.includes(x.cuando)) par.cuandos.push(x.cuando);
  };
  // Las ocurrencias de bloques van antes que las de clases, así que en un par mixto x es el bloque.
  for (let i = 0; i < semana.length; i++) {
    for (let j = i + 1; j < semana.length; j++) {
      const [x, y] = [semana[i], semana[j]];
      if (x.item === y.item || (x.tipo === 'clase' && y.tipo === 'clase') || (x.unica && y.unica)) continue;
      if (solapan(x, y, [-MIN_SEMANA, 0, MIN_SEMANA])) anotar(x, y);
    }
  }
  for (let i = 0; i < porFecha.length; i++) {
    for (let j = i + 1; j < porFecha.length; j++) {
      if (porFecha[i].item !== porFecha[j].item && solapan(porFecha[i], porFecha[j], [0])) anotar(porFecha[i], porFecha[j]);
    }
  }

  for (const { x, y, cuandos } of pares.values()) {
    const horas = `${x.item.inicio}–${x.item.fin} y ${y.item.inicio}–${y.item.fin}`;
    const mensaje = y.tipo === 'clase'
      ? `El bloque "${x.item.id}" se solapa con la clase "${y.item.id}" ${listaY(cuandos)} (${horas}).`
      : `Los bloques "${x.item.id}" y "${y.item.id}" se solapan ${listaY(cuandos)} (${horas}).`;
    resultado.avisos.push({ ruta: `bloques[${x.item.id}]`, mensaje });
  }
}

function avisosGenerales(plan, resultado) {
  const hayCiclo = cicloValido(plan.ciclo);
  const bloques = plan.bloques.filter(esObjeto);

  const haySemanales = bloques.some((b) => esObjeto(b.repeticion) && b.repeticion.tipo === 'semanal');
  if (falta(plan.ciclo.inicio) && falta(plan.ciclo.fin) && (plan.clases.length > 0 || haySemanales)) {
    resultado.avisos.push({
      ruta: 'ciclo',
      mensaje: 'Ciclo: no tiene fechas, así que las clases y los bloques semanales no aparecen en ningún día.',
    });
  }

  for (const bloque of bloques) {
    const rep = bloque.repeticion;
    if (!hayCiclo || !tieneId(bloque) || !esObjeto(rep) || rep.tipo !== 'unica' || !esFechaValida(rep.fecha)) continue;
    if (rep.fecha < plan.ciclo.inicio || rep.fecha > plan.ciclo.fin) {
      resultado.avisos.push({
        ruta: `bloques[${bloque.id}].repeticion.fecha`,
        mensaje: `Bloque "${bloque.id}": su fecha (${rep.fecha}) está fuera del ciclo (${plan.ciclo.inicio} a ${plan.ciclo.fin}); igual aparece ese día.`,
      });
    }
  }

  const cursosConBloques = new Set(bloques.map((b) => b.curso));
  for (const curso of plan.cursos.filter((c) => esObjeto(c) && tieneId(c))) {
    if (cursosConBloques.has(curso.id)) continue;
    resultado.avisos.push({
      ruta: `cursos[${curso.id}]`,
      mensaje: `Curso "${curso.id}": no tiene bloques de estudio, así que no se le van a contar horas ni se podrá medir su meta semanal.`,
    });
  }
}

/**
 * Revisa un plan. Primero lo normaliza (en una copia): no se queja de lo que normalizarPlan completa
 * solo (ids de clases, colores, umbrales que faltan…), y las rutas usan esos ids. Para guardar:
 *   const p = normalizarPlan(plan); if (validarPlan(p).valido) guardar(p);
 *
 * Errores (impiden guardar): campos obligatorios; horas ('HH:MM') y fechas ('AAAA-MM-DD') inválidas;
 * ids que faltan, repetidos (dentro de cada lista) o con espacios, puntos o "@"; cursos que no existen;
 * valores fuera de las listas de tipos.js; inicio igual a fin; ciclo con inicio > fin; excepción con
 * desde > hasta; rampa del foco mal formada; umbrales fuera de rango (focos y día cumplido entre 0 y 1, foco_parcial < foco_cumplido,
 * tolerancias y peso ≥ 0, hueco de sueño > 0); rutina pc sin categoría o sin minutos_meta; rutina
 * dia_logico sin hora objetivo; rutina con solo una de sus dos horas; curso cuya área no empieza con
 * "Estudio"; bloque semanal sin días; bloque único sin fecha válida; "terminado antes" fuera del bloque.
 *
 * Avisos (no impiden guardar): bloques que se solapan entre sí o con una clase, bloque único fuera del
 * ciclo, curso sin bloques, plan con clases o bloques semanales pero sin ciclo, y "terminados antes"
 * repetidos o en un día sin el bloque.
 *
 * @param {*} plan
 * @param {{inicioDia?: string}} [opciones]  startOfDay de AW (04:00): decide de qué día es una hora de madrugada
 * @returns {{valido: boolean, errores: Array<{ruta: string, mensaje: string}>, avisos: Array<{ruta: string, mensaje: string}>}}
 */
export function validarPlan(plan, opciones = {}) {
  const inicioDia = opciones?.inicioDia ?? '04:00';
  const resultado = { valido: false, errores: [], avisos: [] };
  if (!esObjeto(plan)) {
    resultado.errores.push({
      ruta: '',
      mensaje: `El plan tiene que ser un objeto JSON (entre llaves { }) con ciclo, cursos, clases, rutinas, bloques, excepciones y umbrales; ahora es ${mostrar(plan)}.`,
    });
    return resultado;
  }

  // La forma general se revisa en el plan original, porque normalizarPlan cambia lo que no es lista por [].
  for (const lista of LISTAS) {
    if (plan[lista] != null && !Array.isArray(plan[lista])) {
      resultado.errores.push({ ruta: lista, mensaje: `"${lista}" tiene que ser una lista (entre corchetes [ ]); ahora es ${mostrar(plan[lista])}.` });
    }
  }
  for (const objeto of ['ciclo', 'umbrales']) {
    if (plan[objeto] != null && !esObjeto(plan[objeto])) {
      resultado.errores.push({ ruta: objeto, mensaje: `"${objeto}" tiene que ser un objeto (entre llaves { }); ahora es ${mostrar(plan[objeto])}.` });
    }
  }

  const p = normalizarPlan(plan);
  const idsCursos = new Set(p.cursos.filter((c) => esObjeto(c) && tieneId(c)).map((c) => c.id));

  revisarCiclo(p.ciclo, resultado);
  revisarUmbrales(p.umbrales, resultado);
  for (const lista of ['cursos', 'clases', 'rutinas', 'bloques']) revisarIds(p[lista], lista, resultado);
  revisarLista(p.cursos, 'cursos', resultado, (curso, r) => revisarCurso(curso, r));
  revisarLista(p.clases, 'clases', resultado, (clase, r) => revisarClase(clase, r, idsCursos));
  revisarLista(p.rutinas, 'rutinas', resultado, (rutina, r) => revisarRutina(rutina, r));
  revisarLista(p.bloques, 'bloques', resultado, (bloque, r) => revisarBloque(bloque, r, idsCursos));
  revisarLista(p.excepciones, 'excepciones', resultado, (excepcion, r) => revisarExcepcion(excepcion, r));

  if (esHoraValida(inicioDia)) avisosDeSolapes(p, resultado, inicioDia);
  avisosGenerales(p, resultado);

  resultado.valido = resultado.errores.length === 0;
  return resultado;
}
