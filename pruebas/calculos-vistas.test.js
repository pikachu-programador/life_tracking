// Pruebas de web/js/calculos-vistas.js: lo que las vistas calculan a partir de los datos del motor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelDia, estadoDeFoco, focoPorBloque } from '../web/js/calculos-vistas.js';
import { UMBRALES_INICIALES } from '../web/motor/plan.js';

// ── Cumplimiento (F4-08) ──

test('estadoDelDia: cumplido desde el umbral, parcial desde la mitad, fallido debajo; sin nada medible, null', () => {
  assert.equal(estadoDelDia(1, 0.8), 'cumplido');
  assert.equal(estadoDelDia(0.8, 0.8), 'cumplido');
  assert.equal(estadoDelDia(0.79, 0.8), 'parcial');
  assert.equal(estadoDelDia(0.4, 0.8), 'parcial');
  assert.equal(estadoDelDia(0.39, 0.8), 'fallido');
  assert.equal(estadoDelDia(0, 0.8), 'fallido');
  assert.equal(estadoDelDia(null, 0.8), null);
  assert.equal(estadoDelDia(undefined, 0.8), null);
});

test('estadoDeFoco usa los umbrales del plan', () => {
  assert.equal(estadoDeFoco(0.7, UMBRALES_INICIALES), 'cumplido');
  assert.equal(estadoDeFoco(0.69, UMBRALES_INICIALES), 'parcial');
  assert.equal(estadoDeFoco(0.4, UMBRALES_INICIALES), 'parcial');
  assert.equal(estadoDeFoco(0.1, UMBRALES_INICIALES), 'fallido');
});

test('focoPorBloque: junta por bloque del plan, promedia foco y retraso, y deja fuera lo que no se midió', () => {
  const b = (bloqueId, estado, foco, retrasoMin = null, tipo = 'estudio_pc') => ({ bloqueId, curso: 'bd1', tipo, estado, foco, retrasoMin });
  const resumenes = [
    { bloques: [b('b-lun', 'cumplido', 0.9, 0), b('b-papel', 'cumplido', null, null, 'estudio_papel')] },
    { bloques: [b('b-lun', 'fallido', 0.1, 30), b('b-lun', 'pendiente', null), b('b-lun', 'en_curso', 0.5)] },
    { bloques: [b('b-lun', 'parcial', 0.5)] },
    { /* día sin bloques */ },
  ];
  const [lun, papel] = focoPorBloque(resumenes);
  assert.deepEqual({ ...lun, foco: Math.round(lun.foco * 100) }, {
    bloqueId: 'b-lun', curso: 'bd1', tipo: 'estudio_pc', veces: 3, cumplido: 1, parcial: 1, fallido: 1, foco: 50, retrasoMin: 15,
  });
  assert.deepEqual(papel, { bloqueId: 'b-papel', curso: 'bd1', tipo: 'estudio_papel', veces: 1, cumplido: 1, parcial: 0, fallido: 0, foco: null, retrasoMin: null });
  assert.deepEqual(focoPorBloque([]), []);
});

// ── Rachas por rutina (F5-05) ──

test('rutinasDelPeriodo: un estado por día (null si no tocaba) y la cuenta de días medidos', async () => {
  const { rutinasDelPeriodo } = await import('../web/js/calculos-vistas.js');
  const r = (rutinaId, estado, nombre = rutinaId) => ({ rutinaId, nombre, medicion: 'checkin', estado });
  const resumenes = [
    { fecha: '2026-10-12', rutinas: [r('ingles', 'cumplido'), r('ejercicio', 'fallido')] },
    { fecha: '2026-10-13', rutinas: [r('ingles', 'parcial')] },
    { fecha: '2026-10-14', rutinas: [r('ingles', 'pendiente'), r('ejercicio', 'cumplido')] },
    { fecha: '2026-10-15' },
  ];
  const [ingles, ejercicio] = rutinasDelPeriodo(resumenes);
  assert.deepEqual(ingles, {
    rutinaId: 'ingles', nombre: 'ingles', medicion: 'checkin', medidos: 2, cumplido: 1, parcial: 1, fallido: 0,
    dias: [
      { fecha: '2026-10-12', estado: 'cumplido' }, { fecha: '2026-10-13', estado: 'parcial' },
      { fecha: '2026-10-14', estado: 'pendiente' }, { fecha: '2026-10-15', estado: null },
    ],
  });
  assert.deepEqual([ejercicio.medidos, ejercicio.cumplido, ejercicio.fallido], [2, 1, 1]);
  assert.deepEqual(ejercicio.dias.map((d) => d.estado), ['fallido', null, 'cumplido', null]);
  assert.deepEqual(rutinasDelPeriodo([]), []);
});

