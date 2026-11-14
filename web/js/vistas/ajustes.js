// Vista "Ajustes" (arquitectura §13, F4-09): niveles, listas, umbrales del plan, respaldo y estado de AW.
//
// Los niveles viven en el ajuste `rastreador-niveles` de AW. Cada cambio pasa por proponerCambio() del motor,
// que aplica la asimetría de §11: endurecer vale desde hoy; aflojar queda pendiente hasta el día lógico siguiente.
// Nadie "activa" lo pendiente: la configuración vigente de cada día la calcula el motor (configuracionVigente).

import { el, reemplazar } from '../dom.js';
import { datos } from '../datos.js';
import { reloj } from '../reloj.js';
import { fechaLegible, fechaCorta } from '../fechas.js';
import { crearCabecera, textoDeError } from '../componentes/vista.js';
import { crearTarjeta, crearCargando, crearError, crearAviso, crearTabla, crearCampo, crearChipNivel, crearEtiqueta, crearVacio } from '../componentes/ui.js';
import { exportarRespaldo, importarRespaldo, resumenDePlan } from '../componentes/respaldo.js';
import { configuracionVigente, proponerCambio, cambiosPendientes } from '../../motor/niveles.js';
import { NIVELES, NOMBRE_NIVEL } from '../../motor/tipos.js';
import { RAMPA_FOCO_INICIAL, umbralFoco, rampaVigente, rampaPendiente, proponerRampa, fechaDeMeta } from '../../motor/rampa.js';
import { porcentajeLegible } from '../formato.js';
import { CAMPOS_NIVELES, valorDeRuta, textoDeCambio } from '../calculos-vistas.js';
import { nombreCurso, colorCurso, textoRepeticion } from '../textos-plan.js';
import { nivelVigente } from './horario-editor.js';

export const titulo = 'Ajustes';

