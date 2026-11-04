// Componentes visuales base (V-10): funciones que arman el HTML de css/componentes.css,
// para que las vistas no repitan ese HTML. Cada función devuelve un elemento listo para poner
// en la página (con reemplazar() o append()). Todas se ven funcionando en muestra.html.
//
// Ejemplo:
//   import { crearTarjeta, crearFilaKpis } from '../componentes/ui.js';
//   contenedor.append(crearTarjeta({ titulo: 'Estudio', contenido: crearFilaKpis([...]) }));

import { el } from '../dom.js';
import { duracionLegible, porcentajeLegible } from '../formato.js';
import { ESTADOS, ESTADOS_CUMPLIMIENTO, NIVELES, NOMBRE_ESTADO, NOMBRE_NIVEL, COLORES_CURSO } from '../../motor/tipos.js';

/** Nombre visible de cada estado de cumplimiento (ESTADOS_CUMPLIMIENTO de tipos.js). */
export const NOMBRE_CUMPLIMIENTO = Object.freeze({
  cumplido: 'Cumplido',
  parcial: 'Parcial',
  fallido: 'Fallido',
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  no_medible: 'No medible',
});

// Números para ids únicos (las etiquetas <label for> y aria-describedby los necesitan).
let contador = 0;
function nuevoId(prefijo) {
  contador += 1;
  return `${prefijo}-${contador}`;
}

/**
 * Atributo de color para una clave: 'estudio' → { 'data-clase': 'estudio' }, 'cumplido' → { 'data-estado': … },
 * 'friccion' → { 'data-nivel': … }, 'curso-3' → { 'data-curso': … }. Clave desconocida → {} (sin color).
 * @param {string} clave
 * @returns {Object<string, string>}
 */
export function atributoDeColor(clave) {
  if (ESTADOS.includes(clave)) return { 'data-clase': clave };
  if (ESTADOS_CUMPLIMIENTO.includes(clave)) return { 'data-estado': clave };
  if (NIVELES.includes(clave)) return { 'data-nivel': clave };
  if (COLORES_CURSO.includes(clave)) return { 'data-curso': clave };
  return {};
}

/** Nombre visible de una clave de clase, estado de cumplimiento o nivel (o la clave tal cual). */
export function nombreDe(clave) {
  return NOMBRE_ESTADO[clave] ?? NOMBRE_CUMPLIMIENTO[clave] ?? NOMBRE_NIVEL[clave] ?? String(clave);
}

/**
 * Parte un valor como "18 h 40 min" o "72 %" en cifras y unidades, con las unidades en
 * <span class="kpi-unidad"> (se ven más chicas). Lo que no es texto se devuelve igual.
 * @param {string|Node|number|null} valor
 */
export function valorConUnidades(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor !== 'string') return valor;
  // split con un grupo ( ) deja también los separadores: ["", "18", " h ", "40", " min"]
  return valor.split(/(\d[\d.,: ]*)/).filter(Boolean).map((parte) => {
    if (/^\d/.test(parte)) return parte;
    const m = parte.match(/^(\s*)(\p{L}+|%)(\s*)$/u);  // solo letras o "%", con espacios alrededor
    return m ? [m[1], el('span', { class: 'kpi-unidad' }, m[2]), m[3]] : parte;
  });
}

// ── Tarjeta ──

/**
 * Tarjeta con cabecera (título, subtítulo y acciones) y contenido.
 * @param {{titulo?: string, subtitulo?: string, acciones?: Node|Node[], contenido?: any, pie?: string|Node,
 *          clase?: string, nivel?: 2|3|4}} opciones  `clase` se suma a "tarjeta" (por ejemplo "ancho-8").
 * @returns {HTMLElement}
 */
export function crearTarjeta({ titulo, subtitulo, acciones, contenido, pie, clase, nivel = 2 } = {}) {
  const tieneCabecera = titulo || subtitulo || acciones;
  return el('section', { class: ['tarjeta', clase].filter(Boolean).join(' ') },
    tieneCabecera && el('header', { class: 'tarjeta-cabecera' },
      el('div', {},
        titulo && el(`h${nivel}`, { class: 'tarjeta-titulo' }, titulo),
        subtitulo && el('p', { class: 'tarjeta-subtitulo' }, subtitulo)),
      acciones && el('div', { class: 'tarjeta-acciones' }, acciones)),
    contenido,
    pie && el('p', { class: 'tarjeta-pie' }, pie));
}

