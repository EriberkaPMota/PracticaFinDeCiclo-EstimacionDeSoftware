// Utilidades de interfaz: escape de HTML, formato de números y fechas, avisos.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmt(n, d = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('es-DO', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const dinero = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : 'RD$ ' + Math.round(n).toLocaleString('es-DO'));
// Fecha de hoy según el reloj del navegador (no en UTC), formato AAAA-MM-DD.
export const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Muestra DD/MM/AAAA. Las fechas con hora vienen de la base en UTC y se pasan a la hora local; las fechas sin hora se dejan tal cual.
export function fecha(s) {
  if (!s) return '—';
  s = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-').reverse().join('/');
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s.slice(0, 10).split('-').reverse().join('/');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
// Resume el resultado del envío de invitaciones para mostrarlo al usuario.
export function resumenEnvios(lista = []) {
  const c = (e) => lista.filter((x) => x.estado === e).length;
  const err = lista.find((x) => x.estado === 'error');
  if (!lista.length) return { texto: '', error: false };
  if (err) return { texto: `${c('enviado')} correo(s) enviado(s), ${c('error')} con error. ${err.error}`, error: true };
  if (c('simulado')) return { texto: `El correo no está configurado: ${c('simulado')} invitación(es) quedaron guardadas, no se enviaron. Configúralo en Configuración → Correo o copia los enlaces.`, error: true };
  return { texto: `${c('enviado')} invitación(es) enviada(s) por correo.`, error: false };
}

let temporizador;
export function aviso(texto, error = false) {
  const t = document.getElementById('toast');
  t.textContent = texto; t.className = 'toast' + (error ? ' error' : ''); t.hidden = false;
  clearTimeout(temporizador); temporizador = setTimeout(() => { t.hidden = true; }, error ? 6000 : 3000);
}

export const ESTADOS = { borrador: ['muted', 'Borrador'], en_curso: ['info', 'En curso'], cerrada: ['good', 'Cerrada'], activo: ['good', 'Activo'], archivado: ['muted', 'Archivado'] };
export const pill = (estado) => { const [c, t] = ESTADOS[estado] || ['muted', estado]; return `<span class="pill ${c}">${t}</span>`; };
export const ROLES = { admin: 'Administrador', moderador: 'Moderador', experto: 'Experto' };

// Lee un formulario como objeto, convirtiendo campos numéricos.
export function leer(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') { o[el.name] = el.checked; continue; }
    if (el.type === 'number') { o[el.name] = el.value === '' ? null : Number(el.value); continue; }
    o[el.name] = el.value;
  }
  return o;
}
export const opciones = (lista, sel, vacio) =>
  (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') +
  lista.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`).join('');

// Ejecuta una acción de botón mostrando el error en un aviso.
export async function intentar(fn) {
  try { return await fn(); } catch (e) { aviso(e.message, true); return undefined; }
}
