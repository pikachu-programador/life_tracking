// Pruebas de web/motor/plan.js (F3-01): UMBRALES_INICIALES, planVacio, normalizarPlan y validarPlan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UMBRALES_INICIALES, planVacio, normalizarPlan, validarPlan } from '../web/motor/plan.js';
import { COLORES_CURSO } from '../web/motor/tipos.js';
import { planEjemplo } from './ayudantes/ejemplo.js';

/** Plan chico, armado a mano, válido y sin avisos (ya está en la forma normalizada). */
function planBase() {
  return {
    version: 1,
    ciclo: { nombre: '2026-2', inicio: '2026-08-24', fin: '2026-12-12' },
    cursos: [
      { id: 'bd1', nombre: 'BD I', area: ['Estudio', 'Programación'], color: 'curso-1', meta_horas_semana: 6, prioridad: 'media' },
      { id: 'est', nombre: 'Estadística', area: ['Estudio', 'Matemáticas'], color: 'curso-2', meta_horas_semana: 4, prioridad: 'alta' },
    ],
    clases: [
      { id: 'c-bd1-lun-0800', curso: 'bd1', tipo: 'teoria', dias: ['lun'], inicio: '08:00', fin: '10:00', lugar: 'UTEC', usa_pc: false },
    ],
    rutinas: [
      { id: 'despertar', nombre: 'Despertar', dias: ['lun'], inicio: '07:00', medicion: 'dia_logico', evento: 'despertar', tolerancia_min: 30 },
      { id: 'ingles', nombre: 'Inglés diario', dias: ['lun'], medicion: 'pc', categoria: ['Estudio', 'Inglés'], minutos_meta: 15, tolerancia_min: 0 },
    ],
    bloques: [
      {
        id: 'b-bd1-lun', tipo: 'estudio_pc', curso: 'bd1', repeticion: { tipo: 'semanal', dias: ['lun'] },
        inicio: '15:00', fin: '17:00', nivel: 'friccion', objetivo: 'SQL', por_que: 'Llegar bien al examen.', terminados_antes: [],
      },
      {
        id: 'b-est-mar', tipo: 'estudio_pc', curso: 'est', repeticion: { tipo: 'semanal', dias: ['mar'] },
        inicio: '15:00', fin: '17:00', nivel: 'aviso', objetivo: '', por_que: '', terminados_antes: [],
      },
    ],
    excepciones: [{ desde: '2026-10-08', hasta: '2026-10-08', tipo: 'feriado', efecto: 'cancelar_clases_y_bloques' }],
    umbrales: { ...UMBRALES_INICIALES },
  };
}

/** Un bloque semanal con valores por defecto, para agregar en las pruebas de solapes. */
function bloque(id, dias, inicio, fin, extra = {}) {
  return {
    id, tipo: 'estudio_pc', curso: 'est', repeticion: { tipo: 'semanal', dias }, inicio, fin,
    nivel: 'aviso', objetivo: '', por_que: '', terminados_antes: [], ...extra,
  };
}

function bloqueUnico(id, fecha, inicio, fin) {
  return bloque(id, [], inicio, fin, { repeticion: { tipo: 'unica', fecha } });
}

/** validarPlan de una copia de planBase() después de aplicarle `cambiar`. */
function validarCon(cambiar) {
  const plan = planBase();
  cambiar(plan);
  return validarPlan(plan);
}

/** Comprueba que hay un error en `ruta` cuyo mensaje coincide con `patron` (y que el plan no es válido). */
function hayError(resultado, ruta, patron) {
  const encontrado = resultado.errores.find((e) => e.ruta === ruta && patron.test(e.mensaje));
  assert.ok(encontrado, `falta un error en "${ruta}" que diga ${patron}; hay: ${JSON.stringify(resultado.errores, null, 1)}`);
  assert.equal(resultado.valido, false);
}

function hayAviso(resultado, ruta, patron) {
  const encontrado = resultado.avisos.find((a) => a.ruta === ruta && patron.test(a.mensaje));
  assert.ok(encontrado, `falta un aviso en "${ruta}" que diga ${patron}; hay: ${JSON.stringify(resultado.avisos, null, 1)}`);
}

// ── UMBRALES_INICIALES y planVacio ──

test('UMBRALES_INICIALES: los valores de §8, congelados', () => {
  assert.deepEqual(UMBRALES_INICIALES, {
    tolerancia_inicio_min: 10, foco_cumplido: 0.7, foco_parcial: 0.4, dia_cumplido: 0.8, hueco_sueno_h: 3, peso_despertar_dormir_min: 30,
  });
  assert.ok(Object.isFrozen(UMBRALES_INICIALES));
});

test('planVacio: válido, sin avisos, y un objeto nuevo en cada llamada', () => {
  const vacio = planVacio();
  assert.deepEqual(vacio, {
    version: 1, ciclo: { nombre: '', inicio: '', fin: '' },
    cursos: [], clases: [], rutinas: [], bloques: [], excepciones: [], umbrales: { ...UMBRALES_INICIALES },
  });
  assert.deepEqual(validarPlan(vacio), { valido: true, errores: [], avisos: [] });
  vacio.cursos.push({ id: 'x' });
  vacio.umbrales.foco_cumplido = 0.9;
  assert.deepEqual(planVacio().cursos, []);
  assert.equal(planVacio().umbrales.foco_cumplido, 0.7);
});

