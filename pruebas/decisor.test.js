// Pruebas de web/motor/decisor.js: decidir, registrarDecision y concederPase (§11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidir, crearEstadoIntervencion, registrarDecision, concederPase,
  objetivoDe, dominioDe, esProtegido, esAppNavegador, paseVigente, PROCESOS_SISTEMA, TITULO_AGENTE,
} from '../web/motor/decisor.js';
import { configuracionVigente } from '../web/motor/niveles.js';
import { instanteLocal } from '../web/motor/fechas.js';

const FECHA = '2026-10-06';
const MIN = 60 * 1000;
const hora = (hhmm) => instanteLocal(FECHA, hhmm);
const AHORA = hora('17:30');

/** Congela un objeto entero: si el código lo modifica, la prueba falla con TypeError. */
function congelar(objeto) {
  for (const valor of Object.values(objeto)) if (valor && typeof valor === 'object') congelar(valor);
  return Object.freeze(objeto);
}

/** BloqueDia armado a mano (17:00–19:00). */
function bloque(nivel, extra = {}) {
  return {
    id: `b-dbp-mar@${FECHA}`, bloqueId: 'b-dbp-mar', tipo: 'estudio_pc', curso: 'dbp',
    inicio: hora('17:00'), fin: hora('19:00'), finPlan: hora('19:00'), nivel, subidoPorExcepcion: false,
    objetivo: 'Avanzar el frontend', porQue: 'Prioridad alta', terminadoAntes: null, ...extra,
  };
}

/** ClaseDia armada a mano (14:00–16:00). */
function clase(usaPc = true) {
  return {
    id: `c-dbp-mar-1400@${FECHA}`, claseId: 'c-dbp-mar-1400', curso: 'dbp', tipo: 'laboratorio',
    inicio: hora('14:00'), fin: hora('16:00'), lugar: 'UTEC', usaPc,
  };
}

const YOUTUBE = { app: 'chrome.exe', titulo: 'Video gracioso - YouTube', url: 'https://www.youtube.com/watch?v=abc', categoria: ['Distracción', 'Video'] };
const CODE = { app: 'Code.exe', titulo: 'app.js - proyecto', url: null, categoria: ['Estudio', 'Programación'] };
const SPOTIFY = { app: 'Spotify.exe', titulo: 'Música', url: null, categoria: ['Neutral', 'Otros'] };
const RARO = { app: 'herramienta.exe', titulo: 'Ventana', url: null, categoria: ['Uncategorized'] };

const CONFIG = configuracionVigente(null, FECHA);
const config = (cambios = {}) => ({ ...structuredClone(CONFIG), ...cambios });

/** decidir con valores por defecto: bloque en `nivel`, estado vacío, ahora = 17:30. */
function decidirEn(nivel, actividad, extra = {}) {
  return decidir({
    actividad, bloque: nivel ? bloque(nivel) : null, clase: null,
    config: CONFIG, estado: crearEstadoIntervencion({ comodines: 5 }), ahora: AHORA, ...extra,
  });
}

// ── decidir ──

test('fuera de un bloque (y en clases sin PC) se permite todo: solo se mide', () => {
  assert.deepEqual(decidirEn(null, YOUTUBE), { accion: 'permitir', nivel: 'ninguno', objetivo: 'web:youtube.com', motivo: 'fuera_de_bloque' });
  assert.equal(decidirEn(null, YOUTUBE, { clase: clase(false) }).motivo, 'fuera_de_bloque');
});

test('bloque en nivel ninguno: permitir', () => {
  const d = decidirEn('ninguno', YOUTUBE);
  assert.equal(d.accion, 'permitir');
  assert.equal(d.motivo, 'nivel_ninguno');
});

test('cada nivel con Distracción: aviso, fricción y bloqueo', () => {
  assert.deepEqual(decidirEn('aviso', YOUTUBE), { accion: 'aviso', nivel: 'aviso', objetivo: 'web:youtube.com', motivo: 'distraccion' });
  assert.deepEqual(decidirEn('friccion', YOUTUBE), { accion: 'friccion', nivel: 'friccion', objetivo: 'web:youtube.com', motivo: 'distraccion' });
  assert.deepEqual(decidirEn('total', YOUTUBE), { accion: 'bloqueo', nivel: 'total', objetivo: 'web:youtube.com', motivo: 'distraccion' });
});