// ── KPI ──

const FLECHA = { sube: '▲', baja: '▼', igual: '=' };

/**
 * Un KPI: etiqueta, valor grande, comparación con el período anterior y detalle.
 * comparacion.sentido: 'sube' | 'baja' | 'igual' (la flecha); comparacion.bueno: true (mejoró, verde),
 * false (empeoró, rojo) o null (neutro). texto lleva el signo, p. ej. diferenciaLegible(…) → "+2 h 10 min".
 * @param {{etiqueta: string, valor: string|number|null, detalle?: string,
 *          comparacion?: {texto: string, sentido?: 'sube'|'baja'|'igual', bueno?: boolean|null, referencia?: string},
 *          clave?: string}} kpi   clave: color de una clase o estado (opcional; tiñe la etiqueta con un punto)
 * @returns {HTMLElement}
 */
export function crearKpi({ etiqueta, valor, detalle, comparacion, clave } = {}) {
  let comp = null;
  if (comparacion?.texto) {
    const sentido = comparacion.sentido ?? 'igual';
    const bueno = comparacion.bueno === true ? 'si' : comparacion.bueno === false ? 'no' : 'neutro';
    comp = el('span', { class: 'kpi-comparacion', 'data-sentido': sentido, 'data-bueno': bueno },
      el('span', { class: 'kpi-delta' }, el('span', { 'aria-hidden': 'true' }, FLECHA[sentido] ?? ''), ' ', comparacion.texto),
      comparacion.referencia && el('span', {}, comparacion.referencia));
  }
  return el('div', { class: 'kpi' },
    el('span', { class: 'kpi-etiqueta' }, clave ? el('span', { class: 'etiqueta-punto', ...atributoDeColor(clave) }) : null, etiqueta),
    el('span', { class: 'kpi-valor' }, valorConUnidades(valor)),
    comp,
    detalle && el('span', { class: 'kpi-detalle' }, detalle));
}

/**
 * Fila de KPIs (cada uno en una tarjetita; se acomodan al ancho).
 * @param {Array<object|Node>} kpis  objetos para crearKpi() o elementos ya armados
 */
export function crearFilaKpis(kpis = []) {
  return el('div', { class: 'kpis' }, kpis.map((k) => (k instanceof Node ? k : crearKpi(k))));
}

// ── Chips y etiquetas ──

/**
 * Chip de estado. Con un estado de cumplimiento ('cumplido', 'parcial', 'fallido', 'pendiente',
 * 'en_curso', 'no_medible') arma un chip con ícono y texto; con una clase o estado de actividad
 * ('estudio', 'afk'…) arma una etiqueta con punto de color.
 * @param {string} estado
 * @param {string} [texto]  para cambiar el texto (por defecto, el nombre del estado)
 */
export function crearChipEstado(estado, texto) {
  if (ESTADOS.includes(estado)) return crearEtiqueta(estado, texto);
  return el('span', { class: 'chip', ...atributoDeColor(estado) }, texto ?? nombreDe(estado));
}

/**
 * Chip de nivel de bloqueo ('ninguno', 'aviso', 'friccion', 'total'), con un medidor de 0 a 3 barras.
 * @param {string} nivel
 */
export function crearChipNivel(nivel) {
  return el('span', { class: 'chip', ...atributoDeColor(nivel), title: `Nivel: ${nombreDe(nivel)}` }, nombreDe(nivel));
}

/**
 * Etiqueta con punto de color: clase ('estudio'…), curso ('curso-3', con el nombre del curso en `texto`)…
 * @param {string} clave
 * @param {string} [texto]
 */
export function crearEtiqueta(clave, texto) {
  return el('span', { class: 'etiqueta', ...atributoDeColor(clave) }, texto ?? nombreDe(clave));
}

// ── Estados: vacío, cargando y error ──

/**
 * Estado vacío ("Sin datos en este período."), con una acción opcional.
 * @param {string} [texto]
 * @param {{accion?: {texto: string, alHacer: Function}, detalle?: string, compacto?: boolean}} [opciones]
 */
