'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrir } = require('../src/db/conexion');
const { sembrar, CLAVES } = require('../src/db/semilla');
const { crearApp } = require('../src/app');

let servidor, base;
test.before(async () => {
  const db = abrir(':memory:');
  sembrar(db);
  const { app } = crearApp(db);
  await new Promise((ok) => { servidor = app.listen(0, ok); });
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(() => servidor.close());

// Cliente con su propia cookie de sesión
function cliente() {
  let cookie = '';
  const llamar = async (metodo, ruta, cuerpo) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { 'content-type': 'application/json', cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    return { estado: r.status, datos: tipo.includes('json') ? await r.json() : await r.text() };
  };
  return { get: (r) => llamar('GET', r), post: (r, c) => llamar('POST', r, c ?? {}), put: (r, c) => llamar('PUT', r, c), del: (r) => llamar('DELETE', r),
    entrar: async (correo, clave) => { const x = await llamar('POST', '/api/auth/login', { correo, clave }); assert.equal(x.estado, 200); return x.datos; } };
}

test('login: clave incorrecta y rutas protegidas', async () => {
  const c = cliente();
  assert.equal((await c.get('/api/proyectos')).estado, 401);
  assert.equal((await c.post('/api/auth/login', { correo: 'admin@uce.edu.do', clave: 'mala' })).estado, 401);
  await c.entrar('admin@uce.edu.do', CLAVES.admin);
  assert.equal((await c.get('/api/auth/yo')).datos.rol, 'admin');
});

test('permisos por rol', async () => {
  const exp = cliente(); await exp.entrar('ana@uce.edu.do', CLAVES.experto);
  assert.equal((await exp.get('/api/proyectos')).estado, 403);
  assert.equal((await exp.get('/api/usuarios')).estado, 403);
  const mod = cliente(); await mod.entrar('moderador@uce.edu.do', CLAVES.moderador);
  assert.equal((await mod.get('/api/usuarios')).estado, 403);
  assert.equal((await mod.get('/api/proyectos')).estado, 200);
});

test('el proyecto se define sin método y se valida', async () => {
  const mod = cliente(); await mod.entrar('moderador@uce.edu.do', CLAVES.moderador);
  assert.equal((await mod.post('/api/proyectos', { nombre: 'ab', fecha_requerida: '2026-12-01' })).estado, 400);
  const p = await mod.post('/api/proyectos', { nombre: 'Sistema de notas', descripcion: 'x', problema: 'Problema', cliente: 'Colegio', fecha_requerida: '2026-12-01' });
  assert.equal(p.estado, 201);
  const id = p.datos.id;
  const m = (await mod.post(`/api/proyectos/${id}/modulos`, { nombre: 'Calificaciones' })).datos.id;
  assert.equal((await mod.post(`/api/proyectos/${id}/requisitos`, { codigo: 'RF01', tipo: 'funcional', descripcion: 'El sistema permitirá registrar notas.', modulo_id: m })).estado, 201);
  assert.equal((await mod.post(`/api/proyectos/${id}/requisitos`, { codigo: 'RF01', tipo: 'funcional', descripcion: 'Duplicado del código.' })).estado, 409);
  assert.equal((await mod.post(`/api/proyectos/${id}/actividades`, { nombre: 'Registrar notas', modulo_id: m })).estado, 201);
  const det = (await mod.get(`/api/proyectos/${id}`)).datos;
  assert.equal(det.requisitos.length, 1); assert.equal(det.actividades.length, 1); assert.equal(det.estimaciones.length, 0);
  assert.equal((await mod.del(`/api/proyectos/${id}`)).estado, 200);
});

test('Tres Puntos con dos expertos: consenso por promedio, validación y bloqueo', async () => {
  const mod = cliente(); await mod.entrar('moderador@uce.edu.do', CLAVES.moderador);
  const id = (await mod.post('/api/proyectos', { nombre: 'Proyecto TP', problema: 'p', fecha_requerida: '2026-12-01' })).datos.id;
  const a1 = (await mod.post(`/api/proyectos/${id}/actividades`, { nombre: 'Actividad uno' })).datos.id;
  const metodos = (await mod.get('/api/metodos')).datos;
  const tp = metodos.find((m) => m.codigo === 'tres_puntos').id;
  const expertos = (await mod.get('/api/expertos')).datos;
  const cfg = { metodo_id: tp, titulo: 'Prueba TP', unidad: 'horas', tarifa: 350, personas: 2, horas_semana: 15, indirectos: 1500, plazo_semanas: 3, expertos: [expertos[0].id, expertos[1].id] };
  const est = (await mod.post(`/api/proyectos/${id}/estimaciones`, cfg)).datos.id;
  // un experto no invitado no ve la estimación
  const otro = cliente(); await otro.entrar(expertos[2].correo, CLAVES.experto);
  assert.equal((await otro.get(`/api/estimaciones/${est}`)).estado, 403);
  assert.equal((await mod.post(`/api/estimaciones/${est}/iniciar`)).estado, 200);
  assert.equal((await mod.post(`/api/estimaciones/${est}/iniciar`)).estado, 409);
  const e1 = cliente(); await e1.entrar(expertos[0].correo, CLAVES.experto);
  const e2 = cliente(); await e2.entrar(expertos[1].correo, CLAVES.experto);
  // O ≤ M ≤ P
  assert.equal((await e1.put(`/api/estimaciones/${est}/respuestas`, { respuestas: [{ actividad_id: a1, optimista: 9, probable: 5, pesimista: 7 }] })).estado, 400);
  assert.equal((await e1.put(`/api/estimaciones/${est}/respuestas`, { respuestas: [{ actividad_id: a1, optimista: 60, probable: 80, pesimista: 120 }] })).estado, 200);
  assert.equal((await e1.post(`/api/estimaciones/${est}/enviar`)).estado, 200);
  assert.equal((await e1.put(`/api/estimaciones/${est}/respuestas`, { respuestas: [{ actividad_id: a1, optimista: 1, probable: 2, pesimista: 3 }] })).estado, 409, 'no se edita tras enviar');
  // cerrar sin que todos envíen exige confirmación
  assert.equal((await mod.post(`/api/estimaciones/${est}/rondas/cerrar`, {})).estado, 409);
  // el experto 2 no ve los valores del 1 mientras la ronda está abierta
  const vista2 = (await e2.get(`/api/estimaciones/${est}`)).datos;
  assert.equal(vista2.rondas[0].respuestas, undefined);
  assert.equal(vista2.rondas[0].estadisticas, undefined);
  assert.deepEqual(vista2.mis_respuestas.items, []);
  await e2.put(`/api/estimaciones/${est}/respuestas`, { respuestas: [{ actividad_id: a1, optimista: 70, probable: 90, pesimista: 140 }] });
  await e2.post(`/api/estimaciones/${est}/enviar`);
  assert.equal((await mod.post(`/api/estimaciones/${est}/rondas/cerrar`, {})).estado, 200);
  const res = (await mod.get(`/api/estimaciones/${est}/resultados`)).datos;
  const f = res.filas[0];
  assert.equal(f.optimista, 65); assert.equal(f.probable, 85); assert.equal(f.pesimista, 130);
  assert.ok(Math.abs(f.esperado - (65 + 340 + 130) / 6) < 1e-9);
  // con estimaciones iniciadas no se pueden agregar actividades
  assert.equal((await mod.post(`/api/proyectos/${id}/actividades`, { nombre: 'Otra actividad' })).estado, 409);
  assert.equal((await mod.get(`/api/estimaciones/${est}/resultados.csv`)).estado, 200);
});

test('Wideband Delphi: rondas, valores ocultos, dispersión y consenso', async () => {
  const mod = cliente(); await mod.entrar('moderador@uce.edu.do', CLAVES.moderador);
  const id = (await mod.post('/api/proyectos', { nombre: 'Proyecto Delphi', problema: 'p', fecha_requerida: '2026-12-01' })).datos.id;
  const a1 = (await mod.post(`/api/proyectos/${id}/actividades`, { nombre: 'Módulo de reportes' })).datos.id;
  const dl = (await mod.get('/api/metodos')).datos.find((m) => m.codigo === 'delphi').id;
  const expertos = (await mod.get('/api/expertos')).datos;
  const cfg = { metodo_id: dl, titulo: 'Sesión Delphi', unidad: 'horas', tarifa: 350, personas: 2, horas_semana: 15, indirectos: 1500, plazo_semanas: 3, expertos: [expertos[0].id] };
  const est = (await mod.post(`/api/proyectos/${id}/estimaciones`, cfg)).datos.id;
  assert.equal((await mod.post(`/api/estimaciones/${est}/iniciar`)).estado, 400, 'Delphi exige al menos 3 expertos');
  await mod.put(`/api/estimaciones/${est}/expertos`, { expertos: expertos.map((x) => x.id) });
  assert.equal((await mod.post(`/api/estimaciones/${est}/iniciar`)).estado, 200);
  const clientes = [];
  for (const x of expertos) { const c = cliente(); await c.entrar(x.correo, CLAVES.experto); clientes.push(c); }
  const dar = async (c, v) => { await c.put(`/api/estimaciones/${est}/respuestas`, { respuestas: [{ actividad_id: a1, valor: v }] }); assert.equal((await c.post(`/api/estimaciones/${est}/enviar`)).estado, 200); };
  await dar(clientes[0], 20); await dar(clientes[1], 40); await dar(clientes[2], 28);
  assert.equal((await mod.post(`/api/estimaciones/${est}/rondas/cerrar`, {})).estado, 200);
  const d1 = (await mod.get(`/api/estimaciones/${est}`)).datos;
  assert.equal(d1.estimacion.estado, 'en_curso');
  assert.equal(d1.rondas[0].estadisticas[a1].dispersion, 71.4);
  assert.equal(d1.rondas[0].estadisticas[a1].consenso, false);
  // el experto ve estadísticas de la ronda cerrada, pero no los valores ni quién los dio
  const dExp = (await clientes[0].get(`/api/estimaciones/${est}`)).datos;
  assert.equal(dExp.rondas[0].estadisticas[a1].media, 29.333333333333332);
  assert.equal(dExp.rondas[0].respuestas, undefined); assert.equal(dExp.rondas[0].valores_anonimos, undefined);
  // ronda 2 con valores precargados
  assert.equal((await mod.post(`/api/estimaciones/${est}/rondas/nueva`)).estado, 200);
  const d2 = (await clientes[1].get(`/api/estimaciones/${est}`)).datos;
  assert.equal(d2.mis_respuestas.enviado, false); assert.equal(d2.mis_respuestas.items[0].valor, 40);
  await dar(clientes[0], 26); await dar(clientes[1], 30); await dar(clientes[2], 28);
  await mod.post(`/api/estimaciones/${est}/rondas/cerrar`, {});
  assert.equal((await mod.post(`/api/estimaciones/${est}/finalizar`)).estado, 200);
  const res = (await mod.get(`/api/estimaciones/${est}/resultados`)).datos;
  assert.equal(res.filas[0].esperado, 28); assert.equal(res.totales.sigma, null);
  // historial visible en el proyecto
  const hist = (await mod.get(`/api/proyectos/${id}`)).datos.estimaciones;
  assert.equal(hist.length, 1); assert.match(hist[0].expertos, /Ana/);
});

test('configuración de métodos solo por el administrador', async () => {
  const mod = cliente(); await mod.entrar('moderador@uce.edu.do', CLAVES.moderador);
  const ad = cliente(); await ad.entrar('admin@uce.edu.do', CLAVES.admin);
  const dl = (await ad.get('/api/metodos')).datos.find((m) => m.codigo === 'delphi');
  assert.equal((await mod.put(`/api/metodos/${dl.id}`, { activo: true, parametros: { max_rondas: 5 } })).estado, 403);
  assert.equal((await ad.put(`/api/metodos/${dl.id}`, { activo: true, parametros: { max_rondas: 99 } })).estado, 400);
  assert.equal((await ad.put(`/api/metodos/${dl.id}`, { activo: true, parametros: { max_rondas: 4 } })).estado, 200);
  assert.equal((await ad.get('/api/metodos')).datos.find((m) => m.codigo === 'delphi').parametros.find((p) => p.clave === 'max_rondas').valor, 4);
});

test('administración de usuarios', async () => {
  const ad = cliente(); await ad.entrar('admin@uce.edu.do', CLAVES.admin);
  const nuevo = await ad.post('/api/usuarios', { nombre: 'Pedro Gil', correo: 'pedro@uce.edu.do', clave: 'ClaveSegura1', rol: 'experto', especialidad: 'Redes' });
  assert.equal(nuevo.estado, 201);
  assert.equal((await ad.post('/api/usuarios', { nombre: 'Pedro Gil', correo: 'pedro@uce.edu.do', clave: 'ClaveSegura1', rol: 'experto' })).estado, 409);
  const p = cliente(); await p.entrar('pedro@uce.edu.do', 'ClaveSegura1');
  await ad.put(`/api/usuarios/${nuevo.datos.id}`, { nombre: 'Pedro Gil', correo: 'pedro@uce.edu.do', rol: 'experto', especialidad: 'Redes', activo: false });
  assert.equal((await p.get('/api/auth/yo')).datos, null, 'un usuario desactivado pierde el acceso');
  assert.equal((await p.get('/api/proyectos')).estado, 401);
  assert.equal((await ad.put('/api/usuarios/1', { nombre: 'Administrador', correo: 'admin@uce.edu.do', rol: 'experto', activo: true })).estado, 400);
});

test('registro público: siempre crea un experto y valida los datos', async () => {
  const c = cliente();
  assert.equal((await c.post('/api/auth/registro', { nombre: 'Rosa Díaz', correo: 'rosa@correo.com', clave: 'corta' })).estado, 400);
  const r = await c.post('/api/auth/registro', { nombre: 'Rosa Díaz', correo: 'rosa@correo.com', clave: 'ClaveSegura1', especialidad: 'Análisis', rol: 'admin' });
  assert.equal(r.estado, 201);
  assert.equal(r.datos.rol, 'experto', 'el rol enviado se ignora');
  assert.equal((await c.get('/api/auth/yo')).datos.rol, 'experto', 'queda con sesión iniciada');
  assert.equal((await c.get('/api/usuarios')).estado, 403);
  assert.equal((await cliente().post('/api/auth/registro', { nombre: 'Otra Rosa', correo: 'rosa@correo.com', clave: 'ClaveSegura1' })).estado, 409);
});

test('invitaciones: correo con descripción y motivo, registro por enlace y acceso del experto', async () => {
  const mod = cliente(); await mod.entrar('moderador@uce.edu.do', CLAVES.moderador);
  const id = (await mod.post('/api/proyectos', { nombre: 'Portal de citas', descripcion: 'Portal para reservar citas médicas en línea.', problema: 'Las citas se piden por teléfono.', cliente: 'Clínica Norte', fecha_requerida: '2026-12-20' })).datos.id;
  await mod.post(`/api/proyectos/${id}/actividades`, { nombre: 'Reservar cita' });
  const tp = (await mod.get('/api/metodos')).datos.find((m) => m.codigo === 'tres_puntos').id;
  const luis = (await mod.get('/api/expertos')).datos.find((x) => x.correo === 'luis@uce.edu.do');
  const motivo = 'Necesitamos tu experiencia en bases de datos clínicas.';
  const est = (await mod.post(`/api/proyectos/${id}/estimaciones`, { metodo_id: tp, titulo: 'Citas TP', motivo, unidad: 'horas', tarifa: 350, personas: 2, horas_semana: 15, indirectos: 1500, plazo_semanas: 4, expertos: [luis.id] })).datos.id;
  assert.equal((await mod.post(`/api/estimaciones/${est}/invitaciones`, { correos: ['no-es-correo'] })).estado, 400);
  assert.equal((await mod.post(`/api/estimaciones/${est}/invitaciones`, { correos: ['moderador@uce.edu.do'] })).estado, 400, 'solo expertos');
  const antes = (await mod.post(`/api/estimaciones/${est}/invitaciones`, { correos: ['nueva.persona@correo.com'] })).datos;
  assert.equal(antes.correos.length, 0, 'antes de iniciar no se envía nada');
  assert.equal(antes.invitaciones.length, 2);
  // el que no tiene cuenta recibe enlace de registro; el registrado, enlace directo a la estimación
  const sin = antes.invitaciones.find((i) => i.correo === 'nueva.persona@correo.com'), con = antes.invitaciones.find((i) => i.correo === 'luis@uce.edu.do');
  assert.match(sin.enlace, /#\/registro\?token=[0-9a-f]{48}$/); assert.match(con.enlace, new RegExp(`#/estimaciones/${est}$`));
  assert.equal((await mod.post(`/api/estimaciones/${est}/iniciar`)).estado, 200);
  const lista = (await mod.get(`/api/estimaciones/${est}/invitaciones`)).datos;
  assert.equal(lista.modo, 'simulado'); assert.equal(lista.correos.length, 2);
  const paraLuis = lista.correos.find((c) => c.para === 'luis@uce.edu.do');
  for (const frag of ['Portal de citas', 'Portal para reservar citas médicas en línea.', 'Clínica Norte', motivo, `#/estimaciones/${est}`]) assert.ok(paraLuis.texto.includes(frag), `falta: ${frag}`);
  assert.equal(lista.correos.find((c) => c.para === 'nueva.persona@correo.com').estado, 'simulado');
  // registro con la invitación
  const token = sin.enlace.split('token=')[1];
  assert.equal((await cliente().get(`/api/auth/invitacion/${token}`)).datos.correo, 'nueva.persona@correo.com');
  const nuevo = cliente();
  assert.equal((await nuevo.post('/api/auth/registro', { nombre: 'Nueva Persona', correo: 'otro@correo.com', clave: 'ClaveSegura1', token })).estado, 400, 'correo distinto al invitado');
  const reg = await nuevo.post('/api/auth/registro', { nombre: 'Nueva Persona', correo: 'nueva.persona@correo.com', clave: 'ClaveSegura1', token });
  assert.equal(reg.estado, 201); assert.equal(reg.datos.estimacion_id, est);
  assert.equal((await nuevo.get(`/api/estimaciones/${est}`)).estado, 200, 'ya participa y ve su estimación');
  assert.equal((await cliente().post('/api/auth/registro', { nombre: 'Otra', correo: 'nueva.persona@correo.com', clave: 'ClaveSegura1', token })).estado, 400, 'el token es de un solo uso');
  // el experto registrado abre la estimación: su invitación pasa a aceptada
  const l = cliente(); await l.entrar('luis@uce.edu.do', CLAVES.experto); await l.get(`/api/estimaciones/${est}`);
  const fin = (await mod.get(`/api/estimaciones/${est}/invitaciones`)).datos.invitaciones;
  assert.ok(fin.every((i) => i.estado === 'aceptada'));
  assert.equal((await l.get(`/api/estimaciones/${est}/invitaciones`)).estado, 403, 'un experto no ve las invitaciones');
});

test('correo real: se marca enviado, y un fallo SMTP deja la invitación pendiente', async () => {
  for (const falla of [false, true]) {
    const db = abrir(':memory:'); sembrar(db);
    const enviados = [];
    const transporte = { sendMail: async (m) => { if (falla) throw new Error('SMTP caído'); enviados.push(m); } };
    const { app } = crearApp(db, { transporte });
    const srv = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
    const url = `http://127.0.0.1:${srv.address().port}`;
    let cookie = '';
    const llamar = async (m, r, c) => { const x = await fetch(url + r, { method: m, headers: { 'content-type': 'application/json', cookie }, body: c ? JSON.stringify(c) : undefined }); const sc = x.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return x.json(); };
    await llamar('POST', '/api/auth/login', { correo: 'moderador@uce.edu.do', clave: CLAVES.moderador });
    const proys = await llamar('GET', '/api/proyectos');
    const e2 = await llamar('POST', `/api/proyectos/${proys[0].id}/estimaciones`, { metodo_id: 1, titulo: 'Otra TP', motivo: 'm', unidad: 'horas', tarifa: 1, personas: 1, horas_semana: 1, indirectos: 0, plazo_semanas: 1, expertos: [3] });
    await llamar('POST', `/api/estimaciones/${e2.id}/iniciar`);
    const lista = await llamar('GET', `/api/estimaciones/${e2.id}/invitaciones`);
    if (falla) { assert.equal(enviados.length, 0); assert.equal(lista.invitaciones[0].estado, 'pendiente'); assert.equal(lista.correos[0].estado, 'error'); }
    else { assert.equal(enviados.length, 1); assert.equal(enviados[0].to, 'ana@uce.edu.do'); assert.match(enviados[0].html, /Entrar y participar/); assert.equal(lista.invitaciones[0].estado, 'enviada'); assert.equal(lista.modo, 'smtp'); }
    srv.close();
  }
});

test('correo: configuración guardada cifrada, sin devolver la clave; solo el administrador la cambia', async () => {
  const adm = cliente(); await adm.entrar('admin@uce.edu.do', CLAVES.admin);
  const cfg = { host: 'smtp.gmail.com', puerto: 587, seguro: false, usuario: 'yo@gmail.com', clave: 'abcd efgh ijkl mnop', remitente: '', base_url: 'https://x.ngrok-free.app/' };
  let r = await adm.put('/api/correo/config', cfg);
  assert.equal(r.estado, 200);
  assert.equal(r.datos.tiene_clave, true);
  assert.equal(r.datos.clave, undefined);
  assert.equal(r.datos.base_url, 'https://x.ngrok-free.app');
  r = await adm.put('/api/correo/config', { ...cfg, clave: '', base_url: '' });
  assert.equal(r.datos.tiene_clave, true, 'una clave vacía conserva la guardada');
  const mod = cliente(); await mod.entrar('moderador@uce.edu.do', CLAVES.moderador);
  assert.equal((await mod.put('/api/correo/config', cfg)).estado, 403);
  assert.equal((await mod.get('/api/correo/config')).estado, 200);
});

test('fechas: hoy() usa la zona horaria de la aplicación', () => {
  assert.match(require('../src/fechas').hoy(), /^\d{4}-\d{2}-\d{2}$/);
});

test('cada usuario cambia su propia clave', async () => {
  const ad = cliente(); await ad.entrar('admin@uce.edu.do', CLAVES.admin);
  await ad.post('/api/usuarios', { nombre: 'Lola Peña', correo: 'lola@uce.edu.do', clave: 'ClaveInicial1', rol: 'experto' });
  const l = cliente(); await l.entrar('lola@uce.edu.do', 'ClaveInicial1');
  assert.equal((await cliente().put('/api/auth/clave', { actual: 'x', nueva: 'ClaveNueva22' })).estado, 401, 'sin sesión');
  assert.equal((await l.put('/api/auth/clave', { actual: 'incorrecta', nueva: 'ClaveNueva22' })).estado, 400);
  assert.equal((await l.put('/api/auth/clave', { actual: 'ClaveInicial1', nueva: 'corta' })).estado, 400);
  assert.equal((await l.put('/api/auth/clave', { actual: 'ClaveInicial1', nueva: 'ClaveInicial1' })).estado, 400);
  assert.equal((await l.put('/api/auth/clave', { actual: 'ClaveInicial1', nueva: 'ClaveNueva22' })).estado, 200);
  assert.equal((await cliente().post('/api/auth/login', { correo: 'lola@uce.edu.do', clave: 'ClaveInicial1' })).estado, 401);
  assert.equal((await cliente().post('/api/auth/login', { correo: 'lola@uce.edu.do', clave: 'ClaveNueva22' })).estado, 200);
});
