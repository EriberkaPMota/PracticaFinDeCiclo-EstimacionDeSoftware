import { get, post } from '../api.js';
import { esc, pill, fecha, leer, intentar, aviso, hoyLocal } from '../ui.js';

export async function mostrar(raiz) {
  const lista = await get('/proyectos');
  const hoy = hoyLocal();
  raiz.innerHTML = `<div class="card-h"><div><h1>Proyectos</h1><p class="lead">Aquí se definen los proyectos a estimar. Para estimarlos usa la opción «Estimar» del menú: allí eliges el proyecto y el método.</p></div>
      <button class="btn" data-act="nuevo">+ Nuevo proyecto</button></div>
    <form class="card" id="f-nuevo" hidden autocomplete="off"><h2>Definir un proyecto</h2>
      <p class="note">Registra el problema y los datos generales. Los requisitos, módulos y actividades se agregan en la pantalla del proyecto.</p>
      <div class="grid-form">
        <label>Nombre del proyecto<input name="nombre" required minlength="3" maxlength="100"></label>
        <label>Cliente<input name="cliente" maxlength="100"></label>
        <label>Fecha de registro<input type="date" value="${hoy}" disabled></label>
        <label>Fecha requerida por el cliente<input name="fecha_requerida" type="date" min="${hoy}" required></label>
        <label class="span2">Descripción<textarea class="libre" name="descripcion" maxlength="1000"></textarea></label>
        <label class="span2">Definición del problema<textarea class="libre" name="problema" maxlength="2000" placeholder="¿Qué problema resuelve el sistema y para quién?"></textarea></label>
      </div>
      <div class="row"><button class="btn" type="submit">Crear proyecto</button><button class="btn ghost" type="button" data-act="cancelar">Cancelar</button></div></form>
    <section class="card">${lista.length ? `<div class="scroll"><table><thead><tr><th>Proyecto</th><th>Cliente</th><th>Fecha requerida</th><th class="r">Req.</th><th class="r">Módulos</th><th class="r">Activ.</th><th>Estimaciones</th><th></th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td><b>${esc(p.nombre)}</b> ${p.estado === 'archivado' ? pill('archivado') : ''}</td><td>${esc(p.cliente) || '—'}</td><td>${fecha(p.fecha_requerida)}</td>
        <td class="r">${p.n_requisitos}</td><td class="r">${p.n_modulos}</td><td class="r">${p.n_actividades}</td>
        <td>${p.estimaciones.length ? p.estimaciones.map((e) => `<a href="#/estimaciones/${e.id}" class="pill ${e.estado === 'cerrada' ? 'good' : e.estado === 'en_curso' ? 'info' : 'muted'}" title="${esc(e.titulo)}">${esc(e.metodo)}</a>`).join(' ') : '<span class="sub">Sin estimar</span>'}</td>
        <td class="acts"><a class="btn sm ghost" href="#/proyectos/${p.id}">Abrir / editar</a> <a class="btn sm" href="#/estimar/${p.id}">Estimar</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No hay proyectos definidos.</p>'}</section>`;

  const form = raiz.querySelector('#f-nuevo');
  raiz.onclick = (ev) => {
    const a = ev.target.closest('[data-act]')?.dataset.act;
    if (a === 'nuevo') { form.hidden = false; form.querySelector('input').focus(); }
    if (a === 'cancelar') form.hidden = true;
  };
  raiz.onsubmit = async (ev) => {
    ev.preventDefault();
    const boton = form.querySelector('[type=submit]');
    if (boton.disabled) return;
    boton.disabled = true;
    const r = await intentar(() => post('/proyectos', { ...leer(form), fecha_registro: hoy }));
    boton.disabled = false;
    if (r) { aviso('Proyecto creado. Ahora define sus requisitos, módulos y actividades.'); location.hash = `#/proyectos/${r.id}`; }
  };
}
