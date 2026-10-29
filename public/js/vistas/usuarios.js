import { get, post, put } from '../api.js';
import { esc, leer, opciones, intentar, aviso, ROLES, fecha } from '../ui.js';

export async function mostrar(raiz, _p, sesion) {
  let lista = [], editando = null;
  const cargar = async () => { lista = await get('/usuarios'); };
  function html() {
    const x = editando ? lista.find((q) => q.id === editando) : null;
    return `<div><h1>Usuarios</h1><p class="lead">Registro de moderadores y expertos. Los expertos registrados aparecen en la lista al crear una estimación.</p></div>
    <section class="card"><div class="scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Especialidad</th><th>Estado</th><th>Creado</th><th></th></tr></thead><tbody>
      ${lista.map((q) => `<tr><td>${esc(q.nombre)}</td><td>${esc(q.correo)}</td><td>${ROLES[q.rol]}</td><td class="sub">${esc(q.especialidad) || '—'}</td><td>${q.activo ? '<span class="pill good">Activo</span>' : '<span class="pill muted">Inactivo</span>'}</td><td>${fecha(q.creado)}</td><td class="acts"><button class="btn sm ghost" data-act="editar" data-id="${q.id}">Editar</button></td></tr>`).join('')}</tbody></table></div></section>
    <form class="card" data-form="usuario" autocomplete="off"><h2>${x ? 'Editar usuario' : 'Nuevo usuario'}</h2><div class="grid-form">
      <label>Nombre<input name="nombre" required minlength="2" maxlength="80" value="${esc(x?.nombre)}"></label>
      <label>Correo<input name="correo" type="email" required value="${esc(x?.correo)}"></label>
      <label>Rol<select name="rol">${opciones(Object.entries(ROLES), x?.rol || 'experto')}</select></label>
      <label>Especialidad<input name="especialidad" maxlength="80" value="${esc(x?.especialidad)}"></label>
      <label>${x ? 'Nueva clave (opcional)' : 'Clave (mínimo 8 caracteres)'}<input name="clave" type="password" minlength="8" ${x ? '' : 'required'} autocomplete="new-password"></label>
      <label class="check"><input name="activo" type="checkbox" ${!x || x.activo ? 'checked' : ''}> Usuario activo</label></div>
      <div class="row"><button class="btn" type="submit">${x ? 'Guardar cambios' : 'Crear usuario'}</button>${x ? '<button class="btn ghost" type="button" data-act="cancelar">Cancelar</button>' : ''}</div></form>`;
  }
  async function pintar() { await cargar(); raiz.innerHTML = html(); }
  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'editar') { editando = Number(b.dataset.id); raiz.innerHTML = html(); window.scrollTo(0, document.body.scrollHeight); }
    if (b.dataset.act === 'cancelar') { editando = null; raiz.innerHTML = html(); }
  };
  raiz.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = leer(ev.target); if (!d.clave) delete d.clave;
    const r = await intentar(() => (editando ? put(`/usuarios/${editando}`, d) : post('/usuarios', d)));
    if (r) { aviso(editando ? 'Usuario actualizado.' : 'Usuario creado.'); editando = null; await pintar(); }
  };
  void sesion;
  await pintar();
}
