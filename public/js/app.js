// Arranque: sesión, navegación por hash y montaje de cada vista.
import { get, post, alPerderSesion } from './api.js';
import { esc, aviso, ROLES } from './ui.js';
import * as inicio from './vistas/inicio.js';
import * as proyectos from './vistas/proyectos.js';
import * as proyecto from './vistas/proyecto.js';
import * as estimar from './vistas/estimar.js';
import * as estimacion from './vistas/estimacion.js';
import * as usuarios from './vistas/usuarios.js';
import * as configuracion from './vistas/configuracion.js';
import * as ayuda from './vistas/ayuda.js';
import * as cuenta from './vistas/cuenta.js';

const main = document.getElementById('main');
const top = document.getElementById('top');
let sesion = null;
let turnoVista = 0;
let destino = '#/';   // a dónde ir después de iniciar sesión (por ejemplo, el enlace de una invitación)
const irA = (h) => { if ((location.hash || '#/') === h) navegar(); else location.hash = h; };

const RUTAS = [
  [/^#\/?$/, inicio, []],
  [/^#\/proyectos$/, proyectos, []],
  [/^#\/proyectos\/(\d+)$/, proyecto, ['id']],
  [/^#\/estimar$/, estimar, []],
  [/^#\/estimar\/(\d+)$/, estimar, ['id']],
  [/^#\/estimaciones\/(\d+)$/, estimacion, ['id']],
  [/^#\/usuarios$/, usuarios, []],
  [/^#\/configuracion$/, configuracion, []],
  [/^#\/ayuda$/, ayuda, []],
  [/^#\/cuenta$/, cuenta, []],
];

function menu() {
  const esStaff = sesion.rol !== 'experto';
  const items = esStaff
    ? [['#/', 'Inicio'], ['#/proyectos', 'Proyectos'], ['#/estimar', 'Estimar'], ...(sesion.rol === 'admin' ? [['#/usuarios', 'Usuarios']] : []), ['#/configuracion', 'Configuración'], ['#/ayuda', 'Guía de uso']]
    : [['#/', 'Mis estimaciones'], ['#/ayuda', 'Guía de uso']];
  const actual = location.hash || '#/';
  document.getElementById('nav').innerHTML = items
    .map(([h, t]) => `<button data-ir="${h}"${(h === '#/' ? actual === '#/' || actual === '' : actual.startsWith(h)) ? ' aria-current="page"' : ''}>${t}</button>`).join('');
  document.getElementById('userbox').innerHTML = `<span><b>${esc(sesion.nombre)}</b> · ${ROLES[sesion.rol]}</span><button class="btn sm ghost" data-ir="#/cuenta">Mi cuenta</button><button class="btn sm ghost" data-salir>Salir</button>`;
}

function pantallaLogin(mensaje = '') {
  top.hidden = true;
  main.onclick = null; main.onsubmit = null;
  main.innerHTML = `<form class="card login" id="f-login" autocomplete="on">
    <div><h1>Iniciar sesión</h1><p class="lead">Estimador de Software UCE</p></div>
    <label>Correo<input name="correo" type="email" required autocomplete="username" autofocus></label>
    <label>Clave<input name="clave" type="password" required autocomplete="current-password"></label>
    <p class="msg" role="alert">${esc(mensaje)}</p>
    <button class="btn" type="submit">Entrar</button>
    <p class="note">¿Eres experto y no tienes cuenta? <a href="#/registro">Crear cuenta</a></p></form>`;
  main.onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      await post('/auth/login', { correo: f.get('correo'), clave: f.get('clave') });
      sesion = await get('/auth/yo');
      irA(destino); destino = '#/';
    } catch (e) { main.querySelector('.msg').textContent = e.message; }
  };
}

async function pantallaRegistro() {
  top.hidden = true;
  main.onclick = null; main.onsubmit = null;
  const token = new URLSearchParams((location.hash.split('?')[1] || '')).get('token') || '';
  let inv = null, aviso0 = '';
  if (token) { try { inv = await get('/auth/invitacion/' + encodeURIComponent(token)); } catch (e) { aviso0 = e.message; } }
  main.innerHTML = `<form class="card login" id="f-reg" autocomplete="on">
    <div><h1>Crear cuenta de experto</h1><p class="lead">${inv ? `Te invitaron a participar en la estimación «${esc(inv.titulo)}» del proyecto «${esc(inv.proyecto)}».` : 'Con tu cuenta podrás participar en las estimaciones a las que te inviten.'}</p></div>
    ${aviso0 ? `<div class="banner warn">${esc(aviso0)}</div>` : ''}
    <label>Nombre completo<input name="nombre" required minlength="2" maxlength="80" autocomplete="name"></label>
    <label>Correo<input name="correo" type="email" required autocomplete="username" value="${esc(inv ? inv.correo : '')}" ${inv ? 'readonly' : ''}></label>
    <label>Especialidad<input name="especialidad" maxlength="80" placeholder="Ej.: desarrollo web, bases de datos"></label>
    <label>Clave (mínimo 8 caracteres)<input name="clave" type="password" required minlength="8" autocomplete="new-password"></label>
    <label>Repite la clave<input name="clave2" type="password" required minlength="8" autocomplete="new-password"></label>
    <p class="msg" role="alert"></p>
    <button class="btn" type="submit">Crear cuenta</button>
    <p class="note">¿Ya tienes cuenta? <a href="#/">Iniciar sesión</a></p></form>`;
  main.onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), msg = main.querySelector('.msg');
    if (f.get('clave') !== f.get('clave2')) { msg.textContent = 'Las claves no coinciden.'; return; }
    try {
      const r = await post('/auth/registro', { nombre: f.get('nombre'), correo: f.get('correo'), clave: f.get('clave'), especialidad: f.get('especialidad'), ...(inv ? { token } : {}) });
      sesion = await get('/auth/yo');
      aviso('Cuenta creada.');
      irA(r.estimacion_id ? `#/estimaciones/${r.estimacion_id}` : '#/');
    } catch (e) { msg.textContent = e.message; }
  };
}

async function navegar() {
  if (!sesion) {
    if ((location.hash || '').startsWith('#/registro')) return pantallaRegistro();
    destino = location.hash && location.hash !== '#/' ? location.hash : '#/';
    return pantallaLogin();
  }
  if ((location.hash || '').startsWith('#/registro')) { location.hash = '#/'; return; }
  top.hidden = false; menu();
  const hash = location.hash || '#/';
  for (const [re, vista, nombres] of RUTAS) {
    const m = hash.match(re);
    if (!m) continue;
    const params = Object.fromEntries(nombres.map((n, i) => [n, Number(m[i + 1])]));
    // Cada vista trabaja sobre su propio contenedor: si una vista lenta termina después de que el usuario
    // ya cambió de pantalla, solo toca su contenedor descartado y no pisa los eventos de la vista actual.
    const raiz = document.createElement('div');
    raiz.className = 'vista';
    raiz.innerHTML = '<p class="empty">Cargando…</p>';
    const turno = ++turnoVista;
    main.replaceChildren(raiz);
    main.onclick = null; main.onsubmit = null; main.onchange = null;
    try { await vista.mostrar(raiz, params, sesion); }
    catch (e) { raiz.innerHTML = `<div class="card"><h2>No se pudo cargar</h2><p class="msg">${esc(e.message)}</p><div class="row"><a class="btn sm ghost" href="#/">Volver al inicio</a></div></div>`; }
    if (turno === turnoVista) window.scrollTo(0, 0);
    return;
  }
  main.innerHTML = '<div class="card"><h2>Página no encontrada</h2><a href="#/">Volver al inicio</a></div>';
}

document.addEventListener('click', async (ev) => {
  const ir = ev.target.closest('[data-ir]');
  if (ir) { location.hash = ir.dataset.ir; return; }
  if (ev.target.closest('[data-salir]')) { await post('/auth/logout'); sesion = null; location.hash = '#/'; pantallaLogin(); }
});
window.addEventListener('hashchange', navegar);
alPerderSesion(() => { if (sesion) { sesion = null; pantallaLogin('Tu sesión terminó. Inicia sesión de nuevo.'); } });

(async () => {
  try { sesion = await get('/auth/yo'); } catch { sesion = null; }
  await navegar();
})().catch((e) => aviso(e.message, true));
