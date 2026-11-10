// Vista "Clasificación" (arquitectura §13, F2-07): en qué se va el tiempo según las categorías de AW.
//
// - Reparto por clase y un mapa de rectángulos por categoría (ECharts).
// - Apps y sitios más usados, por clase. Los sitios van por dominio y cada uno se despliega en sus URLs completas
//   (son datos locales: nunca salen de la PC, §7).
// - Lo más usado sin clasificar, con enlace al Asistente de categorización de AW.
// - Qué bloquea cada nivel (§11) y las reglas de AW que no compilan en JS (clasificador del motor).

import { el, reemplazar } from '../dom.js';
import { datos } from '../datos.js';
import { periodoLegible } from '../fechas.js';
import { duracionLegible, porcentajeLegible } from '../formato.js';
import { crearCabecera, textoDeError, prepararPeriodo } from '../componentes/vista.js';
import {
  crearTarjeta, crearCargando, crearError, crearVacio, crearFilaKpis, crearTabla, crearSegmentado, crearChipNivel,
  crearEtiqueta, crearCampo, crearAviso, crearBarraApilada, crearListaProporcional,
} from '../componentes/ui.js';
import { crearGrafico, colorDeClase, tooltipHtml, conAlfa } from '../graficos.js';
import { configuracionVigente } from '../../motor/niveles.js';
import { categorizar, claseDeCategoria } from '../../motor/clasificador.js';
import { sumarPorEstado } from '../../motor/segmentos.js';
import { CLASES, NOMBRE_ESTADO } from '../../motor/tipos.js';
import { masUsados, arbolDeCategorias, queBloquea } from '../calculos-vistas.js';
import { textoCategoria } from '../textos-plan.js';

export const titulo = 'Clasificación';

const LIMITE = 12;        // filas de cada lista de "más usados"
const LIMITE_URLS = 20;   // URLs que se muestran al desplegar un dominio
const META_SIN_CLASIFICAR = 0.15; // F0-04: lo Sin clasificar debería ser menos del 15 % del tiempo activo

