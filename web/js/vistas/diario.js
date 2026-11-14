// Vista "Diario" (arquitectura §13). Check-ins e intervenciones con su motivo.
// F5-01: registrar check-ins de un día (despertar, dormir, rutina hecha, estudio en papel y asistencia).
//        Se guardan en el bucket rastreador-checkins_<host> de AW (§12) con datos.registrarCheckin().
// F5-04: el día completo: su cumplimiento, los check-ins (se pueden borrar; para corregir uno basta marcar de nuevo:
//        vale el último) y las intervenciones con su motivo. Borrar un check-in vuelve a calcular el cumplimiento.
// La revisión semanal llega en la fase 8.

import { el, reemplazar } from '../dom.js';
import { datos } from '../datos.js';
import { horaLocal, fechaLegible, fechaCorta, fechaLocal } from '../fechas.js';
import { crearCabecera, textoDeError, prepararPeriodo } from '../componentes/vista.js';
import { duracionLegible, porcentajeLegible } from '../formato.js';
import {
  crearTarjeta, crearCargando, crearError, crearVacio, crearAviso, crearTabla, crearCampo, crearChipEstado, crearFilaKpis,
  crearChipNivel, abrirDialogo,
} from '../componentes/ui.js';
import { marcablesDelDia, checkinsVigentes, estadoDelDia, textoObjetivo, MEDIDOS } from '../calculos-vistas.js';
import { NOMBRE_TIPO_CHECKIN, NOMBRE_VALOR_CHECKIN, NOMBRE_TIPO_CLASE, NOMBRE_ACCION, NOMBRE_MOTIVO, nombreCurso } from '../textos-plan.js';

export const titulo = 'Diario';

