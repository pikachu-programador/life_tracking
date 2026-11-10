// Planificador semanal (F3-05): cuadrícula de lunes a domingo con clases, rutinas y bloques.
// - Clic en un hueco de un día → formulario de bloque nuevo con ese día y esa hora.
// - Clic en una caja → su formulario (bloque, clase o rutina).
// - Con el teclado: cada día tiene un botón "+" y cada caja es un botón.
// La posición de cada caja la calcula js/planificador.js (función pura, con pruebas).

import { el } from '../dom.js';
import { reloj } from '../reloj.js';
import { sumarDias, inicioSemana, diaSemana, inicioDelDia, horaLocal, periodoLegible, fechaLegible } from '../fechas.js';
import { crearTarjeta, crearChipNivel } from '../componentes/ui.js';
import { expandirRango } from '../../motor/horario.js';
import { NOMBRE_DIA, NOMBRE_TIPO_BLOQUE } from '../../motor/tipos.js';
import { disponerSemana, horaDeRelativo, franjaDeClic } from '../planificador.js';
import { bloques, clases, rutinas, nivelVigente } from './horario-editor.js';
import { NOMBRE_TIPO_CLASE, NOMBRE_TIPO_EXCEPCION, NOMBRE_EFECTO, NOMBRE_EVENTO, nombreCurso, colorCurso } from '../textos-plan.js';

const ALTO_HORA = 44; // píxeles por hora (lo usa también el CSS, con --alto-hora)

/**
 * Crea el planificador de una semana.
 * @param {object} ctx  contexto del editor (plan, config, hoy, inicioDia, guardar…)
 * @param {{semana: string, alCambiarSemana: (lunes: string) => void}} opciones  semana: cualquier fecha de la semana
 * @returns {HTMLElement}
 */
