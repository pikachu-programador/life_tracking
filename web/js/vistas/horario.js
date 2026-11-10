// Vista "Horario" (arquitectura §13). Editor del plan y planificador semanal.
// F3-02: lee el plan del ajuste `rastreador-plan` de AW y permite exportarlo e importarlo en JSON.
// F3-04: editor con pestañas (cursos, clases, rutinas, bloques, excepciones y ciclo); cada cambio se valida y se guarda en el acto.
// El planificador semanal llega con F3-05.

import { el, reemplazar } from '../dom.js';
import { datos } from '../datos.js';
import { reloj } from '../reloj.js';
import { fechaLegible } from '../fechas.js';
import { crearCabecera, textoDeError } from '../componentes/vista.js';
import { crearTarjeta, crearCargando, crearError, crearAviso, crearPestanas, abrirDialogo } from '../componentes/ui.js';
import { exportarRespaldo, importarRespaldo } from '../componentes/respaldo.js';
import { normalizarPlan, validarPlan } from '../../motor/plan.js';
import { configuracionVigente, proponerCambio, cambiosPendientes } from '../../motor/niveles.js';
import { NOMBRE_NIVEL } from '../../motor/tipos.js';
import { SECCIONES, editarCiclo } from './horario-editor.js';
import { textoCategoria } from '../textos-plan.js';

export const titulo = 'Horario';

/** Áreas de Estudio por defecto (§7), por si AW todavía no tiene categorías. */
const AREAS_POR_DEFECTO = ['Estudio > Programación', 'Estudio > Matemáticas', 'Estudio > Inglés', 'Estudio > Humanidades'];