// ── Simulador (F4-07) ──

test('textoObjetivo: web y app en texto; lo demás, igual', async () => {
  const { textoObjetivo } = await import('../web/js/calculos-vistas.js');
  assert.equal(textoObjetivo('web:youtube.com'), 'youtube.com (web)');
  assert.equal(textoObjetivo('app:Discord.exe'), 'Discord.exe (app)');
  assert.equal(textoObjetivo('app:'), 'desconocido (app)');
  assert.equal(textoObjetivo('otra cosa'), 'otra cosa');
  assert.equal(textoObjetivo(null), '');
});

// ── Diario (F5-01) ──

test('marcablesDelDia: rutinas con check-in, bloques de papel y clases, con su valor actual (el último registrado)', async () => {
  const { marcablesDelDia } = await import('../web/js/calculos-vistas.js');
  const { expandirDia } = await import('../web/motor/horario.js');
  const { planEjemplo } = await import('./ayudantes/ejemplo.js');
  const items = expandirDia(planEjemplo(), '2026-10-13'); // martes: Ejercicio (check-in) y una clase de DBP
  const ck = (tipo, refId, valor, instante) => ({ id: instante, instante, fecha: '2026-10-13', tipo, refId, valor, nota: '' });
  const lista = marcablesDelDia(items, [
    ck('rutina', 'ejercicio', 'no_hecho', 1), ck('rutina', 'ejercicio', 'hecho', 2),   // manda el último
    ck('rutina', 'otra', 'hecho', 3),                                                    // de otra rutina: no cuenta
  ]);
  assert.deepEqual(lista.map((m) => [m.tipo, m.refId, m.valor]), [
    ['rutina', 'ejercicio', 'hecho'],
    ['asistencia', items.clases[0].claseId, null],
  ]);
  assert.deepEqual(lista[1].opciones, ['asistio', 'falto']);
  // Miércoles: hay un bloque de estudio en papel (EDO).
  const miercoles = marcablesDelDia(expandirDia(planEjemplo(), '2026-10-14'), []);
  assert.deepEqual(miercoles.filter((m) => m.tipo === 'papel').map((m) => [m.item.curso, m.valor, m.opciones]), [['edo', null, ['hecho', 'no_hecho']]]);
  assert.deepEqual(marcablesDelDia(null, null), []);
});

test('checkinsVigentes: de cada cosa vale el último registrado; despertar y dormir no miran el refId', async () => {
  const { checkinsVigentes } = await import('../web/js/calculos-vistas.js');
  const ck = (tipo, refId, valor, instante) => ({ id: instante, instante, fecha: '2026-10-13', tipo, refId, valor, nota: '' });
  const lista = [
    ck('despertar', 'despertar', '07:00', 1), ck('despertar', 'otro', '08:10', 5),
    ck('rutina', 'ejercicio', 'no_hecho', 2), ck('rutina', 'ejercicio', 'hecho', 3), ck('rutina', 'lectura', 'hecho', 4),
    ck('dormir', 'dormir', '23:40', 6),
  ];
  const vigentes = checkinsVigentes(lista);
  assert.deepEqual(lista.map((c) => vigentes.has(c)), [false, true, false, true, true, true]);
  assert.equal(checkinsVigentes([]).size, 0);
  assert.equal(checkinsVigentes(null).size, 0);
});

// ── Clasificación (F2-07) ──

