// Vista "Cumplimiento" (arquitectura §13, F4-08): calendario de días cumplidos, puntualidad, % de foco por bloque
// y horas por curso contra la meta. F5-05: rachas por rutina (actual y mejor).
//
// Todo sale de los resúmenes diarios (datos.resumenes) sumados con agregarPeriodo (motor): la vista no relee eventos.

import { el, reemplazar } from '../dom.js';
import { datos } from '../datos.js';
import { sumarDias, inicioSemana, diasDelRango, diaSemana, fechaMuyCorta, fechaLegible, fechaCorta, largoPeriodo, periodoLegible } from '../fechas.js';
import { duracionLegible, porcentajeLegible, horasLegibles } from '../formato.js';
import { crearCabecera, textoDeError, prepararPeriodo } from '../componentes/vista.js';
import {
  crearTarjeta, crearCargando, crearError, crearVacio, crearFilaKpis, crearProgreso, crearTabla, crearChipEstado,
  crearEtiqueta, crearListaProporcional, crearLeyenda, nombreDe,
} from '../componentes/ui.js';
import { crearGrafico, tooltipHtml } from '../graficos.js';
import { agregarPeriodo } from '../../motor/resumen.js';
import { DIAS_SEMANA, NOMBRE_DIA, NOMBRE_TIPO_BLOQUE } from '../../motor/tipos.js';
import { nombreCurso, colorCurso, textoRepeticion } from '../textos-plan.js';
import { MEDIDOS, estadoDelDia, estadoDeFoco, focoPorBloque, rutinasDelPeriodo } from '../calculos-vistas.js';
import { NOMBRE_MEDICION } from '../textos-plan.js';

export const titulo = 'Cumplimiento';