/** Dibuja la vista dentro de `contenedor`. `parametros.pestana` elige la pestaña. */
export function render(contenedor, parametros) {
  const mensajes = el('div', { class: 'vista-mensajes' });
  const cuerpo = el('div', { class: 'vista-cuerpo' }, crearCargando({ filas: 5 }));
  let pestanaActiva = parametros.get('pestana') ?? 'cursos';
  let ctx = null; // contexto del editor (ver horario-editor.js)

  const botonExportar = el('button', { class: 'boton', type: 'button', onclick: () => exportarRespaldo().catch(mostrarError) }, 'Exportar');
  const botonImportar = el('button', {
    class: 'boton', type: 'button',
    onclick: async () => {
      try {
        const { importado, mensaje } = await importarRespaldo();
        if (importado) { await cargar(); decir('exito', mensaje); }
      } catch (error) { mostrarError(error); }
    },
  }, 'Importar');
  const cabecera = crearCabecera({ titulo, acciones: [botonExportar, botonImportar] });
  contenedor.append(cabecera, mensajes, cuerpo);

  /** Mensaje del último cambio (se reemplaza con el siguiente). */
  function decir(tipo, texto) {
    mensajes.querySelector('.mensaje-accion')?.remove();
    const aviso = crearAviso(tipo, texto);
    aviso.classList.add('mensaje-accion');
    mensajes.prepend(aviso);
  }
  function mostrarError(error) { decir('error', textoDeError(error)); }

  /** Valida y guarda un plan candidato. Devuelve la lista de errores ([] si guardó). */
  async function guardar(candidato, mensaje) {
    const normal = normalizarPlan(candidato);
    const { valido, errores } = validarPlan(normal, { inicioDia: ctx.inicioDia });
    if (!valido) return errores;
    await datos.guardarPlan(normal);
    await cargar();
    if (mensaje) decir('exito', mensaje);
    return [];
  }

  /** Cambia el nivel de un bloque que ya existe, con la asimetría de §11 (subir: hoy; bajar: mañana). */
  async function guardarNivel(bloque, nivel) {
    const cambio = proponerCambio(ctx.niveles, `bloques.${bloque.id}`, nivel, { hoy: ctx.hoy, ahora: reloj.ahora(), nivelPlan: bloque.nivel });
    await datos.guardarNiveles(cambio.niveles);
    await cargar();
    decir(cambio.inmediato ? 'exito' : 'info', cambio.inmediato
      ? `Bloque guardado. Su nivel ya es ${NOMBRE_NIVEL[nivel]}.`
      : `Bloque guardado. Bajar el nivel a ${NOMBRE_NIVEL[nivel]} se aplica mañana (${fechaLegible(cambio.aplicaDesde)}); hoy sigue como estaba.`);
  }

  /** Pide confirmación y borra plan[lista][indice]. */
  async function borrar(lista, indice, nombre) {
    const respuesta = await abrirDialogo({
      titulo: `¿Borrar ${nombre}?`,
      contenido: 'Se quita del plan. Lo que ya pasó no cambia en AW, pero deja de contarse en el cumplimiento.',
      acciones: [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'borrar', texto: 'Borrar', tipo: 'peligro' }],
    });
    if (respuesta !== 'borrar') return;
    const copia = structuredClone(ctx.plan);
    copia[lista].splice(indice, 1);
    try {
      const errores = await guardar(copia, `Se borró ${nombre}.`);
      if (errores.length) decir('error', 'No se pudo borrar: ' + errores.map((e) => e.mensaje).join(' '));
    } catch (error) { mostrarError(error); }
  }

  function avisar(tituloAviso, texto) {
    return abrirDialogo({ titulo: tituloAviso, contenido: texto, acciones: [{ valor: 'cerrar', texto: 'Entendido' }] });
  }

  /** Lee todo de nuevo y redibuja (conserva la pestaña). */
  async function cargar() {
    try {
      const [plan, niveles, reglas, hoy, inicioDia] = await Promise.all([datos.plan(), datos.niveles(), datos.reglas(), datos.hoy(), datos.inicioDia()]);
      // Categorías de AW para los desplegables: las áreas (Estudio > X) para los cursos y todas para las rutinas.
      const rutas = [...new Set(reglas.classes.filter((r) => Array.isArray(r.name) && r.name.length).map((r) => textoCategoria(r.name)))];
      const areas = rutas.filter((r) => r.startsWith('Estudio > ') && r.split(' > ').length === 2);
      ctx = {
        plan, niveles, hoy, inicioDia,
        config: configuracionVigente(niveles, hoy),
        pendientes: cambiosPendientes(niveles, hoy),
        areas: areas.length ? areas : AREAS_POR_DEFECTO,
        categorias: rutas.length ? rutas : AREAS_POR_DEFECTO,
        guardar, guardarNivel, borrar, avisar,
      };
      pintar();
    } catch (error) {
      reemplazar(cuerpo, crearError(textoDeError(error), { reintentar: cargar }));
    }
  }

  /** Avisos del plan (solapes, cursos sin bloques…): no impiden guardar, pero conviene verlos. */
  function pintarAvisos() {
    mensajes.querySelector('.avisos-plan')?.remove();
    const { avisos } = validarPlan(ctx.plan, { inicioDia: ctx.inicioDia });
    if (!avisos.length) return;
    mensajes.append(el('div', { class: 'alerta avisos-plan', 'data-tipo': 'cuidado' },
      el('details', {},
        el('summary', {}, `${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'} del plan (no impiden guardar)`),
        el('ul', { class: 'lista-errores' }, avisos.map((a) => el('li', {}, a.mensaje))))));
  }

  function pintar() {
    const { plan } = ctx;
    cabecera.subtitulo.textContent = plan.ciclo.nombre
      ? `Ciclo ${plan.ciclo.nombre} · del ${plan.ciclo.inicio} al ${plan.ciclo.fin}` : 'Todavía no hay un ciclo: defínelo en la pestaña Ciclo';
    pintarAvisos();

    const pestanas = SECCIONES.map((seccion) => ({
      id: seccion.id,
      texto: `${seccion.nombre} (${plan[seccion.id].length})`,
      contenido: () => {
        const sinCursos = seccion.necesitaCursos && plan.cursos.length === 0;
        return crearTarjeta({
          titulo: seccion.nombre,
          subtitulo: seccion.descripcion,
          acciones: el('button', {
            class: 'boton boton-primario', type: 'button', disabled: sinCursos,
            title: sinCursos ? 'Primero crea un curso' : null,
            onclick: () => seccion.editar(ctx, -1),
          }, `Agregar ${seccion.singular}`),
          contenido: seccion.tabla(ctx),
        });
      },
    }));
    pestanas.push({
      id: 'ciclo',
      texto: 'Ciclo',
      contenido: () => crearTarjeta({
        titulo: plan.ciclo.nombre ? `Ciclo ${plan.ciclo.nombre}` : 'Ciclo sin definir',
        subtitulo: plan.ciclo.nombre ? `Del ${fechaLegible(plan.ciclo.inicio)} al ${fechaLegible(plan.ciclo.fin)}.` : 'Sin ciclo, las clases y los bloques semanales no aparecen en ningún día.',
        acciones: el('button', { class: 'boton boton-primario', type: 'button', onclick: () => editarCiclo(ctx) }, plan.ciclo.nombre ? 'Editar ciclo' : 'Definir ciclo'),
      }),
    });
    if (!pestanas.some((p) => p.id === pestanaActiva)) pestanaActiva = 'cursos';

    reemplazar(cuerpo, crearPestanas({
      pestanas, activa: pestanaActiva, etiqueta: 'Partes del plan',
      alCambiar: (id) => {
        pestanaActiva = id;
        // replaceState cambia la dirección sin avisar al router: la pestaña queda en la dirección (y al recargar) sin redibujar la vista.
        history.replaceState(null, '', `#/horario?pestana=${id}`);
      },
    }));
  }

  cargar();
}
