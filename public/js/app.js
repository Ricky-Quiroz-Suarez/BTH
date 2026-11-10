// Arranque de la aplicación: sesión, menú lateral y enrutador por hash (#/ruta)
import { api, sesion, onSesionExpirada } from './api.js';
import { $, $$, esc, icono, toast } from './ui.js';

import dashboard from './views/dashboard.js';
import ventas from './views/ventas.js';
import productos from './views/productos.js';
import inventario from './views/inventario.js';
import alertas from './views/alertas.js';
import compras from './views/compras.js';
import kardex from './views/kardex.js';
import conteos from './views/conteos.js';
import promociones from './views/promociones.js';
import consultas from './views/consultas.js';
import reportes from './views/reportes.js';
import ajustes from './views/ajustes.js';

const TODOS = ['administrador', 'regente', 'vendedor'];
const GESTION = ['administrador', 'regente'];

// Menú: ruta, texto, ícono, vista, roles
const MENU = [
  { grupo: 'Día a día' },
  { ruta: 'panel', texto: 'Panel', icono: 'panel', vista: dashboard, roles: TODOS },
  { ruta: 'ventas', texto: 'Vender', icono: 'venta', vista: ventas, roles: TODOS },
  { ruta: 'alertas', texto: 'Alertas', icono: 'alerta', vista: alertas, roles: TODOS, badge: 'alertas' },
  { ruta: 'consultas', texto: 'Consultas', icono: 'mensaje', vista: consultas, roles: TODOS, badge: 'consultas' },
  { grupo: 'Inventario' },
  { ruta: 'productos', texto: 'Medicamentos', icono: 'capsula', vista: productos, roles: TODOS },
  { ruta: 'lotes', texto: 'Lotes y vencimientos', icono: 'caja', vista: inventario, roles: TODOS },
  { ruta: 'compras', texto: 'Compras', icono: 'camion', vista: compras, roles: GESTION },
  { ruta: 'conteos', texto: 'Conteo físico', icono: 'check', vista: conteos, roles: GESTION },
  { ruta: 'kardex', texto: 'Kardex', icono: 'lista', vista: kardex, roles: GESTION },
  { grupo: 'Administración' },
  { ruta: 'promociones', texto: 'Promociones', icono: 'etiqueta', vista: promociones, roles: GESTION },
  { ruta: 'reportes', texto: 'Reportes', icono: 'grafico', vista: reportes, roles: GESTION },
  { ruta: 'ajustes', texto: 'Ajustes', icono: 'ajustes', vista: ajustes, roles: TODOS },
];

export const app = {
  usuario: null,
  puede: (...roles) => roles.includes(app.usuario?.rol),
  ir: (ruta) => { location.hash = '#/' + ruta; },
  refrescarBadges,
};

const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" fill="#0F3D66"/></svg>`;

// ------------------------------------------------------------------ login
function pantallaLogin(error = '') {
  $('#raiz').innerHTML = `
    <div class="login">
      <section class="login-arte">
        <div class="marca" style="padding:0">
          <span class="marca-logo">${LOGO}</span>
          <div><b>FarmaStock</b><small>Farmacia VitalClin</small></div>
        </div>
        <div>
          <h1>Cada lote, a tiempo.</h1>
          <p>Inventario por lotes con salida FEFO: primero se vende lo que vence primero, y el sistema avisa antes de que algo se quede en el estante.</p>
        </div>
        <div class="login-semaforo" aria-hidden="true">
          <div><i style="background:#D14343"></i>Retirar del estante<span>≤ 3 meses</span></div>
          <div><i style="background:#D99A0B"></i>Priorizar la venta<span>≤ 6 meses</span></div>
          <div><i style="background:#22C55E"></i>Vigente<span>&gt; 6 meses</span></div>
        </div>
      </section>
      <form class="login-form" id="form-login" novalidate>
        <div>
          <h2>Iniciar sesión</h2>
          <p class="muted" style="margin-top:4px">Use el correo que le asignó la administración.</p>
        </div>
        ${error ? `<div class="error-msg" role="alert">${esc(error)}</div>` : ''}
        <label class="campo">Correo electrónico
          <input name="correo" type="email" autocomplete="username" required autofocus>
        </label>
        <label class="campo">Contraseña
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button class="btn grande" type="submit">Entrar</button>
      </form>
    </div>`;
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api.post('/auth/login', { correo: f.correo.value, password: f.password.value });
      sesion.set(r);
      iniciar();
    } catch (err) {
      pantallaLogin(err.message);
    }
  });
}

