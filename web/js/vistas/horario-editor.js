// Editor del plan (F3-04): tablas y formularios de cursos, clases, rutinas, bloques, excepciones y ciclo.
//
// Cada "sección" del editor tiene:
//   tabla(ctx)            → la tabla con sus botones Editar y Borrar
//   editar(ctx, indice)   → abre el formulario (indice = posición en la lista; -1 = nuevo)
// `ctx` (contexto) lo arma vistas/horario.js: { plan, config, pendientes, areas, categorias, guardar, guardarNivel, borrar }.
//
// Cada cambio se guarda en el acto: se arma una copia del plan con el cambio, se valida con validarPlan (motor)
// y, si no hay errores, se guarda en AW. Si hay errores, el formulario sigue abierto y los muestra en su campo.

import { el } from '../dom.js';
import { abrirFormulario, aId, idLibre } from '../componentes/formulario.js';
import { crearTabla, crearEtiqueta, crearChipNivel, crearVacio } from '../componentes/ui.js';
import {
  NIVELES, NOMBRE_NIVEL, TIPOS_BLOQUE, NOMBRE_TIPO_BLOQUE, TIPOS_CLASE, MEDICIONES, PRIORIDADES,
  TIPOS_EXCEPCION, EFECTOS_EXCEPCION, DIAS_SEMANA,
} from '../../motor/tipos.js';
import {
  NOMBRE_TIPO_CLASE, NOMBRE_PRIORIDAD, NOMBRE_MEDICION, NOMBRE_EVENTO, NOMBRE_TIPO_EXCEPCION, NOMBRE_EFECTO,
  textoDias, textoFranja, textoCategoria, textoRepeticion, nombreCurso, colorCurso,
} from '../textos-plan.js';
import { fechaCorta } from '../fechas.js';

const opcionesDe = (valores, nombres) => valores.map((valor) => ({ valor, texto: nombres[valor] ?? valor }));

/** Botones Editar y Borrar de una fila. `nombre` es para el lector de pantalla ("Editar BD I"). */
function accionesFila(nombre, alEditar, alBorrar) {
  return el('span', { class: 'acciones-fila' },
    el('button', { class: 'boton boton-pequeno', type: 'button', 'aria-label': `Editar ${nombre}`, onclick: alEditar }, 'Editar'),
    el('button', { class: 'boton boton-pequeno boton-fantasma', type: 'button', 'aria-label': `Borrar ${nombre}`, onclick: alBorrar }, 'Borrar'));
}

/** Etiqueta con el color y el nombre del curso. */
function etiquetaCurso(plan, id) {
  return crearEtiqueta(colorCurso(plan, id) ?? 'neutral', nombreCurso(plan, id));
}

/**
 * Errores de validarPlan → forma que entiende abrirFormulario.
 * La ruta 'bloques[b-bd1-lun].repeticion.dias' termina en el nombre del campo ('dias'). `alias` traduce los
 * nombres del plan a las claves del formulario cuando no coinciden. Lo que no es de este formulario va a "general".
 */
export function erroresParaFormulario(errores, claves, alias = {}) {
  const porCampo = {};
  const sueltos = [];
  for (const { ruta, mensaje } of errores) {
    const campo = ruta.split('.').pop();
    const clave = alias[campo] ?? campo;
    // 'Bloque "b-bd1-lun": falta la hora de inicio.' → 'Falta la hora de inicio.'
    const corto = mensaje.replace(/^[^:]{0,60}: /, '');
    if (claves.includes(clave) && !porCampo[clave]) porCampo[clave] = corto[0].toUpperCase() + corto.slice(1);
    else sueltos.push(mensaje);
  }
  return { errores: porCampo, general: sueltos.join(' ') };
}

/** Copia del plan con `lista[indice]` reemplazado por `item` (indice −1: se agrega al final). */
function conItem(plan, lista, indice, item) {
  const copia = structuredClone(plan);
  if (indice < 0) copia[lista].push(item);
  else copia[lista][indice] = item;
  return copia;
}