// ── normalizarPlan ──

test('normalizarPlan del plan de ejemplo: colores, ids de clases, eventos y terminados_antes', () => {
  const plan = normalizarPlan(planEjemplo());
  assert.equal(plan.version, 1);
  assert.deepEqual(plan.cursos.map((c) => c.color), COLORES_CURSO.slice(0, 7)); // en orden: curso-1 … curso-7
  assert.deepEqual(plan.clases.map((c) => c.id), [
    'c-bd1-lun-0800', 'c-edo-lun-1000', 'c-dbp-mar-1400', 'c-est-mie-0800', 'c-p3-jue-0800', 'c-pi2-jue-1000', 'c-ing-vie-1000',
  ]);
  const evento = Object.fromEntries(plan.rutinas.map((r) => [r.id, r.evento]));
  assert.deepEqual(evento, { despertar: 'despertar', 'despertar-finde': 'despertar', dormir: 'dormir', 'ingles-pc': undefined, ejercicio: undefined });
  assert.ok(plan.bloques.every((b) => Array.isArray(b.terminados_antes) && b.terminados_antes.length === 0));
  assert.deepEqual(plan.umbrales, UMBRALES_INICIALES);
  assert.equal(plan.excepciones[0].nota, 'Combate de Angamos'); // la nota de una excepción es del modelo
});

test('normalizarPlan no modifica la entrada ni comparte objetos con ella', () => {
  const original = planEjemplo();
  const copia = structuredClone(original);
  const plan = normalizarPlan(original);
  assert.deepEqual(original, copia);
  plan.cursos[0].area.push('Otra');
  plan.bloques[0].repeticion.dias.push('dom');
  plan.excepciones[0].nota = 'cambiada';
  assert.deepEqual(original, copia);
});

test('normalizarPlan es idempotente y deja igual un plan ya normalizado', () => {
  const una = normalizarPlan(planEjemplo());
  const dos = normalizarPlan(una);
  assert.deepEqual(dos, una);
  assert.equal(JSON.stringify(dos), JSON.stringify(una)); // también el orden de las claves
  assert.deepEqual(normalizarPlan(planBase()), planBase());
});

test('normalizarPlan sin plan (null, undefined, texto, lista) da planVacio()', () => {
  for (const nada of [null, undefined, 'plan', 42, []]) assert.deepEqual(normalizarPlan(nada), planVacio());
  // Un objeto vacío también: es un plan de una versión vieja sin nada.
  assert.deepEqual(normalizarPlan({}), planVacio());
});

test('normalizarPlan completa los umbrales que faltan y deja los que vienen', () => {
  const plan = normalizarPlan({ umbrales: { foco_cumplido: 0.8, hueco_sueno_h: null } });
  assert.deepEqual(plan.umbrales, { ...UMBRALES_INICIALES, foco_cumplido: 0.8 });
});

test('normalizarPlan quita los campos que no son del modelo, en todos los niveles', () => {
  const entrada = planBase();
  entrada.nota = 'suelta';
  entrada.ciclo.color = 'azul';
  entrada.cursos[0].comentario = 'x';
  entrada.bloques[0].repeticion.fecha = '2026-10-05'; // una repetición semanal no lleva fecha
  entrada.bloques[0].extra = true;
  entrada.umbrales.otro = 1;
  entrada.excepciones[0].nota = 'Feriado';
  const plan = normalizarPlan(entrada);
  assert.equal('nota' in plan, false);
  assert.equal('color' in plan.ciclo, false);
  assert.equal('comentario' in plan.cursos[0], false);
  assert.deepEqual(plan.bloques[0].repeticion, { tipo: 'semanal', dias: ['lun'] });
  assert.equal('extra' in plan.bloques[0], false);
  assert.equal('otro' in plan.umbrales, false);
  assert.equal(plan.excepciones[0].nota, 'Feriado');
});

