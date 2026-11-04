// Pruebas de web/motor/regex.js: regex de AW (Python/Rust) traducidas a JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regexDeAW } from '../web/motor/regex.js';

const coincide = (regex, texto, opciones) => regexDeAW(regex, opciones).test(texto);

test('regex simples y escapes de punto', () => {
  assert.ok(coincide('^warp\\.exe$', 'warp.exe'));
  assert.ok(!coincide('^warp\\.exe$', 'warpXexe'));
  assert.ok(coincide('- YouTube', 'Top 10 combos - YouTube - Google Chrome'));
});

test('ignore_case y (?i) al inicio', () => {
  assert.ok(coincide('youtube', 'YouTube', { ignorarMayusculas: true }));
  assert.ok(!coincide('youtube', 'YouTube'));
  assert.ok(coincide('(?i)^(google[-_ ]?chrome|chrome|msedge)', 'Chrome.exe'));
  assert.ok(coincide('(?i)^(microsoft[-_ ]?edge|msedge)', 'msedge.exe'));
  assert.ok(!coincide('(?i)^(microsoft[-_ ]?edge|msedge)', 'chrome.exe'));
});

test('mayúsculas con tilde: (?i) entiende Á y á', () => {
  assert.ok(coincide('matemáticas', 'MATEMÁTICAS', { ignorarMayusculas: true }));
});

test('\\b y \\w entienden letras con tilde, como en Python y Rust', () => {
  assert.ok(coincide('\\bmás\\b', 'cada vez más rápido'));
  assert.ok(!coincide('\\bmás\\b', 'demás cosas'));         // en JS puro, \b vería un límite antes de "m"
  assert.ok(coincide('\\bresolución\\b', 'Resolución de ecuaciones', { ignorarMayusculas: true }));
  assert.ok(coincide('^\\w+$', 'canción'));
  assert.ok(!coincide('^\\w+$', 'dos palabras'));
  assert.ok(coincide('[\\w-]+\\.exe', 'mi-app_2.exe'));
});

test('\\d entiende cifras Unicode y \\A, \\Z marcan inicio y fin', () => {
  assert.ok(coincide('^\\d+$', '١٢٣'));
  assert.ok(coincide('\\Aabc\\Z', 'abc'));
  assert.ok(!coincide('\\Aabc\\Z', 'xabc'));
});

test('grupos con nombre de Python, comentarios y banderas en grupo', () => {
  assert.ok(coincide('(?P<x>ab)(?P=x)', 'abab'));
  assert.ok(!coincide('(?P<x>ab)(?P=x)', 'abac'));
  assert.ok(coincide('(?#un comentario)abc', 'abc'));
  assert.ok(coincide('(?i:claude)', 'CLAUDE'));
});

test('escapes que Python acepta y JS (bandera u) no: \\- \\: \\# y llaves sueltas', () => {
  assert.ok(coincide('a\\-b', 'a-b'));
  assert.ok(coincide('hora\\:', 'hora:'));
  assert.ok(coincide('\\#tag', '#tag'));
  assert.ok(coincide('foo{bar}', 'foo{bar}'));
  assert.ok(coincide('[]a]', ']'));
  assert.ok(coincide('[a\\-z]', '-'));
});

test('cuantificadores con llaves, \\p{…} y \\x{…} de Rust', () => {
  assert.ok(coincide('^a{2}$', 'aa'));
  assert.ok(coincide('^a{,2}$', 'a'));          // Python: {,2} = {0,2}
  assert.ok(coincide('^a{2,}$', 'aaaa'));
  assert.ok(coincide('^\\p{L}+$', 'ñandú'));
  assert.ok(coincide('\\x{1F600}', '😀'));
});

test('regex inválidas o vacías lanzan un error en español', () => {
  assert.throws(() => regexDeAW('(abc'), /no compila/);
  assert.throws(() => regexDeAW('[abc'), /corchete/);
  assert.throws(() => regexDeAW(''), /vacía/);
  assert.throws(() => regexDeAW('abc\\'), /barra invertida/);
  assert.throws(() => regexDeAW('(?x) a b'), /verboso/);
});

test('la RegExp no guarda estado entre llamadas (sin g ni y)', () => {
  const r = regexDeAW('a');
  assert.ok(!r.global && !r.sticky);
  assert.ok(r.test('a') && r.test('a'));
});
