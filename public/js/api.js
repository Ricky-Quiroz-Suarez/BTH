// Cliente de la API REST de FarmaStock
const CLAVE = 'farmastock.sesion';

export const sesion = {
  get() {
    try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; }
  },
  set(datos) {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* modo privado */ }
  },
  limpiar() {
    try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
  },
};

let alExpirar = () => {};
export function onSesionExpirada(fn) { alExpirar = fn; }

async function pedir(metodo, ruta, cuerpo) {
  const s = sesion.get();
  const res = await fetch('/api' + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(s?.token ? { Authorization: 'Bearer ' + s.token } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  let datos = null;
  try { datos = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401 && !ruta.startsWith('/auth/login')) {
    alExpirar();
  }
  if (!res.ok) throw new Error(datos?.error || `Error ${res.status}`);
  return datos;
}

// Convierte {a:1,b:''} en "?a=1"
export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
}

export const api = {
  get: (r) => pedir('GET', r),
  post: (r, b = {}) => pedir('POST', r, b),
  put: (r, b = {}) => pedir('PUT', r, b),
  del: (r) => pedir('DELETE', r),
};
