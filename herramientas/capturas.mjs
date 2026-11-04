// Capturas automáticas del dashboard (H-03; arquitectura §6.8).
//
// Arranca el AW falso (herramientas/aw-falso.js) en un puerto libre, abre cada vista con el reloj de prueba
// y guarda capturas en claro y oscuro, a 1366×768 y a 1920×1080. También anota los errores de consola.
//
// Uso:
//   node herramientas/capturas.mjs [--salida carpeta] [--vistas hoy,horas] [--ahora 2026-10-14T16:20]
//                                  [--tamanos 1366x768,1920x1080] [--temas claro,oscuro] [--pagina-completa]
//                                  [--estilos provisional,sereno,cuaderno,tablero]   (temas de estilo de V-10)
//                                  [--url http://localhost:5600]   (usa un servidor que ya está corriendo)
// Una "vista" que termina en .html (por ejemplo muestra.html) se abre como página suelta.
//
// Necesita Playwright con Chromium (no es una dependencia del proyecto). Si no está instalado:
//   npm i -g playwright && npx playwright install chromium

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const VISTAS = ['hoy', 'horas', 'resumen', 'tipico', 'comparar', 'explorador', 'horario', 'cumplimiento',
  'simulador', 'clasificacion', 'diario', 'ajustes'];

// ── Opciones de la línea de comandos ──
const argumentos = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = argumentos.indexOf('--' + nombre);
  return i === -1 ? porDefecto : argumentos[i + 1];
};
const salida = opcion('salida', join(RAIZ, 'capturas'));
const vistas = opcion('vistas', VISTAS.join(',')).split(',');
const ahora = opcion('ahora', '2026-10-14T16:20');
const tamanos = opcion('tamanos', '1366x768,1920x1080').split(',').map((t) => t.split('x').map(Number));
const temas = opcion('temas', 'claro,oscuro').split(',');
const estilos = opcion('estilos', 'provisional').split(',');
const paginaCompleta = argumentos.includes('--pagina-completa');
let base = opcion('url', null);

// Playwright se busca como lo haría require() (instalación global incluida).
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('No se encontró Playwright. Instálalo con: npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

// ── AW falso en un puerto libre (salvo que se pase --url) ──
let servidor = null;
if (!base) {
  const puerto = 5600 + Math.floor(Math.random() * 300) + 100;
  servidor = spawn(process.execPath, [join(RAIZ, 'herramientas', 'aw-falso.js'), '--puerto', String(puerto)], { stdio: 'ignore' });
  base = `http://127.0.0.1:${puerto}`;
  await esperarServidor(base);
}

mkdirSync(salida, { recursive: true });
const navegador = await chromium.launch();
const informe = [];
try {
  for (const estilo of estilos) for (const tema of temas) {
    for (const [ancho, alto] of tamanos) {
      const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
      // El tema claro u oscuro se fija igual que lo haría el botón del dashboard (js/tema.js).
      await contexto.addInitScript(([t, e]) => {
        localStorage.setItem('rastreador-tema', t);
        localStorage.setItem('rastreador-tema-estilo', e); // tema de estilo de V-10 (js/temas.js)
      }, [tema, estilo]);
      const pagina = await contexto.newPage();
      for (const vista of vistas) {
        const errores = [];
        const alError = (texto) => errores.push(texto);
        pagina.on('console', (m) => { if (m.type() === 'error') alError(m.text()); });
        pagina.on('pageerror', (e) => alError(String(e)));
        const direccion = vista.endsWith('.html') ? `${base}/pages/rastreador/${vista}` : `${base}/pages/rastreador/?ahora=${ahora}#/${vista}`;
        await pagina.goto(direccion, { waitUntil: 'networkidle' });
        await pagina.waitForTimeout(900); // los gráficos de ECharts terminan de dibujarse
        const nombre = vista.replace(/\.html$/, '') + (estilo === 'provisional' ? '' : '-' + estilo);
        const archivo = join(salida, `${nombre}-${tema}-${ancho}x${alto}.png`);
        await pagina.screenshot({ path: archivo, fullPage: paginaCompleta });
        pagina.removeAllListeners('console');
        pagina.removeAllListeners('pageerror');
        informe.push({ vista, estilo, tema, tamano: `${ancho}x${alto}`, archivo, errores });
        console.log(`${errores.length ? '✗' : '✓'} ${vista} · ${estilo} · ${tema} · ${ancho}×${alto}${errores.length ? ' · ' + errores.length + ' error(es) de consola' : ''}`);
      }
      await contexto.close();
    }
  }
} finally {
  await navegador.close();
  servidor?.kill();
}
writeFileSync(join(salida, 'informe.json'), JSON.stringify(informe, null, 2));
const conErrores = informe.filter((i) => i.errores.length);
console.log(`\n${informe.length} capturas en ${salida}; ${conErrores.length} con errores de consola.`);
process.exitCode = conErrores.length ? 1 : 0;

/** Espera a que el servidor responda /api/0/info (hasta 10 s). */
async function esperarServidor(url) {
  for (let intento = 0; intento < 50; intento++) {
    try {
      const r = await fetch(url + '/api/0/info');
      if (r.ok) return;
    } catch { /* todavía no arrancó */ }
    await new Promise((listo) => setTimeout(listo, 200));
  }
  throw new Error(`El AW falso no respondió en ${url}`);
}
