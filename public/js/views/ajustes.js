// Ajustes: usuarios, proveedores, categorías, laboratorios, parámetros y contraseña
import { api } from '../api.js';
import { app } from '../app.js';
import { esc, fechaHora, icono, modal, leerForm, accion, vacio, confirmar, toast } from '../ui.js';

const ROLES = { administrador: 'Administrador', regente: 'Regente farmacéutica', vendedor: 'Vendedor' };

export default async function ajustes(el, ctx) {
  const admin = app.puede('administrador');
  const gestion = app.puede('administrador', 'regente');
  const tabs = [
    admin && ['usuarios', 'Usuarios'],
    gestion && ['proveedores', 'Proveedores'],
    gestion && ['categorias', 'Categorías'],
    gestion && ['laboratorios', 'Laboratorios'],
    admin && ['parametros', 'Alertas y farmacia'],
    ['cuenta', 'Mi contraseña'],
  ].filter(Boolean);
  const tab = tabs.find((t) => t[0] === ctx.params[0])?.[0] || tabs[0][0];

  el.innerHTML = `
    <div class="page-head"><div><h1>Ajustes</h1></div></div>
    <div class="toolbar"><div class="segmentado">${tabs.map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'activo' : ''}">${t}</button>`).join('')}</div></div>
    <div id="cont"></div>`;
  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { location.hash = '#/ajustes/' + b.dataset.t; }));
  const cont = el.querySelector('#cont');
  const recargar = () => ajustes(el, { ...ctx, params: [tab] });

  if (tab === 'usuarios') return usuarios(cont, recargar);
  if (tab === 'parametros') return parametros(cont);
  if (tab === 'cuenta') return cuenta(cont);
  return catalogoSimple(cont, tab, recargar);
}

// ---------------------------------------------------------------- usuarios
async function usuarios(cont, recargar) {
  const lista = await api.get('/usuarios');
  cont.innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><h2>Usuarios</h2><p class="muted small">Solo la administración puede ajustar inventario, anular ventas y dar de baja lotes.</p></div>
        <button class="btn" id="nuevo">${icono('mas')}Nuevo usuario</button></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Último acceso</th><th>Estado</th></tr></thead>
        <tbody>${lista.map((u, i) => `
          <tr class="click" data-i="${i}">
            <td><b>${esc(u.nombre_completo)}</b></td><td>${esc(u.correo)}</td><td>${ROLES[u.rol]}</td>
            <td>${u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : '<span class="muted">Nunca</span>'}</td>
            <td><span class="chip ${u.activo ? 'verde' : 'negro'}">${u.activo ? 'Activo' : 'Desactivado'}</span></td>
          </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
  cont.querySelector('#nuevo').addEventListener('click', () => formUsuario(null, recargar));
  cont.querySelectorAll('tr[data-i]').forEach((tr) => tr.addEventListener('click', () => formUsuario(lista[tr.dataset.i], recargar)));
}