test('Estudio y Neutral no se bloquean en ningún nivel', () => {
  for (const nivel of ['aviso', 'friccion', 'total']) {
    assert.equal(decidirEn(nivel, CODE).motivo, 'no_bloqueable');
    assert.equal(decidirEn(nivel, SPOTIFY).motivo, 'no_bloqueable');
  }
});

test('el nivel elegido en la configuración y la excepción mandan sobre el del plan', () => {
  assert.equal(decidirEn('aviso', YOUTUBE, { config: config({ bloques: { 'b-dbp-mar': 'total' } }) }).accion, 'bloqueo');
  assert.equal(decidirEn('total', YOUTUBE, { config: config({ bloques: { 'b-dbp-mar': 'ninguno' } }) }).accion, 'permitir');
  const subido = decidir({ actividad: YOUTUBE, bloque: bloque('aviso', { subidoPorExcepcion: true }), config: config({ bloques: { 'b-dbp-mar': 'ninguno' } }), estado: crearEstadoIntervencion(), ahora: AHORA });
  assert.equal(subido.accion, 'bloqueo');
});

test('un bloque en aviso que ya escaló decide como fricción', () => {
  const estado = { ...crearEstadoIntervencion(), escalados: { [`b-dbp-mar@${FECHA}`]: true } };
  const d = decidirEn('aviso', YOUTUBE, { estado });
  assert.equal(d.accion, 'friccion');
  assert.equal(d.nivel, 'friccion');
  // El escalamiento no baja un bloque que ya estaba en total.
  assert.equal(decidirEn('total', YOUTUBE, { estado }).accion, 'bloqueo');
});

test('en una clase con PC siempre es aviso, aunque haya avisos acumulados', () => {
  const c = clase(true);
  const estado = { ...crearEstadoIntervencion(), avisos: { [c.id]: 10 }, escalados: { [c.id]: true } };
  const d = decidir({ actividad: YOUTUBE, bloque: null, clase: c, config: CONFIG, estado, ahora: AHORA });
  assert.deepEqual(d, { accion: 'aviso', nivel: 'aviso', objetivo: 'web:youtube.com', motivo: 'distraccion' });
});

test('si hay bloque y clase a la vez, manda el bloque', () => {
  const d = decidir({ actividad: YOUTUBE, bloque: bloque('total'), clase: clase(true), config: CONFIG, estado: crearEstadoIntervencion(), ahora: AHORA });
  assert.equal(d.accion, 'bloqueo');
});

test('protegidos: dashboard, páginas de bloqueo, AW, el agente y el sistema nunca se bloquean', () => {
  const distraccion = { categoria: ['Distracción', 'Video'], titulo: 'x' }; // aunque una regla los marque como Distracción
  const protegidos = [
    { ...distraccion, app: 'chrome.exe', url: 'http://localhost:5600/pages/rastreador/' },
    { ...distraccion, app: 'chrome.exe', url: 'http://localhost:5600/pages/rastreador/#/hoy' },
    { ...distraccion, app: 'msedge.exe', url: 'http://127.0.0.1:5600/pages/rastreador/bloqueo/total.html?b=1' },
    { ...distraccion, app: 'chrome.exe', url: 'http://LOCALHOST:5600/' },
    { ...distraccion, app: 'chrome.exe', url: 'localhost:5600/pages/rastreador/' },
    { ...distraccion, app: 'chrome.exe', url: 'http://127.0.0.1:5650/estado' },
    { ...distraccion, app: 'aw-qt.exe', url: null },
    { ...distraccion, app: 'AW-QT.EXE', url: null },
    { ...distraccion, app: 'aw-server-rust.exe', url: null },
    { ...distraccion, app: 'aw-watcher-window.exe', url: null },
    { ...distraccion, app: 'explorer.exe', url: null },
    { ...distraccion, app: 'taskmgr.exe', url: null },
    { ...distraccion, app: 'C:\\Windows\\System32\\LockApp.exe', url: null },
    { ...distraccion, app: 'node.exe', titulo: `${TITULO_AGENTE} (en marcha)`, url: null },
  ];
  for (const actividad of protegidos) {
    assert.equal(esProtegido(actividad), true, JSON.stringify(actividad));
    const d = decidirEn('total', actividad);
    assert.equal(d.accion, 'permitir');
    assert.equal(d.motivo, 'protegido');
  }
  // Lo que se parece pero no es protegido.
  const noProtegidos = [
    { ...distraccion, app: 'chrome.exe', url: 'http://localhost:3000/' },
    { ...distraccion, app: 'chrome.exe', url: 'http://localhost:5600@ejemplo.com/' },
    { ...distraccion, app: 'chrome.exe', url: 'https://ejemplo.com/?ir=localhost:5600' },
    { ...distraccion, app: 'node.exe', titulo: 'otro script', url: null },
    { ...distraccion, app: 'awesome-game.exe', url: null },
  ];
  for (const actividad of noProtegidos) {
    assert.equal(esProtegido(actividad), false, JSON.stringify(actividad));
    assert.equal(decidirEn('total', actividad).accion, 'bloqueo', JSON.stringify(actividad));
  }
});

