import { get } from '../api.js';
import { esc, pill, fecha } from '../ui.js';

export async function mostrar(raiz, _p, sesion) {
  const est = await get('/estimaciones');
  if (sesion.rol === 'experto') {
    const pend = est.filter((e) => e.estado === 'en_curso' && e.ronda_estado === 'abierta' && !e.yo_envie);
    raiz.innerHTML = `<div><h1>Mis estimaciones</h1><p class="lead">Estimaciones en las que participas como experto. Entra a cada una para registrar tus valores.</p></div>
      ${pend.length ? `<div class="banner warn">Tienes <b>${pend.length}</b> estimación(es) pendiente(s) de enviar.</div>` : ''}
      <section class="card">${tabla(est, true) || '<p class="empty">Todavía no te han asignado estimaciones.</p>'}</section>`;
    return;
  }
  const proyectos = await get('/proyectos');
  const n = (e) => est.filter((x) => x.estado === e).length;
  raiz.innerHTML = `<div><h1>Inicio</h1><p class="lead">Primero se define el proyecto; después se le aplica el método de estimación y participan los expertos.</p></div>
    <div class="stats">
      <div class="stat"><b>${proyectos.filter((p) => p.estado === 'activo').length}</b><span>Proyectos activos</span></div>
      <div class="stat"><b>${n('borrador')}</b><span>Estimaciones en borrador</span></div>
      <div class="stat"><b>${n('en_curso')}</b><span>Estimaciones en curso</span></div>
      <div class="stat"><b>${n('cerrada')}</b><span>Estimaciones cerradas</span></div>
    </div>
    <section class="card"><div class="card-h"><h2>Estimaciones recientes</h2><a class="btn sm" href="#/proyectos">Ir a proyectos</a></div>
    ${tabla(est.slice(0, 10), false) || '<p class="empty">Aún no hay estimaciones. Define un proyecto y aplícale un método.</p>'}</section>`;
}

function tabla(lista, esExperto) {
  if (!lista.length) return '';
  return `<div class="scroll"><table><thead><tr><th>Estimación</th><th>Proyecto</th><th>Método</th><th>Estado</th><th>Ronda</th>${esExperto ? '<th>Tu envío</th>' : '<th>Creada</th>'}<th></th></tr></thead><tbody>
    ${lista.map((e) => `<tr><td>${esc(e.titulo)}</td><td>${esc(e.proyecto)}</td><td>${esc(e.metodo)}</td><td>${pill(e.estado)}</td>
      <td>${e.ronda ? `${e.ronda} ${e.ronda_estado === 'abierta' ? '(abierta)' : '(cerrada)'}` : '—'}</td>
      <td>${esExperto ? (e.estado === 'cerrada' ? '—' : e.yo_envie ? '<span class="ok">Enviado</span>' : e.ronda_estado === 'abierta' ? '<span class="bad">Pendiente</span>' : 'Esperando al moderador') : fecha(e.creada)}</td>
      <td class="acts"><a class="btn sm ghost" href="#/estimaciones/${e.id}">Abrir</a></td></tr>`).join('')}</tbody></table></div>`;
}
