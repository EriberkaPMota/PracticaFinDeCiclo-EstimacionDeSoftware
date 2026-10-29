'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/calculos');

const cerca = (a, b, d = 1e-9) => assert.ok(Math.abs(a - b) < d, `${a} ≠ ${b}`);

test('E y sigma de una tarea', () => {
  cerca(C.esperado(20, 30, 46), 31);
  cerca(C.desviacion(20, 46), 26 / 6);
});
test('validación de O ≤ M ≤ P', () => {
  assert.equal(C.tripleValida(1, 2, 3), true);
  assert.equal(C.tripleValida(3, 2, 1), false);
  assert.equal(C.tripleValida(-1, 2, 3), false);
  assert.equal(C.tripleValida(1, null, 3), false);
});
test('consenso: ejemplo del profesor (promedio de dos expertos)', () => {
  const c = C.consensoTresPuntos([{ optimista: 60, probable: 80, pesimista: 120 }, { optimista: 70, probable: 90, pesimista: 140 }]);
  cerca(c.optimista, 65); cerca(c.probable, 85); cerca(c.pesimista, 130);
});
test('sigma total = raíz de la suma de varianzas', () => {
  const t = C.totales([{ esperado: 10, sigma: 3 }, { esperado: 5, sigma: 4 }]);
  cerca(t.esperado, 15); cerca(t.sigma, 5);
});
test('dispersión Delphi', () => {
  const s = C.estadisticasDelphi([20, 40, 28]);
  assert.equal(s.mediana, 28); cerca(s.dispersion, (40 - 20) / 28 * 100);
});
test('escenario: semanas, costo e indirectos', () => {
  const e = C.escenario({ unidad: 'horas', personas: 2, horas_semana: 15, tarifa: 350, indirectos: 1500 }, 136.8333333333);
  cerca(e.semanas, 4.561111, 1e-4); cerca(Math.round(e.total), 54733, 1);
  const d = C.escenario({ unidad: 'dias', personas: 1, horas_semana: 40, tarifa: 100, indirectos: 0 }, 5);
  cerca(d.horas, 40); cerca(d.semanas, 1);
});