/** Dibuja la vista dentro de `contenedor`. Parámetro propio: clase (filtro de "más usados"). */
export function render(contenedor, parametros) {
  const cabecera = crearCabecera({ titulo });
  const cuerpo = el('div', { class: 'vista-cuerpo' }, crearCargando({ filas: 6 }));
  contenedor.append(cabecera, cuerpo);
  const limpiezas = [];
  let clase = ['todas', ...CLASES].includes(parametros.get('clase')) ? parametros.get('clase') : 'todas';

  async function cargar() {
    try {
      const { hoy, periodo, selector } = await prepararPeriodo(parametros, { tipoPorDefecto: 'semana', rapidos: [7, 30] });
      reemplazar(cabecera.acciones, selector);
      limpiezas.push(() => selector.limpiar());
      cabecera.subtitulo.textContent = periodoLegible(periodo);
      const [dias, reglas, niveles] = await Promise.all([datos.segmentos(periodo.desde, periodo.hasta), datos.reglas(), datos.niveles()]);
      pintar({ segmentos: dias.flatMap((d) => d.segmentos), reglas, config: configuracionVigente(niveles, hoy) });
    } catch (error) {
      reemplazar(cuerpo, crearError(textoDeError(error), { reintentar: cargar }));
    }
  }

  function pintar({ segmentos, reglas, config }) {
    const porEstado = sumarPorEstado(segmentos);
    const activo = CLASES.reduce((suma, c) => suma + porEstado[c], 0);
    const parteSinClasificar = activo > 0 ? porEstado['sin-clasificar'] / activo : null;

    // ── Reparto por clase ──
    const kpis = crearFilaKpis([
      { etiqueta: 'Tiempo activo', valor: duracionLegible(activo), detalle: 'Las 5 clases de actividad (sin AFK ni Sin PC)' },
      ...['estudio', 'distraccion'].map((c) => ({
        etiqueta: NOMBRE_ESTADO[c], clave: c, valor: duracionLegible(porEstado[c]), detalle: activo ? `${porcentajeLegible(porEstado[c] / activo)} del tiempo activo` : undefined,
      })),
      { etiqueta: 'Sin clasificar', clave: 'sin-clasificar', valor: porcentajeLegible(parteSinClasificar),
        detalle: parteSinClasificar === null ? undefined : `${duracionLegible(porEstado['sin-clasificar'])} · ${parteSinClasificar < META_SIN_CLASIFICAR ? 'dentro de' : 'pasa'} la meta (menos de ${porcentajeLegible(META_SIN_CLASIFICAR)})` },
    ]);
    const arbol = arbolDeCategorias(segmentos);
    const lienzoArbol = el('div', { class: 'grafico', role: 'img',
      'aria-label': `Tiempo por categoría: ${arbol.map((r) => `${r.nombre}, ${duracionLegible(r.segundos)}`).join('; ') || 'sin datos'}` });
    const tarjetaReparto = crearTarjeta({
      titulo: 'Tiempo por categoría de AW',
      subtitulo: 'Cada rectángulo es una categoría; su tamaño es el tiempo. El color es el de su clase.',
      contenido: [
        crearBarraApilada(CLASES.map((c) => ({ clave: c, valor: porEstado[c] })), { titulo: 'Reparto del tiempo activo por clase', leyenda: true }),
        lienzoArbol,
      ],
    });

    // ── Más usados ──
    const zonaApps = el('div');
    const zonaSitios = el('div');
    const fila = (f) => ({
      nombre: `${f.nombre} · ${NOMBRE_ESTADO[f.clase]}`, valor: f.segundos, clave: f.clase, crudo: f.nombre,
      titulo: `${f.nombre}: ${CLASES.filter((c) => f.porEstado[c] > 0).map((c) => `${NOMBRE_ESTADO[c]} ${duracionLegible(f.porEstado[c])}`).join(' · ')}`,
    });
    const conOtros = (resultado) => [
      ...resultado.filas.map(fila),
      ...(resultado.otros > 0 ? [{ nombre: 'El resto', valor: resultado.otros, sinDetalle: true }] : []),
    ];
    function pintarMasUsados() {
      const apps = masUsados(segmentos, 'app', { clase, limite: LIMITE });
      const sitios = masUsados(segmentos, 'dominio', { clase, limite: LIMITE });
      reemplazar(zonaApps, crearListaProporcional(conOtros(apps), { total: apps.total, vacio: 'Ninguna app en este período.' }));
      reemplazar(zonaSitios, crearListaProporcional(
        // Cada dominio lleva sus URLs completas con su tiempo (se arman ya: son pocas filas).
        conOtros(sitios).map((f) => (f.sinDetalle ? f : {
          ...f,
          detalle: (() => {
            const urls = masUsados(segmentos, 'url', { clase, limite: LIMITE_URLS, filtro: (s) => s.dominio === f.crudo });
            return [
              ...urls.filas.map((u) => ({ texto: u.nombre, valor: u.segundos })),
              ...(urls.otros > 0 ? [{ texto: 'Otras URLs de este sitio', valor: urls.otros }] : []),
            ];
          })(),
        })),
        { total: sitios.total, vacio: 'Ningún sitio web en este período (¿falta aw-watcher-web?).' }));
    }
    const tarjetaMasUsados = crearTarjeta({
      titulo: 'Más usados',
      subtitulo: 'Cada fila dice su clase (la que más tiempo tuvo). Despliega un sitio para ver sus URLs completas.',
      acciones: crearSegmentado({
        etiqueta: 'Clase', valor: clase,
        opciones: [{ valor: 'todas', texto: 'Todas' }, ...CLASES.map((c) => ({ valor: c, texto: NOMBRE_ESTADO[c] }))],
        alCambiar: (valor) => {
          clase = valor;
          if (valor === 'todas') parametros.delete('clase'); else parametros.set('clase', valor);
          history.replaceState(null, '', `#/clasificacion?${parametros}`); // el mismo objeto `parametros`: el selector de período conserva la clase
          pintarMasUsados();
        },
      }),
      contenido: el('div', { class: 'grilla' },
        el('div', { class: 'ancho-6' }, el('h3', { class: 'tarjeta-titulo' }, 'Apps'), zonaApps),
        el('div', { class: 'ancho-6' }, el('h3', { class: 'tarjeta-titulo' }, 'Sitios (por dominio)'), zonaSitios)),
    });

    // ── Sin clasificar ──
    const sinClasificar = masUsados(segmentos, 'titulo', { clase: 'sin-clasificar', limite: LIMITE });
    const appDe = (tituloVentana) => segmentos.find((s) => s.clase === 'sin-clasificar' && s.titulo === tituloVentana)?.app ?? '';
    const tarjetaSinClasificar = crearTarjeta({
      titulo: 'Lo más usado sin clasificar', clase: 'ancho-6',
      subtitulo: 'Ventanas que ninguna regla reconoce. Agrégalas a una categoría en AW.',
      acciones: el('a', { class: 'boton boton-pequeno', href: '/#/category-builder', target: '_blank', rel: 'noopener' }, 'Abrir el Asistente de AW'),
      contenido: crearListaProporcional(
        sinClasificar.filas.map((f) => ({ nombre: f.nombre, valor: f.segundos, clave: 'sin-clasificar', titulo: `${appDe(f.nombre)} · ${f.nombre}` })),
        { total: sinClasificar.total, vacio: 'Nada sin clasificar en este período.' }),
    });

    // ── Qué bloquea cada nivel ──
    const bloquea = queBloquea(config);
    const lista = (items) => el('ul', { class: 'lista-simple' }, items.map((texto) => el('li', { class: 'envolver' }, texto)));
    const tarjetaNiveles = crearTarjeta({
      titulo: 'Qué bloquea cada nivel', clase: 'ancho-6',
      subtitulo: 'Solo dentro de un bloque (en clase con la laptop, siempre aviso). Con la configuración vigente hoy.',
      acciones: el('a', { class: 'boton boton-pequeno', href: '#/ajustes' }, 'Cambiar en Ajustes'),
      contenido: [
        crearTabla({
          descripcion: 'Qué se interviene en cada nivel',
          columnas: [
            { clave: 'nivel', titulo: 'Nivel', formato: (v) => crearChipNivel(v) },
            { clave: 'que', titulo: 'Se interviene', formato: (v) => lista(v) },
          ],
          filas: ['aviso', 'friccion', 'total'].map((nivel) => ({ nivel, que: bloquea[nivel] })),
        }),
        el('h3', { class: 'tarjeta-titulo subtitulo-seccion' }, 'Nunca se bloquea'),
        lista(bloquea.nunca),
      ],
    });

    // ── Reglas de AW ──
    const { compiladas, classes } = reglas;
    const resultadoPrueba = el('p', { class: 'resultado-prueba', 'aria-live': 'polite' }, 'Escribe una app, un título o una URL para ver qué categoría le toca.');
    const campos = { app: '', title: '', url: '' };
    function probar() {
      if (!campos.app && !campos.title && !campos.url) return;
      const categoria = categorizar({ app: campos.app, title: campos.title, ...(campos.url ? { url: campos.url } : {}) }, compiladas);
      const claseResultado = claseDeCategoria(categoria);
      reemplazar(resultadoPrueba, 'Categoría: ', crearEtiqueta(claseResultado, categoria[0] === 'Uncategorized' ? 'Sin clasificar' : textoCategoria(categoria)));
    }
    const campo = (clave, etiqueta, ejemplo) => crearCampo({
      etiqueta, atributos: { placeholder: ejemplo, oninput: (e) => { campos[clave] = e.target.value.trim(); probar(); } },
    });
    const tarjetaReglas = crearTarjeta({
      titulo: 'Reglas de categorías',
      subtitulo: `${classes.length} categorías en AW; ${compiladas.reglas.length} con regla. Se editan en AW → Ajustes → Categorización.`,
      contenido: [
        compiladas.errores.length
          ? [crearAviso('cuidado', `${compiladas.errores.length === 1 ? 'Hay una regla que' : `Hay ${compiladas.errores.length} reglas que`} no se pueden usar en el dashboard ni en el agente (AW sí las entiende). Mientras tanto, lo que reconocen cuenta como si esa regla no existiera.`, { titulo: 'Reglas que no compilan en JS' }),
            crearTabla({
              descripcion: 'Reglas que no compilan',
              columnas: [
                { clave: 'categoria', titulo: 'Categoría', formato: (v) => textoCategoria(v) },
                { clave: 'regex', titulo: 'Regla', formato: (v) => el('code', { class: 'envolver' }, v) },
                { clave: 'mensaje', titulo: 'Problema', formato: (v) => el('span', { class: 'envolver' }, v) },
              ],
              filas: compiladas.errores,
            })]
          : crearAviso('exito', classes.length ? 'Todas las reglas de AW se pueden usar en el dashboard y en el agente.' : 'AW todavía no tiene categorías: todo cuenta como Sin clasificar.'),
        el('h3', { class: 'tarjeta-titulo subtitulo-seccion' }, 'Probar una actividad'),
        el('div', { class: 'formulario-fila' }, campo('app', 'App', 'chrome.exe'), campo('title', 'Título de la ventana', 'Shorts - YouTube'), campo('url', 'URL (opcional)', 'https://www.youtube.com/shorts/…')),
        resultadoPrueba,
      ],
    });

    if (activo === 0) {
      reemplazar(cuerpo, crearVacio('Sin actividad en este período.', { detalle: 'Elige otro período o revisa que AW esté registrando.' }),
        el('div', { class: 'grilla' }, tarjetaNiveles, el('div', { class: 'ancho-6' }, tarjetaReglas)));
      return;
    }
    reemplazar(cuerpo, kpis, tarjetaReparto, tarjetaMasUsados, el('div', { class: 'grilla' }, tarjetaSinClasificar, tarjetaNiveles), tarjetaReglas);
    pintarMasUsados();

    // Mapa de rectángulos: un rectángulo por categoría, agrupados por clase.
    const grafico = crearGrafico(lienzoArbol, (c) => ({
      tooltip: {
        formatter: (p) => tooltipHtml({
          titulo: p.treePathInfo?.slice(1).map((n) => n.name).join(' > ') || p.name,
          filas: [{ color: p.color, nombre: 'Tiempo', valor: duracionLegible(p.value), fuerte: true },
            { nombre: 'Del tiempo activo', valor: porcentajeLegible(p.value / activo) }],
        }),
      },
      series: [{
        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
        left: 0, right: 0, top: 0, bottom: 0,
        label: { show: true, formatter: (p) => `${p.name}\n${duracionLegible(p.value)}`, color: c.texto, fontSize: 11, overflow: 'truncate' },
        upperLabel: { show: true, height: 20, color: c.texto, fontSize: 11, fontWeight: 600, formatter: (p) => `${p.name} · ${duracionLegible(p.value)}` },
        itemStyle: { borderColor: c.superficie, borderWidth: 2, gapWidth: 2 },
        levels: [{ itemStyle: { borderWidth: 0, gapWidth: 4 } }, { itemStyle: { gapWidth: 2 } }],
        data: arbol.map((raiz) => {
          const color = colorDeClase(raiz.clase, c);
          return {
            name: raiz.nombre, value: raiz.segundos,
            itemStyle: { color: conAlfa(color, 0.35), borderColor: conAlfa(color, 0.35) },
            children: raiz.hijos.map((h) => ({ name: h.nombre, value: h.segundos, itemStyle: { color: conAlfa(color, 0.75) } })),
          };
        }),
      }],
    }), { vacio: () => arbol.length === 0 });
    limpiezas.push(() => grafico.destruir());
  }

  cargar();
  return () => limpiezas.forEach((limpiar) => limpiar());
}