function formUsuario(u, recargar) {
  const nuevo = !u;
  u = u || { rol: 'vendedor', activo: true };
  const m = modal({
    titulo: nuevo ? 'Nuevo usuario' : 'Editar usuario',
    cuerpo: `
      <form id="fu" class="form-grid">
        <label class="campo span-2">Nombre completo<input name="nombre_completo" value="${esc(u.nombre_completo)}" autofocus></label>
        <label class="campo">Correo<input name="correo" type="email" value="${esc(u.correo)}"></label>
        <label class="campo">Teléfono<input name="telefono" value="${esc(u.telefono)}"></label>
        <label class="campo">Rol<select name="rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.rol === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="campo">${nuevo ? 'Contraseña' : 'Nueva contraseña (opcional)'}<input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>
        ${nuevo ? '' : `<label class="check span-2"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Puede iniciar sesión</label>`}
      </form>`,
    pie: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="ok">${nuevo ? 'Crear usuario' : 'Guardar cambios'}</button>`,
  });
  m.el.querySelector('#ok').addEventListener('click', async (e) => {
    const d = leerForm(m.el.querySelector('#fu'));
    if (!d.nombre_completo || !d.correo) return toast('Escriba nombre y correo', 'error');
    if (nuevo && d.password.length < 8) return toast('La contraseña debe tener al menos 8 caracteres', 'error');
    await accion(e.currentTarget, () => nuevo ? api.post('/usuarios', d) : api.put('/usuarios/' + u.id_usuario, d),
      nuevo ? 'Usuario creado' : 'Usuario actualizado');
    m.cerrar();
    recargar();
  });
}

// ------------------------------------------------ catálogos de una tabla
const CATALOGOS = {
  proveedores: {
    titulo: 'Proveedores', singular: 'proveedor', pk: 'id_proveedor', principal: 'razon_social',
    campos: [['razon_social', 'Razón social'], ['nit', 'NIT'], ['contacto', 'Contacto'], ['telefono', 'Teléfono (WhatsApp)'], ['correo', 'Correo'], ['direccion', 'Dirección']],
  },
  categorias: {
    titulo: 'Categorías terapéuticas', singular: 'categoría', pk: 'id_categoria', principal: 'nombre',
    campos: [['nombre', 'Nombre'], ['descripcion', 'Descripción'], ['icono', 'Ícono (emoji, se ve en el catálogo)']],
  },
  laboratorios: {
    titulo: 'Laboratorios', singular: 'laboratorio', pk: 'id_laboratorio', principal: 'nombre',
    campos: [['nombre', 'Nombre'], ['pais', 'País']],
  },
};

async function catalogoSimple(cont, tabla, recargar) {
  const cfg = CATALOGOS[tabla];
  const lista = await api.get('/' + tabla);
  cont.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>${cfg.titulo}</h2><button class="btn" id="nuevo">${icono('mas')}Agregar ${cfg.singular}</button></div>
      <div class="tabla-wrap">${lista.length ? `<table>
        <thead><tr>${cfg.campos.map(([, t]) => `<th>${t.replace(/ \(.*\)/, '')}</th>`).join('')}</tr></thead>
        <tbody>${lista.map((x, i) => `<tr class="click" data-i="${i}">${cfg.campos.map(([k], j) => `<td>${j === 0 ? `<b>${esc(x[k])}</b>` : esc(x[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>` : vacio('Sin registros')}</div>
    </section>`;

  const form = (x) => {
    const nuevo = !x;
    x = x || {};
    const m = modal({
      titulo: nuevo ? `Agregar ${cfg.singular}` : `Editar ${cfg.singular}`,
      cuerpo: `<form id="fc" class="form-grid">${cfg.campos.map(([k, t], i) => `
        <label class="campo ${i === 0 ? 'span-2' : ''}">${t}<input name="${k}" value="${esc(x[k])}" ${i === 0 ? 'autofocus' : ''}></label>`).join('')}</form>`,
      pie: `<div class="izq">${!nuevo && app.puede('administrador') ? '<button class="btn peligro" id="del">Quitar</button>' : ''}</div>
            <button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="ok">Guardar</button>`,
    });
    m.el.querySelector('#ok').addEventListener('click', async (e) => {
      const d = leerForm(m.el.querySelector('#fc'));
      if (!d[cfg.principal]) return toast('Complete el primer campo', 'error');
      await accion(e.currentTarget, () => nuevo ? api.post('/' + tabla, d) : api.put(`/${tabla}/${x[cfg.pk]}`, d), 'Guardado');
      m.cerrar();
      recargar();
    });
    m.el.querySelector('#del')?.addEventListener('click', async () => {
      if (!(await confirmar(`Quitar ${cfg.singular}`, `"${esc(x[cfg.principal])}" dejará de aparecer en las listas. Los registros anteriores se conservan.`, { boton: 'Quitar', peligro: true }))) return;
      await accion(null, () => api.del(`/${tabla}/${x[cfg.pk]}`), 'Quitado de la lista');
      m.cerrar();
      recargar();
    });
  };
  cont.querySelector('#nuevo').addEventListener('click', () => form(null));
  cont.querySelectorAll('tr[data-i]').forEach((tr) => tr.addEventListener('click', () => form(lista[tr.dataset.i])));
}

// -------------------------------------------------------------- parámetros
async function parametros(cont) {
  const p = Object.fromEntries((await api.get('/parametros')).map((x) => [x.clave, x.valor]));
  cont.innerHTML = `
    <section class="panel" style="max-width:720px">
      <div class="panel-head"><h2>Alertas y datos de la farmacia</h2></div>
      <form id="fp" class="panel-body form-grid">
        <label class="campo">Stock mínimo para medicamentos nuevos<input name="stock_minimo_defecto" type="number" min="0" value="${esc(p.stock_minimo_defecto)}"></label>
        <span></span>
        <label class="campo">Alerta amarilla: meses antes del vencimiento<input name="meses_alerta_venc" type="number" min="1" value="${esc(p.meses_alerta_venc)}"></label>
        <label class="campo">Alerta roja (retirar): meses antes del vencimiento<input name="meses_retiro_estante" type="number" min="0" value="${esc(p.meses_retiro_estante)}"></label>
        <label class="campo">Nombre de la farmacia<input name="nombre_farmacia" value="${esc(p.nombre_farmacia)}"></label>
        <label class="campo">WhatsApp para clientes<input name="whatsapp" value="${esc(p.whatsapp)}"></label>
        <label class="campo span-2">Dirección<input name="direccion" value="${esc(p.direccion)}"></label>
        <div class="span-2"><button class="btn" id="ok" type="button">Guardar</button></div>
      </form>
    </section>`;
  cont.querySelector('#ok').addEventListener('click', (e) =>
    accion(e.currentTarget, () => api.put('/parametros', leerForm(cont.querySelector('#fp'))), 'Ajustes guardados'));
}

function cuenta(cont) {
  cont.innerHTML = `
    <section class="panel" style="max-width:480px">
      <div class="panel-head"><h2>Cambiar mi contraseña</h2></div>
      <form id="fc" class="panel-body" style="display:grid;gap:14px">
        <label class="campo">Contraseña actual<input name="actual" type="password" autocomplete="current-password"></label>
        <label class="campo">Nueva contraseña<input name="nueva" type="password" minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>
        <label class="campo">Repetir nueva contraseña<input name="repetir" type="password" autocomplete="new-password"></label>
        <div><button class="btn" id="ok" type="button">Cambiar contraseña</button></div>
      </form>
    </section>`;
  cont.querySelector('#ok').addEventListener('click', async (e) => {
    const f = cont.querySelector('#fc');
    const d = leerForm(f);
    if (d.nueva.length < 8) return toast('La nueva contraseña debe tener al menos 8 caracteres', 'error');
    if (d.nueva !== d.repetir) return toast('Las contraseñas nuevas no coinciden', 'error');
    await accion(e.currentTarget, () => api.post('/auth/cambiar-password', d), 'Contraseña cambiada');
    f.reset();
  });
}
