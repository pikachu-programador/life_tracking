// Pruebas de web/js/dom.js. Node no tiene DOM: se arma un "document" falso con lo mínimo que usa el().
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

class NodoFalso {
  constructor(etiqueta, ns = null) {
    this.etiqueta = etiqueta; this.ns = ns; this.atributos = {}; this.hijos = []; this.escuchas = {}; this.estilos = {};
    this.style = { setProperty: (p, v) => { this.estilos[p] = v; } };
  }
  setAttribute(k, v) { this.atributos[k] = String(v); }
  addEventListener(tipo, f) { (this.escuchas[tipo] ??= []).push(f); }
  append(...hijos) { this.hijos.push(...hijos); }
  replaceChildren(...hijos) { this.hijos = hijos; }
}

let el, svg, reemplazar;
before(async () => {
  globalThis.document = {
    createElement: (e) => new NodoFalso(e),
    createElementNS: (ns, e) => new NodoFalso(e, ns),
  };
  ({ el, svg, reemplazar } = await import('../web/js/dom.js'));
});

test('el() pone atributos, eventos, estilos e hijos', () => {
  const alHacerClic = () => {};
  const n = el('button', { class: 'boton', disabled: true, hidden: false, title: null, onclick: alHacerClic, style: { '--valor': '40%' } },
    'Texto', 3, null, false, ['a', ['b']]);
  assert.equal(n.etiqueta, 'button');
  assert.deepEqual(n.atributos, { class: 'boton', disabled: '' });
  assert.deepEqual(n.escuchas.click, [alHacerClic]);
  assert.deepEqual(n.estilos, { '--valor': '40%' });
  assert.deepEqual(n.hijos, ['Texto', '3', 'a', 'b']); // null y false se saltan; los números pasan a texto
});

test('svg() usa el espacio de nombres de SVG', () => {
  const n = svg('circle', { r: 4 });
  assert.equal(n.ns, 'http://www.w3.org/2000/svg');
  assert.deepEqual(n.atributos, { r: '4' });
});

test('reemplazar() cambia todo el contenido', () => {
  const c = el('div', {}, 'viejo');
  reemplazar(c, 'nuevo', null, ['x']);
  assert.deepEqual(c.hijos, ['nuevo', 'x']);
});