export function crearPlanificador(ctx, { semana, alCambiarSemana }) {
  const { plan, hoy, inicioDia } = ctx;
  const lunes = inicioSemana(semana);
  const domingo = sumarDias(lunes, 6);
  const { dias, desdeMin, hastaMin } = disponerSemana(expandirRango(plan, lunes, domingo, { inicioDia }), { inicioDia });
  const altoTotal = ((hastaMin - desdeMin) / 60) * ALTO_HORA;
  const y = (minutos) => ((minutos - desdeMin) / 60) * ALTO_HORA;

  // ── Navegación de semanas (el plan también se mira hacia adelante: aquí no hay tope en hoy) ──
  const navegacion = el('div', { class: 'botonera' },
    el('button', { class: 'boton boton-icono', type: 'button', 'aria-label': 'Semana anterior', onclick: () => alCambiarSemana(sumarDias(lunes, -7)) }, '‹'),
    el('button', { class: 'boton boton-icono', type: 'button', 'aria-label': 'Semana siguiente', onclick: () => alCambiarSemana(sumarDias(lunes, 7)) }, '›'),
    el('button', { class: 'boton', type: 'button', disabled: lunes === inicioSemana(hoy), onclick: () => alCambiarSemana(inicioSemana(hoy)) }, 'Esta semana'));

  // ── Abrir formularios ──
  const indiceDe = (lista, id) => plan[lista].findIndex((x) => x.id === id);
  function abrir(caja) {
    if (caja.tipo === 'bloque') return bloques.editar(ctx, indiceDe('bloques', caja.item.bloqueId));
    if (caja.tipo === 'clase') return clases.editar(ctx, indiceDe('clases', caja.item.claseId));
    return rutinas.editar(ctx, indiceDe('rutinas', caja.item.rutinaId));
  }
  function nuevoBloque(fecha, minutos) {
    if (!plan.cursos.length) return ctx.avisar('Primero crea un curso', 'Los bloques necesitan un curso: agrégalo en la pestaña Cursos.');
    const franja = minutos === null ? { inicio: '15:00', fin: '16:30' } : franjaDeClic(minutos, { inicioDia });
    return bloques.editar(ctx, -1, { repeticion: 'semanal', dias: [diaSemana(fecha)], fecha, ...franja });
  }

  // ── Cajas ──
  function textoCaja(caja) {
    const { item } = caja;
    const horas = `${horaLocal(item.inicio)} – ${horaLocal(caja.tipo === 'bloque' ? (item.finPlan ?? item.fin) : item.fin)}`;
    if (caja.tipo === 'bloque') {
      const delPlan = plan.bloques.find((b) => b.id === item.bloqueId);
      const nivel = item.subidoPorExcepcion ? 'total' : (delPlan ? nivelVigente(delPlan, ctx.config) : item.nivel);
      return { titulo: nombreCurso(plan, item.curso), detalle: NOMBRE_TIPO_BLOQUE[item.tipo] ?? item.tipo, horas, nivel, nota: item.objetivo };
    }
    if (caja.tipo === 'clase') {
      return { titulo: nombreCurso(plan, item.curso), detalle: `Clase · ${NOMBRE_TIPO_CLASE[item.tipo] ?? item.tipo}`, horas, nota: item.lugar };
    }
    return { titulo: item.nombre, detalle: 'Rutina', horas };
  }

  function crearCaja(caja) {
    const t = textoCaja(caja);
    const alto = y(caja.hastaMin) - y(caja.desdeMin);
    const descripcion = [t.detalle, t.titulo, t.horas, t.nivel && `nivel ${t.nivel}`, t.nota].filter(Boolean).join(' · ');
    return el('button', {
      type: 'button', class: 'plan-caja', 'data-tipo': caja.tipo,
      'data-curso': caja.tipo === 'rutina' ? null : (colorCurso(plan, caja.item.curso) ?? null),
      'data-corta': alto < 40 ? 'si' : null,
      title: descripcion, 'aria-label': `Editar: ${descripcion}`,
      style: {
        top: `${y(caja.desdeMin)}px`, height: `${Math.max(alto, 14)}px`,
        left: `${(100 * caja.columna) / caja.columnas}%`, width: `${100 / caja.columnas}%`,
      },
      onclick: (e) => { e.stopPropagation(); abrir(caja); },
    },
    el('span', { class: 'plan-caja-titulo' }, t.titulo),
    el('span', { class: 'plan-caja-detalle' }, `${t.detalle} · ${t.horas}`),
    t.nivel && t.nivel !== 'ninguno' && alto >= 62 ? crearChipNivel(t.nivel) : null);
  }

  function crearMarca(marca) {
    const texto = `${NOMBRE_EVENTO[marca.item.evento] ?? marca.item.nombre} ${horaLocal(marca.item.inicio)}`;
    return el('button', {
      type: 'button', class: 'plan-marca', style: { top: `${y(marca.desdeMin)}px` },
      title: `Rutina: ${marca.item.nombre} (objetivo ${horaLocal(marca.item.inicio)})`, 'aria-label': `Editar rutina: ${texto}`,
      onclick: (e) => { e.stopPropagation(); abrir(marca); },
    }, texto);
  }

  // ── Columnas ──
  const ahora = reloj.ahora();
  const columnas = dias.map((dia) => {
    const esHoy = dia.fecha === hoy;
    const fantasma = el('div', { class: 'plan-fantasma', hidden: true, 'aria-hidden': 'true' });
    const minutosDe = (evento, columna) => desdeMin + ((evento.clientY - columna.getBoundingClientRect().top) / ALTO_HORA) * 60;
    const columna = el('div', {
      class: 'plan-dia', 'data-hoy': esHoy ? 'si' : null, style: { height: `${altoTotal}px` },
      // Clic en un hueco: bloque nuevo a esa hora. (Las cajas detienen el clic con stopPropagation.)
      onclick: (e) => nuevoBloque(dia.fecha, minutosDe(e, columna)),
      onmousemove: (e) => {
        if (e.target !== columna && e.target !== fantasma) { fantasma.hidden = true; return; }
        const franja = franjaDeClic(minutosDe(e, columna), { inicioDia });
        const desde = Math.floor(minutosDe(e, columna) / 30) * 30;
        fantasma.hidden = false;
        fantasma.style.top = `${y(desde)}px`;
        fantasma.textContent = `+ ${franja.inicio}`;
      },
      onmouseleave: () => { fantasma.hidden = true; },
    },
    dia.cajas.map(crearCaja), dia.marcas.map(crearMarca), fantasma,
    // Línea de "ahora" en la columna de hoy.
    esHoy && ahora >= inicioDelDia(dia.fecha, inicioDia) + desdeMin * 60000 && ahora <= inicioDelDia(dia.fecha, inicioDia) + hastaMin * 60000
      ? el('div', { class: 'plan-ahora', 'aria-hidden': 'true', style: { top: `${y((ahora - inicioDelDia(dia.fecha, inicioDia)) / 60000)}px` } })
      : null);

    const excepcion = dia.items.excepciones?.[0];
    const nombreDia = NOMBRE_DIA[diaSemana(dia.fecha)];
    const cabeza = el('div', { class: 'plan-cabeza', 'data-hoy': esHoy ? 'si' : null },
      el('span', { class: 'plan-cabeza-dia' }, nombreDia.slice(0, 3), ' ', el('span', { class: 'cifra' }, String(Number(dia.fecha.slice(8))))),
      el('button', {
        class: 'boton boton-pequeno boton-icono', type: 'button',
        'aria-label': `Agregar un bloque el ${nombreDia.toLowerCase()}`, title: 'Agregar un bloque este día',
        onclick: () => nuevoBloque(dia.fecha, null),
      }, '+'),
      excepcion && el('span', { class: 'plan-excepcion', title: `${NOMBRE_EFECTO[excepcion.efecto] ?? ''}${excepcion.nota ? ' · ' + excepcion.nota : ''}` },
        NOMBRE_TIPO_EXCEPCION[excepcion.tipo] ?? excepcion.tipo),
      !dia.items.enCiclo && el('span', { class: 'plan-excepcion', title: 'Este día está fuera del ciclo: solo aparecen los bloques únicos' }, 'Fuera del ciclo'));
    return { cabeza, columna };
  });

  // ── Eje de horas ──
  const horas = [];
  for (let m = desdeMin; m <= hastaMin; m += 60) horas.push(el('span', { class: 'plan-hora', style: { top: `${y(m)}px` } }, horaDeRelativo(m, inicioDia)));

  const cuadricula = el('div', { class: 'planificador', style: { '--alto-hora': `${ALTO_HORA}px` }, role: 'group', 'aria-label': `Semana del ${fechaLegible(lunes)}` },
    el('div', { class: 'plan-esquina' }), columnas.map((c) => c.cabeza),
    el('div', { class: 'plan-eje', style: { height: `${altoTotal}px` }, 'aria-hidden': 'true' }, horas),
    columnas.map((c) => c.columna));

  // Rutinas sin franja: no tienen lugar en la cuadrícula; se listan debajo (una vez cada una).
  const sinFranja = new Map();
  for (const dia of dias) for (const r of dia.sinFranja) sinFranja.set(r.rutinaId, r);
  const total = dias.reduce((n, d) => n + d.cajas.length + d.marcas.length, 0);

  const pie = el('div', { class: 'plan-pie' },
    el('ul', { class: 'leyenda' },
      el('li', { class: 'plan-leyenda', 'data-tipo': 'bloque' }, 'Bloque (color del curso)'),
      el('li', { class: 'plan-leyenda', 'data-tipo': 'clase' }, 'Clase'),
      el('li', { class: 'plan-leyenda', 'data-tipo': 'rutina' }, 'Rutina')),
    sinFranja.size > 0 && el('p', { class: 'texto-suave texto-xs' }, 'Rutinas sin franja (cuentan en todo el día): ',
      [...sinFranja.values()].map((r, i) => [i ? ', ' : '', el('button', { class: 'plan-enlace', type: 'button', onclick: () => rutinas.editar(ctx, indiceDe('rutinas', r.rutinaId)) }, r.nombre)])),
    total === 0 && el('p', { class: 'texto-suave' }, 'No hay nada planificado esta semana. Haz clic en un hueco para crear un bloque.'));

  const tarjeta = crearTarjeta({
    titulo: periodoLegible({ tipo: 'semana', desde: lunes, hasta: domingo }),
    subtitulo: 'Clic en un hueco: bloque nuevo a esa hora. Clic en una caja: editarla.',
    acciones: navegacion,
    contenido: [el('div', { class: 'planificador-contenedor' }, cuadricula), pie],
  });
  tarjeta.classList.add('tarjeta-planificador');
  return tarjeta;
}