test('masUsados: por app y por dominio, con su clase dominante, el filtro por clase y el resto en "otros"', async () => {
  const { masUsados } = await import('../web/js/calculos-vistas.js');
  const seg = (min, clase, app, dominio = null, url = null, titulo = 't') => ({
    inicio: 0, fin: min * 60000, clase, categoria: ['X'], area: null, app, titulo, url, dominio, audible: false, incognito: false,
  });
  const segmentos = [
    seg(60, 'estudio', 'Code.exe'),
    seg(30, 'neutral', 'chrome.exe', 'youtube.com', 'https://youtube.com/watch?v=1'),
    seg(50, 'estudio', 'chrome.exe', 'youtube.com', 'https://youtube.com/watch?v=2'),
    seg(20, 'distraccion', 'chrome.exe', 'reddit.com', 'https://reddit.com/r/x'),
    seg(10, 'sin-clasificar', 'raro.exe'),
    seg(500, 'afk', null),
  ];
  const apps = masUsados(segmentos, 'app');
  assert.deepEqual(apps.filas.map((f) => [f.nombre, f.segundos / 60, f.clase]), [['chrome.exe', 100, 'estudio'], ['Code.exe', 60, 'estudio'], ['raro.exe', 10, 'sin-clasificar']]);
  assert.equal(apps.total, 170 * 60);     // AFK no cuenta
  assert.equal(apps.otros, 0);
  const sitios = masUsados(segmentos, 'dominio');
  assert.deepEqual(sitios.filas.map((f) => [f.nombre, f.segundos / 60, f.clase]), [['youtube.com', 80, 'estudio'], ['reddit.com', 20, 'distraccion']]);
  // Solo una clase.
  assert.deepEqual(masUsados(segmentos, 'dominio', { clase: 'neutral' }).filas.map((f) => [f.nombre, f.segundos / 60]), [['youtube.com', 30]]);
  assert.deepEqual(masUsados(segmentos, 'app', { clase: 'todas' }).filas.length, 3);
  // Límite: lo que no entra va a "otros".
  const corto = masUsados(segmentos, 'app', { limite: 1 });
  assert.deepEqual([corto.filas.length, corto.otros / 60], [1, 70]);
  // URLs de un dominio (filtro propio).
  assert.deepEqual(masUsados(segmentos, 'url', { filtro: (s) => s.dominio === 'youtube.com' }).filas.map((f) => f.segundos / 60), [50, 30]);
  assert.deepEqual(masUsados([], 'app'), { filas: [], total: 0, otros: 0 });
});

test('arbolDeCategorias: clases arriba, subcategorías debajo, de mayor a menor', async () => {
  const { arbolDeCategorias } = await import('../web/js/calculos-vistas.js');
  const seg = (min, clase, categoria) => ({ inicio: 0, fin: min * 60000, clase, categoria, app: 'a', titulo: 't', url: null, dominio: null });
  const arbol = arbolDeCategorias([
    seg(30, 'estudio', ['Estudio', 'Inglés']), seg(90, 'estudio', ['Estudio', 'Programación']), seg(5, 'estudio', ['Estudio']),
    seg(40, 'distraccion', ['Distracción', 'Video', 'Shorts']), seg(15, 'sin-clasificar', ['Uncategorized']), seg(99, 'afk', null),
  ]);
  assert.deepEqual(arbol.map((r) => [r.nombre, r.clase, r.segundos / 60]), [['Estudio', 'estudio', 125], ['Distracción', 'distraccion', 40], ['Sin clasificar', 'sin-clasificar', 15]]);
  assert.deepEqual(arbol[0].hijos.map((h) => [h.nombre, h.segundos / 60]), [['Programación', 90], ['Inglés', 30], ['Estudio (sin subcategoría)', 5]]);
  assert.deepEqual(arbol[1].hijos, [{ nombre: 'Video > Shorts', ruta: 'Distracción > Video > Shorts', segundos: 2400 }]);
});

test('queBloquea: aviso y fricción bloquean Distracción y los patrones; total suma lo Sin clasificar (si está activo)', async () => {
  const { queBloquea } = await import('../web/js/calculos-vistas.js');
  const { NIVELES_INICIALES, configuracionVigente } = await import('../web/motor/niveles.js');
  const base = configuracionVigente(NIVELES_INICIALES, '2026-10-14');
  const inicial = queBloquea(base);
  assert.equal(inicial.aviso.length, 1);
  assert.deepEqual(inicial.friccion, inicial.aviso);
  assert.ok(inicial.total.includes('Lo Sin clasificar'));
  assert.equal(inicial.nunca.includes('La IA'), true);
  const otra = queBloquea({ ...base, patrones_url: ['youtube\\.com/shorts'], nunca_bloquear: ['spotify'], total: { ...base.total, bloquear_sin_clasificar: false } });
  assert.match(otra.aviso[1], /El patrón de URL extra: youtube/);
  assert.equal(otra.total.includes('Lo Sin clasificar'), false);
  assert.match(otra.nunca.at(-1), /spotify/);
});
