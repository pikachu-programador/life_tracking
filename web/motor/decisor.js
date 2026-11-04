// Decisor (F4-05): qué hacer con una actividad en un momento dado (§11).
//
// Lo usan el simulador del dashboard y, más adelante, el agente. Por eso no conoce el reloj ni la red:
// "ahora" y todo lo demás entran por parámetro, y el mismo día con el mismo nivel da siempre lo mismo.
//
// Tres piezas:
//   decidir(entrada)              → Decision: permitir, aviso, fricción o bloqueo (puro: no cambia nada)
//   registrarDecision(estado, …)  → estado nuevo + las intervenciones que hay que guardar
//   concederPase(estado, …)       → estado nuevo tras un permiso (aviso) o un pase (fricción)
// El "estado" (EstadoIntervencion) es la memoria entre decisiones: pases vigentes, avisos contados por
// bloque, bloques que ya escalaron, comodines que quedan y la intervención en curso.

import { CLASE_DE_AW, REGEX_APP_NAVEGADOR } from './tipos.js';
import { NIVELES_INICIALES, nivelDeBloque } from './niveles.js';
import { regexDeAW } from './regex.js';

const MS_MIN = 60 * 1000;

// ── Lo que nunca se bloquea (§11) ──

/**
 * Procesos de Windows que nunca se bloquean ni se cierran (escritorio, inicio, búsqueda, bloqueo de
 * pantalla, UAC, administrador de tareas, configuración, teclado táctil…). Se comparan sin distinguir
 * mayúsculas. Ojo: ApplicationFrameHost.exe es el marco de las apps de la Tienda; cerrarlo cerraría todas.
 */
export const PROCESOS_SISTEMA = Object.freeze([
  'explorer.exe', 'SearchHost.exe', 'SearchApp.exe', 'SearchUI.exe', 'LockApp.exe', 'LogonUI.exe',
  'ShellExperienceHost.exe', 'StartMenuExperienceHost.exe', 'ShellHost.exe', 'Taskmgr.exe', 'dwm.exe',
  'ApplicationFrameHost.exe', 'SystemSettings.exe', 'SystemSettingsAdminFlows.exe', 'TextInputHost.exe',
  'PickerHost.exe', 'consent.exe', 'CredentialUIBroker.exe', 'winlogon.exe', 'csrss.exe', 'smss.exe',
  'wininit.exe', 'services.exe', 'lsass.exe', 'svchost.exe', 'sihost.exe', 'ctfmon.exe', 'fontdrvhost.exe',
  'RuntimeBroker.exe', 'SecurityHealthSystray.exe', 'SecHealthUI.exe', 'UserOOBEBroker.exe',
]);
const SISTEMA = new Set(PROCESOS_SISTEMA.map((app) => app.toLowerCase()));

/** Apps de ActivityWatch: aw-qt, aw-server, aw-server-rust, aw-tauri, aw-notify, aw-sync y todos los aw-watcher-*. */
const APPS_AW = /^(aw-(qt|server|server-rust|tauri|notify|sync|watcher-[a-z0-9_-]+)|activitywatch)(\.exe)?$/i;

/**
 * Título con el que se reconoce al agente. El agente es un proceso de Node (node.exe) y pone
 * `process.title = TITULO_AGENTE`, que en Windows es el título de su ventana de consola. Solo se protege
 * node.exe cuando el título lo identifica: otros programas de Node no quedan protegidos por eso.
 * Si algún día el agente se empaqueta como rastreador-agente.exe, ese nombre de app también se protege.
 */
export const TITULO_AGENTE = 'rastreador-agente';
const APP_AGENTE = /^rastreador-agente(\.exe)?$/i;
const APP_NODE = /^node(\.exe)?$/i;

/**
 * Direcciones que nunca se bloquean: el dashboard y las páginas de bloqueo (servidos por AW en :5600, con
 * los dos nombres, que para el navegador son orígenes distintos) y la API del agente (:5650).
 */