test('la lista de procesos del sistema trae los esenciales', () => {
  for (const app of ['explorer.exe', 'SearchHost.exe', 'LockApp.exe', 'ShellExperienceHost.exe', 'StartMenuExperienceHost.exe',
    'Taskmgr.exe', 'dwm.exe', 'ApplicationFrameHost.exe', 'SystemSettings.exe', 'TextInputHost.exe', 'PickerHost.exe',
    'winlogon.exe', 'csrss.exe', 'consent.exe']) {
    assert.ok(PROCESOS_SISTEMA.includes(app), app);
  }
  assert.ok(Object.isFrozen(PROCESOS_SISTEMA));
});

test('la IA nunca se bloquea, aunque su URL coincida con un patrón', () => {
  const claude = { app: 'chrome.exe', titulo: 'Claude', url: 'https://claude.ai/chat/1', categoria: ['IA'] };
  const cfg = config({ patrones_url: ['claude\\.ai'] });
  for (const nivel of ['aviso', 'friccion', 'total']) {
    const d = decidirEn(nivel, claude, { config: cfg });
    assert.equal(d.accion, 'permitir');
    assert.equal(d.motivo, 'ia');
  }
});

test('nunca_bloquear se prueba contra app y URL, no contra el título (sin distinguir mayúsculas)', () => {
  const cfg = config({ nunca_bloquear: ['^obsidian\\.exe$', 'clase grabada', 'youtube\\.com/watch\\?v=abc'] });
  const obsidian = { app: 'Obsidian.exe', titulo: 'Notas', url: null, categoria: ['Distracción', 'Otros'] };
  // El título lo decide cada web: "Clase Grabada…" en el título NO alcanza para no bloquear (revisión de F4-05).
  const porTitulo = { ...YOUTUBE, url: 'https://www.youtube.com/watch?v=otro', titulo: 'Clase Grabada de DBP - YouTube' };
  assert.equal(decidirEn('total', porTitulo, { config: cfg }).accion, 'bloqueo');
  for (const actividad of [obsidian, YOUTUBE]) {
    const d = decidirEn('total', actividad, { config: cfg });
    assert.equal(d.motivo, 'nunca_bloquear', JSON.stringify(actividad));
  }
  assert.equal(decidirEn('total', { ...YOUTUBE, url: 'https://www.youtube.com/watch?v=otro' }, { config: cfg }).accion, 'bloqueo');
});

test('un patrón que no compila se ignora sin romper la decisión', () => {
  const cfg = config({ nunca_bloquear: ['(sin cerrar'], patrones_url: ['[mal'] });
  assert.equal(decidirEn('aviso', YOUTUBE, { config: cfg }).accion, 'aviso');
  assert.equal(decidirEn('aviso', SPOTIFY, { config: cfg }).accion, 'permitir');
});

test('patrones de URL extra se bloquean en todos los niveles (solo contra la URL)', () => {
  const cfg = config({ patrones_url: ['youtube\\.com/shorts'] });
  const shorts = { app: 'chrome.exe', titulo: 'Shorts', url: 'https://www.youtube.com/shorts/xyz', categoria: ['Neutral', 'Otros'] };
  assert.deepEqual(decidirEn('aviso', shorts, { config: cfg }), { accion: 'aviso', nivel: 'aviso', objetivo: 'web:youtube.com', motivo: 'patron_url' });
  assert.equal(decidirEn('friccion', shorts, { config: cfg }).accion, 'friccion');
  assert.equal(decidirEn('total', shorts, { config: cfg }).accion, 'bloqueo');
  // El patrón no se prueba contra el título.
  const titulo = { app: 'chrome.exe', titulo: 'youtube.com/shorts', url: 'https://www.youtube.com/watch?v=1', categoria: ['Neutral', 'Otros'] };
  assert.equal(decidirEn('aviso', titulo, { config: cfg }).accion, 'permitir');
});