// ----------------------------------------------------------------- layout
function pintarLayout() {
  const u = app.usuario;
  const items = MENU.filter((m) => m.grupo || m.roles.includes(u.rol));
  // quitar grupos vacíos
  const visibles = items.filter((m, i) => !m.grupo || (items[i + 1] && !items[i + 1].grupo));
  const iniciales = u.nombre_completo.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  $('#raiz').innerHTML = `
    <div class="app" id="app">
      <aside class="sidebar">
        <div class="marca">
          <span class="marca-logo">${LOGO}</span>
          <div><b>FarmaStock</b><small>Farmacia VitalClin</small></div>
        </div>
        <nav class="nav" aria-label="Menú principal">
          ${visibles.map((m) => m.grupo
            ? `<div class="nav-grupo">${m.grupo}</div>`
            : `<a href="#/${m.ruta}" data-ruta="${m.ruta}">${icono(m.icono)}${m.texto}${m.badge ? `<span class="badge hidden" data-badge="${m.badge}"></span>` : ''}</a>`
          ).join('')}
        </nav>
        <div class="usuario-box">
          <span class="avatar">${esc(iniciales)}</span>
          <div class="info"><b>${esc(u.nombre_completo)}</b><small>${esc(u.rol)}</small></div>
          <button class="btn-salir" id="salir" title="Cerrar sesión" aria-label="Cerrar sesión">${icono('salir')}</button>
        </div>
      </aside>
      <div>
        <header class="topbar-movil">
          <button id="abrir-menu" aria-label="Abrir menú">${icono('menu')}</button>
          <b>FarmaStock</b>
        </header>
        <main class="main" id="vista" tabindex="-1"></main>
      </div>
    </div>`;

  $('#salir').addEventListener('click', cerrarSesion);
  $('#abrir-menu').addEventListener('click', () => $('#app').classList.toggle('menu-abierto'));
  $('.nav').addEventListener('click', () => $('#app').classList.remove('menu-abierto'));
}

async function refrescarBadges() {
  try {
    const [a, c] = await Promise.all([api.get('/alertas'), api.get('/consultas')]);
    const n = {
      alertas: a.stock.length + a.vencimiento.filter((x) => x.semaforo !== 'amarillo').length,
      consultas: c.filter((x) => !x.atendida).length,
    };
    $$('[data-badge]').forEach((b) => {
      const v = n[b.dataset.badge];
      b.textContent = v;
      b.classList.toggle('hidden', !v);
    });
  } catch { /* silencioso */ }
}

// ----------------------------------------------------------------- router
let renderId = 0;
async function enrutar() {
  if (!app.usuario) return;
  const [ruta, ...resto] = (location.hash.replace(/^#\/?/, '') || 'panel').split('/');
  const item = MENU.find((m) => m.ruta === ruta && m.roles?.includes(app.usuario.rol));
  if (!item) return app.ir('panel');

  $$('.modal-fondo').forEach((m) => m.cerrarSilencioso?.());
  $$('.nav a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === ruta));
  const cont = $('#vista');
  const id = ++renderId;
  cont.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    await item.vista(cont, { params: resto, esVigente: () => id === renderId });
    document.title = `${item.texto} | FarmaStock`;
  } catch (e) {
    if (id === renderId) cont.innerHTML = `<div class="panel vacio"><b>No se pudo cargar esta sección</b>${esc(e.message)}</div>`;
  }
}

function cerrarSesion() {
  sesion.limpiar();
  app.usuario = null;
  pantallaLogin();
}

async function iniciar() {
  const s = sesion.get();
  if (!s?.token) return pantallaLogin();
  try {
    app.usuario = await api.get('/auth/me');
  } catch {
    sesion.limpiar();
    return pantallaLogin();
  }
  pintarLayout();
  enrutar();
  refrescarBadges();
}

onSesionExpirada(() => {
  if (!app.usuario) return;
  sesion.limpiar();
  app.usuario = null;
  pantallaLogin('Su sesión expiró. Vuelva a ingresar.');
});
window.addEventListener('hashchange', enrutar);
window.addEventListener('unhandledrejection', (e) => {
  // los errores ya se muestran con toast en accion(); evitar ruido en consola
  if (e.reason instanceof Error) e.preventDefault();
});
iniciar();