export const HOSTS_PROTEGIDOS = Object.freeze(['localhost:5600', '127.0.0.1:5600', 'localhost:5650', '127.0.0.1:5650']);
/** Por si la URL llega sin protocolo ("localhost:5600/pages/…"), que el constructor URL no entiende como host. */
const URL_PROTEGIDA = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:localhost|127\.0\.0\.1):(?:5600|5650)(?:[/?#]|$)/i;

/** 'C:\\Program Files\\x\\Chrome.exe' → 'chrome.exe' (en minúsculas y sin carpetas). */
function nombreDeApp(app) {
  if (typeof app !== 'string' || app === '') return null;
  return app.split(/[\\/]/).at(-1).toLowerCase() || null;
}

/** Host (con puerto) de una URL, o '' si no se puede leer. */
function hostDe(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Dominio de una URL, sin "www." ('https://www.youtube.com/watch?v=1' → 'youtube.com').
 * null si no hay URL o no tiene dominio (about:blank, file:///…).
 * @param {string|null} url  @returns {string|null}
 */
export function dominioDe(url) {
  if (typeof url !== 'string' || url === '') return null;
  try {
    const nombre = new URL(url).hostname.toLowerCase();
    return nombre.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Qué se bloquea o se permite: 'web:<dominio>' si hay una URL con dominio; si no, 'app:<app en minúsculas>'.
 * Sin app ni URL: 'app:desconocida'.
 * @param {import('./tipos.js').Actividad} actividad  @returns {string}
 */
export function objetivoDe(actividad) {
  const dominio = dominioDe(actividad?.url);
  if (dominio) return `web:${dominio}`;
  return `app:${nombreDeApp(actividad?.app) ?? 'desconocida'}`;
}

/**
 * ¿Es algo que nunca se bloquea? El dashboard y las páginas de bloqueo (localhost:5600 y 127.0.0.1:5600),
 * la API del agente, las apps de AW, el agente y los procesos del sistema. Sin distinguir mayúsculas.
 * @param {import('./tipos.js').Actividad} actividad  @returns {boolean}
 */
export function esProtegido(actividad) {
  const url = actividad?.url;
  if (typeof url === 'string' && url !== '') {
    if (HOSTS_PROTEGIDOS.includes(hostDe(url)) || URL_PROTEGIDA.test(url)) return true;
  }
  const app = nombreDeApp(actividad?.app);
  if (!app) return false;
  if (SISTEMA.has(app) || APPS_AW.test(app) || APP_AGENTE.test(app)) return true;
  const titulo = typeof actividad?.titulo === 'string' ? actividad.titulo.toLowerCase() : '';
  return APP_NODE.test(app) && titulo.includes(TITULO_AGENTE);
}

/** Regex de los navegadores de escritorio (las mismas que usa la consulta canónica de AW). */
const NAVEGADORES = Object.values(REGEX_APP_NAVEGADOR).map((texto) => regexDeAW(texto));

/**
 * ¿La app es un navegador? (REGEX_APP_NAVEGADOR de tipos.js: Chrome, Edge, Firefox, Brave, Opera, Vivaldi…)
 * @param {string|null} app  @returns {boolean}
 */
export function esAppNavegador(app) {
  const nombre = nombreDeApp(app);
  return nombre !== null && NAVEGADORES.some((regex) => regex.test(nombre));
}

/**
 * ¿Es un navegador sin la extensión? Si la actividad trae esNavegador y conExtension (el agente los sabe por
 * el latido de la extensión, §6.4), se usan esos; si no, se deducen: navegador = la app coincide con
 * REGEX_APP_NAVEGADOR, y con extensión = trae URL (en los datos de AW, un navegador sin extensión nunca la trae).
 */
function navegadorSinExtension(actividad) {
  const navegador = typeof actividad?.esNavegador === 'boolean' ? actividad.esNavegador : esAppNavegador(actividad?.app);
  if (!navegador) return false;
  const conExtension = typeof actividad?.conExtension === 'boolean'
    ? actividad.conExtension
    : typeof actividad?.url === 'string' && actividad.url !== '';
  return !conExtension;
}

/** Clase de una categoría de AW: ['Distracción', 'Video'] → 'distraccion'. Sin categoría o desconocida: 'sin-clasificar'. */
function claseDe(categoria) {
  if (!Array.isArray(categoria) || categoria.length === 0) return 'sin-clasificar';
  return CLASE_DE_AW[categoria[0]] ?? 'sin-clasificar';
}

// Las regex de la configuración se compilan una vez y se guardan aquí (el simulador decide miles de veces).
// Es solo una memoria de resultados: no cambia lo que devuelve decidir.
const compiladas = new Map();

/** RegExp de un patrón de la configuración, o null si no compila (un patrón roto se ignora: no debe tumbar al agente). */
function compilar(patron) {
  if (!compiladas.has(patron)) {
    let regex = null;
    try {
      // Sin distinguir mayúsculas: en Windows los nombres de app y los dominios no las distinguen.
      regex = regexDeAW(patron, { ignorarMayusculas: true });
    } catch {
      regex = null;
    }
    compiladas.set(patron, regex);
  }
  return compiladas.get(patron);
}

/** ¿Algún patrón coincide con alguno de los textos? */
function coincideAlguno(patrones, textos) {
  if (!Array.isArray(patrones)) return false;
  const validos = textos.filter((texto) => typeof texto === 'string' && texto !== '');
  return patrones.some((patron) => {
    const regex = typeof patron === 'string' && patron !== '' ? compilar(patron) : null;
    return regex !== null && validos.some((texto) => regex.test(texto));
  });
}

/**
 * Pase o permiso vigente (hasta > ahora) para un objetivo, o null.
 * @param {import('./tipos.js').EstadoIntervencion|null} estado
 * @returns {{objetivo: string, hasta: number, tipo: ('permiso'|'pase')}|null}
 */
export function paseVigente(estado, objetivo, ahora) {
  const pases = Array.isArray(estado?.pases) ? estado.pases : [];
  return pases.find((pase) => pase.objetivo === objetivo && pase.hasta > ahora) ?? null;
}

/** Acción de cada nivel cuando algo se tiene que intervenir. */
const ACCION_DE_NIVEL = { aviso: 'aviso', friccion: 'friccion', total: 'bloqueo' };

/**
 * Qué hacer con una actividad (§11). Puro: no cambia el estado. Pasos, en orden:
 *  1. Sin bloque activo y sin clase activa con usaPc → permitir ('fuera_de_bloque'): fuera de los bloques solo se mide.
 *  2. Nivel: el del bloque (nivelDeBloque); si el bloque ya escaló y su nivel era aviso, fricción. En una clase
 *     con usaPc (sin bloque) siempre aviso, sin escalar. 'ninguno' → permitir ('nivel_ninguno').
 *  3. Protegido (dashboard, páginas de bloqueo, agente, AW, sistema) → permitir ('protegido').
 *  4. IA → permitir ('ia').  5. nunca_bloquear (contra app, título y URL) → permitir ('nunca_bloquear').
 *  6. Bloqueable: Distracción ('distraccion'); URL que coincide con patrones_url ('patron_url'); en total, además,
 *     un navegador sin la extensión, sea cual sea su clase ('sin_extension': el agente no ve sus URLs, así que
 *     se cierra entero, §11) y lo Sin clasificar si total.bloquear_sin_clasificar ('sin_clasificar').
 *     Si no → permitir ('no_bloqueable'). Sin app ni URL no hay nada que bloquear → 'no_bloqueable'.
 *  7. Pase o permiso vigente para el objetivo → permitir ('pase_vigente'). En total no valen: no hay pases (§11).
 *  8. Si no: aviso → 'aviso', fricción → 'friccion', total → 'bloqueo'.
 * @param {import('./tipos.js').EntradaDecisor} entrada
 * @returns {import('./tipos.js').Decision}
 */
export function decidir({ actividad = null, bloque = null, clase = null, config = null, estado = null, ahora } = {}) {
  const cfg = config ?? NIVELES_INICIALES.base;
  const objetivo = objetivoDe(actividad);
  const permitir = (nivel, motivo) => ({ accion: 'permitir', nivel, objetivo, motivo });

  // 1 y 2. Bloque activo o, si no hay, clase con PC. El bloque manda sobre la clase (§6.7).
  let nivel;
  if (bloque) {
    nivel = nivelDeBloque(bloque, cfg);
    if (nivel === 'aviso' && estado?.escalados?.[bloque.id]) nivel = 'friccion';
  } else if (clase?.usaPc) {
    nivel = 'aviso';
  } else {
    return permitir('ninguno', 'fuera_de_bloque');
  }
  if (nivel === 'ninguno') return permitir(nivel, 'nivel_ninguno');

  // 3 a 5. Lo que nunca se bloquea.
  if (esProtegido(actividad)) return permitir(nivel, 'protegido');
  const clasificacion = claseDe(actividad?.categoria);
  if (clasificacion === 'ia') return permitir(nivel, 'ia');
  const textos = [actividad?.app, actividad?.titulo, actividad?.url];
  if (coincideAlguno(cfg.nunca_bloquear, textos)) return permitir(nivel, 'nunca_bloquear');

  // 6. ¿Es algo que este nivel bloquea?
  let motivo = null;
  const identificable = Boolean(nombreDeApp(actividad?.app) || dominioDe(actividad?.url));
  if (identificable) {
    if (clasificacion === 'distraccion') motivo = 'distraccion';
    else if (coincideAlguno(cfg.patrones_url, [actividad?.url])) motivo = 'patron_url';
    else if (nivel === 'total' && navegadorSinExtension(actividad)) motivo = 'sin_extension';
    else if (nivel === 'total' && clasificacion === 'sin-clasificar' && cfg.total?.bloquear_sin_clasificar !== false) motivo = 'sin_clasificar';
  }
  if (!motivo) return permitir(nivel, 'no_bloqueable');

  // 7. Permiso (tras un aviso) o pase (fricción) que todavía no vence.
  if (nivel !== 'total' && paseVigente(estado, objetivo, ahora)) return permitir(nivel, 'pase_vigente');

  // 8. Intervenir.
  return { accion: ACCION_DE_NIVEL[nivel], nivel, objetivo, motivo };
}

/**
 * Estado vacío para empezar a decidir (por ejemplo, al inicio de la semana o de una simulación).
 * @param {{comodines?: number}} [opciones]  comodines que quedan; por defecto, los de NIVELES_INICIALES (5)
 * @returns {import('./tipos.js').EstadoIntervencion}
 */
export function crearEstadoIntervencion({ comodines = NIVELES_INICIALES.base.friccion.comodines_semana } = {}) {
  return { pases: [], avisos: {}, escalados: {}, comodines, ultima: null };
}

/** Copia del estado (para no modificar el original), sin los pases que ya vencieron en `ahora`. */
function copiarEstado(estado, ahora) {
  const origen = estado ?? crearEstadoIntervencion();
  const pases = Array.isArray(origen.pases) ? origen.pases : [];
  return {
    pases: pases.filter((pase) => !Number.isFinite(ahora) || pase.hasta > ahora).map((pase) => ({ ...pase })),
    avisos: { ...origen.avisos },
    escalados: { ...origen.escalados },
    comodines: Number.isFinite(origen.comodines) ? origen.comodines : 0,
    ultima: origen.ultima ? { ...origen.ultima } : null,
  };
}

/** El ítem que manda en la decisión: el bloque si hay; si no, la clase. */
function itemQueManda(bloque, clase) {
  if (bloque) return { bloqueId: bloque.id ?? null, claseId: null, itemId: bloque.id ?? null };
  if (clase) return { bloqueId: null, claseId: clase.id ?? null, itemId: clase.id ?? null };
  return { bloqueId: null, claseId: null, itemId: null };
}

/** Arma una Intervencion (forma de §12 y tipos.js). */
function intervencion({ instante, bloqueId, claseId, nivel, accion, objetivo, actividad, motivo }) {
  return {
    instante,
    bloqueId,
    claseId,
    nivel,
    accion,
    objetivo,
    app: actividad?.app ?? null,
    url: actividad?.url ?? null,
    titulo: actividad?.titulo ?? null,
    motivo,
  };
}

/**
 * Anota una decisión en el estado y dice qué intervenciones guardar. No modifica `estado`.
 * - 'permitir': no registra nada; si cambió el objetivo, la intervención en curso termina (`ultima` = null).
 * - La misma intervención en curso (mismo objetivo, acción e ítem) no se registra otra vez: quedarse en la
 *   página de bloqueo no suma bloqueos. Volver al mismo sitio después de salir, sí.
 * - Cada 'aviso' suma uno al bloque (o a la clase). Al llegar a escalamiento.avisos_para_friccion en un BLOQUE
 *   se registra además un 'escalamiento' y el bloque queda en fricción. En las clases nunca se escala.
 * - De paso, quita los pases que ya vencieron.
 * @param {import('./tipos.js').EstadoIntervencion} estado
 * @param {import('./tipos.js').Decision} decision  la que devolvió decidir
 * @param {{bloque?: import('./tipos.js').BloqueDia|null, clase?: import('./tipos.js').ClaseDia|null,
 *          actividad?: import('./tipos.js').Actividad|null, ahora: number, config?: import('./tipos.js').ConfigNiveles}} contexto
 *        los mismos bloque, clase, actividad y config que se le pasaron a decidir
 * @returns {{estado: import('./tipos.js').EstadoIntervencion, intervenciones: import('./tipos.js').Intervencion[]}}
 */
export function registrarDecision(estado, decision, { bloque = null, clase = null, actividad = null, ahora, config = null } = {}) {
  const nuevo = copiarEstado(estado, ahora);
  if (!decision || decision.accion === 'permitir') {
    if (nuevo.ultima && nuevo.ultima.objetivo !== decision?.objetivo) nuevo.ultima = null;
    return { estado: nuevo, intervenciones: [] };
  }

  const { bloqueId, claseId, itemId } = itemQueManda(bloque, clase);
  const enCurso = nuevo.ultima;
  if (enCurso && enCurso.objetivo === decision.objetivo && enCurso.accion === decision.accion && enCurso.itemId === itemId) {
    return { estado: nuevo, intervenciones: [] };
  }

  const comun = { instante: ahora, bloqueId, claseId, objetivo: decision.objetivo, actividad };
  const intervenciones = [intervencion({ ...comun, nivel: decision.nivel, accion: decision.accion, motivo: decision.motivo })];

  if (decision.accion === 'aviso' && itemId !== null) {
    nuevo.avisos[itemId] = (nuevo.avisos[itemId] ?? 0) + 1;
    const umbral = umbralEscalamiento(config);
    if (bloque && !nuevo.escalados[bloque.id] && nuevo.avisos[itemId] >= umbral) {
      nuevo.escalados[bloque.id] = true;
      intervenciones.push(intervencion({ ...comun, nivel: 'friccion', accion: 'escalamiento', motivo: 'avisos_acumulados' }));
    }
  }

  nuevo.ultima = { objetivo: decision.objetivo, accion: decision.accion, itemId };
  return { estado: nuevo, intervenciones };
}

/** Avisos que suben un bloque a fricción (al menos 1; si la configuración no lo trae, el inicial: 3). */
function umbralEscalamiento(config) {
  const valor = config?.escalamiento?.avisos_para_friccion;
  return Number.isFinite(valor) ? Math.max(1, valor) : NIVELES_INICIALES.base.escalamiento.avisos_para_friccion;
}

/**
 * Concede un permiso (tras un aviso: "continuar") o un pase (fricción). No modifica `estado`.
 * - 'permiso': no gasta comodín y no se registra (el aviso ya quedó registrado).
 * - 'pase': gasta un comodín y registra una intervención 'pase' con su motivo. Sin comodines no hay pase:
 *   concedido = false y el estado no cambia.
 * Si ya había un pase para el objetivo, el nuevo lo reemplaza. La intervención en curso termina (`ultima` = null),
 * así, cuando el permiso o el pase venzan, la siguiente intervención se registra como nueva.
 * Con minutos ≤ 0 o datos que faltan, no se concede nada.
 * @param {import('./tipos.js').EstadoIntervencion} estado
 * @param {{objetivo: string, tipo: ('permiso'|'pase'), minutos: number, ahora: number,
 *          bloque?: import('./tipos.js').BloqueDia|null, clase?: import('./tipos.js').ClaseDia|null, motivo?: string,
 *          actividad?: import('./tipos.js').Actividad|null}} pedido
 *        actividad (opcional): para llenar app, url y título de la intervención 'pase'
 * @returns {{estado: import('./tipos.js').EstadoIntervencion, intervenciones: import('./tipos.js').Intervencion[], concedido: boolean}}
 */
export function concederPase(estado, { objetivo, tipo, minutos, ahora, bloque = null, clase = null, motivo = '', actividad = null } = {}) {
  const nada = { estado, intervenciones: [], concedido: false };
  if (typeof objetivo !== 'string' || objetivo === '') return nada;
  if (tipo !== 'permiso' && tipo !== 'pase') return nada;
  if (typeof minutos !== 'number' || !Number.isFinite(minutos) || minutos <= 0) return nada;
  if (typeof ahora !== 'number' || !Number.isFinite(ahora)) return nada;
  if (tipo === 'pase' && !(estado?.comodines > 0)) return nada;

  const nuevo = copiarEstado(estado, ahora);
  nuevo.pases = nuevo.pases.filter((pase) => pase.objetivo !== objetivo);
  nuevo.pases.push({ objetivo, hasta: ahora + minutos * MS_MIN, tipo });
  nuevo.ultima = null;

  const intervenciones = [];
  if (tipo === 'pase') {
    nuevo.comodines -= 1;
    const { bloqueId, claseId } = itemQueManda(bloque, clase);
    intervenciones.push(intervencion({ instante: ahora, bloqueId, claseId, nivel: 'friccion', accion: 'pase', objetivo, actividad, motivo }));
  }
  return { estado: nuevo, intervenciones, concedido: true };
}
