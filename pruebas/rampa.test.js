// Pruebas de web/motor/rampa.js: la rampa del umbral de foco (arquitectura v6.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAMPA_FOCO_INICIAL, errorDeRampa, rampaVigente, umbralFoco, umbralesDelDia, rampaPendiente, proponerRampa, fechaDeMeta,
  focoFijo, focoFijoPendiente, proponerFocoCumplido,
} from '../web/motor/rampa.js';
import { UMBRALES_INICIALES, normalizarPlan, validarPlan, planVacio } from '../web/motor/plan.js';
import { resumirDia } from '../web/motor/resumen.js';
import { instanteLocal } from '../web/motor/fechas.js';

const HOY = '2026-11-14';
const MANANA = '2026-11-15';
const RAMPA = { inicio: HOY, ...RAMPA_FOCO_INICIAL }; // 40 % → 70 %, +4 puntos por semana
const con = (...rampas_foco) => ({ ...UMBRALES_INICIALES, rampas_foco });
const base = con({ aplica_desde: HOY, rampa: RAMPA });

/** Congela un objeto entero: si el código lo modifica, la prueba falla con TypeError. */
function congelar(objeto) {
  for (const valor of Object.values(objeto)) if (valor && typeof valor === 'object') congelar(valor);
  return Object.freeze(objeto);
}

test('valores iniciales: 40 % → 70 %, +4 puntos por semana', () => {
  assert.deepEqual({ ...RAMPA_FOCO_INICIAL }, { valor_inicial: 0.4, meta: 0.7, paso_por_semana: 0.04 });
});

test('umbralFoco: sube un paso cada 7 días desde el inicio y no pasa de la meta', () => {
  assert.equal(umbralFoco(base, '2026-11-14'), 0.4);   // día 0
  assert.equal(umbralFoco(base, '2026-11-20'), 0.4);   // día 6: todavía la primera semana
  assert.equal(umbralFoco(base, '2026-11-21'), 0.44);  // día 7
  assert.equal(umbralFoco(base, '2026-11-28'), 0.48);
  assert.equal(umbralFoco(base, '2026-12-26'), 0.64);  // 6 semanas
  assert.equal(umbralFoco(base, '2027-01-02'), 0.68);  // 7 semanas
  assert.equal(umbralFoco(base, '2027-01-09'), 0.7);   // 8 semanas: 0,72 → tope en la meta
  assert.equal(umbralFoco(base, '2028-06-01'), 0.7);   // y ahí se queda
});

test('umbralFoco: sin rampa, o antes de que empiece, vale el foco_cumplido fijo', () => {
  assert.equal(umbralFoco(UMBRALES_INICIALES, HOY), 0.7);
  assert.equal(umbralFoco({ ...UMBRALES_INICIALES, foco_cumplido: 0.6 }, HOY), 0.6);
  assert.equal(umbralFoco(base, '2026-11-13'), 0.7);   // el día anterior a aplica_desde
  // Vigente desde hoy, pero empieza el lunes 16: hasta entonces, el fijo.
  const futura = con({ aplica_desde: HOY, rampa: { ...RAMPA, inicio: '2026-11-16' } });
  assert.equal(umbralFoco(futura, '2026-11-15'), 0.7);
  assert.equal(umbralFoco(futura, '2026-11-16'), 0.4);
  // Empezó hace dos semanas (inicio anterior a aplica_desde): hoy ya va por el segundo paso.
  const atrasada = con({ aplica_desde: HOY, rampa: { ...RAMPA, inicio: '2026-10-31' } });
  assert.equal(umbralFoco(atrasada, HOY), 0.48);
  assert.equal(umbralFoco(null, HOY), 0.7);
});