export function crearVacio(texto = 'Sin datos en este período.', { accion, detalle, compacto = false } = {}) {
  return el('div', { class: `estado estado-vacio${compacto ? ' estado-compacto' : ''}` },
    el('p', { class: 'estado-texto' }, texto),
    detalle && el('p', { class: 'estado-detalle' }, detalle),
    accion && el('button', { class: 'boton boton-pequeno', type: 'button', onclick: accion.alHacer }, accion.texto));
}

/**
 * Estado de carga: renglones "esqueleto" con un brillo suave (quieto si se pide reducir movimiento).
 * @param {{filas?: number, texto?: string, grafico?: boolean}} [opciones]  grafico: un bloque del alto de un gráfico
 */
export function crearCargando({ filas = 3, texto = 'Cargando…', grafico = false } = {}) {
  const anchos = ['92%', '78%', '64%', '86%', '70%', '55%'];  // fijos: el esqueleto no "salta" al redibujar
  return el('div', { class: 'estado-carga', role: 'status', 'aria-live': 'polite', 'aria-busy': 'true' },
    el('span', { class: 'solo-lector' }, texto),
    grafico
      ? el('span', { class: 'esqueleto esqueleto-bloque', 'aria-hidden': 'true' })
      : Array.from({ length: Math.max(1, filas) }, (_, i) =>
        el('span', { class: 'esqueleto', 'aria-hidden': 'true', style: { '--ancho': anchos[i % anchos.length] } })));
}

/**
 * Estado de error con botón "Reintentar". Si `reintentar` devuelve una promesa, el botón
 * muestra la ruedita y queda deshabilitado hasta que termine.
 * @param {string} mensaje
 * @param {{reintentar?: () => (void|Promise<void>), detalle?: string}} [opciones]
 */
export function crearError(mensaje, { reintentar, detalle } = {}) {
  const boton = reintentar && el('button', {
    class: 'boton boton-pequeno', type: 'button',
    onclick: async () => {
      boton.disabled = true;
      boton.setAttribute('aria-busy', 'true');
      try { await reintentar(); } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
      }
    },
  }, 'Reintentar');
  return el('div', { class: 'estado estado-error', role: 'alert' },
    el('p', { class: 'estado-texto' }, mensaje),
    detalle && el('p', { class: 'estado-detalle' }, detalle),
    boton);
}

/**
 * Alerta con ícono: tipo 'info' | 'exito' | 'cuidado' | 'error'.
 * @param {string} tipo
 * @param {string|Node} texto
 * @param {{titulo?: string}} [opciones]
 */
export function crearAviso(tipo, texto, { titulo } = {}) {
  return el('div', { class: 'alerta', 'data-tipo': tipo, role: tipo === 'error' ? 'alert' : 'status' },
    titulo && el('p', { class: 'alerta-titulo' }, titulo),
    el('p', {}, texto));
}

// ── Leyenda y barras ──

/**
 * Leyenda de colores.
 * @param {Array<{clave: string, etiqueta?: string, valor?: string}>} items
 * @param {{columna?: boolean}} [opciones]  columna: una entrada por renglón, con el valor a la derecha
 */
export function crearLeyenda(items = [], { columna = false } = {}) {
  return el('ul', { class: `leyenda${columna ? ' leyenda-columna' : ''}` },
    items.map((it) => el('li', atributoDeColor(it.clave),
      el('span', {}, it.etiqueta ?? nombreDe(it.clave)),
      it.valor && el('span', { class: 'leyenda-valor' }, it.valor))));
}

/**
 * Barra apilada (reparto). Cada parte: {clave, valor, etiqueta?}. Los tramos en 0 no se dibujan.
 * Cada tramo lleva su detalle en `title` (al pasar el mouse) y la barra entera un aria-label con todo.
 * @param {Array<{clave: string, valor: number, etiqueta?: string}>} partes  valor en segundos (o lo que diga `formato`)
 * @param {{formato?: (valor: number) => string, titulo?: string, leyenda?: boolean, delgada?: boolean}} [opciones]
 * @returns {HTMLElement}  la barra (o, con leyenda, un <div> con la barra y la leyenda debajo)
 */
