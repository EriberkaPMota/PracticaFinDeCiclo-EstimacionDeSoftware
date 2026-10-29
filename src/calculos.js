'use strict';
// Cálculos de estimación: funciones puras, sin base de datos ni red.
// Tres Puntos (PERT): E = (O + 4M + P) / 6   y   σ = (P − O) / 6
// Wideband Delphi: dispersión = (máximo − mínimo) / mediana × 100

const HORAS_DIA = 8;
const DIAS_SEMANA = 5;

const esperado = (o, m, p) => (o + 4 * m + p) / 6;
const desviacion = (o, p) => (p - o) / 6;
const redondear = (n, d = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const suma = (a) => a.reduce((s, x) => s + x, 0);
const promedio = (a) => (a.length ? suma(a) / a.length : NaN);
function mediana(a) {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function tripleValida(o, m, p) {
  return [o, m, p].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) && o <= m && m <= p;
}

// Consenso de Tres Puntos: promedio de O, M y P de los expertos; luego E y σ sobre esos promedios.
function consensoTresPuntos(triples) {
  const o = promedio(triples.map((t) => t.optimista));
  const m = promedio(triples.map((t) => t.probable));
  const p = promedio(triples.map((t) => t.pesimista));
  return { optimista: o, probable: m, pesimista: p, esperado: esperado(o, m, p), sigma: desviacion(o, p), n: triples.length };
}

// Estadísticas de una ronda Delphi para una actividad.
function estadisticasDelphi(valores) {
  if (!valores.length) return null;
  const min = Math.min(...valores), max = Math.max(...valores), med = mediana(valores);
  return { n: valores.length, min, max, media: promedio(valores), mediana: med, dispersion: med > 0 ? ((max - min) / med) * 100 : null };
}

// Totales del proyecto a partir de los resultados por actividad.
function totales(resultados) {
  const E = suma(resultados.map((r) => r.esperado));
  const conSigma = resultados.filter((r) => r.sigma != null);
  const sigma = conSigma.length ? Math.sqrt(suma(conSigma.map((r) => r.sigma ** 2))) : null;
  return { esperado: E, sigma, n: resultados.length };
}

// Convierte un esfuerzo (horas o días-persona) en horas, semanas y costo.
function escenario(est, valor) {
  const horas = est.unidad === 'dias' ? valor * HORAS_DIA : valor;
  const capacidad = est.personas * est.horas_semana;
  const semanas = capacidad > 0 ? horas / capacidad : NaN;
  const mano = horas * est.tarifa;
  const ind = semanas * est.indirectos;
  return { valor, horas, semanas, dias: semanas * DIAS_SEMANA, mano_obra: mano, indirectos: ind, total: mano + ind };
}

module.exports = {
  HORAS_DIA, DIAS_SEMANA, esperado, desviacion, redondear, promedio, mediana, tripleValida,
  consensoTresPuntos, estadisticasDelphi, totales, escenario,
};
