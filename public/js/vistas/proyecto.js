import { get, post, put, del } from '../api.js';
import { esc, pill, fecha, fmt, leer, opciones, intentar, aviso, hoyLocal } from '../ui.js';

export async function mostrar(raiz, { id }, sesion) {
  const estado = { editando: null };   // { ruta, id } del registro hijo que se está editando
  let p;

  async function cargar() {
    p = await get(`/proyectos/${id}`);
  }
  const moduloNombre = (mid) => (p.modulos.find((m) => m.id === mid) || {}).nombre || '—';
  const siguienteCodigo = (tipo) => {
    const pre = tipo === 'no_funcional' ? 'RNF' : 'RF';
    const usados = p.requisitos.filter((r) => r.codigo.startsWith(pre) && (pre === 'RNF' || !r.codigo.startsWith('RNF'))).map((r) => parseInt(r.codigo.slice(pre.length), 10) || 0);
    return pre + String(Math.max(0, ...usados) + 1).padStart(2, '0');
  };
  const editado = (ruta) => (estado.editando && estado.editando.ruta === ruta ? p[ruta].find((x) => x.id === estado.editando.id) : null);

  function html() {
    const rq = editado('requisitos'), mo = editado('modulos'), ac = editado('actividades');
    const bloqueada = p.congelado;
    return `<div class="crumbs"><a href="#/proyectos">Proyectos</a> / ${esc(p.nombre)}</div>
    <div class="card-h"><div><h1>${esc(p.nombre)} ${p.estado === 'archivado' ? pill('archivado') : ''}</h1>
      <p class="lead">Definición del proyecto. Aquí se registra el problema, los requisitos, los módulos y las actividades. Para estimarlo usa la ventana «Estimar».</p></div></div>

    <form class="card" data-form="proyecto" autocomplete="off"><h2>1. Datos generales y definición del problema</h2>
      <div class="grid-form">
        <label>Nombre<input name="nombre" required minlength="3" maxlength="100" value="${esc(p.nombre)}"></label>
        <label>Cliente<input name="cliente" maxlength="100" value="${esc(p.cliente)}"></label>
        <label>Fecha de registro<input type="date" value="${esc(p.fecha_registro)}" disabled></label>
        <label>Fecha requerida por el cliente<input name="fecha_requerida" type="date" required value="${esc(p.fecha_requerida)}"></label>
        <label>Estado<select name="estado">${opciones([['activo', 'Activo'], ['archivado', 'Archivado']], p.estado)}</select></label>
        <label class="span2">Descripción<textarea class="libre" name="descripcion" maxlength="1000">${esc(p.descripcion)}</textarea></label>
        <label class="span2">Definición del problema<textarea class="libre" name="problema" maxlength="2000">${esc(p.problema)}</textarea></label>
      </div>
      <div class="row"><button class="btn" type="submit">Guardar datos</button>
        <button class="btn ghost" type="button" data-act="eliminar-proyecto">Eliminar proyecto</button></div></form>

    <section class="card"><div class="card-h"><h2>2. Módulos (${p.modulos.length})</h2></div>
      ${p.modulos.length ? `<div class="scroll"><table><thead><tr><th>Módulo</th><th>Descripción</th><th></th></tr></thead><tbody>${p.modulos.map((m) => `<tr><td>${esc(m.nombre)}</td><td class="sub">${esc(m.descripcion)}</td><td class="acts">${botones('modulos', m.id)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sin módulos todavía.</p>'}
      <form data-form="hijo" data-ruta="modulos" autocomplete="off"><div class="grid-form">
        <label>Nombre del módulo<input name="nombre" required minlength="2" maxlength="100" value="${esc(mo?.nombre)}"></label>
        <label>Descripción<input name="descripcion" maxlength="500" value="${esc(mo?.descripcion)}"></label></div>
        ${pie('modulos', mo)}</form></section>

    <section class="card"><div class="card-h"><h2>3. Requisitos (${p.requisitos.length})</h2></div>
      <p class="note">Redáctalos como «El sistema + verbo en futuro + acción», por ejemplo: «El sistema permitirá registrar notas».</p>
      ${p.requisitos.length ? `<div class="scroll"><table><thead><tr><th>Código</th><th>Tipo</th><th>Requisito</th><th>Módulo</th><th>Prioridad</th><th></th></tr></thead><tbody>${p.requisitos.map((r) => `<tr><td class="mono">${esc(r.codigo)}</td><td>${r.tipo === 'funcional' ? 'Funcional' : 'No funcional'}</td><td>${esc(r.descripcion)}</td><td class="sub">${esc(moduloNombre(r.modulo_id))}</td><td>${esc(r.prioridad)}</td><td class="acts">${botones('requisitos', r.id)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sin requisitos todavía.</p>'}
      <form data-form="hijo" data-ruta="requisitos" autocomplete="off"><div class="grid-form">
        <label>Tipo<select name="tipo">${opciones([['funcional', 'Funcional'], ['no_funcional', 'No funcional']], rq?.tipo || 'funcional')}</select></label>
        <label>Código<input name="codigo" required maxlength="20" value="${esc(rq?.codigo || siguienteCodigo('funcional'))}"></label>
        <label>Módulo<select name="modulo_id">${opciones(p.modulos.map((m) => [m.id, m.nombre]), rq?.modulo_id, 'Sin módulo')}</select></label>
        <label>Prioridad<select name="prioridad">${opciones([['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']], rq?.prioridad || 'media')}</select></label>
        <label class="span2">Descripción<input name="descripcion" required minlength="5" maxlength="500" placeholder="El sistema permitirá…" value="${esc(rq?.descripcion)}"></label></div>
        ${pie('requisitos', rq)}</form></section>

    <section class="card"><div class="card-h"><h2>4. Actividades a estimar (${p.actividades.length})</h2></div>
      <p class="note">Las actividades son lo que los expertos estiman y se usan igual en Tres Puntos y en Wideband Delphi. ${bloqueada ? '<b>Este proyecto ya tiene estimaciones iniciadas: se pueden renombrar, pero no agregar ni quitar actividades.</b>' : 'Defínelas antes de iniciar una estimación.'}</p>
      ${p.actividades.length ? `<div class="scroll"><table><thead><tr><th>#</th><th>Actividad</th><th>Módulo</th><th></th></tr></thead><tbody>${p.actividades.map((a, i) => `<tr><td class="mono">${i + 1}</td><td>${esc(a.nombre)}<div class="sub">${esc(a.descripcion)}</div></td><td class="sub">${esc(moduloNombre(a.modulo_id))}</td><td class="acts"><button class="btn sm ghost" data-act="editar" data-ruta="actividades" data-id="${a.id}">Editar</button>${bloqueada ? '' : ` <button class="btn sm ghost" data-act="quitar" data-ruta="actividades" data-id="${a.id}">Quitar</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sin actividades todavía.</p>'}
      ${bloqueada && !ac ? '' : `<form data-form="hijo" data-ruta="actividades" autocomplete="off"><div class="grid-form">
        <label>Nombre de la actividad<input name="nombre" required minlength="2" maxlength="120" value="${esc(ac?.nombre)}"></label>
        <label>Módulo<select name="modulo_id">${opciones(p.modulos.map((m) => [m.id, m.nombre]), ac?.modulo_id, 'Sin módulo')}</select></label>
        <label class="span2">Descripción<input name="descripcion" maxlength="500" value="${esc(ac?.descripcion)}"></label></div>
        ${pie('actividades', ac)}</form>`}</section>

    <section class="card"><div class="card-h"><h2>5. Estimaciones de este proyecto (${p.estimaciones.length})</h2></div>
      ${p.estimaciones.length ? `<div class="scroll"><table><thead><tr><th>Estimación</th><th>Método</th><th>Estado</th><th>Estimadores</th><th class="r">Esfuerzo esperado</th><th>Creada</th><th></th></tr></thead><tbody>${p.estimaciones.map((e) => `<tr><td>${esc(e.titulo)}</td><td>${esc(e.metodo)}</td><td>${pill(e.estado)}</td><td class="sub">${esc(e.expertos) || '—'}</td><td class="r mono">${e.esfuerzo_total != null ? fmt(e.esfuerzo_total) + (e.unidad === 'dias' ? ' d' : ' h') : '—'}</td><td>${fecha(e.creada)}</td><td class="acts"><a class="btn sm ghost" href="#/estimaciones/${e.id}">Abrir</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Este proyecto todavía no ha sido estimado.</p>'}
    </section>

    <section class="card"><h2>6. Estimar este proyecto</h2>
      <p class="note">El proyecto ya está definido. Para estimarlo elige el método (Tres Puntos o Wideband Delphi) en la ventana «Estimar»; puedes estimarlo las veces que quieras, con cualquiera de los dos.</p>
      <div class="row"><a class="btn" href="#/estimar/${p.id}">Estimar este proyecto</a></div></section>`;
  }

  const botones = (ruta, rid) => `<button class="btn sm ghost" data-act="editar" data-ruta="${ruta}" data-id="${rid}">Editar</button> <button class="btn sm ghost" data-act="quitar" data-ruta="${ruta}" data-id="${rid}">Quitar</button>`;
  const pie = (ruta, ed) => `<div class="row"><button class="btn sm" type="submit">${ed ? 'Guardar cambios' : 'Agregar'}</button>${ed ? '<button class="btn sm ghost" type="button" data-act="cancelar-edicion">Cancelar</button>' : ''}</div>`;

  async function pintar() { await cargar(); raiz.innerHTML = html(); }
  raiz.onchange = (ev) => {
    const f = ev.target.form;
    if (ev.target.name === 'tipo' && f && f.dataset.ruta === 'requisitos' && !estado.editando) f.elements.codigo.value = siguienteCodigo(ev.target.value);
  };

  raiz.onclick = async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'editar') { estado.editando = { ruta: b.dataset.ruta, id: Number(b.dataset.id) }; raiz.innerHTML = html(); raiz.querySelector(`[data-ruta="${b.dataset.ruta}"] input`).focus(); }
    if (a === 'cancelar-edicion') { estado.editando = null; raiz.innerHTML = html(); }
    if (a === 'quitar') {
      if (!confirm('¿Quitar este registro?')) return;
      if (await intentar(() => del(`/${b.dataset.ruta}/${b.dataset.id}`))) { aviso('Registro eliminado.'); await pintar(); }
    }
    if (a === 'eliminar-proyecto') {
      if (!confirm('¿Eliminar el proyecto y toda su definición? Solo es posible si no tiene estimaciones.')) return;
      if (await intentar(() => del(`/proyectos/${id}`))) { aviso('Proyecto eliminado.'); location.hash = '#/proyectos'; }
    }
  };

  raiz.onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target, tipo = f.dataset.form;
    if (tipo === 'proyecto') {
      const d = leer(f);
      const boton = f.querySelector('[type=submit]'); boton.disabled = true;
      const okp = await intentar(() => put(`/proyectos/${id}`, d)); boton.disabled = false;
      if (okp) { aviso('Datos guardados.'); await pintar(); }
    } else if (tipo === 'hijo') {
      const ruta = f.dataset.ruta, d = leer(f);
      if ('modulo_id' in d) d.modulo_id = d.modulo_id ? Number(d.modulo_id) : null;
      const ed = editado(ruta);
      const r = await intentar(() => (ed ? put(`/${ruta}/${ed.id}`, d) : post(`/proyectos/${id}/${ruta}`, d)));
      if (r) { estado.editando = null; aviso(ed ? 'Cambios guardados.' : 'Agregado.'); await pintar(); }
    }
  };

  await pintar();
}
