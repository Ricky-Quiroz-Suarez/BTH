// Promociones comerciales y de salida rápida (lotes por vencer)
import { api } from '../api.js';
import { app } from '../app.js';
import { esc, fecha, icono, modal, leerForm, accion, vacio, confirmar, toast, hoy, sumarDias } from '../ui.js';
import { listaProductos, datalistProductos, productoDesdeTexto, etiquetaProducto } from './comun.js';

export default async function promociones(el, ctx) {
  const lista = await api.get('/promociones');
  if (!ctx.esVigente()) return;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Promociones</h1><p>El descuento se aplica solo en caja mientras la promoción está vigente. Las de salida rápida pueden limitarse a un lote.</p></div>
      <div class="acciones"><button class="btn" id="nueva">${icono('mas')}Nueva promoción</button></div>
    </div>
    <section class="panel"><div class="tabla-wrap">${lista.length ? `
      <table>
        <thead><tr><th>Promoción</th><th>Tipo</th><th class="num">Descuento</th><th>Vigencia</th><th>Aplica a</th><th>Estado</th></tr></thead>
        <tbody>${lista.map((p, i) => `
          <tr class="click" data-i="${i}">
            <td class="td-prod"><b>${esc(p.titulo)}</b><small>${esc(p.descripcion || '')}</small></td>
            <td>${p.motivo === 'salida_rapida' ? 'Salida rápida' : 'Comercial'}</td>
            <td class="num"><b>${p.descuento_pct}%</b></td>
            <td>${fecha(p.fecha_inicio)} al ${fecha(p.fecha_fin)}</td>
            <td class="small">${p.items.map((x) => esc(x.nombre_comercial) + (x.numero_lote ? ` (lote ${esc(x.numero_lote)})` : '')).join(', ') || '<span class="muted">Sin productos</span>'}</td>
            <td><span class="chip ${p.vigente ? 'verde' : ''}">${p.vigente ? 'Vigente' : p.activo ? (p.fecha_inicio > hoy() ? 'Programada' : 'Terminada') : 'Pausada'}</span></td>
          </tr>`).join('')}</tbody>
      </table>` : vacio('No hay promociones', ' Cree una para los lotes que vencen en menos de 6 meses.')}</div></section>`;

  const recargar = () => promociones(el, ctx);
  el.querySelector('#nueva').addEventListener('click', () => formPromo(null, recargar));
  el.querySelectorAll('tr[data-i]').forEach((tr) => tr.addEventListener('click', () => formPromo(lista[tr.dataset.i], recargar)));
  if (ctx.params[0] === 'nueva') { history.replaceState(null, '', '#/promociones'); formPromo(null, recargar); }
}

async function formPromo(p, alCambiar) {
  const productos = await listaProductos(true);
  const nueva = !p;
  p = p || { descuento_pct: 10, fecha_inicio: hoy(), fecha_fin: sumarDias(hoy(), 30), motivo: 'comercial', activo: true, items: [] };
  const items = p.items.map((x) => ({ ...x }));
  const lotesCache = {};

  const m = modal({
    titulo: nueva ? 'Nueva promoción' : 'Editar promoción',
    ancho: true,
    cuerpo: `
      <form id="fpr" class="form-grid">
        <label class="campo span-2">Título<input name="titulo" required value="${esc(p.titulo)}" autofocus></label>
        <label class="campo span-2">Descripción<input name="descripcion" value="${esc(p.descripcion)}"></label>
        <label class="campo">Descuento (%)<input name="descuento_pct" type="number" min="1" max="100" value="${p.descuento_pct}"></label>
        <label class="campo">Tipo<select name="motivo">
          <option value="comercial" ${p.motivo === 'comercial' ? 'selected' : ''}>Comercial</option>
          <option value="salida_rapida" ${p.motivo === 'salida_rapida' ? 'selected' : ''}>Salida rápida (por vencer)</option></select></label>
        <label class="campo">Desde<input name="fecha_inicio" type="date" value="${p.fecha_inicio}"></label>
        <label class="campo">Hasta<input name="fecha_fin" type="date" value="${p.fecha_fin}"></label>
        <label class="check span-2"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> Promoción activa</label>
      </form>
      <h3 style="margin:18px 0 8px">Medicamentos incluidos</h3>
      ${datalistProductos('dl-promo', productos)}
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input list="dl-promo" id="agregar" placeholder="Escriba para buscar y elija de la lista">
      </div>
      <div class="panel"><div class="tabla-wrap"><table>
        <thead><tr><th>Medicamento</th><th>Lote</th><th></th></tr></thead>
        <tbody id="items"></tbody>
      </table></div></div>`,
    pie: `
      <div class="izq">${!nueva ? '<button class="btn peligro" id="borrar">Eliminar</button>' : ''}</div>
      <button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="ok">${nueva ? 'Crear promoción' : 'Guardar cambios'}</button>`,
  });

  const $items = m.el.querySelector('#items');
  const pintar = async () => {
    for (const it of items) {
      if (!lotesCache[it.id_producto]) lotesCache[it.id_producto] = (await api.get('/productos/' + it.id_producto)).lotes.filter((l) => l.cantidad_actual > 0);
    }
    $items.innerHTML = items.length ? items.map((it, i) => `
      <tr>
        <td><b>${esc(it.nombre_comercial)}</b></td>
        <td><select data-i="${i}" style="width:auto">
          <option value="">Todos los lotes</option>
          ${lotesCache[it.id_producto].map((l) => `<option value="${l.id_lote}" ${l.id_lote === it.id_lote ? 'selected' : ''}>${esc(l.numero_lote)}, vence ${fecha(l.fecha_vencimiento)} (${l.cantidad_actual} u)</option>`).join('')}
        </select></td>
        <td class="num"><button class="btn-icono" data-q="${i}" aria-label="Quitar">${icono('x')}</button></td>
      </tr>`).join('') : `<tr><td colspan="3" class="muted">Agregue al menos un medicamento.</td></tr>`;
    $items.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => { items[s.dataset.i].id_lote = s.value ? Number(s.value) : null; }));
    $items.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { items.splice(b.dataset.q, 1); pintar(); }));
  };
  pintar();

  m.el.querySelector('#agregar').addEventListener('change', (e) => {
    const prod = productoDesdeTexto(e.target.value, productos);
    if (!prod) return toast('Elija un medicamento de la lista', 'error');
    if (!items.some((x) => x.id_producto === prod.id_producto && !x.id_lote)) {
      items.push({ id_producto: prod.id_producto, nombre_comercial: etiquetaProducto(prod), id_lote: null });
    }
    e.target.value = '';
    pintar();
  });

  m.el.querySelector('#ok').addEventListener('click', async (e) => {
    const d = leerForm(m.el.querySelector('#fpr'));
    if (!d.titulo) return toast('Escriba un título', 'error');
    if (!(d.descuento_pct > 0 && d.descuento_pct <= 100)) return toast('El descuento debe estar entre 1 y 100 %', 'error');
    if (!items.length) return toast('Agregue al menos un medicamento', 'error');
    d.items = items.map((x) => ({ id_producto: x.id_producto, id_lote: x.id_lote || null }));
    await accion(e.currentTarget, () => nueva ? api.post('/promociones', d) : api.put('/promociones/' + p.id_promocion, d),
      nueva ? 'Promoción creada' : 'Promoción guardada');
    m.cerrar();
    alCambiar();
  });
  m.el.querySelector('#borrar')?.addEventListener('click', async () => {
    if (!(await confirmar('Eliminar promoción', `Se eliminará "${esc(p.titulo)}". Las ventas ya hechas conservan su descuento.`, { boton: 'Eliminar', peligro: true }))) return;
    await accion(null, () => api.del('/promociones/' + p.id_promocion), 'Promoción eliminada');
    m.cerrar();
    alCambiar();
  });
}