export function crearBarraApilada(partes = [], { formato = duracionLegible, titulo = 'Reparto', leyenda = false, delgada = false } = {}) {
  const visibles = partes.filter((p) => p.valor > 0);
  const total = visibles.reduce((s, p) => s + p.valor, 0);
  const descripcion = (p) => `${p.etiqueta ?? nombreDe(p.clave)} · ${formato(p.valor)} (${porcentajeLegible(p.valor / total)})`;
  const barra = el('div', {
    class: `apilada${delgada ? ' apilada-delgada' : ''}`,
    role: 'img',
    'aria-label': total > 0 ? `${titulo}: ${visibles.map(descripcion).join('; ')}` : `${titulo}: sin datos`,
  }, visibles.map((p) => el('div', {
    ...atributoDeColor(p.clave),
    title: descripcion(p),
    style: { '--valor': `${(100 * p.valor) / total}%` },
  })));
  if (!leyenda) return barra;
  return el('div', {}, barra, crearLeyenda(visibles.map((p) => ({
    clave: p.clave, etiqueta: p.etiqueta, valor: `${formato(p.valor)} · ${porcentajeLegible(p.valor / total)}`,
  }))));
}

/**
 * Barra de progreso, opcionalmente con meta y con nombre y valor encima.
 * @param {{valor: number, maximo?: number, meta?: number, clave?: string, nombre?: string, texto?: string,
 *          textoMeta?: string}} opciones  valor, maximo y meta en la misma unidad (p. ej. segundos);
 *          maximo por defecto = max(valor, meta, 1). texto/textoMeta: "4 h 30 min" y "/ 6 h".
 */
export function crearProgreso({ valor, maximo, meta, clave, nombre, texto, textoMeta } = {}) {
  const tope = maximo ?? Math.max(valor ?? 0, meta ?? 0, 1);
  const pct = (x) => `${Math.max(0, Math.min(100, (100 * x) / tope))}%`;
  const etiqueta = [nombre, texto, textoMeta].filter(Boolean).join(' ');
  const barra = el('div', {
    class: 'progreso', ...(nombre ? {} : atributoDeColor(clave)),
    role: 'img', 'aria-label': etiqueta || porcentajeLegible((valor ?? 0) / tope),
    style: { '--valor': pct(valor ?? 0), ...(meta !== undefined && meta !== null ? { '--meta': pct(meta) } : {}) },
  },
  el('div', { class: 'progreso-relleno' }),
  meta !== undefined && meta !== null && el('span', { class: 'progreso-meta', title: textoMeta ? `Meta ${textoMeta.replace(/^\/\s*/, '')}` : 'Meta' }));
  if (!nombre) return barra;
  return el('div', { class: 'progreso-fila', ...atributoDeColor(clave) },
    el('span', { class: 'progreso-nombre', title: nombre }, nombre),
    el('span', { class: 'progreso-valor' }, texto ?? '', textoMeta && el('span', { class: 'progreso-de' }, ' ', textoMeta)),
    barra);
}

// ── Tabla ──

/**
 * Tabla compacta.
 * @param {{columnas: Array<{clave: string, titulo: string, numerica?: boolean, alinear?: 'izq'|'der'|'centro',
 *            formato?: (valor: any, fila: object) => (string|Node)}>,
 *          filas: object[], vacio?: string, descripcion?: string, densa?: boolean}} opciones
 *   numerica: alineada a la derecha y con cifras tabulares. descripcion: <caption> (para lectores de pantalla
 *   y como título de la tabla).
 */
export function crearTabla({ columnas = [], filas = [], vacio = 'Sin datos en este período.', descripcion, densa = false } = {}) {
  const claseDe = (c) => (c.numerica || c.alinear === 'der' ? 'num' : c.alinear === 'centro' ? 'centro' : null);
  const celda = (c, fila) => {
    const v = fila[c.clave];
    const contenido = c.formato ? c.formato(v, fila) : v;
    return el('td', { class: claseDe(c) }, contenido ?? '—');
  };
  return el('div', { class: 'tabla-contenedor' },
    el('table', { class: `tabla${densa ? ' tabla-densa' : ''}` },
      descripcion && el('caption', {}, descripcion),
      el('thead', {}, el('tr', {}, columnas.map((c) => el('th', { scope: 'col', class: claseDe(c) }, c.titulo)))),
      el('tbody', {}, filas.length
        ? filas.map((f) => el('tr', {}, columnas.map((c) => celda(c, f))))
        : el('tr', {}, el('td', { class: 'tabla-vacia', colspan: String(columnas.length || 1) }, vacio)))));
}

