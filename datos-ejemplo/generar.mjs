// Genera datos de ejemplo de ActivityWatch para las pruebas del motor.
// Todo es inventado: apps reales de Windows, pero títulos y URLs ficticios.
// El ritmo (madrugadas, ráfagas de cambios de ventana, eventos de duración 0)
// imita una exportación real de 5 días.
//
// Uso: node generar.mjs [carpeta-de-salida]
// Con la misma semilla siempre sale exactamente lo mismo.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SALIDA = process.argv[2] ?? fileURLToPath(new URL(".", import.meta.url));
const SEMILLA = 20261104;
const HOST = "ejemplo";
const OFFSET_LIMA_H = 5; // America/Lima = UTC-5, sin horario de verano

// ---------- azar reproducible ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEMILLA);
const elegir = (lista) => lista[Math.floor(rnd() * lista.length)];
function normal() {
  const u = 1 - rnd(), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// Duración de un evento de ventana: casi siempre segundos, a veces minutos.
const durEvento = (mediana = 20) => Math.min(900, Math.exp(Math.log(mediana) + 1.3 * normal()));

// ---------- catálogo inventado ----------
// clave = "Clase/Subcategoría" que DEBERÍA asignarse (la intención real).
const YT = (id) => `https://www.youtube.com/watch?v=${id}`;
const CATALOGO = {
  "Estudio/BD I": [
    ["chrome.exe", "Normalización hasta 3FN - Apuntes BD I - Documentos de Google", "https://docs.google.com/document/d/ejemplo-bd1/edit"],
    ["chrome.exe", "SQL JOIN explicado con ejemplos - YouTube", YT("ejBD1join")],
    ["Code.exe", "consultas_practica.sql - bd1-practicas - Visual Studio Code", null],
  ],
  "Estudio/DBP": [
    ["chrome.exe", "Spring Security con JWT paso a paso - YouTube", YT("ejDBPjwt")],
    ["chrome.exe", "ejemplo/turnos-app: Pull requests - GitHub", "https://github.com/ejemplo/turnos-app/pulls"],
    ["warp.exe", "turnos-app — warp", null],
    ["chrome.exe", "Turnos App", "http://localhost:8080/"],
  ],
  "Estudio/Prog III": [
    ["clion64.exe", "streaming-p3 – trie_sufijos.cpp", null],
    ["chrome.exe", "Árbol de sufijos - Programación III - Documentos de Google", "https://docs.google.com/document/d/ejemplo-p3/edit"],
    ["chrome.exe", "C++ (punteros) [parte 2] - YouTube", YT("ejP3ptr2")],
  ],
  "Estudio/Estadística": [
    ["rstudio.exe", "avance3_analisis.qmd - RStudio", null],
    ["chrome.exe", "Prueba t de Student en R - YouTube", YT("ejESTt")],
  ],
  "Estudio/EDO": [
    ["chrome.exe", "Variación de parámetros - Ecuaciones diferenciales - YouTube", YT("ejEDOvp")],
    ["chrome.exe", "guia_edo_semana12.pdf", "file:///C:/Users/usuario/Documents/guia_edo_semana12.pdf"],
  ],
  "Estudio/PI2": [
    ["Arduino IDE.exe", "sensor_ruido_v3 | Arduino IDE 2.3.10", null],
    ["Fusion360.exe", "Autodesk Fusion - carcasa_sonometro v4", null],
    ["chrome.exe", "Mediciones PI2 - Hojas de cálculo de Google", "https://docs.google.com/spreadsheets/d/ejemplo-pi2/edit"],
  ],
  "Estudio/Inglés": [
    ["chrome.exe", "Present perfect vs past simple - Ejercicios de inglés", "https://ingles-practica.example.org/present-perfect"],
    ["chrome.exe", "English listening practice A1 - YouTube", YT("ejENG01")],
  ],
  "IA": [
    ["claude.exe", "Claude", null],
    ["chrome.exe", "Gemini", "https://gemini.google.com/app/ejemplo"],
  ],
  "Distracción/Video": [
    ["chrome.exe", "Reacción al final de temporada - YouTube", YT("ejENT01")],
    ["chrome.exe", "Top 10 combos imposibles - YouTube", YT("ejENT02")],
    ["chrome.exe", "Shorts - YouTube", "https://www.youtube.com/shorts/ejSH01"],
    ["chrome.exe", "Netflix", "https://www.netflix.com/watch/00000001"],
  ],
  "Distracción/Redes": [
    ["chrome.exe", "Instagram", "https://www.instagram.com/"],
    ["chrome.exe", "TikTok - Para ti", "https://www.tiktok.com/foryou"],
    ["chrome.exe", "r/learnprogramming - Reddit", "https://www.reddit.com/r/learnprogramming/"],
  ],
  "Distracción/Juegos": [
    ["SkullGirls.exe", "Skullgirls 2nd Encore", null],
    ["dnplayer.exe", "LDPlayer", null],
  ],
  "Neutral/Comunicación": [
    ["WhatsApp.Root.exe", "WhatsApp", null],
    ["CiscoCollabHost.exe", "Reunión de Webex", null],
  ],
  "Neutral/Sistema": [
    ["explorer.exe", "Descargas", null],
    ["SearchHost.exe", "Búsqueda", null],
    ["LockApp.exe", "Windows Default Lock Screen", null],
  ],
  "Neutral/Otros": [["Spotify.exe", "Spotify Premium", null], ["Obsidian.exe", "bitácora - life_tracking - Obsidian", null]],
  "Sin clasificar": [
    ["chrome.exe", "Ofertas de laptops - Tienda Ejemplo", "https://tienda-ejemplo.example.com/laptops"],
    ["chrome.exe", "Nueva pestaña", "chrome://newtab/"],
    ["msedge.exe", "Inicio", null], // Edge sin extensión: solo hay evento de ventana
    ["PickerHost.exe", "", null],
  ],
};

// Mezclas típicas (pesos). Las intenciones de cada evento quedan en verdad.json.
const LIBRE = { "Distracción/Video": 3, "Distracción/Redes": 2, "Neutral/Comunicación": 2, "Neutral/Sistema": 1, "Neutral/Otros": 1, "Sin clasificar": 1 };
const MAÑANA = { "Neutral/Comunicación": 3, "Neutral/Sistema": 2, "Distracción/Redes": 1, "Sin clasificar": 1 };
const estudio = (curso, foco = 0.9) => ({
  [`Estudio/${curso}`]: 10 * foco,
  "IA": 1.5 * foco,
  "Distracción/Video": 5 * (1 - foco),
  "Distracción/Redes": 4 * (1 - foco),
  "Neutral/Comunicación": 1 + 2 * (1 - foco),
  "Neutral/Sistema": 0.6,
});

// ---------- días ----------
// Cada día: segmentos en hora local. "25:30" = 01:30 del día siguiente.
// modo: act (uso normal) | afk (PC encendida, sin uso) | papel (afk durante estudio en papel)
//       | video (clase grabada sonando, sin tocar teclado). Lo no cubierto = Sin PC.
const S = (de, a, modo, extra = {}) => ({ de, a, modo, ...extra });
const DIAS = [
  { fecha: "2026-10-05", casos: ["dia_casi_perfecto"], desc: "Despierta a tiempo, bloque de BD I puntual y con foco alto, inglés cumplido.", seg: [
    S("06:55", "07:30", "act", { mezcla: MAÑANA }),
    S("12:40", "14:30", "act", { mezcla: LIBRE }),
    S("14:55", "17:05", "act", { mezcla: estudio("BD I", 0.92) }),
    S("19:00", "20:30", "act", { mezcla: LIBRE }),
    S("21:00", "21:40", "act", { mezcla: estudio("Inglés", 0.95) }),
    S("21:40", "24:40", "act", { mezcla: { ...estudio("DBP", 0.6), ...{ "Neutral/Otros": 1 } } }),
  ]},
  { fecha: "2026-10-06", casos: ["dia_malo", "bloque_cruza_medianoche"], desc: "Despierta tarde, el bloque de DBP empieza tarde y casi todo es distracción; el bloque de Prog III de 23:30 a 00:30 queda a medias; trasnoche hasta las 3.", seg: [
    S("10:30", "13:30", "act", { mezcla: { ...LIBRE, "Distracción/Video": 6 } }),
    S("16:30", "17:40", "act", { mezcla: { "Distracción/Video": 5, "Distracción/Redes": 3, "Neutral/Comunicación": 1 } }),
    S("17:40", "19:00", "act", { mezcla: estudio("DBP", 0.35) }),
    S("19:00", "23:20", "act", { mezcla: { "Distracción/Juegos": 4, "Distracción/Video": 4, "Neutral/Comunicación": 1 } }),
    S("23:30", "24:30", "act", { mezcla: estudio("Prog III", 0.5) }),
    S("24:30", "27:10", "act", { mezcla: { "Distracción/Video": 6, "Distracción/Redes": 2 } }),
  ]},
  { fecha: "2026-10-07", casos: ["trasnoche", "estudio_en_papel_cumplido"], desc: "Estadística puntual; EDO en papel con la PC en AFK; actividad hasta las 2:30, que pertenece a este día lógico.", seg: [
    S("09:10", "10:00", "act", { mezcla: MAÑANA }),
    S("11:00", "14:30", "act", { mezcla: LIBRE }),
    S("15:00", "17:00", "act", { mezcla: estudio("Estadística", 0.85) }),
    S("17:00", "19:30", "afk", { ventana: "Neutral/Otros" }),
    S("19:30", "20:00", "act", { mezcla: LIBRE }),
    S("20:00", "21:30", "papel", { ventana: "Estudio/EDO" }),
    S("21:30", "22:00", "act", { mezcla: estudio("Inglés", 0.9) }),
    S("22:00", "26:30", "act", { mezcla: estudio("DBP", 0.55) }),
  ]},
  { fecha: "2026-10-08", casos: ["feriado", "distraccion_en_tiempo_libre"], desc: "Feriado: no hay clases ni bloques. Muchas horas de juegos y video que NO son fallos.", seg: [
    S("11:00", "11:30", "act", { mezcla: MAÑANA }),
    S("11:30", "15:00", "act", { mezcla: { "Distracción/Juegos": 6, "Neutral/Comunicación": 1 } }),
    S("16:00", "20:00", "act", { mezcla: { "Distracción/Video": 5, "Distracción/Redes": 3, "Neutral/Otros": 1 } }),
    S("21:00", "21:30", "act", { mezcla: estudio("Inglés", 0.8) }),
    S("21:30", "24:50", "act", { mezcla: LIBRE }),
  ]},
  { fecha: "2026-10-09", casos: ["huecos_sin_pc", "estudio_en_papel_cumplido"], desc: "Varios huecos sin PC (clase presencial y salidas); EDO en papel de 16:00 a 17:30 sin tocar la PC.", seg: [
    S("07:10", "07:40", "act", { mezcla: MAÑANA }),
    S("12:30", "13:00", "act", { mezcla: LIBRE }),
    S("15:40", "16:00", "act", { mezcla: MAÑANA }),
    S("16:00", "17:30", "papel", { ventana: "Estudio/EDO" }),
    S("17:30", "17:50", "act", { mezcla: { "Neutral/Comunicación": 3, "Neutral/Sistema": 1 } }),
    S("20:00", "21:00", "act", { mezcla: LIBRE }),
    S("21:00", "21:35", "act", { mezcla: estudio("Inglés", 0.9) }),
    S("21:35", "23:50", "act", { mezcla: LIBRE }),
  ]},
  { fecha: "2026-10-10", casos: ["youtube_estudio_vs_entretenimiento", "video_sin_teclado"], desc: "Bloque de DBP con tutoriales de YouTube; tarde de inglés y EDO en YouTube; clase grabada de 90 min sonando sin tocar el teclado (AFK pero audible); noche de YouTube de entretenimiento.", seg: [
    S("09:30", "10:00", "act", { mezcla: MAÑANA }),
    S("10:00", "12:00", "act", { mezcla: { "Estudio/DBP": 9, "IA": 1, "Distracción/Video": 1, "Neutral/Comunicación": 0.5 } }),
    S("14:00", "16:00", "act", { mezcla: { "Estudio/Inglés": 5, "Estudio/EDO": 4, "Distracción/Video": 1 } }),
    S("16:00", "17:30", "video", { ventana: "Estudio/EDO" }),
    S("18:00", "21:00", "act", { mezcla: { "Distracción/Video": 6, "Distracción/Redes": 3 } }),
    S("21:00", "25:20", "act", { mezcla: LIBRE }),
  ]},
  { fecha: "2026-10-11", casos: ["domingo_sin_bloques", "incognito", "estudio_fuera_de_bloque"], desc: "Domingo sin bloques. PI2 con Arduino fuera de horario (suma horas al curso, no a un bloque). Unos minutos en incógnito.", seg: [
    S("10:40", "11:10", "act", { mezcla: MAÑANA }),
    S("11:10", "11:25", "act", { mezcla: { "Sin clasificar": 1 }, incognito: true }),
    S("11:25", "15:00", "act", { mezcla: LIBRE }),
    S("16:00", "17:00", "act", { mezcla: estudio("PI2", 0.9) }),
    S("19:00", "24:30", "act", { mezcla: { ...LIBRE, "Distracción/Juegos": 2 } }),
  ]},
  { fecha: "2026-10-12", casos: ["inicio_tarde_buen_foco"], desc: "El bloque de BD I empieza 20 min tarde (fuera de tolerancia) aunque luego el foco es alto.", seg: [
    S("07:05", "07:35", "act", { mezcla: MAÑANA }),
    S("12:30", "15:20", "act", { mezcla: LIBRE }),
    S("15:20", "17:00", "act", { mezcla: estudio("BD I", 0.93) }),
    S("19:00", "21:00", "act", { mezcla: LIBRE }),
    S("21:00", "21:40", "act", { mezcla: estudio("Inglés", 0.9) }),
    S("21:40", "23:30", "act", { mezcla: estudio("DBP", 0.7) }),
  ]},
  { fecha: "2026-10-13", casos: ["sin_datos"], desc: "No usó la PC en todo el día: no hay ni un evento. El día lógico debe caer al inicio de día de AW.", seg: [] },
  { fecha: "2026-10-14", casos: ["dia_bueno"], desc: "Estadística puntual con buen foco y EDO en papel cumplido.", seg: [
    S("07:00", "07:40", "act", { mezcla: MAÑANA }),
    S("10:30", "14:30", "act", { mezcla: { ...LIBRE, "Estudio/DBP": 3 } }),
    S("14:58", "17:00", "act", { mezcla: estudio("Estadística", 0.9) }),
    S("17:00", "20:00", "act", { mezcla: LIBRE }),
    S("20:00", "21:30", "papel", { ventana: "Estudio/EDO" }),
    S("21:30", "22:05", "act", { mezcla: estudio("Inglés", 0.95) }),
    S("22:05", "24:20", "act", { mezcla: LIBRE }),
  ]},
  { fecha: "2026-10-15", casos: ["eventos_raros", "titulos_con_simbolos"], desc: "Bloque de PI2 cumplido. Incluye eventos de duración 0, marcas de tiempo repetidas y títulos con símbolos de regex.", raros: true, seg: [
    S("07:20", "07:50", "act", { mezcla: MAÑANA }),
    S("12:30", "14:50", "act", { mezcla: LIBRE }),
    S("15:00", "17:00", "act", { mezcla: estudio("PI2", 0.88) }),
    S("17:00", "18:30", "act", { mezcla: estudio("Prog III", 0.8) }),
    S("19:30", "21:00", "act", { mezcla: LIBRE }),
    S("21:00", "21:30", "act", { mezcla: estudio("Inglés", 0.9) }),
    S("21:30", "24:00", "act", { mezcla: LIBRE }),
  ]},
  { fecha: "2026-10-16", casos: ["papel_con_distraccion"], desc: "EDO en papel de 16:00 a 17:30, pero a mitad del bloque pasa 20 min en redes en la PC.", seg: [
    S("07:15", "07:45", "act", { mezcla: MAÑANA }),
    S("12:30", "15:50", "act", { mezcla: LIBRE }),
    S("16:00", "16:35", "papel", { ventana: "Estudio/EDO" }),
    S("16:35", "16:55", "act", { mezcla: { "Distracción/Redes": 5, "Distracción/Video": 2 } }),
    S("16:55", "17:30", "papel", { ventana: "Estudio/EDO" }),
    S("19:00", "21:00", "act", { mezcla: LIBRE }),
    S("21:00", "21:30", "act", { mezcla: estudio("Inglés", 0.9) }),
    S("21:30", "25:00", "act", { mezcla: LIBRE }),
  ]},
  { fecha: "2026-10-17", casos: ["examen_total"], desc: "Bloque de DBP en la mañana y bloque de examen de BD I (nivel total) de 14:00 a 17:00 con foco muy alto.", seg: [
    S("09:20", "10:00", "act", { mezcla: MAÑANA }),
    S("10:00", "12:00", "act", { mezcla: estudio("DBP", 0.85) }),
    S("12:00", "13:50", "act", { mezcla: LIBRE }),
    S("14:00", "17:00", "act", { mezcla: estudio("BD I", 0.97) }),
    S("18:00", "24:10", "act", { mezcla: LIBRE }),
  ]},
  { fecha: "2026-10-18", casos: ["trasnoche_pasa_inicio_de_dia"], desc: "Domingo largo: sigue activo hasta las 4:30, después del inicio de día de AW (04:00). Sin hueco de 3 h, todo pertenece al domingo.", seg: [
    S("10:30", "11:00", "act", { mezcla: MAÑANA }),
    S("11:00", "15:00", "act", { mezcla: LIBRE }),
    S("16:00", "18:00", "act", { mezcla: estudio("Prog III", 0.75) }),
    S("19:00", "28:30", "act", { mezcla: { ...LIBRE, "Estudio/DBP": 2 } }),
  ]},
];

// Títulos raros para el día "eventos_raros" (no cambian la intención).
const RAROS = [
  ["chrome.exe", "¿Qué es λ? (autovalores) [EDO] | notas $x^2$ - YouTube", YT("ejRaro1"), "Estudio/EDO"],
  ["Code.exe", "a+b*(c?) ^raro$ .|\\ - Visual Studio Code", null, "Sin clasificar"],
];

// Curso -> área de Estudio (arquitectura §7: áreas estables, los cursos viven en el plan).
const AREA = { "BD I": "Programación", "DBP": "Programación", "Prog III": "Programación", "PI2": "Programación",
  "Estadística": "Matemáticas", "EDO": "Matemáticas", "Inglés": "Inglés" };
const comoArea = (k) => k.startsWith("Estudio/") ? `Estudio/${AREA[k.slice(8)]}` : k.replace(/^\((papel|video)\)$/, "Estudio (sin teclado)");

// ---------- utilidades de tiempo ----------
function aUTC(fecha, hhmm) {
  const [y, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h + OFFSET_LIMA_H, mi);
}
const iso = (ms) => new Date(ms).toISOString().slice(0, 23) + "000+00:00";
const tituloVentana = (app, t) =>
  app === "chrome.exe" ? (t ? `${t} - Google Chrome` : "Google Chrome")
  : app === "msedge.exe" ? `${t} - Microsoft Edge` : t;

function sortear(pesos) {
  const claves = Object.keys(pesos);
  let r = rnd() * claves.reduce((s, k) => s + pesos[k], 0);
  for (const k of claves) { r -= pesos[k]; if (r <= 0) return k; }
  return claves.at(-1);
}

// ---------- generación ----------
const ventana = [], web = [], afk = [], verdad = [];
const audibleUrl = (url) => !!url && url.includes("youtube.com/watch");

function emitir(ms, dur, item, intencion, incognito = false, sonando = null) {
  const [app, titulo, url] = item;
  ventana.push({ timestamp: iso(ms), duration: +dur.toFixed(3), data: { app, title: tituloVentana(app, titulo) }, _int: intencion });
  if (app === "chrome.exe") {
    web.push({ timestamp: iso(ms), duration: +dur.toFixed(3), data: {
      audible: sonando ?? (audibleUrl(url) && rnd() < 0.85), incognito, tabCount: 2 + Math.floor(rnd() * 11),
      title: titulo || "Nueva pestaña", url: url ?? "chrome://newtab/" } });
  }
}

for (const dia of DIAS) {
  const totales = {};
  const sumar = (k, s) => (totales[k] = (totales[k] ?? 0) + s);
  let primero = null, ultimo = null;

  for (const seg of dia.seg) {
    const ini = aUTC(dia.fecha, seg.de), fin = aUTC(dia.fecha, seg.a);
    primero ??= ini; ultimo = fin;

    if (seg.modo === "act") {
      afk.push({ timestamp: iso(ini), duration: (fin - ini) / 1000, data: { status: "not-afk" } });
      let t = ini, pool = sortear(seg.mezcla), item = elegir(CATALOGO[pool]);
      while (t < fin) {
        if (rnd() > 0.8) { pool = sortear(seg.mezcla); item = elegir(CATALOGO[pool]); }
        if (dia.raros && rnd() < 0.03) { const r = elegir(RAROS); pool = r[3]; item = r; }
        if (rnd() < 0.25) emitir(t, 0, item, pool, seg.incognito); // parpadeo de foco: duración 0
        const d = Math.min(Math.max(1, Math.round(durEvento(pool.startsWith("Estudio") ? 35 : 20) * 1000)), fin - t);
        emitir(t, d / 1000, item, pool, seg.incognito);
        if (dia.raros && rnd() < 0.02) emitir(t, d / 1000, item, pool); // marca de tiempo repetida
        sumar(pool, d / 1000);
        t += d;
      }
    } else {
      // afk / papel / video: la ventana se queda quieta en un solo evento largo.
      const pool = seg.ventana ?? "Neutral/Otros";
      let item = elegir(CATALOGO[pool]);
      if (seg.modo === "video") item = CATALOGO["Estudio/EDO"][0];
      if (seg.modo === "papel" && pool === "Estudio/EDO") item = CATALOGO["Estudio/EDO"][1];
      emitir(ini, (fin - ini) / 1000, item, pool, false, seg.modo === "video" ? true : null);
      afk.push({ timestamp: iso(ini), duration: (fin - ini) / 1000, data: { status: "afk" } });
      sumar(`(${seg.modo})`, (fin - ini) / 1000);
    }
  }

  const minutos = Object.fromEntries(Object.entries(totales).sort().map(([k, s]) => [k, Math.round(s / 60)]));
  verdad.push({
    fecha: dia.fecha, casos: dia.casos, descripcion: dia.desc,
    primera_actividad: primero ? iso(primero) : null,
    ultima_actividad: ultimo ? iso(ultimo) : null,
    segmentos: dia.seg.map(({ mezcla, ...s }) => ({ ...s, ...(mezcla ? { intenciones: Object.keys(mezcla) } : {}) })),
    minutos_por_intencion: minutos,
    minutos_por_clase_y_area: Object.entries(minutos).reduce((o, [k, m]) => (o[comoArea(k)] = (o[comoArea(k)] ?? 0) + m, o), {}),
  });
}

// AW exporta del más nuevo al más viejo.
const desc = (a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0);
const limpiar = (evs) => evs.map(({ _int, ...e }) => e).sort(desc);
const bucket = (id, type, client, events) => ({ buckets: { [id]: {
  id, created: "2026-10-04T12:00:00.000000+00:00", name: null, type, client, hostname: HOST, data: {}, events } } });

// Check-ins de ejemplo (formato §12 de la arquitectura).
const ck = (fecha, hhmm, tipo, ref_id, valor) => ({ timestamp: iso(aUTC(fecha, hhmm)), duration: 0, data: { tipo, ref_id, valor, nota: "" } });
const checkins = [
  ck("2026-10-05", "06:50", "despertar", "despertar", "06:45"),
  ck("2026-10-06", "10:30", "despertar", "despertar", "10:20"),
  ck("2026-10-07", "21:31", "papel", "b-edo-mie", "hecho"),
  ck("2026-10-09", "17:31", "papel", "b-edo-vie", "hecho"),
  ck("2026-10-13", "20:00", "rutina", "ejercicio", "hecho"),
  ck("2026-10-14", "21:31", "papel", "b-edo-mie", "hecho"),
  ck("2026-10-16", "17:31", "papel", "b-edo-vie", "hecho"),
  ck("2026-10-17", "09:20", "despertar", "despertar", "09:05"),
];

mkdirSync(SALIDA, { recursive: true });
const guardar = (nombre, obj) => writeFileSync(join(SALIDA, nombre), JSON.stringify(obj, null, 1));
guardar(`aw-bucket-export-aw-watcher-window_${HOST}.json`, bucket(`aw-watcher-window_${HOST}`, "currentwindow", "aw-watcher-window", limpiar(ventana)));
guardar(`aw-bucket-export-aw-watcher-web-chrome_${HOST}.json`, bucket(`aw-watcher-web-chrome_${HOST}`, "web.tab.current", "aw-client-web", limpiar(web)));
guardar(`aw-bucket-export-aw-watcher-afk_${HOST}.json`, bucket(`aw-watcher-afk_${HOST}`, "afkstatus", "aw-watcher-afk", limpiar(afk)));
guardar(`rastreador-checkins_${HOST}.json`, bucket(`rastreador-checkins_${HOST}`, "rastreador.checkin", "rastreador", limpiar(checkins)));
guardar("verdad.json", { semilla: SEMILLA, zona: "America/Lima", dias: verdad });
console.log(`ventana: ${ventana.length} · web: ${web.length} · afk: ${afk.length} · check-ins: ${checkins.length} · días: ${DIAS.length}`);