const MAX_FILAS = 150; // filas de la tabla de bloques (un mes tiene unas 40)
const DIAS_RACHA = 60; // las rachas se cuentan en los últimos 60 días (o desde el inicio del ciclo), no solo en el período
const DIAS_TIRA = 14;  // cuadritos de "últimos días" de cada rutina
const MARCA_ESTADO = { cumplido: '✓', parcial: '~', fallido: '✕' };

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor, parametros) {
  const cabecera = crearCabecera({ titulo });
  const cuerpo = el('div', { class: 'vista-cuerpo' }, crearCargando({ filas: 6 }));
  contenedor.append(cabecera, cuerpo);
  const limpiezas = []; // gráficos y atajos que hay que soltar al salir de la vista

  async function cargar() {
    try {
      const { hoy, periodo, selector } = await prepararPeriodo(parametros, { tipoPorDefecto: 'mes', tipos: ['semana', 'mes', 'rango'], rapidos: [7, 30] });
      reemplazar(cabecera.acciones, selector);
      limpiezas.push(() => selector.limpiar());
      cabecera.subtitulo.textContent = periodoLegible(periodo);

      const plan = await datos.plan();
      // Rachas (F5-05): no dependen del período elegido; se cuentan hasta hoy, en los últimos DIAS_RACHA días del ciclo.
      let desdeRachas = sumarDias(hoy, -(DIAS_RACHA - 1));
      if (plan.ciclo.inicio && plan.ciclo.inicio > desdeRachas && plan.ciclo.inicio <= hoy) desdeRachas = plan.ciclo.inicio;
      const [resumenes, paraRachas] = await Promise.all([datos.resumenes(periodo.desde, periodo.hasta), datos.resumenes(desdeRachas, hoy)]);
      const agregado = agregarPeriodo(resumenes, periodo.desde, periodo.hasta, { umbrales: plan.umbrales });
      const rachas = agregarPeriodo(paraRachas, desdeRachas, hoy, { umbrales: plan.umbrales }).rachas;
      pintar({ hoy, periodo, plan, resumenes, agregado, rachas, desdeRachas });
    } catch (error) {
      reemplazar(cuerpo, crearError(textoDeError(error), { reintentar: cargar }));
    }
  }

  function pintar({ hoy, periodo, plan, resumenes, agregado, rachas, desdeRachas }) {
    const { umbrales } = plan;
    const bloques = resumenes.flatMap((r) => (r.bloques ?? []).map((b) => ({ ...b, fecha: r.fecha })));
    const medidos = bloques.filter((b) => MEDIDOS.includes(b.estado));
    const cuenta = (estado) => medidos.filter((b) => b.estado === estado).length;
    const diasMedidos = resumenes.filter((r) => r.cumplimiento?.porcentaje !== null && r.cumplimiento?.porcentaje !== undefined);
    const diasCumplidos = diasMedidos.filter((r) => r.cumplimiento.cumplido === true).length;
    const retraso = agregado.metricas.retraso?.promedio ?? null;

    if (!plan.bloques.length && !plan.rutinas.length) {
      return reemplazar(cuerpo, crearVacio('Todavía no hay un plan que cumplir.', {
        detalle: 'El cumplimiento compara tus bloques y rutinas con lo que pasó. Créalos en Horario.',
        accion: { texto: 'Ir a Horario', alHacer: () => { location.hash = '#/horario'; } },
      }));
    }

    // ── KPIs ──
    const kpis = crearFilaKpis([
      { etiqueta: 'Cumplimiento del período', valor: porcentajeLegible(agregado.cumplimiento.porcentaje), clave: estadoDelDia(agregado.cumplimiento.porcentaje, umbrales.dia_cumplido) ?? undefined,
        detalle: agregado.cumplimiento.medibles ? `Ponderado por duración · ${agregado.cumplimiento.medibles} bloques y rutinas medidos` : 'Nada medible en este período' },
      { etiqueta: 'Días cumplidos', valor: diasMedidos.length ? `${diasCumplidos} de ${diasMedidos.length}` : '—',
        detalle: `Un día cuenta con ${porcentajeLegible(umbrales.dia_cumplido)} o más · racha actual ${agregado.rachas.diaCumplido.actual} · mejor ${agregado.rachas.diaCumplido.mejor}` },
      { etiqueta: 'Bloques', valor: medidos.length ? `${cuenta('cumplido')} de ${medidos.length}` : '—',
        detalle: medidos.length ? `${cuenta('cumplido')} cumplidos · ${cuenta('parcial')} parciales · ${cuenta('fallido')} fallidos` : 'Ningún bloque medido' },
      { etiqueta: 'Retraso al empezar', valor: retraso === null ? '—' : `${Math.round(retraso)} min`,
        detalle: `Promedio por día · tolerancia ${umbrales.tolerancia_inicio_min} min` },
    ]);

    // ── Calendario ──
    const porFecha = new Map(resumenes.map((r) => [r.fecha, r]));
    const primerLunes = inicioSemana(periodo.desde);
    const ultimoDomingo = sumarDias(inicioSemana(periodo.hasta), 6);
    const celdas = diasDelRango(primerLunes, ultimoDomingo).map((fecha) => {
      const dentro = fecha >= periodo.desde && fecha <= periodo.hasta;
      const numero = String(Number(fecha.slice(8)));
      if (!dentro) return el('span', { class: 'cal-dia cal-fuera', 'aria-hidden': 'true' }, numero);
      if (fecha > hoy) return el('span', { class: 'cal-dia cal-futuro', title: `${fechaLegible(fecha)}: todavía no llega` }, el('span', { class: 'cal-numero' }, numero));
      const r = porFecha.get(fecha);
      const p = r?.cumplimiento?.porcentaje ?? null;
      const estado = estadoDelDia(p, umbrales.dia_cumplido);
      const texto = p !== null ? porcentajeLegible(p) : (r?.sinDatos ? 'sin datos' : 'sin plan');
      const detalle = p !== null ? `${porcentajeLegible(p)} (${estado})` : (r?.sinDatos ? 'sin datos de la PC y nada medible' : 'nada medible ese día');
      return el('a', {
        class: 'cal-dia', href: fecha === hoy ? '#/hoy' : `#/hoy?fecha=${fecha}`, 'data-estado': estado, 'data-hoy': fecha === hoy ? 'si' : null,
        title: `${fechaLegible(fecha)}: ${detalle}. Clic: abrir ese día en Hoy.`,
        'aria-label': `${fechaLegible(fecha)}: ${detalle}. Abrir en Hoy.`,
      }, el('span', { class: 'cal-numero' }, numero), el('span', { class: 'cal-valor' }, texto));
    });
    const calendario = el('div', { class: 'calendario' },
      DIAS_SEMANA.map((d) => el('span', { class: 'cal-cabeza', 'aria-hidden': 'true' }, NOMBRE_DIA[d].slice(0, 3))),
      celdas);
    const tarjetaCalendario = crearTarjeta({
      titulo: 'Días cumplidos', subtitulo: 'Clic en un día: abrirlo en Hoy.', clase: 'ancho-7',
      contenido: [calendario, crearLeyenda([
        { clave: 'cumplido', etiqueta: `Cumplido (≥ ${porcentajeLegible(umbrales.dia_cumplido)})` },
        { clave: 'parcial', etiqueta: `Parcial (≥ ${porcentajeLegible(umbrales.dia_cumplido / 2)})` },
        { clave: 'fallido', etiqueta: 'Fallido' },
      ])],
    });

    // ── Horas por curso contra la meta ──
    const semanas = largoPeriodo(periodo) / 7;
    const filasCurso = plan.cursos.map((curso) => {
      const horas = agregado.totales.porCurso?.[curso.id] ?? { bloquesSeg: 0, papelSeg: 0 };
      const valor = horas.bloquesSeg + horas.papelSeg;
      const meta = curso.meta_horas_semana * 3600 * semanas;
      return crearProgreso({
        valor, meta: meta > 0 ? meta : undefined, clave: curso.color, nombre: curso.nombre,
        texto: duracionLegible(valor), textoMeta: meta > 0 ? `/ ${horasLegibles(meta, meta % 3600 ? 1 : 0)}` : undefined,
      });
    });
    const areas = Object.entries(agregado.totales.porArea ?? {}).filter(([, seg]) => seg > 0).sort((a, b) => b[1] - a[1])
      .map(([area, seg]) => ({ nombre: area, valor: seg, clave: 'estudio' }));
    const tarjetaCursos = crearTarjeta({
      titulo: 'Horas por curso contra la meta', clase: 'ancho-5',
      subtitulo: `Estudio dentro de los bloques de cada curso (PC y papel). Meta de ${String(Math.round(semanas * 10) / 10).replace('.', ',')} ${semanas === 1 ? 'semana' : 'semanas'}.`,
      contenido: [
        filasCurso.length ? el('div', { class: 'lista-progreso' }, filasCurso) : crearVacio('No hay cursos en el plan.', { compacto: true }),
        el('h3', { class: 'tarjeta-titulo subtitulo-seccion' }, 'Horas por área (dentro y fuera de los bloques)'),
        crearListaProporcional(areas, { vacio: 'Sin tiempo de Estudio en este período.' }),
      ],
    });

    // ── Foco por bloque (gráfico) ──
    const grupos = focoPorBloque(resumenes).filter((g) => g.foco !== null)
      .map((g) => {
        const delPlan = plan.bloques.find((b) => b.id === g.bloqueId);
        return { ...g, nombre: `${nombreCurso(plan, g.curso)} · ${delPlan ? textoRepeticion(delPlan) : g.bloqueId}` };
      })
      .sort((a, b) => b.foco - a.foco);
    const lienzoFoco = el('div', { class: 'grafico', style: { height: `${Math.max(180, grupos.length * 34 + 70)}px` }, role: 'img',
      'aria-label': `Foco promedio por bloque: ${grupos.map((g) => `${g.nombre}, ${porcentajeLegible(g.foco)}`).join('; ') || 'sin datos'}` });
    const tarjetaFoco = crearTarjeta({
      titulo: '% de foco por bloque', clase: 'ancho-7',
      subtitulo: `Foco = Estudio ÷ duración del bloque (la IA no cuenta). Cumplido desde ${porcentajeLegible(umbrales.foco_cumplido)}; parcial desde ${porcentajeLegible(umbrales.foco_parcial)}.`,
      contenido: lienzoFoco,
    });

    // ── Puntualidad (gráfico) ──
    const conRetraso = resumenes.filter((r) => typeof r.retrasoMedioMin === 'number');
    const lienzoRetraso = el('div', { class: 'grafico', role: 'img',
      'aria-label': `Retraso medio por día: ${conRetraso.map((r) => `${fechaMuyCorta(r.fecha)}, ${Math.round(r.retrasoMedioMin)} minutos`).join('; ') || 'sin datos'}` });
    const tarjetaRetraso = crearTarjeta({
      titulo: 'Puntualidad', clase: 'ancho-5',
      subtitulo: 'Minutos entre el inicio planificado y el primer minuto de Estudio (promedio de los bloques de cada día).',
      contenido: lienzoRetraso,
    });

    // ── Tabla de bloques ──
    const filas = [...bloques].sort((a, b) => b.inicio - a.inicio);
    const tarjetaBloques = crearTarjeta({
      titulo: 'Bloques del período',
      subtitulo: filas.length > MAX_FILAS ? `Se muestran los ${MAX_FILAS} más recientes de ${filas.length}.` : `${filas.length} ${filas.length === 1 ? 'bloque' : 'bloques'}, del más reciente al más antiguo.`,
      contenido: crearTabla({
        descripcion: 'Estado de cada bloque',
        vacio: 'No hubo bloques en este período.',
        columnas: [
          { clave: 'fecha', titulo: 'Día', formato: (v) => el('a', { href: v === hoy ? '#/hoy' : `#/hoy?fecha=${v}` }, fechaCorta(v)) },
          { clave: 'curso', titulo: 'Curso', formato: (v) => crearEtiqueta(colorCurso(plan, v) ?? 'neutral', nombreCurso(plan, v)) },
          { clave: 'tipo', titulo: 'Tipo', formato: (v) => NOMBRE_TIPO_BLOQUE[v] ?? v },
          { clave: 'estado', titulo: 'Estado', formato: (v) => crearChipEstado(v) },
          { clave: 'foco', titulo: 'Foco', numerica: true, formato: (v) => (typeof v === 'number' ? porcentajeLegible(v) : '—') },
          { clave: 'retrasoMin', titulo: 'Retraso', numerica: true, formato: (v) => (typeof v === 'number' ? `${Math.round(v)} min` : '—') },
          { clave: 'motivo', titulo: 'Por qué', formato: (v) => el('span', { class: 'cortar celda-larga', title: v ?? '' }, v || '—') },
        ],
        filas: filas.slice(0, MAX_FILAS),
      }),
    });

    // ── Rachas por rutina (F5-05) ──
    const rutinas = rutinasDelPeriodo(resumenes);
    const racha = (n) => el('span', { class: 'racha' }, el('span', { class: 'racha-numero' }, String(n)), n === 1 ? 'día' : 'días');
    const tarjetaRutinas = crearTarjeta({
      titulo: 'Rachas por rutina',
      subtitulo: `Días seguidos cumpliendo cada rutina, contados hasta hoy desde el ${fechaCorta(desdeRachas)}. Los días en que no toca no cortan la racha.`,
      contenido: crearTabla({
        descripcion: 'Racha actual y mejor racha de cada rutina',
        vacio: plan.rutinas.length ? 'Ninguna rutina tocaba en este período.' : 'No hay rutinas en el plan.',
        columnas: [
          { clave: 'nombre', titulo: 'Rutina' },
          { clave: 'medicion', titulo: 'Medición', formato: (v) => NOMBRE_MEDICION[v] ?? v },
          { clave: 'actual', titulo: 'Racha actual', formato: (_, r) => racha(rachas.rutinas[r.rutinaId]?.actual ?? 0) },
          { clave: 'mejor', titulo: 'Mejor racha', formato: (_, r) => racha(rachas.rutinas[r.rutinaId]?.mejor ?? 0) },
          { clave: 'periodo', titulo: 'En el período', numerica: true, formato: (_, r) => (r.medidos ? `${r.cumplido} de ${r.medidos}` : '—') },
          { clave: 'dias', titulo: `Últimos ${DIAS_TIRA} días`, formato: (v) => el('span', { class: 'tira-dias' },
            v.slice(-DIAS_TIRA).map((d) => el('span', {
              class: 'tira-dia', 'data-estado': MEDIDOS.includes(d.estado) ? d.estado : null,
              title: `${fechaCorta(d.fecha)}: ${d.estado ? nombreDe(d.estado).toLowerCase() : 'no tocaba'}`,
            }, MARCA_ESTADO[d.estado] ?? '·'))) },
        ],
        filas: rutinas,
      }),
    });

    reemplazar(cuerpo, kpis, el('div', { class: 'grilla' }, tarjetaCalendario, tarjetaCursos, tarjetaFoco, tarjetaRetraso), tarjetaRutinas, tarjetaBloques);

    // Los gráficos se crean con sus contenedores ya en la página (ECharts necesita medirlos).
    const graficoFoco = crearGrafico(lienzoFoco, (c) => ({
      grid: { left: 8, right: 44, top: 22, bottom: 8, containLabel: true },
      xAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value} %' } },
      yAxis: { type: 'category', inverse: true, data: grupos.map((g) => g.nombre), axisLabel: { width: 210, overflow: 'truncate' } },
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const g = grupos[p.dataIndex];
          if (!g) return '';
          return tooltipHtml({
            titulo: g.nombre,
            filas: [
              { color: p.color, nombre: 'Foco promedio', valor: porcentajeLegible(g.foco), fuerte: true },
              { nombre: 'Veces', valor: String(g.veces) },
              { color: c.cumplido, nombre: 'Cumplido', valor: String(g.cumplido) },
              { color: c.parcial, nombre: 'Parcial', valor: String(g.parcial) },
              { color: c.fallido, nombre: 'Fallido', valor: String(g.fallido) },
              ...(g.retrasoMin === null ? [] : [{ nombre: 'Retraso medio', valor: `${Math.round(g.retrasoMin)} min` }]),
            ],
          });
        },
      },
      series: [{
        type: 'bar', barMaxWidth: 18,
        data: grupos.map((g) => ({ value: Math.round(g.foco * 100), itemStyle: { color: c[estadoDeFoco(g.foco, umbrales)], borderRadius: [0, 3, 3, 0] } })),
        label: { show: true, position: 'right', formatter: '{c} %', color: c.textoSuave, fontFamily: c.fuenteNumeros, fontSize: 11 },
        markLine: {
          symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: c.bordeFuerte },
          label: { position: 'start', color: c.textoSuave, fontSize: 10, distance: 4 },
          data: [
            { xAxis: umbrales.foco_parcial * 100, label: { formatter: 'parcial' } },
            { xAxis: umbrales.foco_cumplido * 100, label: { formatter: 'cumplido' } },
          ],
        },
      }],
    }), { vacio: () => grupos.length === 0, textoVacio: 'Ningún bloque en la PC medido en este período' });

    const tolerancia = umbrales.tolerancia_inicio_min;
    const colorRetraso = (min, c) => (min <= tolerancia ? c.cumplido : min <= 2 * tolerancia ? c.parcial : c.fallido);
    const graficoRetraso = crearGrafico(lienzoRetraso, (c) => ({
      grid: { left: 8, right: 16, top: 22, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: conRetraso.map((r) => fechaMuyCorta(r.fecha)) },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { formatter: '{value} min' } },
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const r = conRetraso[p.dataIndex];
          if (!r) return '';
          return tooltipHtml({
            titulo: fechaLegible(r.fecha),
            filas: [{ color: p.color, nombre: 'Retraso medio', valor: `${Math.round(r.retrasoMedioMin)} min`, fuerte: true }],
            pie: r.retrasoMedioMin <= tolerancia ? 'Dentro de la tolerancia' : 'Pasa la tolerancia',
          });
        },
      },
      series: [{
        type: 'bar', barMaxWidth: 22,
        data: conRetraso.map((r) => ({ value: Math.round(r.retrasoMedioMin), itemStyle: { color: colorRetraso(r.retrasoMedioMin, c), borderRadius: [3, 3, 0, 0] } })),
        markLine: {
          symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: c.bordeFuerte },
          label: { position: 'insideEndTop', color: c.textoSuave, fontSize: 10, formatter: `tolerancia ${tolerancia} min` },
          data: [{ yAxis: tolerancia }],
        },
      }],
    }), { vacio: () => conRetraso.length === 0, textoVacio: 'Sin bloques empezados en este período' });
    limpiezas.push(() => graficoFoco.destruir(), () => graficoRetraso.destruir());
  }

  cargar();
  return () => limpiezas.forEach((limpiar) => limpiar());
}
