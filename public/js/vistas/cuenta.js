import { put } from '../api.js';
import { esc, leer, intentar, aviso, ROLES } from '../ui.js';

// Mi cuenta: cualquier usuario cambia su propia clave.
export async function mostrar(raiz, _p, sesion) {
  raiz.innerHTML = `<div><h1>Mi cuenta</h1><p class="lead">${esc(sesion.nombre)} · ${esc(sesion.correo)} · ${ROLES[sesion.rol]}</p></div>
    <form class="card" data-form="clave" autocomplete="off"><h2>Cambiar mi clave</h2>
      <p class="note">Si el administrador te asignó una clave, cámbiala aquí por una que solo tú conozcas.</p>
      <div class="grid-form">
        <label>Clave actual<input name="actual" type="password" required autocomplete="current-password"></label>
        <label>Clave nueva (mínimo 8 caracteres)<input name="nueva" type="password" required minlength="8" maxlength="100" autocomplete="new-password"></label>
        <label>Repite la clave nueva<input name="repite" type="password" required maxlength="100" autocomplete="new-password"></label>
      </div>
      <p class="msg" role="alert"></p>
      <div class="row"><button class="btn" type="submit">Cambiar clave</button></div></form>`;
  raiz.onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target, d = leer(f), msg = f.querySelector('.msg');
    msg.textContent = '';
    if (d.nueva !== d.repite) { msg.textContent = 'Las claves nuevas no coinciden.'; return; }
    const r = await intentar(() => put('/auth/clave', { actual: d.actual, nueva: d.nueva }));
    if (r) { f.reset(); aviso('Clave cambiada.'); }
  };
}
