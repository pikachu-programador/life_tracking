// Formulario en un diálogo (F3-04): lo usan Horario, Diario y Ajustes para crear o editar algo.
//
// A diferencia de abrirDialogo() de ui.js (que solo pregunta "¿sí o no?"), este diálogo no se cierra hasta que
// lo que se escribió es válido: al pulsar "Guardar" llama a alGuardar(valores) y, si devuelve errores, los
// muestra debajo de cada campo.
//
// Uso:
//   const valores = await abrirFormulario({
//     titulo: 'Nuevo curso',
//     campos: [
//       { clave: 'nombre', etiqueta: 'Nombre', requerido: true },
//       { clave: 'meta', etiqueta: 'Meta semanal (h)', tipo: 'number', mitad: true, atributos: { min: 0, step: 0.5 } },
//       { clave: 'dias', etiqueta: 'Días', tipo: 'dias' },
//       { clave: 'fecha', etiqueta: 'Fecha', tipo: 'date', visible: (v) => v.repeticion === 'unica' },
//     ],
//     valores: { nombre: 'BD I', meta: 6 },
//     alGuardar: async (v) => (v.meta > 40 ? { errores: { meta: 'Máximo 40 h.' } } : null),
//   });
//   // valores = lo guardado, o null si se canceló.

import { el } from '../dom.js';
import { crearCampo } from './ui.js';
import { DIAS_SEMANA, NOMBRE_DIA } from '../../motor/tipos.js';

let contador = 0;

/**
 * Campo "días de la semana": siete casillas (lun … dom). El valor es la lista de días marcados.
 * @returns {HTMLElement}
 */
function crearCampoDias({ etiqueta, valor = [], ayuda, id }) {
  return el('fieldset', { class: 'campo', id },
    el('legend', { class: 'campo-etiqueta' }, etiqueta),
    el('div', { class: 'opciones campo-dias' }, DIAS_SEMANA.map((dia) => el('label', { class: 'opcion', title: NOMBRE_DIA[dia] },
      el('input', { type: 'checkbox', value: dia, checked: valor.includes(dia) }),
      NOMBRE_DIA[dia].slice(0, 3)))),
    ayuda && el('p', { class: 'campo-ayuda' }, ayuda));
}

/**
 * @typedef {Object} CampoFormulario
 * @property {string} clave
 * @property {string} etiqueta
 * @property {string} [tipo]  'text' | 'number' | 'time' | 'date' | 'select' | 'textarea' | 'checkbox' | 'dias' | 'lineas'
 *   dias: lista de días (lun…dom). lineas: un <textarea> donde cada renglón es un elemento de una lista.
 * @property {Array<{valor: string, texto: string}|string>} [opciones]  para select
 * @property {string} [ayuda]
 * @property {boolean} [requerido]
 * @property {boolean} [opcional]      agrega "(opcional)" a la etiqueta
 * @property {boolean} [mitad]         ocupa media fila (dos campos "mitad" seguidos quedan lado a lado)
 * @property {boolean} [deshabilitado]
 * @property {object} [atributos]      atributos extra del control (min, max, step, placeholder, maxlength…)
 * @property {(valores: object) => boolean} [visible]  si devuelve false el campo se esconde (y su valor no se devuelve)
 */

/**
 * Abre un formulario en un diálogo modal.
 * @param {{titulo: string, descripcion?: string, campos: CampoFormulario[], valores?: object,
 *          textoGuardar?: string,
 *          alGuardar?: (valores: object) => (void|null|{errores?: Object<string, string>, general?: string}|Promise<any>)}} opciones
 *   alGuardar: guarda de verdad. Si devuelve {errores} o {general} (o lanza un error), el diálogo sigue abierto y los muestra.
 * @returns {Promise<object|null>}  los valores guardados, o null si se canceló (botón, Esc o clic afuera)
 */