test('normalizarPlan: color de curso, el primero libre en orden; con más de 8 se repiten', () => {
  const plan = normalizarPlan({ cursos: [{ id: 'a', color: 'curso-1' }, { id: 'b' }, { id: 'c', color: 'curso-3' }, { id: 'd', color: '' }] });
  assert.deepEqual(plan.cursos.map((c) => c.color), ['curso-1', 'curso-2', 'curso-3', 'curso-4']);
  const nueve = normalizarPlan({ cursos: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}` })) });
  assert.deepEqual(nueve.cursos.map((c) => c.color), [...COLORES_CURSO, 'curso-1']);
  // Un color inválido no se cambia: lo reporta validarPlan.
  assert.equal(normalizarPlan({ cursos: [{ id: 'a', color: 'rojo' }] }).cursos[0].color, 'rojo');
});

test('normalizarPlan: id de clase c-<curso>-<días>-<HHMM>, con los días en orden de la semana', () => {
  const plan = normalizarPlan({
    clases: [
      { curso: 'bd1', dias: ['mie', 'lun'], inicio: '08:00', fin: '10:00' },
      { id: 'mi-clase', curso: 'bd1', dias: ['lun'], inicio: '08:00', fin: '10:00' },
      { dias: ['lun'], inicio: '08:00', fin: '10:00' }, // sin curso: no se puede armar el id
      { curso: 'bd1', dias: ['lun'], inicio: '8:00', fin: '10:00' }, // hora inválida: tampoco
    ],
  });
  assert.deepEqual(plan.clases.map((c) => c.id), ['c-bd1-lunmie-0800', 'mi-clase', undefined, undefined]);
  assert.deepEqual(plan.clases[0].dias, ['mie', 'lun']); // los días de la clase no se reordenan
  assert.equal(plan.clases[0].lugar, '');
  assert.equal(plan.clases[0].usa_pc, false);
});

test('normalizarPlan: si dos clases dan el mismo id, se agrega -2, -3… en orden de aparición', () => {
  const clase = (extra) => ({ curso: 'bd1', dias: ['lun'], inicio: '08:00', fin: '10:00', ...extra });
  const plan = normalizarPlan({
    clases: [clase({ tipo: 'teoria' }), clase({ tipo: 'laboratorio' }), clase({ lugar: 'A-101' }), clase({ dias: ['mar'] })],
  });
  assert.deepEqual(plan.clases.map((c) => c.id), ['c-bd1-lun-0800', 'c-bd1-lun-0800-2', 'c-bd1-lun-0800-3', 'c-bd1-mar-0800']);
  // Un id escrito a mano se respeta y el armado no choca con él, aunque venga antes en la lista.
  const conEscrito = normalizarPlan({ clases: [clase({}), clase({ id: 'c-bd1-lun-0800' })] });
  assert.deepEqual(conEscrito.clases.map((c) => c.id), ['c-bd1-lun-0800-2', 'c-bd1-lun-0800']);
  // Normalizar otra vez no cambia nada, y el plan queda sin ids repetidos.
  assert.deepEqual(normalizarPlan(plan), plan);
  const cursos = [{ id: 'bd1', nombre: 'BD I', area: ['Estudio'], meta_horas_semana: 1, prioridad: 'baja' }];
  const bloques = [{ id: 'b', tipo: 'estudio_pc', curso: 'bd1', repeticion: { tipo: 'semanal', dias: ['dom'] }, inicio: '15:00', fin: '16:00', nivel: 'aviso' }];
  const resultado = validarPlan({ cursos, bloques, clases: [clase({ tipo: 'teoria' }), clase({ tipo: 'laboratorio' })] });
  assert.equal(resultado.errores.some((e) => /repetido/.test(e.mensaje)), false);
});

test('normalizarPlan: evento de las rutinas dia_logico, deducido del id o del nombre', () => {
  const plan = normalizarPlan({
    rutinas: [
      { id: 'sueno', nombre: 'Hora de DORMIR', medicion: 'dia_logico', inicio: '01:00' },
      { id: 'dormir-tarde', nombre: 'Acostarse', medicion: 'dia_logico', inicio: '01:00' },
      { id: 'levantarse', nombre: 'Levantarse', medicion: 'dia_logico', inicio: '07:00' },
      { id: 'raro', nombre: 'Dormir', medicion: 'dia_logico', evento: 'despertar', inicio: '07:00' }, // el que viene manda
      { id: 'dormir-pc', nombre: 'Dormir', medicion: 'checkin' }, // solo en dia_logico
    ],
  });
  assert.deepEqual(plan.rutinas.map((r) => r.evento), ['dormir', 'dormir', 'despertar', 'despertar', undefined]);
});

test('normalizarPlan: quita los opcionales vacíos de las rutinas, completa bloques y excepciones', () => {
  const plan = normalizarPlan({
    cursos: [{ id: 'bd1', area: 'Estudio > Programación' }],
    rutinas: [{ id: 'r', nombre: 'R', dias: ['lun'], inicio: '', fin: null, medicion: 'checkin', categoria: null, tolerancia_min: 5 }],
    bloques: [{ id: 'b', repeticion: { tipo: 'unica', fecha: '2026-10-17', dias: ['lun'] }, inicio: '25:00', terminados_antes: [{ fecha: '2026-10-17', fin: '15:00' }] }],
    excepciones: [{ desde: '2026-10-08', tipo: 'feriado', efecto: 'cancelar_bloques', nota: '' }],
  });
  assert.deepEqual(plan.cursos[0].area, ['Estudio', 'Programación']);
  assert.deepEqual(plan.rutinas[0], { id: 'r', nombre: 'R', dias: ['lun'], medicion: 'checkin', tolerancia_min: 5 });
  assert.deepEqual(plan.bloques[0], {
    id: 'b', repeticion: { tipo: 'unica', fecha: '2026-10-17' }, inicio: '25:00', // la hora inválida no se toca
    objetivo: '', por_que: '', terminados_antes: [{ fecha: '2026-10-17', fin: '15:00', motivo: '' }],
  });
  assert.deepEqual(plan.excepciones[0], { desde: '2026-10-08', hasta: '2026-10-08', tipo: 'feriado', efecto: 'cancelar_bloques' });
});

// ── validarPlan: planes válidos ──

test('validarPlan: el plan de ejemplo es válido tras normalizarPlan (y su único aviso es el curso sin bloques)', () => {
  const resultado = validarPlan(normalizarPlan(planEjemplo()));
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(resultado.avisos.map((a) => a.ruta), ['cursos[ing]']);
  assert.match(resultado.avisos[0].mensaje, /^Curso "ing": no tiene bloques de estudio/);
  // validarPlan normaliza una copia, así que el plan sin normalizar da lo mismo (y no se modifica).
  const crudo = planEjemplo();
  assert.deepEqual(validarPlan(crudo), resultado);
  assert.deepEqual(crudo, planEjemplo());
});

test('validarPlan: el plan armado a mano es válido y sin avisos', () => {
  assert.deepEqual(validarPlan(planBase()), { valido: true, errores: [], avisos: [] });
});

// ── validarPlan: errores, uno por tipo ──

test('validarPlan: el mensaje de una hora inválida es claro y accionable', () => {
  const resultado = validarCon((p) => { p.bloques[0].fin = '25:00'; });
  assert.deepEqual(resultado.errores, [{
    ruta: 'bloques[b-bd1-lun].fin',
    mensaje: 'Bloque "b-bd1-lun": la hora de fin "25:00" no es válida (usa HH:MM, de 00:00 a 23:59).',
  }]);
  assert.equal(resultado.valido, false);
});

test('validarPlan: horas y fechas inválidas', () => {
  hayError(validarCon((p) => { p.clases[0].inicio = '8:00'; }), 'clases[c-bd1-lun-0800].inicio', /la hora de inicio "8:00" no es válida \(usa HH:MM/);
  hayError(validarCon((p) => { delete p.bloques[0].inicio; }), 'bloques[b-bd1-lun].inicio', /falta la hora de inicio \(usa HH:MM/);
  hayError(validarCon((p) => { p.ciclo.inicio = '2026-02-30'; }), 'ciclo.inicio', /^Ciclo: la fecha de inicio "2026-02-30" no es válida \(usa AAAA-MM-DD/);
  hayError(validarCon((p) => { p.ciclo.fin = ''; }), 'ciclo.fin', /^Ciclo: falta la fecha de fin/);
  hayError(validarCon((p) => { p.excepciones[0].desde = 'mañana'; }), 'excepciones[0].desde', /^Excepción 1: la fecha "desde" "mañana" no es válida/);
});

test('validarPlan: campos obligatorios', () => {
  hayError(validarCon((p) => { delete p.cursos[0].nombre; }), 'cursos[bd1].nombre', /^Curso "bd1": falta el nombre\.$/);
  hayError(validarCon((p) => { delete p.cursos[0].meta_horas_semana; }), 'cursos[bd1].meta_horas_semana', /falta la meta de horas por semana/);
  hayError(validarCon((p) => { p.cursos[0].meta_horas_semana = -1; }), 'cursos[bd1].meta_horas_semana', /de 0 o más; ahora es -1/);
  hayError(validarCon((p) => { delete p.bloques[0].tipo; }), 'bloques[b-bd1-lun].tipo', /falta el tipo \(usa estudio_pc, estudio_papel o examen\)/);
  hayError(validarCon((p) => { delete p.bloques[0].nivel; }), 'bloques[b-bd1-lun].nivel', /falta el nivel/);
  hayError(validarCon((p) => { delete p.rutinas[0].nombre; }), 'rutinas[despertar].nombre', /falta el nombre/);
  hayError(validarCon((p) => { delete p.rutinas[0].tolerancia_min; }), 'rutinas[despertar].tolerancia_min', /falta la tolerancia/);
  hayError(validarCon((p) => { p.rutinas[1].dias = []; }), 'rutinas[ingles].dias', /elige al menos un día/);
  hayError(validarCon((p) => { p.ciclo.nombre = ''; }), 'ciclo.nombre', /^Ciclo: falta el nombre/);
  hayError(validarCon((p) => { delete p.excepciones[0].efecto; }), 'excepciones[0].efecto', /^Excepción del 2026-10-08: falta el efecto/);
  hayError(validarCon((p) => { p.clases[0].usa_pc = 'si'; }), 'clases[c-bd1-lun-0800].usa_pc', /"usa_pc" tiene que ser true/);
  hayError(validarCon((p) => { p.bloques[0].objetivo = 5; }), 'bloques[b-bd1-lun].objetivo', /el objetivo tiene que ser un texto; ahora es 5/);
});

test('validarPlan: ids que faltan, repetidos (por tipo) o con caracteres no permitidos', () => {
  const repetido = validarCon((p) => { p.bloques.push(bloque('b-bd1-lun', ['mie'], '15:00', '17:00')); });
  hayError(repetido, 'bloques[b-bd1-lun].id', /^Bloque "b-bd1-lun": el id está repetido \(bloques 1 y 3\); cada bloque necesita uno distinto\.$/);
  // El mismo id en listas distintas no es un problema.
  assert.equal(validarCon((p) => { p.rutinas[0].id = 'bd1'; }).valido, true);
  hayError(validarCon((p) => { delete p.bloques[0].id; }), 'bloques[0].id', /^Bloque 1: falta el id\.$/);
  hayError(validarCon((p) => { p.bloques[0].id = 'b bd1'; }), 'bloques[b bd1].id', /solo puede tener letras, números, "-" y "_"/);
  hayError(validarCon((p) => { p.cursos[0].id = 'bd.1'; p.clases = []; p.bloques[0].curso = 'bd.1'; }), 'cursos[bd.1].id', /sin espacios, puntos ni "@"/);
  // Una clase sin id ni curso: el id no se puede poner solo, y se dice por qué.
  const sinCurso = validarCon((p) => { delete p.clases[0].id; delete p.clases[0].curso; });
  hayError(sinCurso, 'clases[0].id', /^Clase 1: falta el id \(se pone solo si la clase tiene curso, días y hora de inicio\)\.$/);
  hayError(sinCurso, 'clases[0].curso', /^Clase 1: falta el curso\.$/);
  // Con letras con tilde sí se puede.
  assert.equal(validarCon((p) => { p.bloques[0].id = 'b-inglés-ñ_2'; }).valido, true);
});

test('validarPlan: referencias a cursos que no existen', () => {
  hayError(validarCon((p) => { p.clases[0].curso = 'xyz'; }), 'clases[c-bd1-lun-0800].curso', /el curso "xyz" no existe; créalo en Cursos o elige otro\./);
  hayError(validarCon((p) => { p.bloques[1].curso = 'est2'; }), 'bloques[b-est-mar].curso', /el curso "est2" no existe/);
});

test('validarPlan: valores fuera de las listas de tipos.js', () => {
  hayError(validarCon((p) => { p.bloques[0].nivel = 'alto'; }), 'bloques[b-bd1-lun].nivel', /el nivel "alto" no existe \(usa ninguno, aviso, friccion o total\)/);
  hayError(validarCon((p) => { p.bloques[0].tipo = 'repaso'; }), 'bloques[b-bd1-lun].tipo', /el tipo "repaso" no existe/);
  hayError(validarCon((p) => { p.clases[0].tipo = 'practica'; }), 'clases[c-bd1-lun-0800].tipo', /\(usa teoria o laboratorio\)/);
  hayError(validarCon((p) => { p.clases[0].dias = ['lunes', 'mar', 'mar']; }), 'clases[c-bd1-lun-0800].dias', /el día "lunes" no existe \(usa lun, mar, mie, jue, vie, sab o dom\)/);
  hayError(validarCon((p) => { p.clases[0].dias = ['lun', 'lun']; }), 'clases[c-bd1-lun-0800].dias', /el día "lun" está repetido/);
  hayError(validarCon((p) => { p.clases[0].dias = 'lun'; }), 'clases[c-bd1-lun-0800].dias', /tienen que ser una lista/);
  hayError(validarCon((p) => { p.rutinas[1].medicion = 'reloj'; }), 'rutinas[ingles].medicion', /la medición "reloj" no existe \(usa pc, checkin o dia_logico\)/);
  hayError(validarCon((p) => { p.rutinas[0].evento = 'siesta'; }), 'rutinas[despertar].evento', /el evento "siesta" no existe \(usa despertar o dormir\)/);
  hayError(validarCon((p) => { p.cursos[0].prioridad = 'urgente'; }), 'cursos[bd1].prioridad', /\(usa alta, media o baja\)/);
  hayError(validarCon((p) => { p.cursos[0].color = 'rojo'; }), 'cursos[bd1].color', /el color "rojo" no existe \(usa curso-1, .* o curso-8\)/);
  hayError(validarCon((p) => { p.excepciones[0].tipo = 'vacaciones'; }), 'excepciones[0].tipo', /\(usa feriado, examenes o libre\)/);
  hayError(validarCon((p) => { p.excepciones[0].efecto = 'borrar'; }), 'excepciones[0].efecto', /\(usa cancelar_clases_y_bloques, subir_bloques_a_total o cancelar_bloques\)/);
});

test('validarPlan: fin igual a inicio (en bloques, clases y rutinas con franja)', () => {
  hayError(validarCon((p) => { p.bloques[0].fin = '15:00'; }), 'bloques[b-bd1-lun].fin', /empieza y termina a la misma hora \(15:00\); cambia la hora de fin/);
  hayError(validarCon((p) => { p.clases[0].fin = '08:00'; }), 'clases[c-bd1-lun-0800].fin', /empieza y termina a la misma hora \(08:00\)/);
  hayError(validarCon((p) => { p.rutinas[1].inicio = '21:00'; p.rutinas[1].fin = '21:00'; }), 'rutinas[ingles].fin', /misma hora/);
  // En dia_logico el fin no se usa: igual al inicio (como en el plan de ejemplo) está bien.
  assert.equal(validarCon((p) => { p.rutinas[0].fin = '07:00'; }).valido, true);
});

test('validarPlan: ciclo con inicio > fin y excepción con desde > hasta', () => {
  hayError(validarCon((p) => { p.ciclo.inicio = '2026-12-12'; p.ciclo.fin = '2026-08-24'; }), 'ciclo.fin',
    /^Ciclo: la fecha de inicio \(2026-12-12\) es posterior a la de fin \(2026-08-24\)\.$/);
  hayError(validarCon((p) => { p.excepciones[0].desde = '2026-10-09'; }), 'excepciones[0].hasta',
    /"desde" \(2026-10-09\) es posterior a "hasta" \(2026-10-08\); cámbialas de lugar\./);
});

test('validarPlan: umbrales fuera de rango', () => {
  hayError(validarCon((p) => { p.umbrales.foco_cumplido = 1.5; }), 'umbrales.foco_cumplido', /^Umbrales: el foco para "cumplido" \(foco_cumplido\) tiene que ser un número entre 0 y 1/);
  hayError(validarCon((p) => { p.umbrales.foco_parcial = 70; }), 'umbrales.foco_parcial', /ahora es 70 \(para 70 % escribe 0\.7\)/);
  hayError(validarCon((p) => { p.umbrales.foco_parcial = 0.8; }), 'umbrales.foco_parcial',
    /el foco para "parcial" \(0\.8\) tiene que ser menor que el foco para "cumplido" \(0\.7\)/);
  hayError(validarCon((p) => { p.umbrales.foco_parcial = 0.7; }), 'umbrales.foco_parcial', /tiene que ser menor/); // iguales tampoco
  hayError(validarCon((p) => { p.umbrales.dia_cumplido = -0.1; }), 'umbrales.dia_cumplido', /entre 0 y 1/);
  hayError(validarCon((p) => { p.umbrales.tolerancia_inicio_min = -5; }), 'umbrales.tolerancia_inicio_min', /un número de 0 o más; ahora es -5/);
  hayError(validarCon((p) => { p.umbrales.hueco_sueno_h = 0; }), 'umbrales.hueco_sueno_h', /un número mayor que 0; ahora es 0/);
  hayError(validarCon((p) => { p.umbrales.peso_despertar_dormir_min = 'treinta'; }), 'umbrales.peso_despertar_dormir_min', /ahora es "treinta"/);
  hayError(validarCon((p) => { p.umbrales.foco_cumplido = Number.NaN; }), 'umbrales.foco_cumplido', /entre 0 y 1/);
  // Los bordes valen: focos en 0 y 1, tolerancias en 0.
  assert.equal(validarCon((p) => { Object.assign(p.umbrales, { foco_cumplido: 1, foco_parcial: 0, dia_cumplido: 1, tolerancia_inicio_min: 0, peso_despertar_dormir_min: 0 }); }).valido, true);
});

test('validarPlan: rutinas pc sin categoría o sin minutos_meta, dia_logico sin hora y franjas a medias', () => {
  hayError(validarCon((p) => { delete p.rutinas[1].categoria; }), 'rutinas[ingles].categoria', /con medición "pc" necesita la categoría de AW que cuenta/);
  hayError(validarCon((p) => { p.rutinas[1].categoria = []; }), 'rutinas[ingles].categoria', /necesita la categoría/);
  hayError(validarCon((p) => { delete p.rutinas[1].minutos_meta; }), 'rutinas[ingles].minutos_meta', /con medición "pc" necesita los minutos de meta/);
  hayError(validarCon((p) => { p.rutinas[1].minutos_meta = 0; }), 'rutinas[ingles].minutos_meta', /un número mayor que 0; ahora es 0/);
  hayError(validarCon((p) => { delete p.rutinas[0].inicio; }), 'rutinas[despertar].inicio', /con medición "dia_logico" necesita la hora objetivo en "inicio"/);
  hayError(validarCon((p) => { p.rutinas[1].inicio = '21:00'; }), 'rutinas[ingles].fin', /tiene hora de inicio pero no de fin; pon las dos o ninguna/);
  hayError(validarCon((p) => { p.rutinas[1].fin = '22:00'; }), 'rutinas[ingles].inicio', /tiene hora de fin pero no de inicio/);
  // Sin franja (ni inicio ni fin) está bien: cuenta en todo el día lógico.
  assert.equal(validarPlan(planBase()).valido, true);
});

test('validarPlan: curso cuya área no empieza con "Estudio"', () => {
  hayError(validarCon((p) => { p.cursos[0].area = ['Distracción', 'Video']; }), 'cursos[bd1].area',
    /^Curso "bd1": el área tiene que empezar con "Estudio" \(por ejemplo \["Estudio", "Programación"\]\); ahora es "Distracción > Video"\.$/);
  hayError(validarCon((p) => { delete p.cursos[0].area; }), 'cursos[bd1].area', /falta el área/);
  hayError(validarCon((p) => { p.cursos[0].area = [1, 2]; }), 'cursos[bd1].area', /tiene que ser una lista de textos/);
  // Escrita como texto se acepta (normalizarPlan la pasa a lista).
  assert.equal(validarCon((p) => { p.cursos[0].area = 'Estudio > Programación'; }).valido, true);
});

test('validarPlan: repetición de los bloques (semanal sin días, única sin fecha válida)', () => {
  hayError(validarCon((p) => { p.bloques[0].repeticion.dias = []; }), 'bloques[b-bd1-lun].repeticion.dias', /es semanal pero no tiene días/);
  hayError(validarCon((p) => { p.bloques[0].repeticion = { tipo: 'unica' }; }), 'bloques[b-bd1-lun].repeticion.fecha', /es un bloque único pero no tiene fecha/);
  hayError(validarCon((p) => { p.bloques[0].repeticion = { tipo: 'unica', fecha: '2026-13-01' }; }), 'bloques[b-bd1-lun].repeticion.fecha', /la fecha "2026-13-01" no es válida/);
  hayError(validarCon((p) => { p.bloques[0].repeticion = { tipo: 'mensual' }; }), 'bloques[b-bd1-lun].repeticion.tipo', /la repetición "mensual" no existe/);
  hayError(validarCon((p) => { delete p.bloques[0].repeticion; }), 'bloques[b-bd1-lun].repeticion', /falta la repetición/);
});

test('validarPlan: "terminado antes" fuera del bloque, repetido o en otro día', () => {
  hayError(validarCon((p) => { p.bloques[0].terminados_antes = [{ fecha: '2026-10-05', fin: '18:00', motivo: '' }]; }),
    'bloques[b-bd1-lun].terminados_antes[0].fin', /la hora real de fin "18:00" del 2026-10-05 tiene que estar dentro del bloque \(de 15:00 a 17:00\)/);
  hayError(validarCon((p) => { p.bloques[0].terminados_antes = [{ fecha: '2026-10-05', fin: '14:59' }]; }),
    'bloques[b-bd1-lun].terminados_antes[0].fin', /dentro del bloque/);
  hayError(validarCon((p) => { p.bloques[0].terminados_antes = [{ fecha: 'ayer', fin: '16:00' }]; }),
    'bloques[b-bd1-lun].terminados_antes[0].fecha', /no es válida/);
  // Dentro de un bloque que cruza la medianoche: 00:10 está dentro de 23:30–00:30.
  const cruza = validarCon((p) => {
    p.bloques.push(bloque('b-noche', ['mar'], '23:30', '00:30', { terminados_antes: [{ fecha: '2026-10-06', fin: '00:10', motivo: 'sueño' }] }));
  });
  assert.equal(cruza.valido, true, JSON.stringify(cruza.errores));
  // Repetido y en un día sin el bloque: solo avisos.
  const avisos = validarCon((p) => {
    p.bloques[0].terminados_antes = [
      { fecha: '2026-10-05', fin: '16:00', motivo: '' }, { fecha: '2026-10-05', fin: '16:30', motivo: '' }, { fecha: '2026-10-06', fin: '16:00', motivo: '' },
    ];
  });
  assert.equal(avisos.valido, true);
  hayAviso(avisos, 'bloques[b-bd1-lun].terminados_antes[1].fecha', /hay más de un "terminado antes" para el 2026-10-05; se usa el último/);
  hayAviso(avisos, 'bloques[b-bd1-lun].terminados_antes[2].fecha', /del 2026-10-06 \(martes\) cae en un día sin este bloque; no se usa/);
});

test('validarPlan: forma general (no es un objeto, listas que no son listas, elementos que no son objetos)', () => {
  for (const nada of [null, undefined, 'plan', []]) {
    const resultado = validarPlan(nada);
    assert.equal(resultado.valido, false);
    assert.equal(resultado.errores[0].ruta, '');
    assert.match(resultado.errores[0].mensaje, /^El plan tiene que ser un objeto JSON/);
  }
  hayError(validarCon((p) => { p.cursos = 'bd1'; }), 'cursos', /"cursos" tiene que ser una lista \(entre corchetes \[ \]\); ahora es "bd1"/);
  hayError(validarCon((p) => { p.umbrales = 5; }), 'umbrales', /"umbrales" tiene que ser un objeto/);
  hayError(validarCon((p) => { p.bloques.push(null); }), 'bloques[2]', /^Bloque 3: tiene que ser un objeto con sus campos/);
  hayError(validarCon((p) => { p.bloques[0].terminados_antes = ['16:00']; }), 'bloques[b-bd1-lun].terminados_antes[0]', /tiene que ser \{"fecha", "fin", "motivo"\}/);
});

test('validarPlan: cada error dice de qué se trata y termina en punto', () => {
  const resultado = validarCon((p) => {
    p.cursos[0].area = ['Neutral'];
    p.clases[0].inicio = '99:99';
    p.rutinas[1].medicion = 'x';
    p.bloques[0].nivel = '';
    p.excepciones[0].hasta = '2026-10-01';
    p.umbrales.foco_parcial = 2;
  });
  assert.ok(resultado.errores.length >= 6);
  for (const { ruta, mensaje } of resultado.errores) {
    assert.ok(ruta.length > 0);
    assert.match(mensaje, /^(Curso|Clase|Rutina|Bloque|Excepción|Ciclo|Umbrales)\b.*\.$/);
  }
});

// ── validarPlan: avisos ──

test('validarPlan avisa de bloques que se solapan el mismo día de la semana (y sigue siendo válido)', () => {
  const resultado = validarCon((p) => { p.bloques.push(bloque('b-x', ['lun'], '16:00', '18:00')); });
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.avisos, [{
    ruta: 'bloques[b-bd1-lun]',
    mensaje: 'Los bloques "b-bd1-lun" y "b-x" se solapan el lunes (15:00–17:00 y 16:00–18:00).',
  }]);
  // Varios días en el mismo aviso.
  const dos = validarCon((p) => {
    p.bloques[0].repeticion.dias = ['lun', 'mie'];
    p.bloques.push(bloque('b-x', ['mie', 'lun'], '16:00', '18:00'));
  });
  hayAviso(dos, 'bloques[b-bd1-lun]', /se solapan el lunes y el miércoles/);
  assert.equal(dos.avisos.length, 1);
});

test('validarPlan no avisa de bloques que solo se tocan o están en otro día', () => {
  assert.deepEqual(validarCon((p) => { p.bloques.push(bloque('b-x', ['lun'], '17:00', '19:00')); }).avisos, []);
  assert.deepEqual(validarCon((p) => { p.bloques.push(bloque('b-x', ['mie'], '15:00', '17:00')); }).avisos, []);
});

test('validarPlan: solapes que cruzan la medianoche y el fin de semana', () => {
  // "martes 23:30–00:30" y "martes 00:00–01:00" (madrugada del miércoles) se solapan.
  hayAviso(validarCon((p) => {
    p.bloques.push(bloque('b-noche', ['mar'], '23:30', '00:30'), bloque('b-madrugada', ['mar'], '00:00', '01:00'));
  }), 'bloques[b-noche]', /"b-noche" y "b-madrugada" se solapan el martes/);
  // Pero "miércoles 00:00–01:00" es la madrugada del jueves: no toca al bloque del martes.
  assert.deepEqual(validarCon((p) => {
    p.bloques.push(bloque('b-noche', ['mar'], '23:30', '00:30'), bloque('b-madrugada', ['mie'], '00:00', '01:00'));
  }).avisos, []);
  // "domingo 23:00–05:00" termina el lunes a las 05:00: choca con "lunes 04:30–06:00".
  hayAviso(validarCon((p) => {
    p.bloques.push(bloque('b-dom', ['dom'], '23:00', '05:00'), bloque('b-lun-temprano', ['lun'], '04:30', '06:00'));
  }), 'bloques[b-dom]', /"b-dom" y "b-lun-temprano" se solapan el domingo/);
});

test('validarPlan avisa de un bloque que se solapa con una clase', () => {
  const resultado = validarCon((p) => { p.bloques.push(bloque('b-x', ['lun'], '09:00', '11:00')); });
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.avisos, [{
    ruta: 'bloques[b-x]',
    mensaje: 'El bloque "b-x" se solapa con la clase "c-bd1-lun-0800" el lunes (09:00–11:00 y 08:00–10:00).',
  }]);
});

test('validarPlan: bloques únicos (solapes por fecha y fuera del ciclo)', () => {
  // 2026-10-05 es lunes y está en el ciclo: choca con el semanal del lunes.
  hayAviso(validarCon((p) => { p.bloques.push(bloqueUnico('b-u', '2026-10-05', '16:00', '17:30')); }),
    'bloques[b-bd1-lun]', /"b-bd1-lun" y "b-u" se solapan el lunes \(15:00–17:00 y 16:00–17:30\)/);
  // Dos únicos el mismo día.
  hayAviso(validarCon((p) => {
    p.bloques.push(bloqueUnico('b-u1', '2026-10-10', '10:00', '12:00'), bloqueUnico('b-u2', '2026-10-10', '11:00', '13:00'));
  }), 'bloques[b-u1]', /"b-u1" y "b-u2" se solapan el sábado 2026-10-10/);
  // Dos únicos en fechas distintas: no.
  assert.deepEqual(validarCon((p) => {
    p.bloques.push(bloqueUnico('b-u1', '2026-10-10', '10:00', '12:00'), bloqueUnico('b-u2', '2026-10-17', '11:00', '13:00'));
  }).avisos, []);
  // Fuera del ciclo (un lunes): se avisa, y no choca con los semanales porque ahí no existen.
  const fuera = validarCon((p) => { p.bloques.push(bloqueUnico('b-u', '2027-01-04', '15:00', '17:00')); });
  assert.equal(fuera.valido, true);
  assert.deepEqual(fuera.avisos, [{
    ruta: 'bloques[b-u].repeticion.fecha',
    mensaje: 'Bloque "b-u": su fecha (2027-01-04) está fuera del ciclo (2026-08-24 a 2026-12-12); igual aparece ese día.',
  }]);
});

test('validarPlan avisa de un curso sin bloques y de un plan con clases pero sin ciclo', () => {
  const sinBloques = validarCon((p) => {
    p.cursos.push({ id: 'ing', nombre: 'Inglés', area: ['Estudio', 'Inglés'], color: 'curso-3', meta_horas_semana: 3, prioridad: 'media' });
  });
  assert.equal(sinBloques.valido, true);
  assert.deepEqual(sinBloques.avisos, [{
    ruta: 'cursos[ing]',
    mensaje: 'Curso "ing": no tiene bloques de estudio, así que no se le van a contar horas ni se podrá medir su meta semanal.',
  }]);
  const sinCiclo = validarCon((p) => { p.ciclo = { nombre: '', inicio: '', fin: '' }; });
  assert.equal(sinCiclo.valido, true);
  hayAviso(sinCiclo, 'ciclo', /no tiene fechas, así que las clases y los bloques semanales no aparecen en ningún día/);
});

test('validarPlan con otro inicio de día: "00:30" ya no es de la madrugada siguiente', () => {
  const cambiar = (p) => { p.bloques.push(bloque('b-noche', ['mar'], '23:30', '00:30'), bloque('b-temprano', ['mar'], '00:00', '01:00')); };
  // Con 04:00, "martes 00:00–01:00" es la madrugada del miércoles y choca con "martes 23:30–00:30".
  assert.equal(validarCon(cambiar).avisos.length, 1);
  // Con 00:00, "martes 00:00–01:00" es el comienzo del martes: no choca.
  const plan = planBase();
  cambiar(plan);
  assert.deepEqual(validarPlan(plan, { inicioDia: '00:00' }).avisos, []);
});