// ── Lista proporcional ("más usados") ──

/**
 * Lista de filas con barra proporcional, de mayor a menor como vengan.
 * Cada fila: {nombre, valor, clave?, detalle?: [{texto, valor}], titulo?}.
 * - Sin `total`, la barra es relativa a la fila más grande; con `total`, es la parte del total y se muestra el %.
 * - Una fila con `detalle`, o cualquier fila si hay `alDesplegar`, se puede desplegar (<details>).
 *   alDesplegar(fila) se llama la primera vez que se abre y devuelve (o promete) la lista de detalle.
 * @param {Array<{nombre: string, valor: number, clave?: string, detalle?: Array<{texto: string, valor: number}>, titulo?: string}>} filas
 * @param {{total?: number, formato?: (valor: number) => string,
 *          alDesplegar?: (fila: object) => (Array<{texto: string, valor: number}>|Promise<Array<{texto: string, valor: number}>>),
 *          vacio?: string}} [opciones]
 */
export function crearListaProporcional(filas = [], { total, formato = duracionLegible, alDesplegar, vacio = 'Sin datos en este período.' } = {}) {
  if (!filas.length) return crearVacio(vacio, { compacto: true });
  const base = total ?? Math.max(...filas.map((f) => f.valor), 1);
  const listaDetalle = (items) => el('ul', { class: 'lista-prop-detalle' },
    items.length
      ? items.map((d) => el('li', {}, el('span', {}, d.texto), el('span', { class: 'lista-prop-valor' }, formato(d.valor))))
      : el('li', {}, el('span', {}, 'Sin detalle.')));

  return el('ol', { class: 'lista-prop' }, filas.map((fila) => {
    const cabeza = [
      el('span', { class: 'lista-prop-nombre', title: fila.titulo ?? fila.nombre }, fila.nombre),
      el('span', { class: 'lista-prop-valor' }, formato(fila.valor),
        total ? el('span', { class: 'lista-prop-porcentaje' }, porcentajeLegible(fila.valor / total)) : null),
      el('span', { class: 'lista-prop-barra', 'aria-hidden': 'true' }),
    ];
    const atributos = { ...atributoDeColor(fila.clave), style: { '--valor': `${Math.min(100, (100 * fila.valor) / base)}%` } };
    if (!fila.detalle && !alDesplegar) return el('li', atributos, el('div', { class: 'lista-prop-cabeza' }, cabeza));

    const desplegable = el('details', {}, el('summary', { class: 'lista-prop-cabeza' }, cabeza));
    if (fila.detalle) desplegable.append(listaDetalle(fila.detalle));
    else {
      // El detalle se pide la primera vez que se abre (por ejemplo, las URLs de un dominio).
      let pedido = false;
      desplegable.addEventListener('toggle', async () => {
        if (!desplegable.open || pedido) return;
        pedido = true;
        const cargando = crearCargando({ filas: 2, texto: `Cargando el detalle de ${fila.nombre}…` });
        desplegable.append(cargando);
        try {
          cargando.replaceWith(listaDetalle(await alDesplegar(fila)));
        } catch (error) {
          pedido = false;  // se puede volver a intentar cerrando y abriendo
          cargando.replaceWith(crearError(`No se pudo cargar el detalle: ${error.message}`));
        }
      });
    }
    return el('li', atributos, desplegable);
  }));
}

// ── Controles ──

/**
 * Control segmentado (una opción entre pocas). Son radios: las flechas del teclado funcionan solas.
 * @param {{opciones: Array<{valor: string, texto: string, deshabilitada?: boolean}>, valor?: string,
 *          alCambiar?: (valor: string) => void, etiqueta: string, nombre?: string}} opciones
 *   etiqueta: lo que lee el lector de pantalla ("Agrupar por").
 */