/** Guarda desde un formulario: devuelve los errores en la forma de abrirFormulario, o null si guardó. */
async function guardarDesdeFormulario(ctx, candidato, campos, alias, mensaje) {
  const errores = await ctx.guardar(candidato, mensaje);
  return errores.length ? erroresParaFormulario(errores, campos.map((c) => c.clave), alias) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursos
// ─────────────────────────────────────────────────────────────────────────────

export const cursos = {
  id: 'cursos', nombre: 'Cursos', singular: 'curso',
  descripcion: 'Cada curso apunta a un área de Estudio de AW. Su meta semanal se mide con sus bloques.',

  tabla(ctx) {
    const { plan } = ctx;
    if (!plan.cursos.length) return crearVacio('Todavía no hay cursos.', { detalle: 'Empieza por aquí: las clases y los bloques necesitan un curso.', compacto: true });
    return crearTabla({
      descripcion: 'Cursos del ciclo',
      columnas: [
        { clave: 'nombre', titulo: 'Curso', formato: (_, c) => etiquetaCurso(plan, c.id) },
        { clave: 'id', titulo: 'Id', formato: (v) => el('code', {}, v) },
        { clave: 'area', titulo: 'Área', formato: (v) => textoCategoria(v) },
        { clave: 'meta_horas_semana', titulo: 'Meta semanal', numerica: true, formato: (v) => `${String(v).replace('.', ',')} h` },
        { clave: 'prioridad', titulo: 'Prioridad', formato: (v) => NOMBRE_PRIORIDAD[v] ?? v },
        { clave: 'acciones', titulo: '', alinear: 'der', formato: (_, c) => accionesFila(c.nombre, () => this.editar(ctx, plan.cursos.indexOf(c)), () => this.borrar(ctx, plan.cursos.indexOf(c))) },
      ],
      filas: plan.cursos,
    });
  },

  editar(ctx, indice) {
    const { plan } = ctx;
    const actual = plan.cursos[indice] ?? null;
    const usados = plan.cursos.map((c) => c.color);
    const colorLibre = ['curso-1', 'curso-2', 'curso-3', 'curso-4', 'curso-5', 'curso-6', 'curso-7', 'curso-8'].find((c) => !usados.includes(c)) ?? 'curso-1';
    const areaActual = actual ? textoCategoria(actual.area) : ctx.areas[0];
    const campos = [
      { clave: 'nombre', etiqueta: 'Nombre', requerido: true, atributos: { maxlength: 60, placeholder: 'BD I' } },
      { clave: 'id', etiqueta: 'Id', opcional: !actual, deshabilitado: Boolean(actual), atributos: { maxlength: 30, placeholder: 'bd1' },
        ayuda: actual ? 'El id no se cambia: las clases, los bloques y los check-ins lo usan.' : 'Corto, sin espacios. Si lo dejas vacío, sale del nombre.' },
      { clave: 'area', etiqueta: 'Área de Estudio (categoría de AW)', tipo: 'select', opciones: [...new Set([...ctx.areas, areaActual])] },
      { clave: 'color', etiqueta: 'Color', tipo: 'colores', ayuda: 'Colores provisionales: la paleta final se decide después.' },
      { clave: 'meta_horas_semana', etiqueta: 'Meta de estudio propio (horas por semana)', tipo: 'number', mitad: true, atributos: { min: 0, max: 100, step: 0.5 } },
      { clave: 'prioridad', etiqueta: 'Prioridad', tipo: 'select', mitad: true, opciones: opcionesDe(PRIORIDADES, NOMBRE_PRIORIDAD) },
    ];
    return abrirFormulario({
      titulo: actual ? `Editar ${actual.nombre}` : 'Nuevo curso',
      campos,
      valores: actual ? { ...actual, area: areaActual } : { area: areaActual, color: colorLibre, meta_horas_semana: 4, prioridad: 'media' },
      alGuardar: (v) => {
        const id = actual ? actual.id : (v.id || aId(v.nombre));
        if (!id) return { errores: { id: 'Escribe un id (letras, números o guiones).' } };
        if (!actual && plan.cursos.some((c) => c.id === id)) return { errores: { id: `Ya hay un curso con el id "${id}".` } };
        const curso = { id, nombre: v.nombre, area: v.area.split(' > '), color: v.color || colorLibre, meta_horas_semana: v.meta_horas_semana ?? 0, prioridad: v.prioridad };
        return guardarDesdeFormulario(ctx, conItem(plan, 'cursos', indice, curso), campos, {}, `Curso "${curso.nombre}" guardado.`);
      },
    });
  },

  borrar(ctx, indice) {
    const { plan } = ctx;
    const curso = plan.cursos[indice];
    const clases = plan.clases.filter((c) => c.curso === curso.id).length;
    const bloques = plan.bloques.filter((b) => b.curso === curso.id).length;
    if (clases || bloques) {
      return ctx.avisar(`No se puede borrar "${curso.nombre}"`,
        `Todavía tiene ${clases} ${clases === 1 ? 'clase' : 'clases'} y ${bloques} ${bloques === 1 ? 'bloque' : 'bloques'}. Bórralos primero (o pásalos a otro curso).`);
    }
    return ctx.borrar('cursos', indice, `el curso "${curso.nombre}"`);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Clases
// ─────────────────────────────────────────────────────────────────────────────

export const clases = {
  id: 'clases', nombre: 'Clases', singular: 'clase', necesitaCursos: true,
  descripcion: 'Las clases no cuentan para el % de cumplimiento: son contexto. Si usas la laptop en clase, se aplican avisos.',

  tabla(ctx) {
    const { plan } = ctx;
    if (!plan.clases.length) return crearVacio('Todavía no hay clases.', { compacto: true });
    const nombre = (c) => `la clase de ${nombreCurso(plan, c.curso)} (${textoDias(c.dias)})`;
    return crearTabla({
      descripcion: 'Horario de clases',
      columnas: [
        { clave: 'curso', titulo: 'Curso', formato: (v) => etiquetaCurso(plan, v) },
        { clave: 'tipo', titulo: 'Tipo', formato: (v) => NOMBRE_TIPO_CLASE[v] ?? v },
        { clave: 'dias', titulo: 'Días', formato: (v) => textoDias(v) },
        { clave: 'inicio', titulo: 'Horario', formato: (_, c) => textoFranja(c.inicio, c.fin) },
        { clave: 'lugar', titulo: 'Lugar', formato: (v) => v || '—' },
        { clave: 'usa_pc', titulo: 'Laptop', formato: (v) => (v ? 'Sí' : 'No') },
        { clave: 'acciones', titulo: '', alinear: 'der', formato: (_, c) => accionesFila(nombre(c), () => this.editar(ctx, plan.clases.indexOf(c)), () => ctx.borrar('clases', plan.clases.indexOf(c), nombre(c))) },
      ],
      filas: plan.clases,
    });
  },

  editar(ctx, indice, inicial = {}) {
    const { plan } = ctx;
    const actual = plan.clases[indice] ?? null;
    const campos = [
      { clave: 'curso', etiqueta: 'Curso', tipo: 'select', requerido: true, mitad: true, opciones: plan.cursos.map((c) => ({ valor: c.id, texto: c.nombre })) },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', mitad: true, opciones: opcionesDe(TIPOS_CLASE, NOMBRE_TIPO_CLASE) },
      { clave: 'dias', etiqueta: 'Días', tipo: 'dias', requerido: true },
      { clave: 'inicio', etiqueta: 'Empieza', tipo: 'time', requerido: true, mitad: true },
      { clave: 'fin', etiqueta: 'Termina', tipo: 'time', requerido: true, mitad: true },
      { clave: 'lugar', etiqueta: 'Lugar', opcional: true, atributos: { maxlength: 60 } },
      { clave: 'usa_pc', etiqueta: 'Uso la laptop en esta clase', tipo: 'checkbox', ayuda: 'Con la laptop, en clase se dan avisos (nunca pasa de aviso).' },
    ];
    return abrirFormulario({
      titulo: actual ? `Editar clase de ${nombreCurso(plan, actual.curso)}` : 'Nueva clase',
      campos,
      valores: actual ?? { curso: plan.cursos[0]?.id, tipo: 'teoria', dias: [], inicio: '08:00', fin: '10:00', ...inicial },
      alGuardar: (v) => {
        // Al editar se conserva el id (los check-ins de asistencia lo usan); en una nueva lo pone normalizarPlan.
        const clase = { ...(actual ? { id: actual.id } : {}), curso: v.curso, tipo: v.tipo, dias: v.dias, inicio: v.inicio, fin: v.fin, lugar: v.lugar, usa_pc: v.usa_pc };
        return guardarDesdeFormulario(ctx, conItem(plan, 'clases', indice, clase), campos, {}, `Clase de ${nombreCurso(plan, clase.curso)} guardada.`);
      },
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Rutinas
// ─────────────────────────────────────────────────────────────────────────────

const AYUDA_MEDICION = 'En la PC: minutos de una categoría. Con check-in: marcas "hecho" en el Diario. Hora del día: despertar o dormir.';

export const rutinas = {
  id: 'rutinas', nombre: 'Rutinas', singular: 'rutina',
  descripcion: 'Una rutina sin horas cuenta en cualquier momento del día lógico (de despertar a dormir).',

  tabla(ctx) {
    const { plan } = ctx;
    if (!plan.rutinas.length) return crearVacio('Todavía no hay rutinas.', { compacto: true });
    const meta = (r) => {
      if (r.medicion === 'pc') return `${r.minutos_meta} min de ${textoCategoria(r.categoria)}`;
      if (r.medicion === 'dia_logico') return `${NOMBRE_EVENTO[r.evento] ?? r.evento} a las ${r.inicio} (± ${r.tolerancia_min} min)`;
      return 'Marcar "hecho"';
    };
    return crearTabla({
      descripcion: 'Rutinas',
      columnas: [
        { clave: 'nombre', titulo: 'Rutina' },
        { clave: 'dias', titulo: 'Días', formato: (v) => textoDias(v) },
        { clave: 'inicio', titulo: 'Franja', formato: (_, r) => (r.medicion === 'dia_logico' ? '—' : textoFranja(r.inicio, r.fin)) },
        { clave: 'medicion', titulo: 'Medición', formato: (v) => NOMBRE_MEDICION[v] ?? v },
        { clave: 'meta', titulo: 'Meta', formato: (_, r) => meta(r) },
        { clave: 'acciones', titulo: '', alinear: 'der', formato: (_, r) => accionesFila(r.nombre, () => this.editar(ctx, plan.rutinas.indexOf(r)), () => ctx.borrar('rutinas', plan.rutinas.indexOf(r), `la rutina "${r.nombre}"`)) },
      ],
      filas: plan.rutinas,
    });
  },

  editar(ctx, indice) {
    const { plan } = ctx;
    const actual = plan.rutinas[indice] ?? null;
    const categoriaActual = actual?.categoria ? textoCategoria(actual.categoria) : null;
    const categorias = [...new Set([...ctx.categorias, ...(categoriaActual ? [categoriaActual] : [])])];
    const campos = [
      { clave: 'nombre', etiqueta: 'Nombre', requerido: true, atributos: { maxlength: 60, placeholder: 'Inglés diario' } },
      { clave: 'id', etiqueta: 'Id', opcional: !actual, deshabilitado: Boolean(actual), atributos: { maxlength: 30 },
        ayuda: actual ? 'El id no se cambia: los check-ins lo usan.' : 'Si lo dejas vacío, sale del nombre.' },
      { clave: 'dias', etiqueta: 'Días', tipo: 'dias', requerido: true },
      { clave: 'medicion', etiqueta: 'Cómo se mide', tipo: 'select', opciones: opcionesDe(MEDICIONES, NOMBRE_MEDICION), ayuda: AYUDA_MEDICION },
      { clave: 'evento', etiqueta: 'Qué hora se mide', tipo: 'select', mitad: true, opciones: opcionesDe(['despertar', 'dormir'], NOMBRE_EVENTO), visible: (v) => v.medicion === 'dia_logico' },
      { clave: 'hora', etiqueta: 'Hora objetivo', tipo: 'time', requerido: true, mitad: true, visible: (v) => v.medicion === 'dia_logico' },
      { clave: 'inicio', etiqueta: 'Desde', tipo: 'time', opcional: true, mitad: true, visible: (v) => v.medicion !== 'dia_logico' },
      { clave: 'fin', etiqueta: 'Hasta', tipo: 'time', opcional: true, mitad: true, visible: (v) => v.medicion !== 'dia_logico' },
      { clave: 'categoria', etiqueta: 'Categoría de AW', tipo: 'select', mitad: true, opciones: categorias, visible: (v) => v.medicion === 'pc' },
      { clave: 'minutos_meta', etiqueta: 'Minutos por día', tipo: 'number', mitad: true, atributos: { min: 1, max: 1440 }, visible: (v) => v.medicion === 'pc' },
      { clave: 'tolerancia_min', etiqueta: 'Tolerancia (min)', tipo: 'number', mitad: true, atributos: { min: 0, max: 600 }, ayuda: 'Margen antes de contar como tarde.' },
    ];
    return abrirFormulario({
      titulo: actual ? `Editar ${actual.nombre}` : 'Nueva rutina',
      campos,
      valores: actual
        ? { ...actual, hora: actual.inicio, categoria: categoriaActual ?? categorias[0] }
        : { dias: [...DIAS_SEMANA], medicion: 'pc', evento: 'despertar', categoria: categorias.find((c) => c.startsWith('Estudio')) ?? categorias[0], minutos_meta: 15, tolerancia_min: 10 },
      alGuardar: (v) => {
        const id = actual ? actual.id : (v.id || aId(v.nombre));
        if (!id) return { errores: { id: 'Escribe un id (letras, números o guiones).' } };
        if (!actual && plan.rutinas.some((r) => r.id === id)) return { errores: { id: `Ya hay una rutina con el id "${id}".` } };
        const rutina = { id, nombre: v.nombre, dias: v.dias, medicion: v.medicion, tolerancia_min: v.tolerancia_min ?? 0 };
        if (v.medicion === 'dia_logico') Object.assign(rutina, { inicio: v.hora, fin: v.hora, evento: v.evento });
        else Object.assign(rutina, { inicio: v.inicio || undefined, fin: v.fin || undefined });
        if (v.medicion === 'pc') Object.assign(rutina, { categoria: v.categoria.split(' > '), minutos_meta: v.minutos_meta });
        return guardarDesdeFormulario(ctx, conItem(plan, 'rutinas', indice, rutina), campos, {}, `Rutina "${rutina.nombre}" guardada.`);
      },
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Bloques
// ─────────────────────────────────────────────────────────────────────────────

/** Nivel vigente hoy de un bloque del plan: el elegido en los niveles, o el del plan. */
export function nivelVigente(bloque, config) {
  const elegido = config?.bloques?.[bloque.id];
  return NIVELES.includes(elegido) ? elegido : bloque.nivel;
}

export const bloques = {
  id: 'bloques', nombre: 'Bloques', singular: 'bloque', necesitaCursos: true,
  descripcion: 'Tramos de estudio o examen. Subir el nivel de un bloque vale desde hoy; bajarlo, desde mañana.',

  tabla(ctx) {
    const { plan, config, pendientes } = ctx;
    if (!plan.bloques.length) return crearVacio('Todavía no hay bloques de estudio.', { compacto: true });
    const nombre = (b) => `el bloque de ${nombreCurso(plan, b.curso)} (${textoRepeticion(b)})`;
    const nivel = (b) => {
      const pendiente = pendientes.find((c) => c.ruta === `bloques.${b.id}`);
      return el('span', {}, crearChipNivel(nivelVigente(b, config)),
        pendiente && el('span', { class: 'texto-suave texto-xs' }, ` → ${NOMBRE_NIVEL[pendiente.valor]} desde ${fechaCorta(pendiente.aplica_desde)}`));
    };
    return crearTabla({
      descripcion: 'Bloques de estudio',
      columnas: [
        { clave: 'curso', titulo: 'Curso', formato: (v) => etiquetaCurso(plan, v) },
        { clave: 'tipo', titulo: 'Tipo', formato: (v) => NOMBRE_TIPO_BLOQUE[v] ?? v },
        { clave: 'cuando', titulo: 'Cuándo', formato: (_, b) => textoRepeticion(b) },
        { clave: 'nivel', titulo: 'Nivel', formato: (_, b) => nivel(b) },
        { clave: 'objetivo', titulo: 'Objetivo', formato: (v) => el('span', { class: 'cortar celda-larga', title: v }, v || '—') },
        { clave: 'acciones', titulo: '', alinear: 'der', formato: (_, b) => accionesFila(nombre(b), () => this.editar(ctx, plan.bloques.indexOf(b)), () => ctx.borrar('bloques', plan.bloques.indexOf(b), nombre(b))) },
      ],
      filas: plan.bloques,
    });
  },

  /** `inicial`: valores para un bloque nuevo (el planificador pasa el día y la hora del hueco donde se hizo clic). */
  editar(ctx, indice, inicial = {}) {
    const { plan, config } = ctx;
    const actual = plan.bloques[indice] ?? null;
    const nivelHoy = actual ? nivelVigente(actual, config) : 'aviso';
    const campos = [
      { clave: 'curso', etiqueta: 'Curso', tipo: 'select', requerido: true, mitad: true, opciones: plan.cursos.map((c) => ({ valor: c.id, texto: c.nombre })) },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', mitad: true, opciones: opcionesDe(TIPOS_BLOQUE, NOMBRE_TIPO_BLOQUE) },
      { clave: 'repeticion', etiqueta: 'Se repite', tipo: 'select', opciones: [{ valor: 'semanal', texto: 'Cada semana' }, { valor: 'unica', texto: 'Una sola vez' }] },
      { clave: 'dias', etiqueta: 'Días', tipo: 'dias', requerido: true, visible: (v) => v.repeticion === 'semanal' },
      { clave: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, visible: (v) => v.repeticion === 'unica' },
      { clave: 'inicio', etiqueta: 'Empieza', tipo: 'time', requerido: true, mitad: true },
      { clave: 'fin', etiqueta: 'Termina', tipo: 'time', requerido: true, mitad: true, ayuda: 'Si termina antes de la hora de inicio, cruza la medianoche.' },
      { clave: 'nivel', etiqueta: 'Nivel de bloqueo', tipo: 'select', opciones: opcionesDe(NIVELES, NOMBRE_NIVEL),
        ayuda: actual ? 'Subirlo vale desde hoy. Bajarlo queda pendiente hasta mañana.' : 'Aviso: un clic para seguir. Fricción: espera y comodín. Total: sin pase.' },
      { clave: 'objetivo', etiqueta: 'Objetivo: qué vas a hacer', opcional: true, atributos: { maxlength: 140 } },
      { clave: 'por_que', etiqueta: 'Por qué', tipo: 'textarea', opcional: true, atributos: { maxlength: 400 }, ayuda: 'Se muestra en las páginas de bloqueo.' },
    ];
    return abrirFormulario({
      titulo: actual ? `Editar bloque de ${nombreCurso(plan, actual.curso)}` : 'Nuevo bloque',
      campos,
      valores: actual
        ? { ...actual, repeticion: actual.repeticion.tipo, dias: actual.repeticion.dias ?? [], fecha: actual.repeticion.fecha ?? '', nivel: nivelHoy }
        : { curso: plan.cursos[0]?.id, tipo: 'estudio_pc', repeticion: 'semanal', dias: [], fecha: ctx.hoy, inicio: '15:00', fin: '17:00', nivel: 'aviso', ...inicial },
      alGuardar: async (v) => {
        const repeticion = v.repeticion === 'unica' ? { tipo: 'unica', fecha: v.fecha } : { tipo: 'semanal', dias: v.dias };
        // Id de un bloque nuevo: b-<curso>-<días o fecha>-<HHMM>, sin repetir.
        const cuando = v.repeticion === 'unica' ? (v.fecha ?? '') : (v.dias ?? []).join('');
        const id = actual ? actual.id : idLibre(`b-${v.curso}-${cuando}-${(v.inicio ?? '').replace(':', '')}`, plan.bloques.map((b) => b.id));
        const bloque = {
          id, tipo: v.tipo, curso: v.curso, repeticion, inicio: v.inicio, fin: v.fin,
          // En un bloque que ya existe, el nivel del plan no se toca: el cambio va a los niveles (asimetría de §11).
          nivel: actual ? actual.nivel : v.nivel,
          objetivo: v.objetivo, por_que: v.por_que, terminados_antes: actual?.terminados_antes ?? [],
        };
        const errores = await guardarDesdeFormulario(ctx, conItem(plan, 'bloques', indice, bloque), campos, {}, `Bloque de ${nombreCurso(plan, bloque.curso)} guardado.`);
        if (errores) return errores;
        if (actual && v.nivel !== nivelHoy) await ctx.guardarNivel(bloque, v.nivel);
        return null;
      },
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Excepciones
// ─────────────────────────────────────────────────────────────────────────────

export const excepciones = {
  id: 'excepciones', nombre: 'Excepciones', singular: 'excepción',
  descripcion: 'Feriados, semanas de exámenes y días libres. Cancelan las clases y los bloques semanales; los bloques únicos no se cancelan.',

  tabla(ctx) {
    const { plan } = ctx;
    if (!plan.excepciones.length) return crearVacio('No hay excepciones.', { compacto: true });
    const nombre = (e) => `la excepción del ${e.desde}`;
    return crearTabla({
      descripcion: 'Excepciones del ciclo',
      columnas: [
        { clave: 'desde', titulo: 'Desde', formato: (v) => fechaCorta(v) },
        { clave: 'hasta', titulo: 'Hasta', formato: (v) => fechaCorta(v) },
        { clave: 'tipo', titulo: 'Tipo', formato: (v) => NOMBRE_TIPO_EXCEPCION[v] ?? v },
        { clave: 'efecto', titulo: 'Efecto', formato: (v) => NOMBRE_EFECTO[v] ?? v },
        { clave: 'nota', titulo: 'Nota', formato: (v) => el('span', { class: 'cortar celda-larga', title: v ?? '' }, v || '—') },
        { clave: 'acciones', titulo: '', alinear: 'der', formato: (_, e) => accionesFila(nombre(e), () => this.editar(ctx, plan.excepciones.indexOf(e)), () => ctx.borrar('excepciones', plan.excepciones.indexOf(e), nombre(e))) },
      ],
      filas: plan.excepciones,
    });
  },

  editar(ctx, indice) {
    const { plan } = ctx;
    const actual = plan.excepciones[indice] ?? null;
    const campos = [
      { clave: 'desde', etiqueta: 'Desde', tipo: 'date', requerido: true, mitad: true },
      { clave: 'hasta', etiqueta: 'Hasta', tipo: 'date', opcional: true, mitad: true, ayuda: 'Vacío: un solo día.' },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', mitad: true, opciones: opcionesDe(TIPOS_EXCEPCION, NOMBRE_TIPO_EXCEPCION) },
      { clave: 'efecto', etiqueta: 'Efecto', tipo: 'select', mitad: true, opciones: opcionesDe(EFECTOS_EXCEPCION, NOMBRE_EFECTO) },
      { clave: 'nota', etiqueta: 'Nota', opcional: true, atributos: { maxlength: 120, placeholder: 'Combate de Angamos' } },
    ];
    return abrirFormulario({
      titulo: actual ? 'Editar excepción' : 'Nueva excepción',
      campos,
      valores: actual ?? { desde: ctx.hoy, tipo: 'feriado', efecto: 'cancelar_clases_y_bloques' },
      alGuardar: (v) => {
        const excepcion = { desde: v.desde, hasta: v.hasta || v.desde, tipo: v.tipo, efecto: v.efecto, ...(v.nota ? { nota: v.nota } : {}) };
        return guardarDesdeFormulario(ctx, conItem(plan, 'excepciones', indice, excepcion), campos, {}, 'Excepción guardada.');
      },
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo
// ─────────────────────────────────────────────────────────────────────────────

export function editarCiclo(ctx) {
  const { plan } = ctx;
  const campos = [
    { clave: 'nombre', etiqueta: 'Nombre', requerido: true, atributos: { maxlength: 40, placeholder: '2026-2' } },
    { clave: 'inicio', etiqueta: 'Empieza', tipo: 'date', requerido: true, mitad: true },
    { clave: 'fin', etiqueta: 'Termina', tipo: 'date', requerido: true, mitad: true },
  ];
  return abrirFormulario({
    titulo: 'Ciclo',
    descripcion: 'Las clases y los bloques semanales solo ocurren dentro del ciclo.',
    campos,
    valores: plan.ciclo,
    alGuardar: (v) => guardarDesdeFormulario(ctx, { ...structuredClone(plan), ciclo: { nombre: v.nombre, inicio: v.inicio, fin: v.fin } }, campos, {}, 'Ciclo guardado.'),
  });
}

export const SECCIONES = [cursos, clases, rutinas, bloques, excepciones];
