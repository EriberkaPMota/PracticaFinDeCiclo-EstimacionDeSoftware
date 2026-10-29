// Ventana «Estimar»: lista de proyectos ya registrados y formulario para estimar cualquiera de ellos
// con cualquiera de los dos métodos, las veces que se quiera.
import { get, post } from '../api.js';
import { esc, pill, fecha, fmt, opciones, leer, intentar, aviso, hoyLocal, resumenEnvios } from '../ui.js';

const claseEst = (e) => (e === 'cerrada' ? 'good' : e === 'en_curso' ? 'info' : 'muted');

export async function mostrar(raiz, params) {
  if (params.id) return formulario(raiz, params.id);
  const lista = (await get('/proyectos')).filter((p) => p.estado === 'activo');
  raiz.innerHTML = `<div><h1>Estimar</h1><p class="lead">Elige uno de los proyectos registrados y estímalo con el método que prefieras. Un mismo proyecto se puede estimar varias veces, con Tres Puntos o con Wideband Delphi.</p></div>
    <section class="card">${lista.length ? `<div class="scroll"><table><thead><tr><th>Proyecto</th><th>Cliente</th><th>Fecha requerida</th><th class="r">Activ.</th><th>Estimaciones anteriores</th><th></th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td><b>${esc(p.nombre)}</b><div class="sub">${esc(p.descripcion).slice(0, 90)}</div></td><td>${esc(p.cliente) || '—'}</td><td>${fecha(p.fecha_requerida)}</td><td class="r">${p.n_actividades}</td>
        <td>${p.estimaciones.length ? p.estimaciones.map((e) => `<a href="#/estimaciones/${e.id}" class="pill ${claseEst(e.estado)}" title="${esc(e.titulo)}">${esc(e.metodo)}</a>`).join(' ') : '<span class="sub">Sin estimar</span>'}</td>
        <td class="acts">${p.n_actividades ? `<a class="btn sm" href="#/estimar/${p.id}">Estimar</a>` : `<a class="btn sm ghost" href="#/proyectos/${p.id}" title="Primero agrega actividades">Agregar actividades</a>`}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">Todavía no hay proyectos. <a href="#/proyectos">Registra el primero</a>.</p>'}</section>`;
}