test('Sin clasificar se bloquea solo en total (y solo si bloquear_sin_clasificar)', () => {
  assert.equal(decidirEn('aviso', RARO).motivo, 'no_bloqueable');
  assert.equal(decidirEn('friccion', RARO).motivo, 'no_bloqueable');
  assert.deepEqual(decidirEn('total', RARO), { accion: 'bloqueo', nivel: 'total', objetivo: 'app:herramienta.exe', motivo: 'sin_clasificar' });
  // Sin categoría o con un primer nivel desconocido también es Sin clasificar.
  assert.equal(decidirEn('total', { ...RARO, categoria: null }).motivo, 'sin_clasificar');
  assert.equal(decidirEn('total', { ...RARO, categoria: ['Otra cosa'] }).motivo, 'sin_clasificar');
  const cfg = config({ total: { ...CONFIG.total, bloquear_sin_clasificar: false } });
  assert.equal(decidirEn('total', RARO, { config: cfg }).motivo, 'no_bloqueable');
});

test('navegador sin la extensión: en total se bloquea entero, sea cual sea su clase', () => {
  // Edge sin extensión: AW solo ve la ventana (app y título), nunca la URL.
  const edgeEstudio = { app: 'msedge.exe', titulo: 'Documentación de Spring - Edge', url: null, categoria: ['Estudio', 'Programación'] };
  const edgeVideo = { ...edgeEstudio, titulo: 'Video - YouTube - Edge', categoria: ['Distracción', 'Video'] };
  assert.deepEqual(decidirEn('total', edgeEstudio), { accion: 'bloqueo', nivel: 'total', objetivo: 'app:msedge.exe', motivo: 'sin_extension' });
  assert.equal(decidirEn('total', { ...edgeEstudio, categoria: ['Uncategorized'] }).motivo, 'sin_extension');
  // Si además es Distracción, el motivo es la distracción.
  assert.equal(decidirEn('total', edgeVideo).motivo, 'distraccion');
  // En aviso y fricción no se mira la extensión.
  assert.equal(decidirEn('aviso', edgeEstudio).accion, 'permitir');
  assert.equal(decidirEn('friccion', edgeEstudio).accion, 'permitir');
  // Con URL (la extensión funciona) es una web más.
  assert.equal(decidirEn('total', { ...edgeEstudio, url: 'https://spring.io/guias' }).accion, 'permitir');
  // Lo que nunca se bloquea sigue ganando: la IA y nunca_bloquear.
  assert.equal(decidirEn('total', { ...edgeEstudio, categoria: ['IA'] }).motivo, 'ia');
  assert.equal(decidirEn('total', edgeEstudio, { config: config({ nunca_bloquear: ['^msedge\\.exe$'] }) }).motivo, 'nunca_bloquear');
  // Una app que no es navegador y no trae URL no cuenta.
  assert.equal(decidirEn('total', CODE).accion, 'permitir');
});

test('esNavegador y conExtension, si vienen en la actividad, mandan sobre lo deducido', () => {
  const chrome = { app: 'chrome.exe', titulo: 'Nueva pestaña', url: null, categoria: ['Neutral', 'Otros'] };
  // El agente sabe por el latido que Chrome tiene la extensión, aunque esta ventana no traiga URL.
  assert.equal(decidirEn('total', { ...chrome, conExtension: true }).accion, 'permitir');
  assert.equal(decidirEn('total', chrome).motivo, 'sin_extension');
  // Y al revés: un navegador que la regex no conoce, marcado por el agente.
  const raro = { app: 'navegador-nuevo.exe', titulo: 'x', url: null, categoria: ['Neutral', 'Otros'] };
  assert.equal(decidirEn('total', raro).accion, 'permitir');
  assert.equal(decidirEn('total', { ...raro, esNavegador: true, conExtension: false }).motivo, 'sin_extension');
  assert.equal(decidirEn('total', { ...chrome, esNavegador: false }).accion, 'permitir');
});

