// Vista "Simulador" (arquitectura §13, F4-07): eliges un día y un nivel, y ves qué habría hecho el bloqueo.
//
// - Línea de tiempo con los carriles Plan, Real, Intervenciones y Cortes (componentes/linea-tiempo.js).
// - Resumen por nivel: el mismo día simulado con Aviso, Fricción y Total (compararNiveles del motor).
// - Lista de intervenciones simuladas, con su motivo.
// Las simulaciones no se guardan: se recalculan (§12). Cambiar de nivel no vuelve a pedir datos: solo corre el
// Simulador del motor otra vez sobre los segmentos que ya están en memoria.

import { el, reemplazar } from '../dom.js';
import { datos } from '../datos.js';
import { reloj } from '../reloj.js';
import { horaLocal, fechaLegible } from '../fechas.js';
import { duracionLegible } from '../formato.js';
import { crearCabecera, textoDeError, prepararPeriodo } from '../componentes/vista.js';
import {
  crearTarjeta, crearCargando, crearError, crearVacio, crearFilaKpis, crearTabla, crearSegmentado, crearChipNivel,
  crearEtiqueta, crearCampo, crearAviso,
} from '../componentes/ui.js';
import { crearLineaTiempo } from '../componentes/linea-tiempo.js';
import { simular, compararNiveles } from '../../motor/simulador.js';
import { nivelDeBloque } from '../../motor/niveles.js';
import { NOMBRE_NIVEL } from '../../motor/tipos.js';
import { NOMBRE_ACCION, NOMBRE_MOTIVO, nombreCurso, colorCurso } from '../textos-plan.js';
import { textoObjetivo } from '../calculos-vistas.js';

export const titulo = 'Simulador';

const NIVELES_SIMULADOS = ['plan', 'aviso', 'friccion', 'total'];
const NOMBRE_SIMULADO = { plan: 'Como en el plan', ...NOMBRE_NIVEL };
const MAX_FILAS = 200;

