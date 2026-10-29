import { get, post, put, del } from '../api.js';
import { resumenEnvios, esc, pill, fecha, fmt, dinero, leer, intentar, aviso } from '../ui.js';

export async function mostrar(raiz, { id }, sesion) {
  const staff = sesion.rol !== 'experto';
  let det, expertosLista = [], graficos = [], inv = null;

  async function cargar() {
    det = await get(`/estimaciones/${id}`);
    if (staff && det.estimacion.estado === 'borrador') expertosLista = await get('/expertos');
    inv = staff && det.estimacion.estado !== 'cerrada' ? await get(`/estimaciones/${id}/invitaciones`) : null;
  }
  const E = () => det.estimacion;
  const esTP = () => E().metodo.codigo === 'tres_puntos';
  const u = () => (E().unidad === 'dias' ? 'd' : 'h');
  const actual = () => det.rondas[det.rondas.length - 1] || null;

  // ---------- cabecera ----------
  function cabecera() {
    const e = E(), p = det.proyecto;
    return `<div class="crumbs">${staff ? `<a href="#/proyectos">Proyectos</a> / <a href="#/proyectos/${p.id}">${esc(p.nombre)}</a>` : `<a href="#/">Mis estimaciones</a> / ${esc(p.nombre)}`} / ${esc(e.titulo)}</div>
    <div class="card-h"><div><h1>${esc(e.titulo)}</h1><p class="lead">${esc(e.metodo.nombre)} · ${pill(e.estado)} · Proyecto: ${esc(p.nombre)}</p></div></div>
    <section class="card"><div class="kv">
      <div><span>Moderador</span>${esc(e.moderador)}</div><div><span>Unidad</span>${e.unidad === 'dias' ? 'Días-persona (8 h)' : 'Horas-persona'}</div>
      <div><span>Equipo</span>${e.personas} persona(s) × ${fmt(e.horas_semana, 0)} h/semana</div><div><span>Tarifa / indirectos</span>${dinero(e.tarifa)} por hora · ${dinero(e.indirectos)} por semana</div>
      <div><span>Plazo requerido por el cliente</span>${fmt(e.plazo_semanas, 1)} semanas (${fecha(p.fecha_requerida)})</div>
      ${esTP() ? '' : `<div><span>Rondas / umbral</span>máx. ${e.max_rondas} · dispersión ≤ ${fmt(e.umbral_dispersion, 0)} %</div><div><span>Valores individuales</span>${e.ocultar_valores ? 'Ocultos a los expertos' : 'Visibles tras cerrar la ronda'}</div>`}
    </div></section>`;
  }

  function definicion() {
    const p = det.proyecto;
    return `<details class="card"><summary>Definición del proyecto (problema, requisitos y actividades)</summary>
      <p><b>Problema:</b> ${esc(p.problema) || '—'}</p><p><b>Cliente:</b> ${esc(p.cliente) || '—'} · <b>Fecha requerida:</b> ${fecha(p.fecha_requerida)}</p>
      ${det.requisitos.length ? `<div class="scroll"><table><thead><tr><th>Código</th><th>Requisito</th><th>Prioridad</th></tr></thead><tbody>${det.requisitos.map((r) => `<tr><td class="mono">${esc(r.codigo)}</td><td>${esc(r.descripcion)}</td><td>${esc(r.prioridad)}</td></tr>`).join('')}</tbody></table></div>` : ''}</details>`;
  }

  // ---------- borrador (moderador) ----------
  function borrador() {
    const marcados = new Set(det.expertos.map((x) => x.id));
    return `<section class="card"><h2>Participantes</h2><p class="note">Selecciona los expertos de la lista registrada. ${esTP() ? '' : 'Wideband Delphi necesita varios estimadores.'}</p>
      ${expertosLista.length ? `<div class="checks">${expertosLista.map((x) => `<label><input type="checkbox" name="exp" value="${x.id}" ${marcados.has(x.id) ? 'checked' : ''}><span>${esc(x.nombre)}<small>${esc(x.especialidad) || esc(x.correo)}</small></span></label>`).join('')}</div>` : '<p class="empty">No hay expertos registrados.</p>'}
      <div class="row"><button class="btn ghost" data-act="guardar-exp">Guardar participantes</button><button class="btn" data-act="iniciar">Iniciar estimación</button><button class="btn ghost" data-act="eliminar">Eliminar borrador</button></div>
      <p class="note">Al iniciar se abre la ronda 1, se envían las invitaciones por correo y los expertos podrán entrar con su usuario y registrar sus valores sobre las ${det.actividades.length} actividad(es) del proyecto.</p></section>
      ${invitaciones()}`;
  }

  // ---------- invitaciones (moderador) ----------
  const ETIQ_INV = { pendiente: ['muted', 'Se enviará al iniciar'], enviada: ['info', 'Enviada'], aceptada: ['good', 'Ya entró'] };
  function invitaciones() {
    if (!inv) return '';
    const borr = E().estado === 'borrador', sim = inv.modo === 'simulado';
    return `<section class="card"><div class="card-h"><h2>Invitaciones a los expertos</h2>${!borr && inv.invitaciones.some((i) => i.estado !== 'aceptada') ? '<button class="btn sm ghost" data-act="reenviar">Reenviar a quienes no han entrado</button>' : ''}</div>
      <p class="note">Cada experto recibe un correo con la descripción del proyecto, el motivo de su participación${E().motivo ? '' : ' (no escribiste uno: se usará un texto general)'} y un enlace para entrar con su propia cuenta.</p>
      ${sim ? '<div class="banner warn">El servidor de correo no está configurado, así que los correos <b>no se envían</b>: se guardan aquí y puedes copiar el enlace de cada experto y mandárselo por WhatsApp o por tu correo. Para enviarlos automáticamente configura SMTP (ver README).</div>' : ''}
      <form data-form="invitar" class="row" autocomplete="off"><input name="correos" type="text" style="max-width:420px" placeholder="correo1@ejemplo.com, correo2@ejemplo.com" aria-label="Correos a invitar"><button class="btn sm" type="submit">${borr ? 'Agregar invitación' : 'Agregar y enviar'}</button></form>
      <p class="note">Si la persona ya tiene cuenta se agrega como participante; si no, recibe un enlace para crear su cuenta de experto y entra directo a esta estimación.</p>
      ${inv.invitaciones.length ? `<div class="scroll"><table><thead><tr><th>Experto</th><th>Estado</th><th>Enlace de acceso</th></tr></thead><tbody>${inv.invitaciones.map((i) => `<tr><td>${esc(i.nombre) || '<span class="sub">Sin cuenta todavía</span>'}<div class="sub">${esc(i.correo)}</div></td>
        <td><span class="pill ${ETIQ_INV[i.estado][0]}">${i.estado === 'enviada' && sim ? 'Generada' : ETIQ_INV[i.estado][1]}</span></td>
        <td><div class="row"><input readonly value="${esc(i.enlace)}" style="min-width:260px" aria-label="Enlace de ${esc(i.correo)}"><button class="btn sm ghost" data-act="copiar">Copiar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aún no hay invitaciones: selecciona expertos arriba o agrega correos.</p>'}
      ${inv.correos.length ? `<details><summary>Correos generados (${inv.correos.length})</summary>${inv.correos.map((c) => `<details><summary>${esc(c.para)} · ${esc(c.estado)}${c.error ? ' · ' + esc(c.error) : ''}</summary><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin:6px 0">${esc(c.asunto)}\n\n${esc(c.texto)}</pre></details>`).join('')}</details>` : ''}</section>`;
  }

  // ---------- tablas de ronda ----------
  function celdaExperto(r, uid, a, enviados) {
    const x = (r.respuestas || []).find((q) => q.usuario_id === uid && q.actividad_id === a.id);
    if (!x) return '<td class="sub">—</td>';
    const txt = esTP() ? `${fmt(x.optimista, 1)} / ${fmt(x.probable, 1)} / ${fmt(x.pesimista, 1)}` : fmt(x.valor, 1);
    return `<td class="mono ${enviados.includes(uid) ? '' : 'sub'}" ${enviados.includes(uid) ? '' : 'title="Borrador sin enviar"'}>${txt}${enviados.includes(uid) ? '' : '*'}</td>`;
  }
  function tablaRonda(r) {
    const st = r.estadisticas || {};
    const enviados = r.enviados || [];
    const colsExp = staff ? det.expertos : [];
    const cab = esTP()
      ? `${colsExp.map((x) => `<th class="r">${esc(x.nombre)} (O/M/P)</th>`).join('')}<th class="r">O prom.</th><th class="r">M prom.</th><th class="r">P prom.</th><th class="r">E</th><th class="r"><span class="sg">σ</span></th>`
      : `${colsExp.map((x) => `<th class="r">${esc(x.nombre)}</th>`).join('')}<th class="r">Mín</th><th class="r">Máx</th><th class="r">Mediana</th><th class="r">Media</th><th class="r">Dispersión</th>`;
    const filas = det.actividades.map((a) => {
      const s = st[a.id];
      const stats = !s ? `<td class="sub" colspan="${esTP() ? 5 : 5}">Sin datos</td>`
        : esTP() ? `<td class="r mono">${fmt(s.optimista)}</td><td class="r mono">${fmt(s.probable)}</td><td class="r mono">${fmt(s.pesimista)}</td><td class="r mono"><b>${fmt(s.esperado)}</b></td><td class="r mono">${fmt(s.sigma)}</td>`
          : `<td class="r mono">${fmt(s.min, 1)}</td><td class="r mono">${fmt(s.max, 1)}</td><td class="r mono">${fmt(s.mediana, 1)}</td><td class="r mono"><b>${fmt(s.media)}</b></td><td class="r">${s.dispersion == null ? '—' : `<span class="pill ${s.consenso ? 'good' : 'warn'}">${fmt(s.dispersion, 1)} %</span>`}</td>`;
      return `<tr><td>${esc(a.nombre)}<div class="sub">${esc(a.modulo) || ''}</div></td>${colsExp.map((x) => celdaExperto(r, x.id, a, enviados)).join('')}${stats}</tr>`;
    }).join('');
    return `<div class="scroll"><table><thead><tr><th>Actividad</th>${cab}</tr></thead><tbody>${filas}</tbody></table></div>${staff ? '<p class="note">* Valor en borrador (el experto aún no lo envía).</p>' : ''}`;
  }

  // ---------- en curso: moderador ----------
  function enCursoStaff() {
    const r = actual(), e = E();
    const pendientes = det.expertos.filter((x) => !x.enviado).length;
    let acciones = '';
    if (r.estado === 'abierta') acciones = `<button class="btn" data-act="cerrar" data-pend="${pendientes}">Cerrar ronda ${r.numero}</button>`;
    else if (esTP()) acciones = '';
    else acciones = `${r.numero < e.max_rondas ? `<button class="btn ghost" data-act="nueva">Abrir ronda ${r.numero + 1}</button>` : ''}<button class="btn" data-act="finalizar">Finalizar con el consenso</button>`;
    const desc = r.estado === 'abierta' ? `Ronda ${r.numero} abierta: ${r.n_enviados} de ${det.expertos.length} experto(s) enviaron sus valores.`
      : `Ronda ${r.numero} cerrada. ${(() => { const cs = Object.values(r.estadisticas || {}).filter(Boolean); return cs.length && !esTP() ? `${cs.filter((c) => c.consenso).length} de ${cs.length} actividad(es) alcanzaron el umbral de consenso.` : ''; })()}`;
    return `<section class="card"><div class="card-h"><h2>Ronda ${r.numero}</h2><div class="row">${acciones}</div></div><p class="note">${desc}</p>
      <div class="chips">${det.expertos.map((x) => `<span class="pill ${x.enviado ? 'good' : 'warn'}">${esc(x.nombre)}: ${x.enviado ? 'envió' : 'pendiente'}</span>`).join(' ')}</div>
      ${tablaRonda(r)}</section>
      ${det.rondas.length > 1 ? `<section class="card"><h2>Rondas anteriores</h2>${det.rondas.slice(0, -1).reverse().map((q) => `<details><summary>Ronda ${q.numero} (${q.n_enviados} envíos)</summary>${tablaRonda(q)}</details>`).join('')}</section>` : ''}
      ${invitaciones()}`;
  }

  // ---------- en curso: experto ----------
  function enCursoExperto() {
    const r = actual(), m = det.mis_respuestas;
    if (!r) return '<div class="banner">Esta estimación todavía no tiene rondas.</div>';
    const mias = new Map(((m && m.items) || []).map((x) => [x.actividad_id, x]));
    const previa = det.rondas.length > 1 ? det.rondas[det.rondas.length - 2] : null;
    if (r.estado === 'abierta' && !m.enviado) {
      const filas = det.actividades.map((a, i) => {
        const x = mias.get(a.id) || {};
        const ps = previa && previa.estadisticas && previa.estadisticas[a.id];
        const ref = ps ? `<div class="sub">Ronda ${previa.numero}: media ${fmt(ps.media, 1)} · mediana ${fmt(ps.mediana, 1)} · rango ${fmt(ps.min, 1)}–${fmt(ps.max, 1)} (${fmt(ps.dispersion, 1)} %)</div>` : '';
        const inp = (n, v) => `<td><input class="num" name="${n}" data-a="${a.id}" type="number" min="0" step="any" value="${v ?? ''}" aria-label="${n} de ${esc(a.nombre)}"></td>`;
        return `<tr><td>${i + 1}. ${esc(a.nombre)}<div class="sub">${esc(a.modulo) || ''} ${esc(a.descripcion) || ''}</div>${ref}</td>${esTP() ? inp('optimista', x.optimista) + inp('probable', x.probable) + inp('pesimista', x.pesimista) : inp('valor', x.valor)}</tr>`;
      }).join('');
      return `<form class="card" data-form="valores"><h2>Tus estimaciones — ronda ${r.numero}</h2>
        <p class="note">${esTP() ? 'Para cada actividad indica cuánto tomaría en el mejor caso (optimista), en condiciones normales (más probable) y en el peor caso razonable (pesimista), en ' + (E().unidad === 'dias' ? 'días-persona' : 'horas-persona') + '. Debe cumplirse optimista ≤ más probable ≤ pesimista.' : 'Para cada actividad indica tu estimación en ' + (E().unidad === 'dias' ? 'días-persona' : 'horas-persona') + '. Los demás expertos no verán tu valor mientras la ronda esté abierta.'}</p>
        <div class="scroll"><table><thead><tr><th>Actividad</th>${esTP() ? '<th class="r">Optimista (O)</th><th class="r">Más probable (M)</th><th class="r">Pesimista (P)</th>' : '<th class="r">Valor</th>'}</tr></thead><tbody>${filas}</tbody></table></div>
        <div class="row"><button class="btn ghost" type="button" data-act="borrador-valores">Guardar borrador</button><button class="btn" type="button" data-act="enviar">Enviar valores</button></div>
        <p class="note">Después de enviar no podrás cambiar tus valores en esta ronda.</p></form>`;
    }
    if (r.estado === 'abierta') {
      return `<section class="card"><h2>Valores enviados</h2><div class="banner">Ya enviaste tus valores de la ronda ${r.numero}. Espera a que el moderador cierre la ronda.</div>
        ${tablaPropia(mias)}</section>`;
    }
    return `<section class="card"><h2>Resultado de la ronda ${r.numero}</h2><div class="banner">La ronda está cerrada. ${esTP() ? 'El moderador cerrará la estimación.' : 'El moderador decidirá si abre otra ronda o finaliza con el consenso.'}</div>
      ${tablaPropia(mias)}${tablaRonda(r)}</section>`;
  }
  function tablaPropia(mias) {
    return `<div class="scroll"><table><thead><tr><th>Actividad</th><th class="r">Tus valores</th></tr></thead><tbody>${det.actividades.map((a) => { const x = mias.get(a.id); return `<tr><td>${esc(a.nombre)}</td><td class="r mono">${!x ? '—' : esTP() ? `${fmt(x.optimista, 1)} / ${fmt(x.probable, 1)} / ${fmt(x.pesimista, 1)}` : fmt(x.valor, 1)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  // ---------- resultados ----------
  function resultados() {
    const r = det.resultados, e = E();
    const esc2 = (n) => r.escenarios.find((s) => s.nombre === n);
    const ref = esc2(esTP() ? 'Esperado' : 'Consenso (promedio)');
    const cumple = ref.cumple;
    const interp = cumple
      ? `Con el escenario de referencia se necesitan ${fmt(ref.semanas, 2)} semanas, dentro del plazo de ${fmt(r.plazo_semanas, 1)} semanas que pide el cliente.`
      : `Con el escenario de referencia se necesitan ${fmt(ref.semanas, 2)} semanas y el cliente pide ${fmt(r.plazo_semanas, 1)}: el plazo no se cumple con esta capacidad. Para cumplirlo, cada una de las ${e.personas} persona(s) tendría que dedicar unas ${fmt(r.horas_semana_necesarias, 1)} horas por semana, o habría que reducir el alcance.`;
    return `<section class="card"><div class="card-h"><h2>Resultados</h2><div class="row"><a class="btn sm ghost" href="/api/estimaciones/${id}/resultados.csv">Descargar CSV</a><button class="btn sm ghost" data-act="imprimir">Imprimir</button></div></div>
      <div class="stats"><div class="stat"><b>${fmt(r.totales.esperado)} ${u()}</b><span>${esTP() ? 'Esfuerzo esperado (ΣE)' : 'Esfuerzo por consenso'}</span></div>
        ${r.totales.sigma != null ? `<div class="stat"><b>${fmt(r.totales.sigma)} ${u()}</b><span>σ total = √Σσ²</span></div>` : ''}
        <div class="stat"><b>${fmt(ref.semanas, 2)} sem</b><span>Plazo estimado (cliente: ${fmt(r.plazo_semanas, 1)})</span></div>
        <div class="stat"><b>${dinero(ref.total)}</b><span>Costo total estimado</span></div></div>
      <div class="banner ${cumple ? '' : 'warn'}">${interp}</div>
      <div class="scroll"><table><thead><tr><th>Actividad</th><th>Módulo</th><th class="r">${esTP() ? 'Optimista' : 'Mínimo'}</th><th class="r">${esTP() ? 'Más probable' : 'Mediana'}</th><th class="r">${esTP() ? 'Pesimista' : 'Máximo'}</th><th class="r">${esTP() ? 'E' : 'Consenso'}</th>${esTP() ? '<th class="r"><span class="sg">σ</span></th>' : ''}</tr></thead><tbody>
        ${r.filas.map((f) => `<tr><td>${esc(f.actividad)}</td><td class="sub">${esc(f.modulo) || '—'}</td><td class="r mono">${fmt(f.optimista)}</td><td class="r mono">${fmt(f.probable)}</td><td class="r mono">${fmt(f.pesimista)}</td><td class="r mono"><b>${fmt(f.esperado)}</b></td>${esTP() ? `<td class="r mono">${fmt(f.sigma)}</td>` : ''}</tr>`).join('')}
        <tr><td><b>Total</b></td><td></td><td class="r mono">${fmt(r.totales.suma_o)}</td><td class="r mono">${fmt(r.totales.suma_m)}</td><td class="r mono">${fmt(r.totales.suma_p)}</td><td class="r mono"><b>${fmt(r.totales.esperado)}</b></td>${esTP() ? `<td class="r mono">${fmt(r.totales.sigma)}</td>` : ''}</tr></tbody></table></div>
      ${r.rangos.length ? `<p class="note">${r.rangos.map((g) => `Con ~${g.nivel} % de confianza el esfuerzo estará entre <b>${fmt(g.desde)}</b> y <b>${fmt(g.hasta)}</b> ${u()}`).join(' · ')} (E ± 1σ y E ± 2σ).</p>` : ''}
      <h2>Escenarios: plazo y costo</h2>
      <div class="scroll"><table><thead><tr><th>Escenario</th><th class="r">Esfuerzo (${u()})</th><th class="r">Horas</th><th class="r">Semanas</th><th class="r">Mano de obra</th><th class="r">Indirectos</th><th class="r">Costo total</th><th>Plazo</th></tr></thead><tbody>
        ${r.escenarios.map((s) => `<tr><td>${esc(s.nombre)}</td><td class="r mono">${fmt(s.valor)}</td><td class="r mono">${fmt(s.horas)}</td><td class="r mono">${fmt(s.semanas)}</td><td class="r mono">${dinero(s.mano_obra)}</td><td class="r mono">${dinero(s.indirectos)}</td><td class="r mono"><b>${dinero(s.total)}</b></td><td><span class="pill ${s.cumple ? 'good' : 'warn'}">${s.cumple ? 'Cumple' : 'Excede'}</span></td></tr>`).join('')}</tbody></table></div>
      <div class="grid-form"><div><h2>Semanas por escenario</h2><div class="canvas-box"><canvas id="g-esc"></canvas></div></div><div><h2>Esfuerzo por actividad (${u()})</h2><div class="canvas-box"><canvas id="g-act"></canvas></div></div></div>
    </section>`;
  }

  async function dibujar() {
    if (!det.resultados) return;
    if (!window.Chart) await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = '/vendor/chart.js/chart.umd.js'; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
    graficos.forEach((g) => g.destroy()); graficos = [];
    const css = getComputedStyle(document.documentElement);
    const col = (v) => css.getPropertyValue(v).trim();
    const r = det.resultados;
    Chart.defaults.color = col('--muted'); Chart.defaults.font.family = css.getPropertyValue('--font-sans');
    const ge = document.getElementById('g-esc'), ga = document.getElementById('g-act');
    if (ge) graficos.push(new Chart(ge, {
      data: { labels: r.escenarios.map((s) => s.nombre), datasets: [
        { type: 'bar', label: 'Semanas necesarias', data: r.escenarios.map((s) => Number(s.semanas.toFixed(2))), backgroundColor: r.escenarios.map((s) => (s.cumple ? col('--accent') : col('--warn'))) },
        { type: 'line', label: `Plazo del cliente (${fmt(r.plazo_semanas, 1)} sem)`, data: r.escenarios.map(() => r.plazo_semanas), borderColor: col('--ink'), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'semanas' } } } },
    }));
    if (ga) graficos.push(new Chart(ga, {
      type: 'bar', data: { labels: r.filas.map((f) => f.actividad), datasets: [{ label: 'Esperado', data: r.filas.map((f) => Number(f.esperado.toFixed(2))), backgroundColor: col('--accent') }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    }));
  }

  // ---------- armado ----------
  function pintar() {
    const e = E();
    let cuerpo = '';
    if (e.estado === 'borrador') cuerpo = staff ? borrador() : '<div class="banner">Esta estimación aún no ha sido iniciada.</div>';
    else if (e.estado === 'en_curso') cuerpo = staff ? enCursoStaff() : enCursoExperto();
    else cuerpo = resultados() + (staff && det.rondas.length ? `<section class="card"><h2>Historial de rondas</h2>${det.rondas.map((q) => `<details><summary>Ronda ${q.numero} (${q.n_enviados} envíos)</summary>${tablaRonda(q)}</details>`).join('')}</section>` : '');
    raiz.innerHTML = cabecera() + (!staff && e.motivo ? `<div class="banner"><b>Por qué se necesita tu participación:</b> ${esc(e.motivo)}</div>` : '') + (e.estado !== 'borrador' || staff ? definicion() : '') + cuerpo;
    dibujar().catch(() => aviso('No se pudieron dibujar los gráficos.', true));
  }
  async function recargar() { await cargar(); pintar(); }

  const valoresForm = () => {
    const f = raiz.querySelector('[data-form="valores"]');
    const mapa = new Map();
    for (const el of f.querySelectorAll('input[data-a]')) {
      const aid = Number(el.dataset.a);
      if (!mapa.has(aid)) mapa.set(aid, { actividad_id: aid });
      mapa.get(aid)[el.name] = el.value === '' ? null : Number(el.value);
    }
    return [...mapa.values()];
  };

  raiz.onclick = async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, base = `/estimaciones/${id}`;
    const ok = async (fn, msg) => { if (await intentar(fn) !== undefined) { aviso(msg); await recargar(); } };
    if (a === 'guardar-exp') await ok(() => put(`${base}/expertos`, { expertos: [...raiz.querySelectorAll('[name="exp"]:checked')].map((x) => Number(x.value)) }), 'Participantes guardados.');
    if (a === 'iniciar') {
      await intentar(() => put(`${base}/expertos`, { expertos: [...raiz.querySelectorAll('[name="exp"]:checked')].map((x) => Number(x.value)) }));
      const ini = await intentar(() => post(`${base}/iniciar`));
      if (ini) { const r = resumenEnvios(ini.invitaciones); aviso('Estimación iniciada: la ronda 1 está abierta. ' + r.texto, r.error); await recargar(); }
    }
    if (a === 'eliminar' && confirm('¿Eliminar este borrador?')) { if (await intentar(() => del(base)) !== undefined) { location.hash = `#/proyectos/${det.proyecto.id}`; } }
    if (a === 'cerrar') {
      const pend = Number(b.dataset.pend);
      if (pend && !confirm(`Faltan ${pend} experto(s) por enviar. ¿Cerrar la ronda de todos modos? Sus borradores no se tomarán en cuenta.`)) return;
      await ok(() => post(`${base}/rondas/cerrar`, { forzar: pend > 0 }), esTP() ? 'Ronda cerrada: la estimación quedó calculada.' : 'Ronda cerrada.');
    }
    if (a === 'nueva') await ok(() => post(`${base}/rondas/nueva`), 'Nueva ronda abierta.');
    if (a === 'finalizar' && confirm('¿Finalizar la estimación con el consenso de la última ronda?')) await ok(() => post(`${base}/finalizar`), 'Estimación finalizada.');
    if (a === 'borrador-valores') await ok(() => put(`${base}/respuestas`, { respuestas: valoresForm() }), 'Borrador guardado.');
    if (a === 'enviar') {
      if (!confirm('¿Enviar tus valores? Después no podrás cambiarlos en esta ronda.')) return;
      if (await intentar(() => put(`${base}/respuestas`, { respuestas: valoresForm() })) === undefined) return;
      await ok(() => post(`${base}/enviar`), 'Valores enviados. Gracias.');
    }
    if (a === 'copiar') {
      const campo = b.parentElement.querySelector('input'); campo.select();
      try { await navigator.clipboard.writeText(campo.value); } catch { document.execCommand('copy'); }
      aviso('Enlace copiado.');
    }
    if (a === 'reenviar') { const r0 = await intentar(() => post(`${base}/invitaciones`, { reenviar: true })); if (r0) { const r = resumenEnvios(r0.enviados); aviso(r.texto || 'No había invitaciones por enviar.', r.error); await recargar(); } }
    if (a === 'imprimir') window.print();
  };

  raiz.onsubmit = async (ev) => {
    ev.preventDefault();
    if (ev.target.dataset.form === 'invitar') {
      const correos = ev.target.elements.correos.value.split(/[,;\s]+/).filter(Boolean);
      if (!correos.length) { aviso('Escribe al menos un correo.', true); return; }
      const r0 = await intentar(() => post(`/estimaciones/${id}/invitaciones`, { correos }));
      if (r0 !== undefined) { const r = resumenEnvios(r0.enviados); aviso(E().estado === 'borrador' ? 'Invitación agregada. Se enviará al iniciar.' : (r.texto || 'Invitación registrada.'), r.error); await recargar(); }
    }
  };

  await cargar();
  pintar();
}