export function crearSegmentado({ opciones = [], valor, alCambiar, etiqueta, nombre = nuevoId('segmentado') } = {}) {
  return el('div', { class: 'segmentado', role: 'radiogroup', 'aria-label': etiqueta },
    opciones.map((o) => el('label', { class: 'segmentado-opcion' },
      el('input', {
        type: 'radio', name: nombre, value: o.valor, checked: o.valor === valor, disabled: o.deshabilitada,
        onchange: (e) => { if (e.target.checked && alCambiar) alCambiar(o.valor); },
      }),
      el('span', {}, o.texto))));
}

/**
 * Pestañas. contenido puede ser un nodo o una función que lo arma (se llama la primera vez que se muestra).
 * Teclado: ← → cambian de pestaña; Inicio y Fin van a la primera y a la última.
 * @param {{pestanas: Array<{id: string, texto: string, contenido: Node|(() => Node)}>, activa?: string,
 *          alCambiar?: (id: string) => void, etiqueta?: string}} opciones
 */
export function crearPestanas({ pestanas = [], activa = pestanas[0]?.id, alCambiar, etiqueta } = {}) {
  const base = nuevoId('pestanas');
  const botones = [];
  const paneles = [];
  const armados = new Set();

  function mostrar(id, enfocar = false) {
    pestanas.forEach((p, i) => {
      const elegida = p.id === id;
      botones[i].setAttribute('aria-selected', String(elegida));
      botones[i].tabIndex = elegida ? 0 : -1;  // solo la pestaña activa entra en el recorrido con Tab
      paneles[i].hidden = !elegida;
      if (elegida && !armados.has(p.id)) {
        armados.add(p.id);
        paneles[i].append(typeof p.contenido === 'function' ? p.contenido() : p.contenido);
      }
      if (elegida && enfocar) botones[i].focus();
    });
  }

  pestanas.forEach((p, i) => {
    botones.push(el('button', {
      class: 'pestana', type: 'button', role: 'tab', id: `${base}-t${i}`, 'aria-controls': `${base}-p${i}`,
      onclick: () => { if (botones[i].getAttribute('aria-selected') !== 'true') { mostrar(p.id); alCambiar?.(p.id); } },
    }, p.texto));
    paneles.push(el('div', { class: 'pestana-panel', role: 'tabpanel', id: `${base}-p${i}`, 'aria-labelledby': `${base}-t${i}`, tabindex: '0' }));
  });

  const lista = el('div', {
    class: 'pestanas', role: 'tablist', 'aria-label': etiqueta,
    onkeydown: (e) => {
      const actual = botones.indexOf(document.activeElement);
      if (actual < 0) return;
      const n = botones.length;
      const destino = { ArrowRight: (actual + 1) % n, ArrowLeft: (actual - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (destino === undefined) return;
      e.preventDefault();
      mostrar(pestanas[destino].id, true);
      alCambiar?.(pestanas[destino].id);
    },
  }, botones);

  mostrar(activa);
  return el('div', { class: 'pestanas-grupo' }, lista, paneles);
}

/**
 * Campo de formulario con etiqueta, ayuda y error.
 * tipo: 'text' | 'number' | 'time' | 'date' | 'select' | 'textarea' | 'checkbox' | 'radio'.
 * - select y radio usan `opciones` ([{valor, texto}] o textos sueltos).
 * - checkbox: `valor` true/false.
 * El control se busca con campo.querySelector('input, select, textarea').
 * @param {{etiqueta: string, tipo?: string, valor?: any, opciones?: Array<{valor: string, texto: string}|string>,
 *          ayuda?: string, error?: string, nombre?: string, id?: string, requerido?: boolean, opcional?: boolean,
 *          atributos?: object, alCambiar?: (valor: any, evento: Event) => void}} opciones
 *   opcional: agrega "(opcional)" a la etiqueta. atributos: otros atributos del control (min, max, step, placeholder…).
 *   alCambiar se llama con el evento "change" (en un texto, al salir del campo).
 * @returns {HTMLElement}
 */
export function crearCampo({ etiqueta, tipo = 'text', valor, opciones = [], ayuda, error, nombre, id = nuevoId('campo'),
  requerido = false, opcional = false, atributos = {}, alCambiar } = {}) {
  const ops = opciones.map((o) => (typeof o === 'string' ? { valor: o, texto: o } : o));
  const idAyuda = ayuda ? `${id}-ayuda` : null;
  const idError = error ? `${id}-error` : null;
  const describe = [idError, idAyuda].filter(Boolean).join(' ') || null;
  const ayudaYError = [
    error && el('p', { class: 'campo-error', id: idError }, error),
    ayuda && el('p', { class: 'campo-ayuda', id: idAyuda }, ayuda),
  ];
  const avisar = (e) => {
    if (!alCambiar) return;
    const t = e.target;
    alCambiar(t.type === 'checkbox' ? t.checked : t.value, e);
  };

  if (tipo === 'checkbox') {
    return el('div', { class: 'campo' },
      el('label', { class: 'opcion' },
        el('input', { type: 'checkbox', id, name: nombre, checked: Boolean(valor), 'aria-describedby': describe,
          'aria-invalid': error ? 'true' : null, onchange: avisar, ...atributos }),
        etiqueta),
      ayudaYError);
  }
  if (tipo === 'radio') {
    const grupo = nombre ?? id;
    return el('fieldset', { class: 'campo', 'aria-describedby': describe },
      el('legend', { class: 'campo-etiqueta' }, etiqueta),
      el('div', { class: 'opciones' }, ops.map((o) => el('label', { class: 'opcion' },
        el('input', { type: 'radio', name: grupo, value: o.valor, checked: o.valor === valor, required: requerido, onchange: avisar }),
        o.texto))),
      ayudaYError);
  }

  const comunes = {
    class: 'control', id, name: nombre, required: requerido,
    'aria-describedby': describe, 'aria-invalid': error ? 'true' : null,
    onchange: avisar, ...atributos,
  };
  let control;
  if (tipo === 'select') {
    control = el('select', comunes, ops.map((o) => el('option', { value: o.valor, selected: o.valor === valor }, o.texto)));
  } else if (tipo === 'textarea') {
    control = el('textarea', comunes);
    control.value = valor ?? '';
  } else {
    control = el('input', { type: tipo, value: valor ?? null, ...comunes });
  }
  return el('div', { class: 'campo' },
    el('label', { class: 'campo-etiqueta', for: id }, etiqueta, opcional && el('span', { class: 'campo-opcional' }, ' (opcional)')),
    control,
    ayudaYError);
}

// ── Diálogo ──

/**
 * Abre un diálogo modal y espera la respuesta.
 * acciones: botones de abajo, de izquierda a derecha: [{valor, texto, tipo?: 'primario'|'peligro'|'fantasma'}].
 * El foco empieza en el primer botón (normalmente "Cancelar": lo seguro). Esc o un clic afuera cierran sin elegir.
 * @param {{titulo: string, contenido?: string|Node|Node[], acciones?: Array<{valor: string, texto: string, tipo?: string}>}} opciones
 * @returns {Promise<string|null>}  el `valor` del botón elegido, o null si se cerró sin elegir
 */
export function abrirDialogo({ titulo, contenido, acciones = [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'aceptar', texto: 'Aceptar', tipo: 'primario' }] } = {}) {
  const idTitulo = nuevoId('dialogo');
  const dialogo = el('dialog', { class: 'dialogo', 'aria-labelledby': idTitulo },
    // method="dialog": un botón del formulario cierra el diálogo y deja su value en dialogo.returnValue.
    el('form', { method: 'dialog' },
      el('h2', { class: 'dialogo-titulo', id: idTitulo }, titulo),
      contenido && el('div', { class: 'dialogo-cuerpo' }, typeof contenido === 'string' ? el('p', {}, contenido) : contenido),
      el('div', { class: 'dialogo-acciones' }, acciones.map((a) =>
        el('button', { class: `boton${a.tipo ? ` boton-${a.tipo}` : ''}`, value: a.valor }, a.texto)))));

  // Clic en el fondo oscuro: el evento llega al propio <dialog> (fuera del formulario).
  dialogo.addEventListener('click', (e) => {
    if (e.target !== dialogo) return;
    const r = dialogo.getBoundingClientRect();
    const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!dentro) dialogo.close('');
  });

  document.body.append(dialogo);
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener('close', () => {
      resolver(dialogo.returnValue || null);
      // Se quita del DOM cuando termina la animación de salida (o enseguida, si no hay).
      setTimeout(() => dialogo.remove(), 400);
    }, { once: true });
  });
}
