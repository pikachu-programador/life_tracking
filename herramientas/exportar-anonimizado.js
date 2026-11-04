// Exporta días de ActivityWatch y crea una copia ANONIMIZADA para las pruebas (F0-06).
//
// Uso (con AW abierto):
//   node herramientas/exportar-anonimizado.js 2026-10-31 2026-11-02
//   (días lógicos aproximados de 04:00 a 04:00, hora de Lima, desde el primero hasta el último inclusive)
//
// Escribe dos archivos:
//   datos-reales/export-<desde>_<hasta>.json   → datos reales (carpeta ignorada en git; NUNCA se sube)
//   datos-ejemplo/aw-<desde>_<hasta>.json      → copia anonimizada (sí se sube)
//
// Qué se anonimiza:
//   - títulos de ventana y de pestaña → "titulo-0001", "titulo-0002"… (el mismo título real, el mismo seudónimo)
//   - URLs → "https://sitio-001.ejemplo/p-0001" (mismo dominio real → mismo sitio; misma URL → misma ruta)
//   - hostname → "EQUIPO"
// Qué se conserva: horas, duraciones, nombres de app, estado AFK, audible/incógnito, y la categoría que AW
// le da a cada evento de ventana con las reglas reales (data.$category), para tener el valor esperado.
// Al final comprueba que ningún título ni URL real aparezca en la copia; si aparece, no la escribe.

import { mkdirSync, writeFileSync } from 'node:fs';
import { crearClienteAW } from '../web/js/aw.js';
import { aTextoDeConsulta, reglasParaConsulta, bucketsDeNavegador } from '../web/js/consultas.js';

const [desdeTexto, hastaTexto = desdeTexto] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(desdeTexto ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(hastaTexto)) {
  console.error('Uso: node herramientas/exportar-anonimizado.js AAAA-MM-DD [AAAA-MM-DD]');
  process.exit(1);
}
// 04:00 en Lima (UTC−5, sin horario de verano) = 09:00 UTC.
const inicio = new Date(`${desdeTexto}T09:00:00Z`);
const fin = new Date(new Date(`${hastaTexto}T09:00:00Z`).getTime() + 24 * 3600 * 1000);

const aw = crearClienteAW({ base: 'http://localhost:5600/api/0' });
const { hostname } = await aw.info();
const buckets = await aw.buckets();
const classes = await aw.ajuste('classes');

const idVentana = `aw-watcher-window_${hostname}`;
const idAfk = `aw-watcher-afk_${hostname}`;
const navegadores = bucketsDeNavegador(buckets, hostname);

// ── 1. Exportar los datos reales ──
const ordenar = (eventos) => eventos.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
// La categoría de cada evento de ventana la calcula AW con las reglas reales (sin filtrar AFK).
const [ventana] = await aw.consulta([[inicio, fin]], [
  `events = query_bucket(${aTextoDeConsulta(idVentana)});`,
  `events = categorize(events, ${aTextoDeConsulta(reglasParaConsulta(classes))});`,
  'RETURN = events;',
]);
const real = {
  exportado: new Date().toISOString(),
  periodo: { inicio: inicio.toISOString(), fin: fin.toISOString(), zona: 'America/Lima', inicio_dia: '04:00' },
  hostname,
  buckets: {
    [idVentana]: ordenar(ventana),
    [idAfk]: ordenar(await aw.eventos(idAfk, { inicio, fin })),
  },
};
for (const { id } of navegadores) real.buckets[id] = ordenar(await aw.eventos(id, { inicio, fin }));

mkdirSync('datos-reales', { recursive: true });
const archivoReal = `datos-reales/export-${desdeTexto}_${hastaTexto}.json`;
writeFileSync(archivoReal, JSON.stringify(real, null, 2));

// ── 2. Anonimizar ──
function seudonimos(prefijo, ancho) {
  const mapa = new Map();
  return (valor) => {
    if (!mapa.has(valor)) mapa.set(valor, `${prefijo}-${String(mapa.size + 1).padStart(ancho, '0')}`);
    return mapa.get(valor);
  };
}
const titulo = seudonimos('titulo', 4);
const sitio = seudonimos('sitio', 3);
const ruta = seudonimos('p', 4);
const secretos = new Set(); // títulos y URLs reales, para comprobar al final que no se filtró ninguno

function anonimizarUrl(url) {
  secretos.add(url);
  let u;
  try { u = new URL(url); } catch { return `https://${sitio('sin-dominio')}.ejemplo/${ruta(url)}`; }
  secretos.add(u.hostname);
  const esquema = u.protocol === 'http:' || u.protocol === 'https:' ? u.protocol : 'https:'; // chrome://, file://… → https
  return `${esquema}//${sitio(u.hostname)}.ejemplo/${ruta(url)}`;
}

function anonimizarEvento(e) {
  const data = { ...e.data };
  if (typeof data.title === 'string') { secretos.add(data.title); data.title = titulo(data.title); }
  if (typeof data.url === 'string') data.url = anonimizarUrl(data.url);
  // Cualquier otro texto que no conozcamos se elimina (por si una versión nueva de AW agrega campos).
  for (const [clave, valor] of Object.entries(data)) {
    if (typeof valor === 'string' && !['app', 'title', 'url', 'status'].includes(clave)) delete data[clave];
  }
  return { timestamp: e.timestamp, duration: e.duration, data };
}

const nombreAnonimo = (id) => id.replace(hostname, 'EQUIPO');
const ejemplo = {
  descripcion: 'Datos de ActivityWatch ANONIMIZADOS para las pruebas (F0-06). Títulos y URLs son seudónimos; '
    + 'data.$category de la ventana es la categoría que AW calculó con las reglas reales.',
  periodo: real.periodo,
  hostname: 'EQUIPO',
  buckets: Object.fromEntries(Object.entries(real.buckets).map(([id, eventos]) => [nombreAnonimo(id), eventos.map(anonimizarEvento)])),
};

// ── 3. Comprobar que no se filtró nada ──
// Se revisan todos los textos de la copia salvo `app` y `status`, que se conservan a propósito
// (un título igual al nombre de la app, como "warp", no es una filtración).
const textosRevisados = [];
for (const [id, eventos] of Object.entries(ejemplo.buckets)) {
  textosRevisados.push(id);
  for (const e of eventos) {
    for (const [clave, valor] of Object.entries(e.data)) {
      if (typeof valor === 'string' && clave !== 'app' && clave !== 'status') textosRevisados.push(valor);
    }
  }
}
const texto = textosRevisados.join('\n');
const filtrados = [...secretos].filter((s) => s.length >= 4 && texto.includes(s));
if (filtrados.length > 0) {
  console.error(`✘ ${filtrados.length} textos reales aparecen en la copia anonimizada. No se escribió nada en datos-ejemplo/.`);
  process.exit(2);
}

mkdirSync('datos-ejemplo', { recursive: true });
const archivoEjemplo = `datos-ejemplo/aw-${desdeTexto}_${hastaTexto}.json`;
writeFileSync(archivoEjemplo, JSON.stringify(ejemplo, null, 2));

// Resumen (solo conteos).
console.log(`Datos reales     → ${archivoReal}`);
console.log(`Copia anonimizada → ${archivoEjemplo}`);
for (const [id, eventos] of Object.entries(ejemplo.buckets)) console.log(`  ${id.padEnd(32)} ${eventos.length} eventos`);
console.log(`Seudónimos: ${secretos.size} textos reales reemplazados; ninguno aparece en la copia ✔`);