/** Dibuja la vista dentro de `contenedor`. Parámetro: fecha (día). */
export function render(contenedor, parametros) {
  const cabecera = crearCabecera({ titulo });
  const mensajes = el('div', { class: 'vista-mensajes' });
  const cuerpo = el('div', { class: 'vista-cuerpo' }, crearCargando({ filas: 6 }));
  contenedor.append(cabecera, mensajes, cuerpo);
  const limpiezas = [];
  let fecha = null;
  let nota = ''; // nota opcional para el próximo check-in

  const decir = (tipo, texto) => reemplazar(mensajes, crearAviso(tipo, texto));

  async function cargar() {
    try {
      if (!fecha) {
        const { periodo, selector } = await prepararPeriodo(parametros, { tipoPorDefecto: 'dia', tipos: ['dia'] });
        reemplazar(cabecera.acciones, selector);
        limpiezas.push(() => selector.limpiar());
        fecha = periodo.desde;
        cabecera.subtitulo.textContent = fechaLegible(fecha);
      }
      pintar(await datos.dia(fecha));
    } catch (error) {
      reemplazar(cuerpo, crearError(textoDeError(error), { reintentar: cargar }));
    }
  }

  /** Guarda un check-in y vuelve a leer el día (el cumplimiento cambia con él). */
  async function registrar(checkin, texto) {
    try {
      await datos.registrarCheckin({ ...checkin, nota, fecha });
      nota = '';
      await cargar();
      decir('exito', texto);
    } catch (error) {
      decir('error', 'No se pudo guardar el check-in: ' + (error?.message ?? error));
    }
  }

  /** Pide confirmación y borra un check-in de AW; después vuelve a leer el día. */
  async function borrar(checkin, descripcion) {
    const respuesta = await abrirDialogo({
      titulo: '¿Borrar este check-in?',
      contenido: `${descripcion}. Se borra de AW y el cumplimiento del día se vuelve a calcular.`,
      acciones: [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'borrar', texto: 'Borrar', tipo: 'peligro' }],
    });
    if (respuesta !== 'borrar') return;
    try {
      await datos.borrarCheckin(checkin.id);
      await cargar();
      decir('exito', `Se borró el check-in (${descripcion}).`);
    } catch (error) {
      decir('error', 'No se pudo borrar el check-in: ' + (error?.message ?? error));
    }
  }

  function pintar(dia) {
    const { plan, items, checkins, resumen } = dia;

    // ── El día en números (F5-04): cambian al registrar o borrar un check-in ──
    const p = resumen.cumplimiento?.porcentaje ?? null;
    const medidos = [...resumen.bloques, ...resumen.rutinas].filter((x) => MEDIDOS.includes(x.estado));
    const cumplidos = medidos.filter((x) => x.estado === 'cumplido').length;
    const kpis = crearFilaKpis([
      { etiqueta: 'Cumplimiento del día', valor: porcentajeLegible(p), clave: estadoDelDia(p, plan.umbrales.dia_cumplido) ?? undefined,
        detalle: medidos.length ? `${cumplidos} de ${medidos.length} bloques y rutinas cumplidos` : 'Nada medible este día' },
      { etiqueta: 'Horas despierto', valor: duracionLegible(dia.dia.despiertoSeg),
        detalle: dia.dia.sinDatos ? (dia.dia.despiertoSeg ? 'Sin PC: de despertar a dormir, por los check-ins' : 'Sin datos de la PC') : `De ${horaLocal(dia.dia.inicio)} a ${horaLocal(dia.dia.fin)}` },
      { etiqueta: 'Check-ins', valor: String(checkins.length), detalle: 'Registrados para este día' },
      { etiqueta: 'Intervenciones', valor: String(dia.intervenciones.length), detalle: 'Reales, del agente (todavía no existe)' },
    ]);

    // ── Despertar y dormir ──
    // El valor es la hora ('HH:MM'). Dormir pasada la medianoche es la madrugada siguiente (lo resuelve el motor).
    const ultimo = (tipo) => checkins.filter((c) => c.tipo === tipo).sort((a, b) => a.instante - b.instante).at(-1) ?? null;
    const filaHora = (tipo, etiqueta, estimada, fuente) => {
      const actual = ultimo(tipo);
      const campo = crearCampo({ etiqueta, tipo: 'time', valor: actual?.valor ?? '' });
      const control = campo.querySelector('input');
      const ayuda = actual
        ? `Registrado: ${actual.valor}.`
        : (estimada ? `Sin check-in. Estimado por la actividad de la PC: ${estimada}${fuente === 'ahora' ? ' (el día sigue)' : ''}.` : 'Sin check-in y sin actividad para estimarlo.');
      return el('div', { class: 'diario-hora' }, campo,
        el('button', {
          class: 'boton', type: 'button',
          onclick: () => {
            if (!control.value) { control.focus(); return decir('cuidado', `Escribe la hora de ${etiqueta.toLowerCase()} antes de guardar.`); }
            registrar({ tipo, valor: control.value }, `${etiqueta}: ${control.value} guardado para el ${fechaCorta(fecha)}.`);
          },
        }, 'Guardar'),
        el('p', { class: 'campo-ayuda' }, ayuda));
    };
    const d = dia.dia;
    const tarjetaHoras = crearTarjeta({
      titulo: 'Despertar y dormir', clase: 'ancho-5',
      subtitulo: 'Con estos dos check-ins, el día lógico va exactamente de uno a otro (aunque no uses la PC).',
      contenido: el('div', { class: 'diario-horas' },
        filaHora('despertar', 'Despertar', d.sinDatos && d.fuenteInicio !== 'checkin' ? null : horaLocal(d.inicio), d.fuenteInicio),
        filaHora('dormir', 'Dormir', d.sinDatos && d.fuenteFin !== 'checkin' ? null : horaLocal(d.fin), d.fuenteFin)),
    });

    // ── Rutinas, estudio en papel y asistencia ──
    const estadoDe = (m) => {
      if (m.tipo === 'rutina') return resumen.rutinas.find((r) => r.rutinaId === m.refId)?.estado ?? null;
      if (m.tipo === 'papel') return resumen.bloques.find((b) => b.bloqueId === m.refId)?.estado ?? null;
      return null;
    };
    const nombreDe = (m) => {
      const horas = m.item.inicio ? `${horaLocal(m.item.inicio)} – ${horaLocal(m.item.fin)}` : 'todo el día';
      if (m.tipo === 'rutina') return { nombre: m.item.nombre, detalle: `Rutina · ${horas}` };
      if (m.tipo === 'papel') return { nombre: nombreCurso(plan, m.item.curso), detalle: `Estudio en papel · ${horas}${m.item.objetivo ? ' · ' + m.item.objetivo : ''}` };
      return { nombre: nombreCurso(plan, m.item.curso), detalle: `Clase · ${NOMBRE_TIPO_CLASE[m.item.tipo] ?? m.item.tipo} · ${horas}` };
    };
    const marcables = marcablesDelDia(items, checkins);
    const tarjetaMarcar = crearTarjeta({
      titulo: 'Rutinas, estudio en papel y asistencia', clase: 'ancho-7',
      subtitulo: 'Lo que la PC no puede medir. Si te equivocas, marca de nuevo: vale el último.',
      contenido: marcables.length
        ? el('ul', { class: 'diario-marcables' }, marcables.map((m) => {
          const { nombre, detalle } = nombreDe(m);
          const estado = estadoDe(m);
          return el('li', {},
            el('div', { class: 'diario-marcable-texto' },
              el('span', { class: 'diario-marcable-nombre' }, nombre, estado && [' ', crearChipEstado(estado)]),
              el('span', { class: 'texto-suave texto-xs' }, detalle)),
            el('div', { class: 'botonera', role: 'group', 'aria-label': `${nombre}: ${detalle}` }, m.opciones.map((valor) => el('button', {
              class: 'boton boton-pequeno', type: 'button', 'aria-pressed': String(m.valor === valor),
              onclick: () => registrar({ tipo: m.tipo, refId: m.refId, valor }, `${nombre}: "${NOMBRE_VALOR_CHECKIN[valor]}" guardado.`),
            }, NOMBRE_VALOR_CHECKIN[valor]))));
        }))
        : crearVacio('Este día no tiene rutinas con check-in, estudio en papel ni clases.', { compacto: true }),
    });
    // Nota opcional: se guarda con el próximo check-in que se registre (y después se vacía).
    tarjetaMarcar.append(crearCampo({
      etiqueta: 'Nota para el próximo check-in', opcional: true, valor: nota,
      atributos: { maxlength: 200, placeholder: 'Por ejemplo: me quedé dormido', oninput: (e) => { nota = e.target.value.trim(); } },
    }));

    // ── Check-ins registrados ──
    const aQue = (c) => {
      if (c.tipo === 'rutina') return plan.rutinas.find((r) => r.id === c.refId)?.nombre ?? c.refId;
      if (c.tipo === 'papel') return nombreCurso(plan, plan.bloques.find((b) => b.id === c.refId)?.curso ?? c.refId);
      if (c.tipo === 'asistencia') return nombreCurso(plan, plan.clases.find((k) => k.id === c.refId)?.curso ?? c.refId);
      return '—';
    };
    const tarjetaLista = crearTarjeta({
      titulo: 'Check-ins de este día',
      subtitulo: 'Se guardan en AW, en el bucket rastreador-checkins. Para corregir uno, marca de nuevo (vale el último) o bórralo.',
      contenido: crearTabla({
        descripcion: `${checkins.length} ${checkins.length === 1 ? 'check-in' : 'check-ins'}, del más reciente al más antiguo`,
        vacio: 'Todavía no hay check-ins de este día.',
        columnas: columnasDeCheckins(aQue, checkinsVigentes(checkins)),
        filas: [...checkins].sort((a, b) => b.instante - a.instante),
      }),
    });

    // ── Intervenciones reales (las escribe el agente desde la fase 6) ──
    const itemDe = (i) => {
      const bloque = items.bloques.find((b) => b.id === i.bloqueId);
      const clase = items.clases.find((c) => c.id === i.claseId);
      return bloque ? nombreCurso(plan, bloque.curso) : clase ? `Clase de ${nombreCurso(plan, clase.curso)}` : '—';
    };
    const tarjetaIntervenciones = crearTarjeta({
      titulo: 'Intervenciones de este día',
      subtitulo: 'Avisos, fricciones, bloqueos, pases y salidas de emergencia, con su motivo.',
      contenido: crearTabla({
        descripcion: `${dia.intervenciones.length} ${dia.intervenciones.length === 1 ? 'intervención' : 'intervenciones'}`,
        vacio: 'Sin intervenciones: el agente todavía no existe (fase 6). Lo que habría pasado se ve en el Simulador.',
        columnas: [
          { clave: 'instante', titulo: 'Hora', numerica: true, formato: (v) => horaLocal(v) },
          { clave: 'accion', titulo: 'Acción', formato: (v, i) => el('span', {}, NOMBRE_ACCION[v] ?? v, ' ', crearChipNivel(i.nivel)) },
          { clave: 'objetivo', titulo: 'Sobre', formato: (v) => el('span', { class: 'cortar celda-larga', title: v }, textoObjetivo(v)) },
          { clave: 'item', titulo: 'En', formato: (_, i) => itemDe(i) },
          { clave: 'motivo', titulo: 'Motivo', formato: (v) => el('span', { class: 'cortar celda-larga', title: v ?? '' }, NOMBRE_MOTIVO[v] ?? (v || '—')) },
        ],
        filas: dia.intervenciones,
      }),
    });

    reemplazar(cuerpo, kpis, el('div', { class: 'grilla' }, tarjetaHoras, tarjetaMarcar), tarjetaLista, tarjetaIntervenciones);
  }

  /** Columnas de la tabla de check-ins. `vigentes`: los ids de los que valen (el último de cada cosa). */
  function columnasDeCheckins(aQue, vigentes) {
    const descripcion = (c) => `${NOMBRE_TIPO_CHECKIN[c.tipo] ?? c.tipo}${aQue(c) !== '—' ? ' de ' + aQue(c) : ''}: ${NOMBRE_VALOR_CHECKIN[c.valor] ?? c.valor}`;
    return [
      // .cifra: en un solo renglón (en una tabla angosta la fecha se partía en tres).
      { clave: 'instante', titulo: 'Registrado', formato: (v) => el('span', { class: 'cifra' }, `${fechaCorta(fechaLocal(v))}, ${horaLocal(v)}`) },
      { clave: 'tipo', titulo: 'Tipo', formato: (v) => NOMBRE_TIPO_CHECKIN[v] ?? v },
      { clave: 'refId', titulo: 'De', formato: (_, c) => aQue(c) },
      { clave: 'valor', titulo: 'Valor', formato: (v, c) => el('span', {}, NOMBRE_VALOR_CHECKIN[v] ?? v,
        !vigentes.has(c) && el('span', { class: 'texto-suave texto-xs' }, ' · reemplazado por uno posterior')) },
      { clave: 'nota', titulo: 'Nota', formato: (v) => el('span', { class: 'cortar celda-larga', title: v ?? '' }, v || '—') },
      { clave: 'acciones', titulo: '', alinear: 'der', formato: (_, c) => el('span', { class: 'acciones-fila' }, el('button', {
        class: 'boton boton-pequeno boton-fantasma', type: 'button', disabled: c.id === null || c.id === undefined,
        'aria-label': `Borrar el check-in ${descripcion(c)}`, onclick: () => borrar(c, descripcion(c)),
      }, 'Borrar')) },
    ];
  }

  cargar();
  return () => limpiezas.forEach((limpiar) => limpiar());
}