test('esAppNavegador reconoce los navegadores de REGEX_APP_NAVEGADOR', () => {
  for (const app of ['chrome.exe', 'Chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) {
    assert.equal(esAppNavegador(app), true, app);
  }
  for (const app of ['Code.exe', 'explorer.exe', null, '']) assert.equal(esAppNavegador(app), false, String(app));
});

test('sin app ni URL no hay nada que bloquear', () => {
  const nada = { app: null, titulo: null, url: null, categoria: null };
  const d = decidirEn('total', nada);
  assert.equal(d.accion, 'permitir');
  assert.equal(d.motivo, 'no_bloqueable');
  assert.equal(d.objetivo, 'app:desconocida');
  assert.equal(decidirEn('total', null).motivo, 'no_bloqueable');
});

test('pase o permiso vigente: permitir en aviso y fricción; vencido o en total, no', () => {
  const estado = { ...crearEstadoIntervencion(), pases: [{ objetivo: 'web:youtube.com', hasta: AHORA + 5 * MIN, tipo: 'pase' }] };
  assert.equal(decidirEn('aviso', YOUTUBE, { estado }).motivo, 'pase_vigente');
  assert.equal(decidirEn('friccion', YOUTUBE, { estado }).motivo, 'pase_vigente');
  assert.equal(decidirEn('total', YOUTUBE, { estado }).accion, 'bloqueo');
  // Vence justo en `ahora`: ya no vale.
  assert.equal(decidirEn('friccion', YOUTUBE, { estado, ahora: AHORA + 5 * MIN }).accion, 'friccion');
  // Un pase de otro objetivo no sirve.
  assert.equal(decidirEn('friccion', { ...YOUTUBE, url: 'https://x.com/inicio' }, { estado }).accion, 'friccion');
});

test('objetivo: web:<dominio sin www> o app:<app en minúsculas>', () => {
  assert.equal(objetivoDe(YOUTUBE), 'web:youtube.com');
  assert.equal(objetivoDe({ app: 'chrome.exe', url: 'https://m.facebook.com/x' }), 'web:m.facebook.com');
  assert.equal(objetivoDe({ app: 'Steam.exe', url: null }), 'app:steam.exe');
  assert.equal(objetivoDe({ app: 'chrome.exe', url: 'about:blank' }), 'app:chrome.exe');
  assert.equal(objetivoDe({ app: 'chrome.exe', url: 'no es una url' }), 'app:chrome.exe');
  assert.equal(objetivoDe(null), 'app:desconocida');
  assert.equal(dominioDe('https://WWW.YouTube.com/'), 'youtube.com');
  assert.equal(dominioDe(null), null);
});

test('decidir no modifica su entrada', () => {
  const entrada = congelar({
    actividad: YOUTUBE, bloque: bloque('aviso'), clase: null, config: CONFIG,
    estado: { ...crearEstadoIntervencion(), pases: [{ objetivo: 'web:x.com', hasta: AHORA + MIN, tipo: 'pase' }] }, ahora: AHORA,
  });
  assert.equal(decidir(entrada).accion, 'aviso');
});

// ── crearEstadoIntervencion ──

test('crearEstadoIntervencion: estado vacío con los comodines pedidos', () => {
  assert.deepEqual(crearEstadoIntervencion({ comodines: 2 }), { pases: [], avisos: {}, escalados: {}, comodines: 2, ultima: null });
  assert.equal(crearEstadoIntervencion().comodines, 5);
});

// ── registrarDecision ──

/** Decide y registra en un paso (como hará el agente). */
function paso(estado, actividad, ahora, { b = bloque('aviso'), c = null, cfg = CONFIG } = {}) {
  const decision = decidir({ actividad, bloque: b, clase: c, config: cfg, estado, ahora });
  return { decision, ...registrarDecision(estado, decision, { bloque: b, clase: c, actividad, ahora, config: cfg }) };
}

test('permitir no registra nada; termina la intervención en curso si cambió el objetivo', () => {
  const inicial = { ...crearEstadoIntervencion(), ultima: { objetivo: 'web:youtube.com', accion: 'aviso', itemId: `b-dbp-mar@${FECHA}` } };
  const mismo = registrarDecision(inicial, { accion: 'permitir', nivel: 'aviso', objetivo: 'web:youtube.com', motivo: 'pase_vigente' }, { ahora: AHORA });
  assert.deepEqual(mismo.intervenciones, []);
  assert.deepEqual(mismo.estado.ultima, inicial.ultima);
  const otro = registrarDecision(inicial, { accion: 'permitir', nivel: 'aviso', objetivo: 'app:code.exe', motivo: 'no_bloqueable' }, { ahora: AHORA });
  assert.deepEqual(otro.intervenciones, []);
  assert.equal(otro.estado.ultima, null);
});

test('registra la intervención con la forma de §12 y no repite la que está en curso', () => {
  let estado = crearEstadoIntervencion();
  const r1 = paso(estado, YOUTUBE, AHORA, { b: bloque('total') });
  assert.deepEqual(r1.intervenciones, [{
    instante: AHORA, bloqueId: `b-dbp-mar@${FECHA}`, claseId: null, nivel: 'total', accion: 'bloqueo',
    objetivo: 'web:youtube.com', app: 'chrome.exe', url: 'https://www.youtube.com/watch?v=abc',
    titulo: 'Video gracioso - YouTube', motivo: 'distraccion',
  }]);
  estado = r1.estado;
  assert.deepEqual(estado.ultima, { objetivo: 'web:youtube.com', accion: 'bloqueo', itemId: `b-dbp-mar@${FECHA}` });
  // Sigue en YouTube (otro video): misma intervención en curso.
  const r2 = paso(estado, { ...YOUTUBE, url: 'https://www.youtube.com/watch?v=otro' }, AHORA + MIN, { b: bloque('total') });
  assert.deepEqual(r2.intervenciones, []);
  // Sale a estudiar y vuelve: es un intento nuevo.
  const r3 = paso(r2.estado, CODE, AHORA + 2 * MIN, { b: bloque('total') });
  const r4 = paso(r3.estado, YOUTUBE, AHORA + 3 * MIN, { b: bloque('total') });
  assert.equal(r4.intervenciones.length, 1);
  // Otro sitio de distracción, sin pasar por algo permitido: también es nuevo.
  const r5 = paso(r4.estado, { ...YOUTUBE, url: 'https://x.com/inicio' }, AHORA + 4 * MIN, { b: bloque('total') });
  assert.equal(r5.intervenciones.length, 1);
});

test('la misma web en otro bloque es una intervención nueva', () => {
  const r1 = paso(crearEstadoIntervencion(), YOUTUBE, AHORA, { b: bloque('total') });
  const otroBloque = bloque('total', { id: `b-otro@${FECHA}`, bloqueId: 'b-otro' });
  const r2 = paso(r1.estado, YOUTUBE, AHORA + MIN, { b: otroBloque });
  assert.equal(r2.intervenciones.length, 1);
  assert.equal(r2.intervenciones[0].bloqueId, `b-otro@${FECHA}`);
});

test('escalamiento: 3 avisos en un bloque lo suben a fricción', () => {
  const id = `b-dbp-mar@${FECHA}`;
  let estado = crearEstadoIntervencion({ comodines: 5 });
  const acciones = [];
  // Tres veces: entra a YouTube (aviso) y vuelve a estudiar.
  for (let i = 0; i < 3; i++) {
    const r = paso(estado, YOUTUBE, AHORA + i * 2 * MIN);
    acciones.push(...r.intervenciones.map((x) => x.accion));
    estado = paso(r.estado, CODE, AHORA + (i * 2 + 1) * MIN).estado;
  }
  assert.deepEqual(acciones, ['aviso', 'aviso', 'aviso', 'escalamiento']);
  assert.equal(estado.avisos[id], 3);
  assert.equal(estado.escalados[id], true);
  // El cuarto intento ya es fricción, con nivel efectivo 'friccion'.
  const cuarto = paso(estado, YOUTUBE, AHORA + 10 * MIN);
  assert.equal(cuarto.decision.accion, 'friccion');
  assert.deepEqual(cuarto.intervenciones.map((x) => [x.accion, x.nivel]), [['friccion', 'friccion']]);
});

test('la intervención de escalamiento lleva nivel fricción y no se repite', () => {
  let estado = crearEstadoIntervencion();
  const escalamientos = [];
  for (let i = 0; i < 6; i++) {
    const r = paso(estado, YOUTUBE, AHORA + i * 2 * MIN, { b: bloque('aviso') });
    escalamientos.push(...r.intervenciones.filter((x) => x.accion === 'escalamiento'));
    estado = paso(r.estado, CODE, AHORA + (i * 2 + 1) * MIN).estado;
  }
  assert.equal(escalamientos.length, 1);
  assert.equal(escalamientos[0].nivel, 'friccion');
  assert.equal(escalamientos[0].motivo, 'avisos_acumulados');
});

test('avisos_para_friccion es configurable', () => {
  const cfg = config({ escalamiento: { avisos_para_friccion: 1 } });
  const r = paso(crearEstadoIntervencion(), YOUTUBE, AHORA, { cfg });
  assert.deepEqual(r.intervenciones.map((x) => x.accion), ['aviso', 'escalamiento']);
});

test('en una clase con PC los avisos se cuentan pero nunca escalan', () => {
  const c = clase(true);
  let estado = crearEstadoIntervencion();
  const acciones = [];
  for (let i = 0; i < 5; i++) {
    const r = paso(estado, YOUTUBE, hora('14:00') + i * 2 * MIN, { b: null, c });
    acciones.push(...r.intervenciones.map((x) => x.accion));
    assert.ok(r.intervenciones.every((x) => x.claseId === c.id && x.bloqueId === null));
    estado = paso(r.estado, CODE, hora('14:00') + (i * 2 + 1) * MIN, { b: null, c }).estado;
  }
  assert.deepEqual(acciones, ['aviso', 'aviso', 'aviso', 'aviso', 'aviso']);
  assert.equal(estado.avisos[c.id], 5);
  assert.deepEqual(estado.escalados, {});
});

test('registrarDecision no modifica el estado y quita los pases vencidos', () => {
  const estado = congelar({
    ...crearEstadoIntervencion(),
    pases: [{ objetivo: 'web:x.com', hasta: AHORA - MIN, tipo: 'pase' }, { objetivo: 'app:steam.exe', hasta: AHORA + MIN, tipo: 'permiso' }],
    avisos: { a: 1 },
  });
  const r = paso(estado, YOUTUBE, AHORA);
  assert.deepEqual(r.estado.pases, [{ objetivo: 'app:steam.exe', hasta: AHORA + MIN, tipo: 'permiso' }]);
  assert.equal(r.estado.avisos[`b-dbp-mar@${FECHA}`], 1);
  assert.equal(estado.avisos[`b-dbp-mar@${FECHA}`], undefined);
});

// ── concederPase ──

test('permiso tras un aviso: no gasta comodín ni se registra; al vencer vuelve el aviso', () => {
  const r1 = paso(crearEstadoIntervencion({ comodines: 5 }), YOUTUBE, AHORA);
  assert.equal(r1.decision.accion, 'aviso');
  const p = concederPase(r1.estado, { objetivo: 'web:youtube.com', tipo: 'permiso', minutos: 5, ahora: AHORA, bloque: bloque('aviso') });
  assert.equal(p.concedido, true);
  assert.deepEqual(p.intervenciones, []);
  assert.equal(p.estado.comodines, 5);
  assert.equal(p.estado.ultima, null);
  assert.deepEqual(paseVigente(p.estado, 'web:youtube.com', AHORA), { objetivo: 'web:youtube.com', hasta: AHORA + 5 * MIN, tipo: 'permiso', itemId: `b-dbp-mar@${FECHA}` });
  // Durante el permiso: permitir.
  const r2 = paso(p.estado, YOUTUBE, AHORA + 4 * MIN);
  assert.equal(r2.decision.motivo, 'pase_vigente');
  assert.deepEqual(r2.intervenciones, []);
  // Al vencer: otro aviso (el segundo del bloque).
  const r3 = paso(r2.estado, YOUTUBE, AHORA + 5 * MIN);
  assert.equal(r3.decision.accion, 'aviso');
  assert.equal(r3.intervenciones.length, 1);
  assert.equal(r3.estado.avisos[`b-dbp-mar@${FECHA}`], 2);
});

test('pase de fricción: gasta un comodín y registra "pase" con su motivo', () => {
  const r1 = paso(crearEstadoIntervencion({ comodines: 2 }), YOUTUBE, AHORA, { b: bloque('friccion') });
  const p = concederPase(r1.estado, {
    objetivo: 'web:youtube.com', tipo: 'pase', minutos: 10, ahora: AHORA + 60_000,
    bloque: bloque('friccion'), motivo: 'Necesito ver un tutorial', actividad: YOUTUBE,
  });
  assert.equal(p.concedido, true);
  assert.equal(p.estado.comodines, 1);
  assert.deepEqual(p.intervenciones, [{
    instante: AHORA + 60_000, bloqueId: `b-dbp-mar@${FECHA}`, claseId: null, nivel: 'friccion', accion: 'pase',
    objetivo: 'web:youtube.com', app: 'chrome.exe', url: 'https://www.youtube.com/watch?v=abc',
    titulo: 'Video gracioso - YouTube', motivo: 'Necesito ver un tutorial',
  }]);
  assert.equal(paseVigente(p.estado, 'web:youtube.com', AHORA + 60_000).hasta, AHORA + 11 * MIN);
});

test('sin comodines no hay pase y nada cambia', () => {
  const estado = congelar({ ...crearEstadoIntervencion({ comodines: 0 }), ultima: { objetivo: 'web:youtube.com', accion: 'friccion', itemId: 'b' } });
  const p = concederPase(estado, { objetivo: 'web:youtube.com', tipo: 'pase', minutos: 10, ahora: AHORA, bloque: bloque('friccion'), motivo: 'x' });
  assert.equal(p.concedido, false);
  assert.deepEqual(p.intervenciones, []);
  assert.equal(p.estado, estado);
});

test('el último comodín se puede usar; después ya no', () => {
  let estado = crearEstadoIntervencion({ comodines: 1 });
  const p1 = concederPase(estado, { objetivo: 'web:youtube.com', tipo: 'pase', minutos: 10, ahora: AHORA });
  assert.equal(p1.concedido, true);
  estado = p1.estado;
  assert.equal(estado.comodines, 0);
  const p2 = concederPase(estado, { objetivo: 'web:x.com', tipo: 'pase', minutos: 10, ahora: AHORA });
  assert.equal(p2.concedido, false);
  // El permiso de un aviso no necesita comodines.
  assert.equal(concederPase(estado, { objetivo: 'web:x.com', tipo: 'permiso', minutos: 5, ahora: AHORA }).concedido, true);
});

test('un pase nuevo reemplaza al anterior del mismo objetivo', () => {
  const p1 = concederPase(crearEstadoIntervencion(), { objetivo: 'web:youtube.com', tipo: 'permiso', minutos: 5, ahora: AHORA });
  const p2 = concederPase(p1.estado, { objetivo: 'web:youtube.com', tipo: 'pase', minutos: 10, ahora: AHORA + MIN });
  assert.deepEqual(p2.estado.pases, [{ objetivo: 'web:youtube.com', hasta: AHORA + 11 * MIN, tipo: 'pase' }]);
});

test('pedidos que no sirven no conceden nada', () => {
  const estado = crearEstadoIntervencion();
  for (const pedido of [
    { objetivo: 'web:youtube.com', tipo: 'permiso', minutos: 0, ahora: AHORA },
    { objetivo: 'web:youtube.com', tipo: 'permiso', minutos: -5, ahora: AHORA },
    { objetivo: 'web:youtube.com', tipo: 'regalo', minutos: 5, ahora: AHORA },
    { objetivo: '', tipo: 'permiso', minutos: 5, ahora: AHORA },
    { objetivo: 'web:youtube.com', tipo: 'permiso', minutos: 5 },
  ]) {
    const r = concederPase(estado, pedido);
    assert.equal(r.concedido, false, JSON.stringify(pedido));
    assert.equal(r.estado, estado);
  }
});

test('un pase vale solo en el bloque o la clase donde se dio (revisión de F4-05)', () => {
  const c = clase(true);
  const b = bloque('friccion');
  let { estado } = concederPase(crearEstadoIntervencion({ comodines: 5 }), { objetivo: 'web:youtube.com', tipo: 'permiso', minutos: 5, ahora: AHORA, clase: c });
  // Dentro de la clase, el permiso vale…
  assert.equal(decidir({ actividad: YOUTUBE, clase: c, config: CONFIG, estado, ahora: AHORA + 60_000 }).motivo, 'pase_vigente');
  // …pero en el bloque siguiente no: hay fricción aunque el permiso no haya vencido.
  assert.equal(decidir({ actividad: YOUTUBE, bloque: b, config: CONFIG, estado, ahora: AHORA + 60_000 }).accion, 'friccion');
});