/** Umbrales del plan (§8). `porcentaje`: se guarda de 0 a 1 y se muestra de 0 a 100. */
const CAMPOS_UMBRALES = [
  { clave: 'tolerancia_inicio_min', nombre: 'Tolerancia de inicio (min)', ayuda: 'Minutos de margen antes de contar un bloque como "empezó tarde".' },
  { clave: 'foco_cumplido', nombre: 'Foco para "cumplido" (%)', porcentaje: true, ayuda: 'Estudio ÷ duración del bloque. Con la rampa del foco activa, manda la rampa.' },
  { clave: 'foco_parcial', nombre: 'Foco para "parcial" (%)', porcentaje: true, ayuda: 'Menor que el de "cumplido".' },
  { clave: 'dia_cumplido', nombre: 'Día cumplido (%)', porcentaje: true, ayuda: 'Desde qué % un día cuenta para la racha.' },
  { clave: 'hueco_sueno_h', nombre: 'Hueco que cuenta como sueño (h)', ayuda: 'Sin actividad durante este tiempo: ahí se corta el día lógico.' },
  { clave: 'peso_despertar_dormir_min', nombre: 'Peso de despertar y de dormir (min)', ayuda: 'Cuánto pesan en el % del día.' },
];

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const cabecera = crearCabecera({ titulo, subtitulo: 'Niveles de bloqueo, umbrales, respaldo y estado' });
  const mensajes = el('div', { class: 'vista-mensajes' });
  const cuerpo = el('div', { class: 'vista-cuerpo' }, crearCargando({ filas: 6 }));
  contenedor.append(cabecera, mensajes, cuerpo);
  let estado = null; // {plan, niveles, config, pendientes, hoy, aw}

  const decir = (tipo, texto) => reemplazar(mensajes, crearAviso(tipo, texto));

  async function cargar() {
    try {
      const [plan, niveles, hoy, aw] = await Promise.all([datos.plan(), datos.niveles(), datos.hoy(), datos.estadoAW()]);
      estado = { plan, niveles, hoy, aw, config: configuracionVigente(niveles, hoy), pendientes: cambiosPendientes(niveles, hoy) };
      pintar();
    } catch (error) {
      reemplazar(cuerpo, crearError(textoDeError(error), { reintentar: cargar }));
    }
  }

  /**
   * Propone un cambio de niveles y lo guarda. Dice si ya vale o si queda para mañana.
   * @param {string} ruta  @param {*} valor  @param {string} nombre  cómo se llama lo que cambia (para el mensaje)
   * @param {{nivelPlan?: string}} [extra]  en un bloque, su nivel del plan
   */
  async function cambiar(ruta, valor, nombre, extra = {}) {
    try {
      const cambio = proponerCambio(estado.niveles, ruta, valor, { hoy: estado.hoy, ahora: reloj.ahora(), ...extra });
      await datos.guardarNiveles(cambio.niveles);
      await cargar();
      if (cambio.tipo === 'afloja') decir('info', `${nombre}: el cambio afloja, así que se aplica mañana (${fechaLegible(cambio.aplicaDesde)}). Hoy sigue como estaba.`);
      else if (cambio.tipo === 'endurece') decir('exito', `${nombre}: el cambio endurece, así que ya está aplicado.`);
      else decir('exito', `${nombre}: queda como está hoy (si había un cambio pendiente, se canceló).`);
    } catch (error) {
      await cargar(); // vuelve a mostrar el valor vigente
      decir('error', `No se pudo cambiar "${nombre}": ${error?.message ?? error}`);
    }
  }

  const nombreBloque = (id) => {
    const bloque = estado.plan.bloques.find((b) => b.id === id);
    return bloque ? `${nombreCurso(estado.plan, bloque.curso)} (${textoRepeticion(bloque)})` : id;
  };
  /** "→ 20 min desde jue, 15 oct", si esa ruta tiene un cambio pendiente. */
  function notaPendiente(ruta) {
    const pendiente = estado.pendientes.find((c) => c.ruta === ruta);
    if (!pendiente) return null;
    const texto = textoDeCambio(pendiente, { nombreBloque, nombreNivel: NOMBRE_NIVEL }).split(': ').slice(1).join(': ');
    return el('p', { class: 'ajuste-pendiente' }, `Pendiente: ${texto}, desde ${fechaCorta(pendiente.aplica_desde)}.`);
  }

  function pintar() {
    const { plan, config, pendientes, aw } = estado;

    // ── Valores de cada nivel ──
    const filaNivel = (campo) => {
      const vigente = valorDeRuta(config, campo.ruta);
      const comunes = { etiqueta: campo.unidad ? `${campo.nombre} (${campo.unidad})` : campo.nombre, ayuda: `${campo.afloja} (queda para mañana); lo contrario vale desde hoy.` };
      let control;
      if (campo.tipo === 'booleano') {
        control = crearCampo({ ...comunes, tipo: 'checkbox', valor: vigente, alCambiar: (v) => cambiar(campo.ruta, v, campo.nombre) });
      } else if (campo.tipo === 'texto') {
        control = crearCampo({ ...comunes, valor: vigente, atributos: { maxlength: 200 }, alCambiar: (v) => cambiar(campo.ruta, v.trim(), campo.nombre) });
      } else {
        control = crearCampo({
          ...comunes, tipo: 'number', valor: vigente, atributos: { min: campo.minimo ?? 0, step: 1 },
          alCambiar: (v) => cambiar(campo.ruta, v.trim() === '' ? NaN : Number(v), campo.nombre),
        });
      }
      return el('div', { class: `ajuste${campo.tipo === 'texto' ? ' ajuste-ancho' : ''}` }, control, notaPendiente(campo.ruta));
    };
    const grupoNivel = (nivel) => el('section', { class: 'ajuste-grupo' },
      el('h3', { class: 'ajuste-grupo-titulo' }, crearChipNivel(nivel)),
      el('div', { class: 'ajustes-rejilla' }, CAMPOS_NIVELES.filter((c) => c.nivel === nivel).map(filaNivel)));
    const tarjetaNiveles = crearTarjeta({
      titulo: 'Valores de cada nivel',
      subtitulo: 'Cada valor se guarda al salir del campo. Endurecer vale desde hoy; aflojar, desde mañana.',
      contenido: ['aviso', 'friccion', 'total'].map(grupoNivel),
    });

    // ── Listas ──
    const tarjetaLista = (ruta, tituloLista, ayuda, ejemplo) => {
      const campo = crearCampo({ etiqueta: 'Un patrón por renglón (regex, como en AW)', tipo: 'textarea', valor: (config[ruta] ?? []).join('\n'), ayuda, atributos: { placeholder: ejemplo, spellcheck: 'false' } });
      const area = campo.querySelector('textarea');
      return crearTarjeta({
        titulo: tituloLista, clase: 'ancho-6',
        acciones: el('button', {
          class: 'boton boton-pequeno boton-primario', type: 'button',
          onclick: () => cambiar(ruta, area.value.split('\n').map((l) => l.trim()).filter(Boolean), tituloLista),
        }, 'Guardar lista'),
        contenido: [campo, notaPendiente(ruta)],
      });
    };

    // ── Nivel de cada bloque ──
    const tarjetaBloques = crearTarjeta({
      titulo: 'Nivel de cada bloque',
      subtitulo: 'Subir el nivel de un bloque vale desde hoy; bajarlo se aplica mañana.',
      contenido: crearTabla({
        descripcion: 'Nivel vigente de cada bloque del plan',
        vacio: 'El plan todavía no tiene bloques (se crean en Horario).',
        columnas: [
          // Un nombre de curso largo se corta con "…" (entero en el title) y "Cuándo" va en un renglón: así la tabla no ensancha la página.
          { clave: 'curso', titulo: 'Curso', formato: (v) => el('span', { class: 'cortar celda-larga', title: nombreCurso(plan, v) }, crearEtiqueta(colorCurso(plan, v) ?? 'neutral', nombreCurso(plan, v))) },
          { clave: 'cuando', titulo: 'Cuándo', formato: (_, b) => el('span', { class: 'cifra' }, textoRepeticion(b)) },
          { clave: 'vigente', titulo: 'Hoy', formato: (_, b) => crearChipNivel(nivelVigente(b, config)) },
          { clave: 'nivel', titulo: 'Cambiar a', formato: (_, b) => {
            const actual = nivelVigente(b, config);
            return el('div', {},
              el('select', {
                class: 'control control-chico', 'aria-label': `Nivel del bloque de ${nombreBloque(b.id)}`,
                onchange: (e) => cambiar(`bloques.${b.id}`, e.target.value, `Nivel de ${nombreBloque(b.id)}`, { nivelPlan: b.nivel }),
              }, NIVELES.map((n) => el('option', { value: n, selected: n === actual }, NOMBRE_NIVEL[n]))),
              notaPendiente(`bloques.${b.id}`));
          } },
        ],
        filas: plan.bloques,
      }),
    });

    // ── Cambios pendientes ──
    const tarjetaPendientes = crearTarjeta({
      titulo: 'Cambios pendientes',
      subtitulo: 'Lo que aflojaste y todavía no vale. Cancelar un cambio lo quita (eso endurece: es inmediato).',
      contenido: pendientes.length
        ? crearTabla({
          descripcion: `${pendientes.length} ${pendientes.length === 1 ? 'cambio pendiente' : 'cambios pendientes'}`,
          columnas: [
            { clave: 'ruta', titulo: 'Cambio', formato: (_, c) => el('span', { class: 'envolver' }, textoDeCambio(c, { nombreBloque, nombreNivel: NOMBRE_NIVEL })) },
            { clave: 'aplica_desde', titulo: 'Se aplica', formato: (v) => fechaLegible(v) },
            { clave: 'acciones', titulo: '', alinear: 'der', formato: (_, c) => el('button', {
              class: 'boton boton-pequeno', type: 'button',
              onclick: () => {
                // Proponer el valor que vale hoy reemplaza (y así cancela) el cambio pendiente de esa ruta.
                const bloque = c.ruta.startsWith('bloques.') ? plan.bloques.find((b) => `bloques.${b.id}` === c.ruta) : null;
                const hoyVale = bloque ? nivelVigente(bloque, config) : valorDeRuta(config, c.ruta);
                cambiar(c.ruta, hoyVale, 'Cambio pendiente', bloque ? { nivelPlan: bloque.nivel } : {});
              },
            }, 'Cancelar') },
          ],
          filas: pendientes,
        })
        : crearVacio('No hay cambios pendientes.', { compacto: true }),
    });

    // ── Umbrales del plan ──
    const camposUmbral = CAMPOS_UMBRALES.map((u) => {
      const valor = plan.umbrales[u.clave];
      return { u, campo: crearCampo({ etiqueta: u.nombre, tipo: 'number', valor: u.porcentaje ? Math.round(valor * 100) : valor, ayuda: u.ayuda, atributos: { min: 0, step: u.clave === 'hueco_sueno_h' ? 0.5 : 1, ...(u.porcentaje ? { max: 100 } : {}) } }) };
    });
    const tarjetaUmbrales = crearTarjeta({
      titulo: 'Umbrales del cumplimiento',
      subtitulo: 'Son parte del plan. Cambiarlos vuelve a calcular el cumplimiento de todos los días.',
      acciones: el('button', {
        class: 'boton boton-primario', type: 'button',
        onclick: async () => {
          const umbrales = {};
          for (const { u, campo } of camposUmbral) {
            const texto = campo.querySelector('input').value.trim();
            if (texto === '' || Number.isNaN(Number(texto))) return decir('error', `Falta un número en "${u.nombre}".`);
            umbrales[u.clave] = u.porcentaje ? Number(texto) / 100 : Number(texto);
          }
          try {
            // Los demás datos de los umbrales (la rampa del foco) se conservan.
            await datos.guardarPlan({ ...structuredClone(plan), umbrales: { ...structuredClone(plan.umbrales), ...umbrales } });
            await cargar();
            decir('exito', 'Umbrales guardados.');
          } catch (error) {
            decir('error', error?.errores ? error.errores.map((e) => e.mensaje).join(' ') : textoDeError(error));
          }
        },
      }, 'Guardar umbrales'),
      contenido: el('div', { class: 'ajustes-rejilla' }, camposUmbral.map(({ campo }) => el('div', { class: 'ajuste' }, campo))),
    });

    // ── Rampa del foco (arquitectura §8, v6.4) ──
    // El foco para "cumplido" empieza bajo y sube cada semana. Vive en el plan (umbrales.rampas_foco).
    const hoy = estado.hoy;
    const vigente = rampaVigente(plan.umbrales, hoy);
    const pendiente = rampaPendiente(plan.umbrales, hoy);
    const base = vigente ?? pendiente?.rampa ?? { inicio: hoy, ...RAMPA_FOCO_INICIAL };
    const puntos = (proporcion) => Math.round(proporcion * 1000) / 10; // 0.44 → 44
    const textoRampa = (r) => {
      const llega = fechaDeMeta(r);
      return `${porcentajeLegible(r.valor_inicial)} → ${porcentajeLegible(r.meta)}, +${String(puntos(r.paso_por_semana)).replace('.', ',')} ${puntos(r.paso_por_semana) === 1 ? 'punto' : 'puntos'} por semana desde el ${fechaCorta(r.inicio)}${llega ? ` (llega a la meta el ${fechaCorta(llega)})` : ' (con paso 0 no sube)'}`;
    };
    const camposRampa = {
      inicio: crearCampo({ etiqueta: 'Empieza', tipo: 'date', valor: base.inicio, ayuda: 'Desde este día se cuentan las semanas.' }),
      valor_inicial: crearCampo({ etiqueta: 'Foco inicial (%)', tipo: 'number', valor: puntos(base.valor_inicial), atributos: { min: 1, max: 100, step: 1 } }),
      meta: crearCampo({ etiqueta: 'Meta (%)', tipo: 'number', valor: puntos(base.meta), atributos: { min: 1, max: 100, step: 1 } }),
      paso_por_semana: crearCampo({ etiqueta: 'Sube por semana (puntos)', tipo: 'number', valor: puntos(base.paso_por_semana), atributos: { min: 0, max: 100, step: 0.5 } }),
    };
    /** Propone la rampa (o quitarla, con null), la guarda en el plan y dice si ya vale o si queda para mañana. */
    async function guardarRampa(rampa) {
      try {
        const cambio = proponerRampa(plan.umbrales, rampa, { hoy });
        await datos.guardarPlan({ ...structuredClone(plan), umbrales: cambio.umbrales });
        await cargar();
        const que = rampa ? 'La rampa' : 'Quitar la rampa';
        if (cambio.tipo === 'afloja') decir('info', `${que} pide menos foco algún día, así que se aplica mañana (${fechaLegible(cambio.aplicaDesde)}). Hoy sigue como estaba.`);
        else if (cambio.tipo === 'endurece') decir('exito', `${que} pide más foco, así que ya está aplicada. Hoy el foco para "cumplido" es ${porcentajeLegible(umbralFoco(cambio.umbrales, hoy))}.`);
        else decir('exito', 'La rampa queda como está hoy (si había un cambio pendiente, se canceló).');
      } catch (error) {
        decir('error', error?.errores ? error.errores.map((e) => e.mensaje).join(' ') : `No se pudo cambiar la rampa: ${error?.message ?? error}`);
      }
    }
    const tarjetaRampa = crearTarjeta({
      titulo: 'Rampa del foco',
      subtitulo: 'Para formar el hábito: el foco que pide un bloque para salir "cumplido" empieza bajo y sube cada semana. No baja si fallas, y cada día se mide con el umbral de su fecha.',
      acciones: [
        el('button', {
          class: 'boton boton-primario', type: 'button',
          onclick: () => {
            const numero = (clave) => Number(camposRampa[clave].querySelector('input').value);
            const texto = (clave) => camposRampa[clave].querySelector('input').value.trim();
            if (['valor_inicial', 'meta', 'paso_por_semana'].some((c) => texto(c) === '' || Number.isNaN(numero(c)))) return decir('error', 'Faltan números en la rampa del foco.');
            guardarRampa({ inicio: texto('inicio'), valor_inicial: numero('valor_inicial') / 100, meta: numero('meta') / 100, paso_por_semana: numero('paso_por_semana') / 100 });
          },
        }, vigente ? 'Guardar rampa' : 'Activar rampa'),
        (vigente || pendiente?.rampa) && el('button', { class: 'boton', type: 'button', onclick: () => guardarRampa(null) }, 'Quitar la rampa'),
      ],
      contenido: [
        crearAviso(vigente ? 'exito' : 'info',
          vigente ? `Rampa activa: ${textoRampa(vigente)}.` : `Sin rampa: vale el foco fijo de los umbrales (${porcentajeLegible(plan.umbrales.foco_cumplido)}).`,
          { titulo: `Hoy el foco para "cumplido" es ${porcentajeLegible(umbralFoco(plan.umbrales, hoy))}` }),
        pendiente && el('p', { class: 'ajuste-pendiente' }, `Pendiente desde ${fechaCorta(pendiente.aplica_desde)}: ${pendiente.rampa ? textoRampa(pendiente.rampa) : 'quitar la rampa'}.`),
        el('div', { class: 'ajustes-rejilla rampa-campos' }, Object.values(camposRampa).map((campo) => el('div', { class: 'ajuste' }, campo))),
        el('p', { class: 'campo-ayuda' }, 'Subir la exigencia vale desde hoy. Bajarla (activar una rampa más baja que el foco fijo, un paso más lento o empezar de nuevo) queda para mañana.'),
      ],
    });

    // ── Respaldo ──
    const tarjetaRespaldo = crearTarjeta({
      titulo: 'Respaldo', clase: 'ancho-6',
      subtitulo: `Plan actual: ${resumenDePlan(plan)}. El archivo JSON trae el plan y los niveles.`,
      contenido: el('div', { class: 'botonera' },
        el('button', { class: 'boton', type: 'button', onclick: () => exportarRespaldo().catch((e) => decir('error', textoDeError(e))) }, 'Exportar'),
        el('button', {
          class: 'boton', type: 'button',
          onclick: async () => {
            try {
              const { importado, mensaje } = await importarRespaldo();
              if (importado) { await cargar(); decir('exito', mensaje); }
            } catch (error) { decir('error', textoDeError(error)); }
          },
        }, 'Importar')),
      pie: 'Al importar, los niveles del archivo solo se restauran si aquí nunca se cambiaron (importar no sirve para aflojar en el acto).',
    });

    // ── Estado ──
    const propios = aw.buckets.filter((b) => String(b.id ?? '').startsWith('rastreador-'));
    const tarjetaEstado = crearTarjeta({
      titulo: 'Estado', clase: 'ancho-6',
      contenido: [
        aw.conectado
          ? crearAviso('exito', `Versión ${aw.version} · equipo "${aw.hostname}" · ${aw.buckets.length} buckets (${propios.length} del rastreador${propios.length ? ': ' + propios.map((b) => b.id).join(', ') : ''}).`, { titulo: 'ActivityWatch conectado' })
          : crearAviso('error', 'Revisa que esté abierto (ícono en la bandeja).', { titulo: 'ActivityWatch no responde' }),
        crearAviso('info', 'Todavía no existe (fase 6). Hasta entonces no hay bloqueo real: lo que habría pasado se ve en el Simulador.', { titulo: 'Agente de escritorio' }),
        el('p', { class: 'texto-suave texto-xs' }, 'Tema de estilo y componentes: ', el('a', { href: 'muestra.html' }, 'página de muestra'), '.'),
      ],
    });

    reemplazar(cuerpo,
      tarjetaNiveles,
      el('div', { class: 'grilla' },
        tarjetaLista('patrones_url', 'Patrones de URL extra', 'Se bloquean en todos los niveles, además de la clase Distracción. Agregar endurece; quitar afloja.', 'reddit\\.com/r/'),
        tarjetaLista('nunca_bloquear', 'Nunca bloquear', 'Apps o URLs que no se bloquean nunca. Agregar afloja; quitar endurece.', 'spotify')),
      tarjetaBloques, tarjetaPendientes, tarjetaUmbrales, tarjetaRampa,
      el('div', { class: 'grilla' }, tarjetaRespaldo, tarjetaEstado));
  }

  cargar();
}