/** "1 aviso", "3 avisos". */
const cuantos = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Dibuja la vista dentro de `contenedor`. Parámetros: fecha (día), nivel, continuar=no, pases=no. */
export function render(contenedor, parametros) {
  const cabecera = crearCabecera({ titulo });
  const cuerpo = el('div', { class: 'vista-cuerpo' }, crearCargando({ filas: 6 }));
  contenedor.append(cabecera, cuerpo);
  const limpiezas = [];

  // Lo que se elige en la vista (queda en la dirección para que se mantenga al recargar).
  const eleccion = {
    nivel: NIVELES_SIMULADOS.includes(parametros.get('nivel')) ? parametros.get('nivel') : 'plan',
    continuarAviso: parametros.get('continuar') !== 'no',
    usarPases: parametros.get('pases') !== 'no',
  };
  function anotarDireccion() {
    // Se cambia el mismo objeto `parametros` (no una copia): el selector de período lo lee al cambiar de día,
    // y así el nivel elegido se conserva de un día a otro.
    parametros.set('nivel', eleccion.nivel);
    if (eleccion.continuarAviso) parametros.delete('continuar'); else parametros.set('continuar', 'no');
    if (eleccion.usarPases) parametros.delete('pases'); else parametros.set('pases', 'no');
    history.replaceState(null, '', `#/simulador?${parametros}`); // sin redibujar toda la vista
  }

  async function cargar() {
    try {
      const { periodo, selector } = await prepararPeriodo(parametros, { tipoPorDefecto: 'dia', tipos: ['dia'] });
      reemplazar(cabecera.acciones, selector);
      limpiezas.push(() => selector.limpiar());
      cabecera.subtitulo.textContent = fechaLegible(periodo.desde);
      pintar(await datos.dia(periodo.desde));
    } catch (error) {
      reemplazar(cuerpo, crearError(textoDeError(error), { reintentar: cargar }));
    }
  }

  function pintar(dia) {
    const { plan, items, segmentos, config } = dia;
    const vigilados = [...items.bloques, ...items.clases.filter((c) => c.usaPc)];
    if (dia.dia.sinDatos) {
      return reemplazar(cuerpo, crearVacio('Sin datos de la PC este día.', { detalle: 'No hay actividad que simular. Elige otro día.' }));
    }

    // ── Controles ──
    const controles = el('div', { class: 'simulador-controles' },
      crearSegmentado({
        etiqueta: 'Nivel simulado', valor: eleccion.nivel,
        opciones: NIVELES_SIMULADOS.map((valor) => ({ valor, texto: NOMBRE_SIMULADO[valor] })),
        alCambiar: (valor) => { eleccion.nivel = valor; anotarDireccion(); recalcular(); },
      }),
      crearCampo({
        etiqueta: 'Tras un aviso, pulso "continuar"', tipo: 'checkbox', valor: eleccion.continuarAviso,
        alCambiar: (valor) => { eleccion.continuarAviso = valor; anotarDireccion(); recalcular(); },
      }),
      crearCampo({
        etiqueta: 'En fricción, uso pases mientras queden comodines', tipo: 'checkbox', valor: eleccion.usarPases,
        alCambiar: (valor) => { eleccion.usarPases = valor; anotarDireccion(); recalcular(); },
      }));

    const zonaKpis = el('div');
    const zonaLinea = el('div');
    const zonaNiveles = el('div');
    const zonaItems = el('div');
    const zonaLista = el('div');
    const nota = el('p', { class: 'nota-carga', 'aria-live': 'polite' });

    reemplazar(cuerpo,
      crearTarjeta({ titulo: 'Qué se simula', subtitulo: 'El mismo motor que usará el bloqueo real, sobre lo que hiciste ese día.', contenido: controles }),
      !vigilados.length && crearAviso('info', 'Ese día no tuvo bloques ni clases con la laptop: fuera de un bloque nada se interviene (la distracción en tiempo libre solo se mide).'),
      zonaKpis,
      crearTarjeta({ titulo: 'Línea de tiempo', subtitulo: 'Rueda del mouse: acercar. Arrastrar: moverse. Doble clic: ver todo el día.', contenido: zonaLinea }),
      el('div', { class: 'grilla' },
        crearTarjeta({ titulo: 'Comparación de los 3 niveles', subtitulo: 'El mismo día con cada nivel puesto en todos los bloques.', clase: 'ancho-6', contenido: zonaNiveles }),
        crearTarjeta({ titulo: 'Por bloque', subtitulo: 'Con el nivel elegido arriba.', clase: 'ancho-6', contenido: zonaItems })),
      crearTarjeta({ titulo: 'Intervenciones simuladas', contenido: zonaLista }),
      nota);

    let linea = null;
    limpiezas.push(() => linea?.destruir());

    const nombreItem = (id) => {
      const bloque = items.bloques.find((b) => b.id === id);
      if (bloque) return { tipo: 'Bloque', curso: bloque.curso, horas: `${horaLocal(bloque.inicio)} – ${horaLocal(bloque.fin)}`, bloque };
      const clase = items.clases.find((c) => c.id === id);
      if (clase) return { tipo: 'Clase', curso: clase.curso, horas: `${horaLocal(clase.inicio)} – ${horaLocal(clase.fin)}` };
      return null;
    };
    const etiquetaItem = (id) => {
      const item = nombreItem(id);
      if (!item) return '—';
      return el('span', {}, crearEtiqueta(colorCurso(plan, item.curso) ?? 'neutral', nombreCurso(plan, item.curso)),
        el('span', { class: 'texto-suave texto-xs' }, ` ${item.tipo.toLowerCase()} · ${item.horas}`));
    };

    function recalcular() {
      const t0 = performance.now();
      const politica = { continuarAviso: eleccion.continuarAviso, usarPases: eleccion.usarPases };
      const entrada = { segmentos, items, config, politica };
      const resultado = simular({ ...entrada, nivel: eleccion.nivel });
      const porNivel = { plan: eleccion.nivel === 'plan' ? resultado : simular({ ...entrada, nivel: 'plan' }), ...compararNiveles(entrada) };
      const t = resultado.totales;

      // KPIs
      reemplazar(zonaKpis, crearFilaKpis([
        { etiqueta: 'Intervenciones', valor: String(t.avisos + t.fricciones + t.bloqueos),
          detalle: `${cuantos(t.avisos, 'aviso', 'avisos')} · ${cuantos(t.fricciones, 'fricción', 'fricciones')} · ${cuantos(t.bloqueos, 'bloqueo', 'bloqueos')}` },
        { etiqueta: 'Tiempo que se habría cortado', valor: duracionLegible(t.cortadoSeg), clave: 'distraccion', detalle: 'Distracción dentro de bloques que el nivel habría impedido' },
        { etiqueta: 'Pases', valor: String(t.pases), detalle: `${t.comodinesUsados} de ${config.friccion.comodines_semana} comodines de la semana` },
        { etiqueta: 'Nivel', valor: NOMBRE_SIMULADO[eleccion.nivel], detalle: eleccion.nivel === 'plan' ? 'Cada bloque con su propio nivel' : 'El mismo nivel en todos los bloques' },
      ]));

      // Línea de tiempo (conserva el zoom al cambiar de nivel)
      const carriles = [
        { tipo: 'plan', datos: items, cursos: plan.cursos, colorPor: 'curso' },
        { tipo: 'real', datos: segmentos },
        { tipo: 'intervenciones', datos: resultado.intervenciones },
        { tipo: 'cortes', datos: resultado.cortes, nivel: eleccion.nivel === 'plan' ? undefined : eleccion.nivel },
        ...(dia.intervenciones.length ? [{ tipo: 'intervenciones', nombre: 'Reales', datos: dia.intervenciones }] : []),
      ];
      if (linea) linea.actualizar({ carriles });
      else linea = crearLineaTiempo(zonaLinea, { inicio: dia.dia.inicio, fin: dia.dia.fin, ahora: dia.esHoy ? reloj.ahora() : undefined, carriles });

      // Comparación por nivel
      reemplazar(zonaNiveles, crearTabla({
        descripcion: 'Intervenciones y tiempo cortado con cada nivel',
        columnas: [
          { clave: 'nivel', titulo: 'Nivel', formato: (v) => el('span', {}, v === 'plan' ? NOMBRE_SIMULADO.plan : crearChipNivel(v),
            v === eleccion.nivel && el('span', { class: 'texto-suave texto-xs' }, ' · elegido')) },
          { clave: 'avisos', titulo: 'Avisos', numerica: true },
          { clave: 'fricciones', titulo: 'Fricciones', numerica: true },
          { clave: 'bloqueos', titulo: 'Bloqueos', numerica: true },
          { clave: 'pases', titulo: 'Pases', numerica: true },
          { clave: 'cortadoSeg', titulo: 'Cortado', numerica: true, formato: (v) => duracionLegible(v) },
        ],
        filas: NIVELES_SIMULADOS.map((nivel) => ({ nivel, ...porNivel[nivel].totales })),
      }));

      // Por bloque o clase
      reemplazar(zonaItems, crearTabla({
        descripcion: 'Intervenciones en cada bloque y clase del día',
        vacio: 'Ese día no hubo bloques ni clases con la laptop.',
        columnas: [
          { clave: 'id', titulo: 'Bloque o clase', formato: (v) => etiquetaItem(v) },
          { clave: 'nivel', titulo: 'Nivel', formato: (v, fila) => el('span', {}, crearChipNivel(v), fila.escalo && el('span', { class: 'texto-suave texto-xs' }, ' → escaló a fricción')) },
          { clave: 'intervenciones', titulo: 'Interv.', numerica: true },
          { clave: 'pases', titulo: 'Pases', numerica: true },
          { clave: 'cortadoSeg', titulo: 'Cortado', numerica: true, formato: (v) => duracionLegible(v) },
        ],
        filas: vigilados.map((item) => {
          const c = resultado.porItem[item.id] ?? { avisos: 0, fricciones: 0, bloqueos: 0, pases: 0, escalo: false, cortadoSeg: 0 };
          const esBloque = 'bloqueId' in item;
          const nivel = !esBloque ? 'aviso' : (eleccion.nivel === 'plan' ? nivelDeBloque(item, config) : eleccion.nivel);
          return { id: item.id, nivel, escalo: c.escalo, intervenciones: c.avisos + c.fricciones + c.bloqueos, pases: c.pases, cortadoSeg: c.cortadoSeg };
        }),
      }));

      // Lista de intervenciones
      const lista = resultado.intervenciones;
      reemplazar(zonaLista, crearTabla({
        descripcion: lista.length > MAX_FILAS ? `Las primeras ${MAX_FILAS} de ${lista.length} intervenciones` : `${lista.length} ${lista.length === 1 ? 'intervención' : 'intervenciones'}, en orden`,
        vacio: 'Con este nivel no habría habido ninguna intervención ese día.',
        columnas: [
          { clave: 'instante', titulo: 'Hora', numerica: true, formato: (v) => horaLocal(v) },
          { clave: 'accion', titulo: 'Acción', formato: (v, i) => el('span', {}, NOMBRE_ACCION[v] ?? v, ' ', crearChipNivel(i.nivel)) },
          { clave: 'objetivo', titulo: 'Sobre', formato: (v) => el('span', { class: 'cortar celda-larga', title: v }, textoObjetivo(v)) },
          { clave: 'item', titulo: 'En', formato: (_, i) => etiquetaItem(i.bloqueId ?? i.claseId) },
          { clave: 'motivo', titulo: 'Motivo', formato: (v) => NOMBRE_MOTIVO[v] ?? v },
          // El título y la URL completa van en el detalle (title): son datos locales (§7).
          { clave: 'titulo', titulo: 'Ventana', formato: (v, i) => el('span', { class: 'cortar celda-larga', title: [v, i.url].filter(Boolean).join('\n') }, v || i.app || '—') },
        ],
        filas: lista.slice(0, MAX_FILAS),
      }));

      nota.textContent = `Simulado en ${Math.round(performance.now() - t0)} ms (no se guarda: se recalcula cada vez).`;
    }

    recalcular();
  }

  cargar();
  return () => limpiezas.forEach((limpiar) => limpiar());
}
