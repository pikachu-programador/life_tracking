// Pruebas de las partes puras de web/js/consultas.js (sin red ni AW).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aTextoDeConsulta, reglasParaConsulta, bucketsDeNavegador, consultaCanonica,
} from '../web/js/consultas.js';

test('aTextoDeConsulta deja UNA barra invertida en las regex', () => {
  const regla = { type: 'regex', regex: '^warp\\.exe$' }; // en memoria: ^warp\.exe$
  const texto = aTextoDeConsulta(regla);
  assert.ok(texto.includes('"^warp\\.exe$"'));  // en el texto: ^warp\.exe$ (una barra)
  assert.ok(!texto.includes('\\\\'));           // nunca dos barras seguidas
});

test('reglasParaConsulta arma [nombre, regla] y manda las regex vacías como none', () => {
  const classes = [
    { name: ['Estudio'], rule: { type: 'none' } },
    { name: ['Estudio', 'Inglés'], rule: { type: 'regex', regex: 'English', ignore_case: true } },
    { name: ['Vacía'], rule: { type: 'regex', regex: '  ' } },
    { name: ['IA'], rule: { type: 'regex', regex: 'Claude', priority: 30 } },
  ];
  assert.deepEqual(reglasParaConsulta(classes), [
    [['Estudio'], { type: 'none' }],
    [['Estudio', 'Inglés'], { type: 'regex', regex: 'English', ignore_case: true }],
    [['Vacía'], { type: 'none' }],
    [['IA'], { type: 'regex', regex: 'Claude', priority: 30 }],
  ]);
});

test('bucketsDeNavegador prefiere los del hostname y si no hay usa los "unknown"', () => {
  const buckets = {
    'aw-watcher-window_PC': { id: 'aw-watcher-window_PC', type: 'currentwindow', hostname: 'PC' },
    'aw-watcher-web-chrome_PC': { id: 'aw-watcher-web-chrome_PC', type: 'web.tab.current', hostname: 'PC' },
    'aw-watcher-web-chrome': { id: 'aw-watcher-web-chrome', type: 'web.tab.current', hostname: 'unknown' },
    'aw-watcher-web-edge_PC': { id: 'aw-watcher-web-edge_PC', type: 'web.tab.current', hostname: 'PC' },
  };
  assert.deepEqual(bucketsDeNavegador(buckets, 'PC'), [
    { navegador: 'chrome', id: 'aw-watcher-web-chrome_PC' },
    { navegador: 'edge', id: 'aw-watcher-web-edge_PC' },
  ]);
  // Otro equipo sin buckets propios: cae a los "unknown".
  assert.deepEqual(bucketsDeNavegador(buckets, 'OTRA'), [{ navegador: 'chrome', id: 'aw-watcher-web-chrome' }]);
});

test('consultaCanonica: AFK, navegador, audible, categorías y RETURN', () => {
  const s = consultaCanonica({
    bucketVentana: 'aw-watcher-window_PC',
    bucketAfk: 'aw-watcher-afk_PC',
    navegadores: [{ navegador: 'edge', id: 'aw-watcher-web-edge_PC' }],
    reglas: [[['IA'], { type: 'regex', regex: 'claude\\.exe' }]],
  });
  assert.ok(s.every((linea) => linea.trim().endsWith(';')), 'cada sentencia termina en ;');
  const texto = s.join('\n');
  assert.match(texto, /events = flood\(query_bucket\("aw-watcher-window_PC"\)\);/);
  assert.match(texto, /filter_keyvals\(not_afk, "status", \["not-afk"\]\)/);
  assert.match(texto, /events_edge = flood\(query_bucket\("aw-watcher-web-edge_PC"\)\);/);
  assert.match(texto, /filter_keyvals_regex\(events, "app", "\(\?i\)\^\(microsoft\[-_ \]\?edge\|msedge\)"\)/);
  assert.match(texto, /not_afk = period_union\(not_afk, audible_events\);/);
  assert.ok(texto.includes('events = categorize(events, [[["IA"],{"type":"regex","regex":"claude\\.exe"}]]);'));
  // El filtro AFK va DESPUÉS de sumar el audio (como en aw-webui).
  assert.ok(texto.indexOf('period_union(not_afk, audible_events)') < texto.indexOf('filter_period_intersect(events, not_afk)'));
  assert.match(s.at(-1), /^RETURN = \{"eventos": events, "navegador": browser_events, "no_afk": not_afk\};$/);
});

test('consultaCanonica sin audible ni navegadores', () => {
  const texto = consultaCanonica({ bucketVentana: 'w', bucketAfk: 'a', reglas: [], incluirAudible: false }).join('\n');
  assert.ok(!texto.includes('audible'));
  assert.ok(texto.includes('browser_events = [];'));
});