export function abrirFormulario({ titulo, descripcion, campos = [], valores = {}, textoGuardar = 'Guardar', alGuardar } = {}) {
  contador += 1;
  const base = `formulario-${contador}`;
  const piezas = new Map(); // clave → {campo, envoltura, error}

  for (const campo of campos) {
    const id = `${base}-${campo.clave}`;
    const inicial = valores[campo.clave];
    let nodo;
    if (campo.tipo === 'dias') {
      nodo = crearCampoDias({ etiqueta: campo.etiqueta, valor: Array.isArray(inicial) ? inicial : [], ayuda: campo.ayuda, id });
    } else {
      nodo = crearCampo({
        etiqueta: campo.etiqueta,
        tipo: campo.tipo === 'lineas' ? 'textarea' : (campo.tipo ?? 'text'),
        valor: campo.tipo === 'lineas' ? (Array.isArray(inicial) ? inicial.join('\n') : '') : inicial,
        opciones: campo.opciones, ayuda: campo.ayuda, id, requerido: campo.requerido, opcional: campo.opcional,
        atributos: { ...(campo.deshabilitado ? { disabled: true } : {}), ...(campo.atributos ?? {}) },
      });
    }
    const error = el('p', { class: 'campo-error', id: `${id}-error`, hidden: true });
    nodo.append(error);
    const envoltura = el('div', { class: `formulario-campo${campo.mitad ? ' formulario-mitad' : ''}`, 'data-clave': campo.clave }, nodo);
    piezas.set(campo.clave, { campo, envoltura, error, nodo });
  }

  /** Valor de un campo según su tipo. */
  function leerCampo({ campo, nodo }) {
    if (campo.tipo === 'dias') {
      return [...nodo.querySelectorAll('input[type="checkbox"]')].filter((c) => c.checked).map((c) => c.value);
    }
    const control = nodo.querySelector('input, select, textarea');
    if (campo.tipo === 'checkbox') return control.checked;
    if (campo.tipo === 'number') return control.value.trim() === '' ? null : Number(control.value);
    if (campo.tipo === 'lineas') return control.value.split('\n').map((l) => l.trim()).filter(Boolean);
    return control.value.trim();
  }

  /** Todos los valores (también los de los campos escondidos; alGuardar recibe solo los visibles). */
  function leer({ soloVisibles = false } = {}) {
    const todos = {};
    for (const [clave, pieza] of piezas) todos[clave] = leerCampo(pieza);
    if (!soloVisibles) return todos;
    return Object.fromEntries(Object.entries(todos).filter(([clave]) => !piezas.get(clave).envoltura.hidden));
  }

  function actualizarVisibles() {
    const actuales = leer();
    for (const { campo, envoltura } of piezas.values()) {
      envoltura.hidden = campo.visible ? !campo.visible(actuales) : false;
    }
  }

  const general = el('p', { class: 'campo-error formulario-error-general', role: 'alert', hidden: true });

  function mostrarErrores({ errores = {}, general: textoGeneral = '' } = {}) {
    const sueltos = [];
    for (const { error, nodo } of piezas.values()) {
      error.hidden = true;
      nodo.querySelector('input, select, textarea')?.removeAttribute('aria-invalid');
    }
    let primero = null;
    for (const [clave, mensaje] of Object.entries(errores)) {
      const pieza = piezas.get(clave);
      if (!pieza || pieza.envoltura.hidden) { sueltos.push(mensaje); continue; }
      pieza.error.textContent = mensaje;
      pieza.error.hidden = false;
      const control = pieza.nodo.querySelector('input, select, textarea');
      control?.setAttribute('aria-invalid', 'true');
      primero ??= control;
    }
    const texto = [textoGeneral, ...sueltos].filter(Boolean).join(' ');
    general.textContent = texto;
    general.hidden = texto === '';
    primero?.focus();
  }

  const botonGuardar = el('button', { class: 'boton boton-primario', type: 'submit' }, textoGuardar);
  const formulario = el('form', {
    novalidate: true, // los errores los muestra este componente (en español y junto al campo), no el navegador
    onchange: actualizarVisibles,
    onsubmit: async (evento) => {
      evento.preventDefault();
      const actuales = leer({ soloVisibles: true });
      // Lo obligatorio se revisa aquí; lo demás lo decide alGuardar.
      const faltan = {};
      for (const [clave, { campo, envoltura }] of piezas) {
        if (!campo.requerido || envoltura.hidden) continue;
        const v = actuales[clave];
        if (v === '' || v === null || (Array.isArray(v) && v.length === 0)) faltan[clave] = 'Este dato es obligatorio.';
      }
      if (Object.keys(faltan).length) return mostrarErrores({ errores: faltan });

      botonGuardar.disabled = true;
      botonGuardar.setAttribute('aria-busy', 'true');
      try {
        const resultado = alGuardar ? await alGuardar(actuales) : null;
        if (resultado && (resultado.errores || resultado.general)) return mostrarErrores(resultado);
        guardado = actuales;
        dialogo.close('guardar');
      } catch (error) {
        mostrarErrores({ general: error?.message ?? String(error) });
      } finally {
        botonGuardar.disabled = false;
        botonGuardar.removeAttribute('aria-busy');
      }
    },
  },
  el('h2', { class: 'dialogo-titulo', id: `${base}-titulo` }, titulo),
  el('div', { class: 'dialogo-cuerpo formulario-cuerpo' },
    descripcion && el('p', { class: 'formulario-descripcion' }, descripcion),
    [...piezas.values()].map((p) => p.envoltura),
    general),
  el('div', { class: 'dialogo-acciones' },
    el('button', { class: 'boton', type: 'button', onclick: () => dialogo.close('') }, 'Cancelar'),
    botonGuardar));

  let guardado = null;
  const dialogo = el('dialog', { class: 'dialogo dialogo-formulario', 'aria-labelledby': `${base}-titulo` }, formulario);
  // Clic en el fondo oscuro: cierra sin guardar (igual que abrirDialogo de ui.js).
  let presionadoAfuera = false;
  dialogo.addEventListener('mousedown', (e) => { presionadoAfuera = e.target === dialogo; });
  dialogo.addEventListener('click', (e) => {
    if (e.target !== dialogo || !presionadoAfuera) return; // arrastrar desde un campo hacia afuera no cierra
    const r = dialogo.getBoundingClientRect();
    const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!dentro) dialogo.close('');
  });

  document.body.append(dialogo);
  actualizarVisibles();
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener('close', () => {
      resolver(dialogo.returnValue === 'guardar' ? guardado : null);
      setTimeout(() => dialogo.remove(), 400); // cuando termina la animación de salida
    }, { once: true });
  });
}

/**
 * "Bases de Datos I" → "bases-de-datos-i": minúsculas, sin tildes, y solo letras, números y guiones.
 * Sirve para proponer el id de un curso, una rutina o un bloque.
 */
export function aId(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Un id que no esté en `usados`: "b-bd1-lun-1500", y si ya existe, "b-bd1-lun-1500-2", "-3"… */
export function idLibre(base, usados) {
  const tomados = new Set(usados);
  if (!tomados.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!tomados.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}