test('umbralFoco solo depende de la fecha: nunca baja de un día al siguiente', () => {
  let anterior = 0;
  for (let d = 0; d < 120; d++) {
    const fecha = new Date(Date.parse(HOY + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
    const valor = umbralFoco(base, fecha);
    assert.ok(valor >= anterior, fecha);
    assert.ok(valor >= 0.4 && valor <= 0.7, fecha);
    anterior = valor;
  }
});

test('cada día se evalúa con la versión de su fecha: cambiar la rampa no reescribe el pasado', () => {
  const dos = con(
    { aplica_desde: HOY, rampa: RAMPA },
    { aplica_desde: '2026-11-28', rampa: { ...RAMPA, valor_inicial: 0.6, paso_por_semana: 0.05 } },
    { aplica_desde: '2026-12-20', rampa: null },
  );
  assert.equal(umbralFoco(dos, '2026-11-21'), 0.44);   // con la primera versión
  assert.equal(umbralFoco(dos, '2026-11-28'), 0.7);    // la segunda: 0,6 + 2 × 0,05 = 0,7
  assert.equal(umbralFoco(dos, '2026-12-25'), 0.7);    // sin rampa: el fijo
  assert.deepEqual(rampaVigente(dos, '2026-11-20'), RAMPA);
  assert.equal(rampaVigente(dos, '2026-12-25'), null);
  assert.equal(rampaVigente(dos, '2026-11-01'), null);
  // Las versiones mal formadas se ignoran (un plan editado a mano no rompe el cálculo).
  const rota = con({ aplica_desde: 'ayer', rampa: RAMPA }, { aplica_desde: HOY, rampa: { ...RAMPA, meta: 7 } }, null);
  assert.equal(umbralFoco(rota, HOY), 0.7);
});

test('umbralesDelDia: foco_cumplido del día; el de "parcial" nunca queda por encima', () => {
  const dia = umbralesDelDia(base, HOY);
  assert.equal(dia.foco_cumplido, 0.4);
  assert.equal(dia.foco_parcial, 0.4);
  assert.equal(dia.dia_cumplido, UMBRALES_INICIALES.dia_cumplido);
  const baja = umbralesDelDia(con({ aplica_desde: HOY, rampa: { ...RAMPA, valor_inicial: 0.3 } }), HOY);
  assert.deepEqual([baja.foco_cumplido, baja.foco_parcial], [0.3, 0.3]);
  assert.deepEqual(umbralesDelDia(UMBRALES_INICIALES, HOY), { ...UMBRALES_INICIALES });
  assert.equal(base.foco_cumplido, 0.7); // no modifica la entrada
});

test('proponerRampa: activar una rampa más baja que el fijo afloja → se aplica mañana', () => {
  const r = proponerRampa(congelar({ ...UMBRALES_INICIALES }), RAMPA, { hoy: HOY });
  assert.deepEqual([r.tipo, r.inmediato, r.aplicaDesde], ['afloja', false, MANANA]);
  assert.equal(umbralFoco(r.umbrales, HOY), 0.7);      // hoy sigue como estaba
  assert.equal(umbralFoco(r.umbrales, MANANA), 0.4);
  assert.deepEqual(rampaPendiente(r.umbrales, HOY), { aplica_desde: MANANA, rampa: RAMPA });
  assert.equal(rampaPendiente(r.umbrales, MANANA), null);
});

test('proponerRampa: endurecer vale desde hoy; un cambio que sube unos días y baja otros cuenta como aflojar', () => {
  const masDura = proponerRampa(congelar(structuredClone(base)), { ...RAMPA, valor_inicial: 0.5 }, { hoy: HOY });
  assert.deepEqual([masDura.tipo, masDura.inmediato, masDura.aplicaDesde], ['endurece', true, HOY]);
  assert.equal(umbralFoco(masDura.umbrales, HOY), 0.5);
  assert.equal(masDura.umbrales.rampas_foco.length, 1); // reemplaza la versión de hoy
  // Paso más rápido: endurece. Meta más alta: endurece. Quitar la rampa (vuelve al 70 % fijo): endurece.
  assert.equal(proponerRampa(base, { ...RAMPA, paso_por_semana: 0.1 }, { hoy: HOY }).tipo, 'endurece');
  assert.equal(proponerRampa(base, { ...RAMPA, meta: 0.8 }, { hoy: HOY }).tipo, 'endurece');
  const quitar = proponerRampa(base, null, { hoy: HOY });
  assert.deepEqual([quitar.tipo, quitar.inmediato, umbralFoco(quitar.umbrales, HOY)], ['endurece', true, 0.7]);
  // Empieza más alto pero con meta más baja: algún día pide menos → afloja.
  assert.equal(proponerRampa(base, { ...RAMPA, valor_inicial: 0.5, meta: 0.6 }, { hoy: HOY }).tipo, 'afloja');
  // Paso más lento, o empezar de nuevo más tarde: afloja.
  assert.equal(proponerRampa(base, { ...RAMPA, paso_por_semana: 0.02 }, { hoy: HOY }).tipo, 'afloja');
  assert.equal(proponerRampa(base, { ...RAMPA, inicio: '2026-11-30' }, { hoy: '2026-11-25' }).tipo, 'afloja');
});

test('proponerRampa: lo pendiente se reemplaza, y volver a lo de hoy lo cancela; el historial se conserva', () => {
  const pendiente = proponerRampa(base, { ...RAMPA, paso_por_semana: 0.02 }, { hoy: HOY }).umbrales;
  assert.equal(pendiente.rampas_foco.length, 2);
  const otra = proponerRampa(pendiente, { ...RAMPA, paso_por_semana: 0.03 }, { hoy: HOY });
  assert.equal(otra.tipo, 'afloja');
  assert.deepEqual(otra.umbrales.rampas_foco.map((v) => [v.aplica_desde, v.rampa.paso_por_semana]), [[HOY, 0.04], [MANANA, 0.03]]);
  const cancelar = proponerRampa(pendiente, RAMPA, { hoy: HOY });
  assert.deepEqual([cancelar.tipo, cancelar.umbrales.rampas_foco], ['igual', [{ aplica_desde: HOY, rampa: RAMPA }]]);
  // Un cambio semanas después deja la versión vieja para los días pasados.
  const despues = proponerRampa(base, { ...RAMPA, valor_inicial: 0.6 }, { hoy: '2026-11-28' });
  assert.equal(despues.tipo, 'endurece');
  assert.equal(umbralFoco(despues.umbrales, '2026-11-21'), 0.44);
  assert.equal(umbralFoco(despues.umbrales, '2026-11-28'), 0.68);
  // Sin rampa y pidiendo "sin rampa": no agrega nada.
  assert.equal('rampas_foco' in proponerRampa({ ...UMBRALES_INICIALES }, null, { hoy: HOY }).umbrales, false);
});

test('proponerRampa y errorDeRampa rechazan lo que no sirve', () => {
  assert.throws(() => proponerRampa(base, RAMPA, {}), /hoy/);
  assert.throws(() => proponerRampa(base, { ...RAMPA, valor_inicial: 0.9 }, { hoy: HOY }), /mayor que su meta/);
  assert.throws(() => proponerRampa(base, { ...RAMPA, meta: 70 }, { hoy: HOY }), /entre 0 y 1/);
  assert.equal(errorDeRampa(RAMPA), null);
  assert.match(errorDeRampa({ ...RAMPA, inicio: '14/11' }), /inicio/);
  assert.match(errorDeRampa({ ...RAMPA, paso_por_semana: -0.1 }), /paso/);
  assert.match(errorDeRampa(null), /objeto/);
});

test('fechaDeMeta: 40 % → 70 % a +4 por semana llega en 8 semanas', () => {
  assert.equal(fechaDeMeta(RAMPA), '2027-01-09');
  assert.equal(umbralFoco(base, '2027-01-08'), 0.68);
  assert.equal(fechaDeMeta({ ...RAMPA, paso_por_semana: 0 }), null);
  assert.equal(fechaDeMeta({ ...RAMPA, valor_inicial: 0.7 }), HOY);
  assert.equal(fechaDeMeta({ ...RAMPA, paso_por_semana: 0.1 }), '2026-12-05'); // 3 semanas (0,4 → 0,7)
});

test('el plan guarda y valida la rampa; sin rampa, los umbrales quedan como antes', () => {
  assert.equal('rampas_foco' in normalizarPlan(planVacio()).umbrales, false);
  const plan = { ...planVacio(), umbrales: structuredClone(base) };
  assert.deepEqual(normalizarPlan(plan).umbrales.rampas_foco, base.rampas_foco);
  assert.equal(validarPlan(plan).valido, true);
  const malo = { ...planVacio(), umbrales: con({ aplica_desde: HOY, rampa: { ...RAMPA, meta: 0.2 } }) };
  const { valido, errores } = validarPlan(malo);
  assert.equal(valido, false);
  assert.match(errores[0].ruta, /^umbrales\.rampas_foco/);
  assert.equal(validarPlan({ ...planVacio(), umbrales: { ...UMBRALES_INICIALES, rampas_foco: 'no' } }).valido, false);
});

test('resumirDia evalúa cada día con el umbral de su fecha: 50 % de foco es parcial sin rampa y cumplido con ella', () => {
  const fecha = '2026-11-16'; // lunes
  const t = (hora) => instanteLocal(fecha, hora);
  const plan = (umbrales) => normalizarPlan({
    ciclo: { nombre: 'x', inicio: '2026-11-01', fin: '2026-12-31' },
    cursos: [{ id: 'a', nombre: 'A', area: ['Estudio', 'Programación'], meta_horas_semana: 1, prioridad: 'media' }],
    bloques: [{ id: 'b', tipo: 'estudio_pc', curso: 'a', repeticion: { tipo: 'semanal', dias: ['lun'] }, inicio: '10:00', fin: '12:00', nivel: 'aviso' }],
    umbrales,
  });
  const seg = (inicio, fin, clase, categoria) => ({ inicio, fin, clase, categoria, area: clase === 'estudio' ? 'Programación' : null, app: 'x.exe', titulo: 't', url: null, dominio: null, audible: false, incognito: false });
  const segmentos = [
    seg(t('09:00'), t('10:00'), 'neutral', ['Neutral']),
    seg(t('10:00'), t('11:00'), 'estudio', ['Estudio', 'Programación']),   // 1 h de 2 h = 50 %
    seg(t('11:00'), t('12:00'), 'neutral', ['Neutral']),
  ];
  const dia = { fecha, inicio: t('09:00'), fin: t('12:00'), fuenteInicio: 'actividad', fuenteFin: 'actividad', cerrado: true, sinDatos: false, despiertoSeg: 3 * 3600 };
  const estado = (umbrales) => resumirDia(segmentos, plan(umbrales), [], dia).bloques[0].estado;
  assert.equal(estado({ ...UMBRALES_INICIALES }), 'parcial');
  assert.equal(estado(base), 'cumplido');                                             // el 16-nov el umbral es 40 %
  assert.equal(estado(con({ aplica_desde: HOY, rampa: { ...RAMPA, inicio: '2026-10-05' } })), 'parcial'); // 6 semanas: 64 %
});

// ── "Foco para cumplido" fijo: bajarlo espera a mañana ──

test('proponerFocoCumplido: bajarlo (aflojar) se aplica mañana; hoy y los días pasados siguen igual', () => {
  const r = proponerFocoCumplido(congelar({ ...UMBRALES_INICIALES }), 0.5, { hoy: HOY });
  assert.deepEqual([r.tipo, r.inmediato, r.aplicaDesde], ['afloja', false, MANANA]);
  assert.equal(r.umbrales.foco_cumplido, 0.7);            // el valor base no se toca
  assert.equal(focoFijo(r.umbrales, HOY), 0.7);
  assert.equal(focoFijo(r.umbrales, '2026-11-01'), 0.7);
  assert.equal(focoFijo(r.umbrales, MANANA), 0.5);
  assert.equal(umbralFoco(r.umbrales, HOY), 0.7);         // lo que usa el cumplimiento
  assert.equal(umbralFoco(r.umbrales, MANANA), 0.5);
  assert.deepEqual(focoFijoPendiente(r.umbrales, HOY), { aplica_desde: MANANA, valor: 0.5 });
  assert.equal(focoFijoPendiente(r.umbrales, MANANA), null);
});

test('proponerFocoCumplido: subirlo (endurecer) vale en el acto, sin cambiar los días anteriores', () => {
  const r = proponerFocoCumplido({ ...UMBRALES_INICIALES }, 0.8, { hoy: HOY });
  assert.deepEqual([r.tipo, r.inmediato, r.aplicaDesde], ['endurece', true, HOY]);
  assert.equal(focoFijo(r.umbrales, HOY), 0.8);
  assert.equal(focoFijo(r.umbrales, '2026-11-13'), 0.7);  // ayer se midió con 70 %
  assert.equal(focoFijoPendiente(r.umbrales, HOY), null);
});

test('proponerFocoCumplido: lo pendiente se reemplaza; volver al valor de hoy lo cancela; se compara con lo vigente hoy', () => {
  const pendiente = proponerFocoCumplido({ ...UMBRALES_INICIALES }, 0.5, { hoy: HOY }).umbrales;
  const otro = proponerFocoCumplido(pendiente, 0.6, { hoy: HOY });
  assert.deepEqual([otro.tipo, otro.umbrales.focos_cumplido], ['afloja', [{ aplica_desde: MANANA, valor: 0.6 }]]);
  const cancelar = proponerFocoCumplido(pendiente, 0.7, { hoy: HOY });
  assert.equal(cancelar.tipo, 'igual');
  assert.equal('focos_cumplido' in cancelar.umbrales, false);
  // Con algo pendiente, subir sobre el valor de hoy sigue siendo endurecer (y quita lo pendiente).
  const subir = proponerFocoCumplido(pendiente, 0.75, { hoy: HOY });
  assert.deepEqual([subir.tipo, subir.umbrales.focos_cumplido], ['endurece', [{ aplica_desde: HOY, valor: 0.75 }]]);
  // Al día siguiente, el 50 % ya vale: subir a 60 % endurece y bajar a 40 % afloja.
  assert.equal(proponerFocoCumplido(pendiente, 0.6, { hoy: MANANA }).tipo, 'endurece');
  assert.equal(proponerFocoCumplido(pendiente, 0.4, { hoy: MANANA }).tipo, 'afloja');
});

test('proponerFocoCumplido rechaza valores fuera de rango; el plan guarda y valida las versiones', () => {
  assert.throws(() => proponerFocoCumplido({ ...UMBRALES_INICIALES }, 70, { hoy: HOY }), /entre 0 y 1/);
  assert.throws(() => proponerFocoCumplido({ ...UMBRALES_INICIALES }, 0, { hoy: HOY }), /entre 0 y 1/);
  assert.throws(() => proponerFocoCumplido({ ...UMBRALES_INICIALES }, 0.5, {}), /hoy/);
  const umbrales = proponerFocoCumplido({ ...UMBRALES_INICIALES }, 0.5, { hoy: HOY }).umbrales;
  const plan = { ...planVacio(), umbrales };
  assert.deepEqual(normalizarPlan(plan).umbrales.focos_cumplido, [{ aplica_desde: MANANA, valor: 0.5 }]);
  assert.equal(validarPlan(plan).valido, true);
  assert.equal(validarPlan({ ...planVacio(), umbrales: { ...UMBRALES_INICIALES, focos_cumplido: [{ aplica_desde: HOY, valor: 5 }] } }).valido, false);
  assert.equal('focos_cumplido' in normalizarPlan(planVacio()).umbrales, false);
  // Las versiones mal formadas se ignoran al calcular.
  assert.equal(focoFijo({ ...UMBRALES_INICIALES, focos_cumplido: [{ aplica_desde: 'ayer', valor: 0.1 }, null] }, HOY), 0.7);
});

test('con una rampa vigente manda la rampa; al quitarla vuelve el foco fijo de ese día', () => {
  const conFoco = proponerFocoCumplido(structuredClone(base), 0.8, { hoy: HOY }).umbrales; // rampa 40 % + fijo 80 %
  assert.equal(umbralFoco(conFoco, HOY), 0.4);
  const sinRampa = proponerRampa(conFoco, null, { hoy: HOY }).umbrales;
  assert.equal(umbralFoco(sinRampa, HOY), 0.8);
});