async function formulario(raiz, id) {
  const [p, metodos, expertos, cfg] = await Promise.all([get(`/proyectos/${id}`), get('/metodos'), get('/expertos'), get('/configuracion')]);
  const cfgv = (k, d) => (cfg.find((c) => c.clave === k) || { valor: d }).valor;
  const activos = metodos.filter((m) => m.activo);
  const paramDef = (codigo, clave, d) => { const m = metodos.find((x) => x.codigo === codigo); const pr = m && m.parametros.find((x) => x.clave === clave); return pr ? pr.valor : d; };
  const dias = (new Date(p.fecha_requerida + 'T00:00:00') - new Date(hoyLocal() + 'T00:00:00')) / 86400000;
  const plazo = Math.max(0.5, Math.round((dias / 7) * 10) / 10);

  raiz.innerHTML = `<div class="crumbs"><a href="#/estimar">Estimar</a> / ${esc(p.nombre)}</div>
    <div><h1>Estimar «${esc(p.nombre)}»</h1><p class="lead">${esc(p.descripcion) || 'Proyecto registrado.'}</p></div>
    <section class="card"><h2>Resumen del proyecto</h2>
      <p class="note">${p.modulos.length} módulo(s) · ${p.requisitos.length} requisito(s) · ${p.actividades.length} actividad(es) · Fecha requerida: ${fecha(p.fecha_requerida)}. Estos datos se usan igual en los dos métodos. <a href="#/proyectos/${p.id}">Editar el proyecto</a></p>
      ${p.estimaciones.length ? `<div class="scroll"><table><thead><tr><th>Estimaciones anteriores</th><th>Método</th><th>Estado</th><th class="r">Esfuerzo esperado</th><th></th></tr></thead><tbody>${p.estimaciones.map((e) => `<tr><td>${esc(e.titulo)}</td><td>${esc(e.metodo)}</td><td>${pill(e.estado)}</td><td class="r mono">${e.esfuerzo_total != null ? fmt(e.esfuerzo_total) + (e.unidad === 'dias' ? ' d' : ' h') : '—'}</td><td class="acts"><a class="btn sm ghost" href="#/estimaciones/${e.id}">Abrir</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Este proyecto todavía no ha sido estimado.</p>'}</section>
    ${p.actividades.length ? `<form class="card" id="f-est" autocomplete="off"><h2>Nueva estimación</h2>
      <div class="grid-form">
        <label>Método de estimación<select name="metodo_id">${opciones(activos.map((m) => [m.id, m.nombre]), activos[0]?.id)}</select></label>
        <label>Título de la estimación<input name="titulo" required minlength="3" maxlength="120" value="${esc(`${p.nombre.slice(0, 60)} · estimación ${p.estimaciones.length + 1}`)}"></label>
        <label>Unidad<select name="unidad">${opciones([['horas', 'Horas-persona'], ['dias', 'Días-persona (8 h)']], 'horas')}</select></label>
        <label>Tarifa por hora (RD$)<input name="tarifa" type="number" min="0" step="any" required value="${cfgv('tarifa_hora', 350)}"></label>
        <label>Personas en el equipo<input name="personas" type="number" min="1" step="1" required value="${cfgv('personas', 2)}"></label>
        <label>Horas por persona por semana<input name="horas_semana" type="number" min="1" step="any" required value="${cfgv('horas_semana', 15)}"></label>
        <label>Costos indirectos por semana (RD$)<input name="indirectos" type="number" min="0" step="any" required value="${cfgv('indirectos_semana', 1500)}"></label>
        <label>Plazo requerido por el cliente (semanas)<input name="plazo_semanas" type="number" min="0.1" step="any" required value="${plazo}"></label>
        <label class="span2">¿Por qué es necesaria la participación de los expertos? (va en el correo de invitación)<textarea class="libre" name="motivo" required minlength="10" maxlength="1000" placeholder="Ej.: Necesitamos tu experiencia en bases de datos para que el esfuerzo de las actividades de diseño sea realista."></textarea></label>
      </div>
      <div class="grid-form" data-solo="delphi" hidden>
        <label>Máximo de rondas<input name="max_rondas" type="number" min="1" max="10" step="1" value="${paramDef('delphi', 'max_rondas', 3)}"></label>
        <label>Umbral de dispersión (%)<input name="umbral_dispersion" type="number" min="0" step="any" value="${paramDef('delphi', 'umbral_dispersion', 15)}"></label>
        <label class="check"><input name="ocultar" type="checkbox" ${paramDef('delphi', 'ocultar_valores', 1) ? 'checked' : ''}> Ocultar los valores individuales a los expertos</label>
      </div>
      <div><b style="font-size:14px">Estimadores (expertos registrados)</b>
        ${expertos.length ? `<div class="checks" style="margin-top:8px">${expertos.map((x) => `<label><input type="checkbox" name="exp" value="${x.id}"><span>${esc(x.nombre)}<small>${esc(x.correo)}</small></span></label>`).join('')}</div>` : '<p class="empty">No hay expertos registrados todavía; puedes invitarlos por correo abajo.</p>'}</div>
      <label>Invitar además a personas sin cuenta (correos separados por coma, opcional)<input name="correos" type="text" placeholder="correo1@gmail.com, correo2@gmail.com"></label>
      <label class="check"><input name="iniciar" type="checkbox" checked> Iniciar ahora y enviar las invitaciones por correo</label>
      <div class="row"><button class="btn" type="submit">Crear estimación</button><span class="note">Si no la inicias ahora, queda en borrador y la inicias desde su pantalla.</span></div></form>`
      : `<div class="card"><div class="banner warn">Este proyecto no tiene actividades. <a href="#/proyectos/${p.id}">Agrégalas</a> para poder estimarlo.</div></div>`}`;

  const f = raiz.querySelector('#f-est');
  if (!f) return;
  const alternar = () => {
    const m = metodos.find((x) => String(x.id) === f.elements.metodo_id.value);
    raiz.querySelector('[data-solo="delphi"]').hidden = !(m && m.codigo === 'delphi');
  };
  alternar();
  raiz.onchange = (ev) => { if (ev.target.name === 'metodo_id') alternar(); };
  raiz.onsubmit = async (ev) => {
    ev.preventDefault();
    const boton = f.querySelector('[type=submit]');
    if (boton.disabled) return;
    const d = leer(f);
    const m = metodos.find((x) => String(x.id) === d.metodo_id);
    const cuerpo = {
      metodo_id: Number(d.metodo_id), titulo: d.titulo, motivo: d.motivo, unidad: d.unidad, tarifa: d.tarifa, personas: d.personas, horas_semana: d.horas_semana,
      indirectos: d.indirectos, plazo_semanas: d.plazo_semanas, expertos: [...f.querySelectorAll('[name="exp"]:checked')].map((x) => Number(x.value)),
    };
    if (m && m.codigo === 'delphi') { cuerpo.max_rondas = d.max_rondas; cuerpo.umbral_dispersion = d.umbral_dispersion; cuerpo.ocultar_valores = d.ocultar ? 1 : 0; }
    boton.disabled = true;
    const r = await intentar(() => post(`/proyectos/${id}/estimaciones`, cuerpo));
    if (!r) { boton.disabled = false; return; }
    const correos = (d.correos || '').split(/[,;\s]+/).filter(Boolean);
    if (correos.length) await intentar(() => post(`/estimaciones/${r.id}/invitaciones`, { correos }));
    if (d.iniciar) {
      const ini = await intentar(() => post(`/estimaciones/${r.id}/iniciar`));
      if (ini) {
        const s = resumenEnvios(ini.invitaciones);
        aviso(s.texto ? `Estimación iniciada. ${s.texto}` : 'Estimación iniciada.', s.error);
      }
    } else aviso('Estimación creada en borrador.');
    location.hash = `#/estimaciones/${r.id}`;
  };
}
