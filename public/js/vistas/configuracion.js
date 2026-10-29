import { get, put, post } from '../api.js';
import { esc, intentar, aviso } from '../ui.js';

export async function mostrar(raiz, _p, sesion) {
  const admin = sesion.rol === 'admin';
  async function pintar() {
    const [metodos, cfg, mail] = await Promise.all([get('/metodos'), get('/configuracion'), get('/correo/config')]);
    const dis = admin ? '' : 'disabled';
    raiz.innerHTML = `<div><h1>Configuración</h1><p class="lead">Parámetros de los métodos de estimación y valores por defecto. ${admin ? 'Los cambios aplican a las estimaciones nuevas.' : 'Solo el administrador puede modificarlos.'}</p></div>
    <form class="card" data-form="correo" autocomplete="off"><div class="card-h"><h2>Correo para las invitaciones</h2>
        <span class="pill ${mail.activo ? 'good' : 'warn'}">${mail.activo ? 'Configurado' : 'Sin configurar (modo simulado)'}</span></div>
      <p class="note">Aquí pones la cuenta desde la que se envían las invitaciones a los estimadores. ${admin ? '' : '<b>Solo el administrador puede cambiarla.</b>'}</p>
      <details class="card-sub" ${mail.activo ? '' : 'open'}><summary><b>Cómo usar tu cuenta de Gmail</b></summary>
        <ol class="note"><li>Entra a tu cuenta de Google → <b>Seguridad</b> y activa la <b>verificación en dos pasos</b>.</li>
        <li>Abre <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a>, crea una contraseña de aplicación (nombre: «Estimador UCE») y copia las 16 letras.</li>
        <li>Aquí abajo pulsa <b>Usar Gmail</b>, escribe tu correo en «Usuario» y pega esas 16 letras en «Contraseña de aplicación» (no tu contraseña normal).</li>
        <li>Guarda y pulsa <b>Enviar correo de prueba</b>.</li></ol></details>
      <div class="row"><button class="btn sm ghost" type="button" data-act="gmail" ${dis}>Usar Gmail</button></div>
      <div class="grid-form">
        <label>Servidor SMTP<input name="host" maxlength="120" value="${esc(mail.host)}" placeholder="smtp.gmail.com" ${dis}></label>
        <label>Puerto<input name="puerto" type="number" min="1" max="65535" value="${mail.puerto}" ${dis}></label>
        <label class="check"><input name="seguro" type="checkbox" ${mail.seguro ? 'checked' : ''} ${dis}> Conexión SSL directa (puerto 465)</label>
        <label>Usuario (tu correo)<input name="usuario" type="email" maxlength="120" value="${esc(mail.usuario)}" placeholder="tucuenta@gmail.com" ${dis}></label>
        <label>Contraseña de aplicación<input name="clave" type="password" maxlength="200" autocomplete="new-password" placeholder="${mail.tiene_clave ? '•••••••• (guardada; déjala vacía para conservarla)' : 'xxxx xxxx xxxx xxxx'}" ${dis}></label>
        <label>Remitente (opcional)<input name="remitente" maxlength="160" value="${esc(mail.remitente)}" placeholder="Estimador UCE &lt;tucuenta@gmail.com&gt;" ${dis}></label>
        <label class="span2">Dirección pública de la aplicación (para los enlaces de las invitaciones)<input name="base_url" maxlength="200" value="${esc(mail.base_url)}" placeholder="https://xxxx.ngrok-free.app" ${dis}>
          <span class="sub">Si usas ngrok, pega aquí la dirección https que te muestra. Si la dejas vacía se usa la dirección con la que abriste esta página.</span></label>
      </div>
      ${admin ? `<div class="row"><button class="btn sm" type="submit">Guardar correo</button>
        <input name="para" type="email" style="max-width:260px" placeholder="Enviar la prueba a…" aria-label="Correo para la prueba">
        <button class="btn sm ghost" type="button" data-act="probar">Enviar correo de prueba</button></div><p class="msg" data-res></p>` : ''}</form>
    ${metodos.map((m) => `<form class="card" data-form="metodo" data-id="${m.id}"><div class="card-h"><h2>${esc(m.nombre)}</h2><label class="check"><input type="checkbox" name="activo" ${m.activo ? 'checked' : ''} ${dis}> Método activo</label></div>
      <p class="note">${esc(m.descripcion)}</p>
      <div class="grid-form">${m.parametros.map((p) => `<label>${esc(p.etiqueta)}<input type="number" name="${esc(p.clave)}" min="${p.minimo}" max="${p.maximo}" step="any" value="${p.valor}" ${dis}><span class="sub">${esc(p.ayuda)}</span></label>`).join('')}</div>
      ${admin ? '<div class="row"><button class="btn sm" type="submit">Guardar</button></div>' : ''}</form>`).join('')}
    <form class="card" data-form="general"><h2>Valores por defecto de las estimaciones</h2><p class="note">Se usan como valores iniciales al aplicar un método a un proyecto; se pueden cambiar en cada estimación.</p>
      <div class="grid-form">${cfg.map((c) => `<label>${esc(c.etiqueta)}<input type="number" name="${esc(c.clave)}" min="0" step="any" value="${c.valor}" ${dis}></label>`).join('')}</div>
      ${admin ? '<div class="row"><button class="btn sm" type="submit">Guardar</button></div>' : ''}</form>`;
  }
  raiz.onclick = async (ev) => {
    const a = ev.target.closest('[data-act]')?.dataset.act;
    const f = raiz.querySelector('[data-form="correo"]');
    if (a === 'gmail') { f.elements.host.value = 'smtp.gmail.com'; f.elements.puerto.value = 587; f.elements.seguro.checked = false; f.elements.usuario.focus(); }
    if (a === 'probar') {
      const res = f.querySelector('[data-res]'); res.textContent = 'Enviando…'; res.className = 'msg';
      const r = await intentar(() => post('/correo/prueba', { para: f.elements.para.value.trim() || undefined }));
      if (r) { res.textContent = r.estado === 'enviado' ? `Listo: se envió un correo de prueba a ${r.para}. Revisa tu bandeja (y spam).` : (r.error || 'No se pudo enviar.'); res.className = 'msg' + (r.estado === 'enviado' ? ' ok' : ''); }
      else res.textContent = '';
    }
  };
  raiz.onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.dataset.form === 'correo') {
      const e = f.elements;
      const cuerpo = { host: e.host.value.trim(), puerto: Number(e.puerto.value), seguro: e.seguro.checked, usuario: e.usuario.value.trim(), clave: e.clave.value, remitente: e.remitente.value.trim(), base_url: e.base_url.value.trim() };
      if (await intentar(() => put('/correo/config', cuerpo))) { aviso('Configuración de correo guardada. Pulsa «Enviar correo de prueba» para comprobarla.'); await pintar(); }
      return;
    }
    if (f.dataset.form === 'metodo') {
      const parametros = {};
      for (const el of f.elements) if (el.type === 'number') parametros[el.name] = Number(el.value);
      if (await intentar(() => put(`/metodos/${f.dataset.id}`, { activo: f.elements.activo.checked, parametros }))) { aviso('Método actualizado.'); await pintar(); }
    } else {
      const d = {}; for (const el of f.elements) if (el.type === 'number') d[el.name] = Number(el.value);
      if (await intentar(() => put('/configuracion', d))) aviso('Valores guardados.');
    }
  };
  await pintar();
}
