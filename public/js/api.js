// Cliente de la API: todas las llamadas pasan por aquí.
let alNoAutorizado = () => {};
export const alPerderSesion = (f) => { alNoAutorizado = f; };

export async function api(metodo, ruta, cuerpo) {
  const r = await fetch('/api' + ruta, {
    method: metodo,
    headers: cuerpo !== undefined ? { 'content-type': 'application/json' } : {},
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    credentials: 'same-origin',
  });
  let datos = null;
  try { datos = await r.json(); } catch { /* sin cuerpo */ }
  if (r.status === 401 && !ruta.startsWith('/auth/login')) alNoAutorizado();
  if (!r.ok) throw new Error((datos && datos.error) || `Error ${r.status}`);
  return datos;
}
export const get = (r) => api('GET', r);
export const post = (r, c = {}) => api('POST', r, c);
export const put = (r, c) => api('PUT', r, c);
export const del = (r) => api('DELETE', r);
