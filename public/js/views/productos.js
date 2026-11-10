// Catálogo de medicamentos: búsqueda, ficha con lotes, alta y edición
import { api, qs } from '../api.js';
import { app } from '../app.js';
import {
  esc, bs, fecha, icono, modal, leerForm, accion, opciones, vacio, confirmar,
  chipSemaforo, stockBar, toast, hoy,
} from '../ui.js';

let cat = null; // categorías, laboratorios y formas

async function cargarCatalogos() {
  const [categorias, laboratorios, formas] = await Promise.all([
    api.get('/categorias'), api.get('/laboratorios'), api.get('/formas'),
  ]);
  cat = { categorias, laboratorios, formas };
  return cat;
}

export default async function productos(el, ctx) {
  await cargarCatalogos();
  if (!ctx.esVigente()) return;
  const editor = app.puede('administrador', 'regente');
  const filtros = { q: '', categoria: '', laboratorio: '', estado: '' };

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Medicamentos</h1><p>Busque por nombre comercial, principio activo o código.</p></div>
      <div class="acciones">${editor ? `<button class="btn" id="nuevo">${icono('mas')}Registrar medicamento</button>` : ''}</div>
    </div>
    <div class="toolbar">
      <input type="search" id="f-q" placeholder="Paracetamol, ibuprofeno, MED-001…" aria-label="Buscar medicamento">
      <select id="f-cat" aria-label="Categoría">${opciones(cat.categorias, '', 'id_categoria', 'nombre', 'Todas las categorías')}</select>
      <select id="f-lab" aria-label="Laboratorio">${opciones(cat.laboratorios, '', 'id_laboratorio', 'nombre', 'Todos los laboratorios')}</select>
      <div class="segmentado" id="f-estado" role="group" aria-label="Stock">
        <button class="activo" data-v="">Todos</button>
        <button data-v="bajo">Stock bajo</button>
        <button data-v="agotado">Agotados</button>
      </div>
    </div>
    <section class="panel"><div class="tabla-wrap" id="tabla"></div></section>`;

  const pintar = async () => {
    const lista = await api.get('/productos' + qs(filtros));
    if (!ctx.esVigente()) return;
    el.querySelector('#tabla').innerHTML = lista.length ? `
      <table>
        <thead><tr>
          <th>Medicamento</th><th>Categoría</th><th>Laboratorio</th>
          <th class="num">Stock</th><th>Próximo vencimiento</th><th class="num">Precio</th>
        </tr></thead>
        <tbody>${lista.map((p) => `
          <tr class="click" data-id="${p.id_producto}" tabindex="0">
            <td class="td-prod"><b>${esc(p.nombre_comercial)} ${esc(p.concentracion || '')}</b>
              <small>${esc(p.principio_activo)} <span class="codigo">${esc(p.codigo)}</span>
              ${p.es_controlado ? ' <span class="chip rojo sin-punto">Controlado</span>' : p.requiere_receta ? ' <span class="chip azul sin-punto">Receta</span>' : ''}</small></td>
            <td>${esc(p.categoria)}</td>
            <td>${esc(p.laboratorio)}</td>
            <td class="num">${stockBar(p.stock_disponible, p.stock_minimo)}</td>
            <td>${p.proximo_vencimiento ? fecha(p.proximo_vencimiento) : '<span class="muted">Sin lotes</span>'}</td>
            <td class="num">${bs(p.precio_venta)}</td>
          </tr>`).join('')}</tbody>
      </table>` : vacio('No hay medicamentos con esos filtros', editor ? ' Pruebe otra búsqueda o registre uno nuevo.' : '');
    el.querySelectorAll('tr[data-id]').forEach((tr) => {
      const abrir = () => abrirFicha(tr.dataset.id, pintar);
      tr.addEventListener('click', abrir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    });
  };

  let t;
  el.querySelector('#f-q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { filtros.q = e.target.value.trim(); pintar(); }, 220);
  });
  el.querySelector('#f-cat').addEventListener('change', (e) => { filtros.categoria = e.target.value; pintar(); });
  el.querySelector('#f-lab').addEventListener('change', (e) => { filtros.laboratorio = e.target.value; pintar(); });
  el.querySelectorAll('#f-estado button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('#f-estado button').forEach((x) => x.classList.toggle('activo', x === b));
    filtros.estado = b.dataset.v;
    pintar();
  }));
  el.querySelector('#nuevo')?.addEventListener('click', () => formProducto(null, pintar));

  await pintar();
  if (ctx.params[0] === 'nuevo' && editor) formProducto(null, pintar);
  else if (ctx.params[0]) abrirFicha(ctx.params[0], pintar);
}

// ------------------------------------------------------------------ ficha
export async function abrirFicha(id, alCambiar, { volver } = {}) {
  const p = await api.get('/productos/' + id);
  if (!volver) history.replaceState(null, '', '#/productos/' + id);
  const editor = app.puede('administrador', 'regente');
  const admin = app.puede('administrador');

  const m = modal({
    titulo: `${p.nombre_comercial} ${p.concentracion || ''}`,
    subtitulo: `${esc(p.principio_activo)}, ${esc(p.laboratorio)}`,
    ancho: true,
    cuerpo: `
      <div class="grid-2" style="gap:24px;margin-bottom:18px">
        <dl class="dl">
          <dt>Código</dt><dd>${esc(p.codigo)}</dd>
          <dt>Categoría</dt><dd>${esc(p.categoria)}</dd>
          <dt>Forma</dt><dd>${esc(p.forma || '—')}</dd>
          <dt>Presentación</dt><dd>${esc(p.presentacion || '—')}</dd>
          <dt>Registro sanitario</dt><dd>${esc(p.registro_sanitario || '—')}</dd>
        </dl>
        <dl class="dl">
          <dt>Precio de venta</dt><dd>${bs(p.precio_venta)}</dd>
          <dt>Stock vendible</dt><dd>${p.stock_disponible ?? 0} unidades (mínimo ${p.stock_minimo})</dd>
          <dt>Receta</dt><dd>${p.es_controlado ? 'Controlado: receta archivada y libro SEDES' : p.requiere_receta ? 'Requiere receta médica' : 'Venta libre'}</dd>
          <dt>Estado</dt><dd>${p.activo ? 'Activo' : 'Desactivado'}</dd>
        </dl>
      </div>
      <h3 style="margin-bottom:8px">Lotes (se venden en este orden)</h3>
      <div class="panel"><div class="tabla-wrap">${p.lotes.length ? `
        <table>
          <thead><tr><th>Lote</th><th>Vence</th><th>Estado</th><th class="num">Ingresó</th><th class="num">Quedan</th><th class="num">Costo</th></tr></thead>
          <tbody>${p.lotes.map((l) => `
            <tr>
              <td><b>${esc(l.numero_lote)}</b></td>
              <td>${fecha(l.fecha_vencimiento)}</td>
              <td>${l.cantidad_actual > 0 ? chipSemaforo(l.semaforo, l.dias_restantes) : '<span class="chip sin-punto">Agotado</span>'}
                  ${l.estado === 'retirado' ? '<span class="chip negro sin-punto">Retirado</span>' : ''}</td>
              <td class="num">${l.cantidad_inicial}</td>
              <td class="num"><b>${l.cantidad_actual}</b></td>
              <td class="num">${bs(l.costo_unitario)}</td>
            </tr>`).join('')}</tbody>
        </table>` : vacio('Sin lotes registrados', ' Ingrese stock con una compra o con "Agregar lote".')}</div></div>`,
    pie: `
      <div class="izq">${admin && p.activo ? `<button class="btn peligro" data-acc="desactivar">${icono('basura')}Desactivar</button>` : ''}</div>
      ${editor ? `<button class="btn sec" data-acc="lote">${icono('mas')}Agregar lote</button>
                  <button class="btn" data-acc="editar">${icono('editar')}Editar</button>` : ''}`,
    alCerrar: () => history.replaceState(null, '', volver || '#/productos'),
  });

  const on = (acc, fn) => m.el.querySelector(`[data-acc="${acc}"]`)?.addEventListener('click', fn);
  on('editar', () => { m.cerrar(); formProducto(p, alCambiar, volver); });
  on('lote', () => { m.cerrar(); formLote(p, alCambiar, volver); });
  on('desactivar', async () => {
    if (!(await confirmar('Desactivar medicamento', `"${esc(p.nombre_comercial)}" dejará de aparecer en el catálogo y en ventas. El historial se conserva.`, { boton: 'Desactivar', peligro: true }))) return;
    await accion(null, () => api.del('/productos/' + p.id_producto), 'Medicamento desactivado');
    m.cerrar();
    alCambiar?.();
  });
}

// --------------------------------------------------------- alta / edición
async function formProducto(p, alCambiar, volver) {
  if (!cat) await cargarCatalogos();
  const nuevo = !p;
  if (nuevo) {
    const ps = await api.get('/parametros');
    p = { stock_minimo: Number(ps.find((x) => x.clave === 'stock_minimo_defecto')?.valor ?? 10) };
  }
  const m = modal({
    titulo: nuevo ? 'Registrar medicamento' : 'Editar medicamento',
    ancho: true,
    cuerpo: `
      <form id="fp" class="form-grid" novalidate>
        <label class="campo">Código o código de barras<input name="codigo" required value="${esc(p.codigo)}" autofocus></label>
        <label class="campo">Nombre comercial<input name="nombre_comercial" required value="${esc(p.nombre_comercial)}"></label>
        <label class="campo">Principio activo<input name="principio_activo" required value="${esc(p.principio_activo)}"></label>
        <label class="campo">Concentración<input name="concentracion" placeholder="500 mg" value="${esc(p.concentracion)}"></label>
        <label class="campo">Forma farmacéutica<select name="id_forma">${opciones(cat.formas, p.id_forma, 'id_forma', 'nombre', 'Sin especificar')}</select></label>
        <label class="campo">Presentación<input name="presentacion" placeholder="Caja x 20 tabletas" value="${esc(p.presentacion)}"></label>
        <label class="campo">Categoría terapéutica<select name="id_categoria" required>${opciones(cat.categorias, p.id_categoria, 'id_categoria', 'nombre', 'Elegir…')}</select></label>
        <label class="campo">Laboratorio<select name="id_laboratorio" required>${opciones(cat.laboratorios, p.id_laboratorio, 'id_laboratorio', 'nombre', 'Elegir…')}</select></label>
        <label class="campo">Registro sanitario (AGEMED)<input name="registro_sanitario" value="${esc(p.registro_sanitario)}"></label>
        <label class="campo">Precio de venta (Bs)<input name="precio_venta" type="number" min="0" step="0.01" required value="${p.precio_venta ?? ''}"></label>
        <label class="campo">Stock mínimo (alerta)<input name="stock_minimo" type="number" min="0" step="1" value="${p.stock_minimo ?? 10}"></label>
        <div style="display:flex;flex-direction:column;gap:8px;justify-content:flex-end">
          <label class="check"><input type="checkbox" name="requiere_receta" ${p.requiere_receta ? 'checked' : ''}> Requiere receta médica</label>
          <label class="check"><input type="checkbox" name="es_controlado" ${p.es_controlado ? 'checked' : ''}> Psicotrópico o controlado</label>
        </div>
        <label class="campo span-2">Descripción o indicaciones<textarea name="descripcion" rows="2">${esc(p.descripcion)}</textarea></label>
        ${nuevo ? `
        <fieldset class="fieldset span-2">
          <legend>Stock inicial (opcional)</legend>
          <p class="muted small" style="margin-bottom:10px">Si el medicamento ya está en el estante, registre su lote actual.</p>
          <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
            <label class="campo">Número de lote<input name="li_lote"></label>
            <label class="campo">Vence<input name="li_venc" type="date" min="${hoy()}"></label>
            <label class="campo">Costo unitario (Bs)<input name="li_costo" type="number" min="0" step="0.01"></label>
            <label class="campo">Cantidad<input name="li_cant" type="number" min="1" step="1"></label>
          </div>
        </fieldset>` : ''}
      </form>`,
    pie: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="guardar">${nuevo ? 'Registrar' : 'Guardar cambios'}</button>`,
  });

  m.el.querySelector('#guardar').addEventListener('click', async (e) => {
    const f = m.el.querySelector('#fp');
    const d = leerForm(f);
    if (!d.codigo || !d.nombre_comercial || !d.principio_activo || !d.id_categoria || !d.id_laboratorio || d.precio_venta === '') {
      return toast('Complete código, nombre, principio activo, categoría, laboratorio y precio', 'error');
    }
    if (d.es_controlado) d.requiere_receta = true;
    if (nuevo && (d.li_lote || d.li_cant)) {
      if (!d.li_lote || !d.li_venc || !d.li_cant) return toast('Para el stock inicial indique lote, vencimiento y cantidad', 'error');
      d.lote_inicial = { numero_lote: d.li_lote, fecha_vencimiento: d.li_venc, costo_unitario: d.li_costo || 0, cantidad: d.li_cant };
    }
    ['li_lote', 'li_venc', 'li_costo', 'li_cant'].forEach((k) => delete d[k]);
    const r = await accion(e.currentTarget, () =>
      nuevo ? api.post('/productos', d) : api.put('/productos/' + p.id_producto, d),
      nuevo ? 'Medicamento registrado' : 'Cambios guardados');
    m.cerrar();
    await alCambiar?.();
    abrirFicha(nuevo ? r.id_producto : p.id_producto, alCambiar, { volver });
  });
}

function formLote(p, alCambiar, volver) {
  const m = modal({
    titulo: 'Agregar lote',
    subtitulo: `${esc(p.nombre_comercial)}. Para mercadería comprada use Compras, así queda el comprobante.`,
    cuerpo: `
      <form id="fl" class="form-grid">
        <label class="campo">Número de lote<input name="numero_lote" required autofocus></label>
        <label class="campo">Vence<input name="fecha_vencimiento" type="date" min="${hoy()}" required></label>
        <label class="campo">Costo unitario (Bs)<input name="costo_unitario" type="number" min="0" step="0.01"></label>
        <label class="campo">Cantidad<input name="cantidad" type="number" min="1" step="1" required></label>
      </form>`,
    pie: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="ok">Agregar lote</button>`,
  });
  m.el.querySelector('#ok').addEventListener('click', async (e) => {
    const d = leerForm(m.el.querySelector('#fl'));
    if (!d.numero_lote || !d.fecha_vencimiento || !d.cantidad) return toast('Complete lote, vencimiento y cantidad', 'error');
    await accion(e.currentTarget, () => api.post(`/productos/${p.id_producto}/lotes`, d), 'Lote agregado');
    m.cerrar();
    await alCambiar?.();
    abrirFicha(p.id_producto, alCambiar, { volver });
  });
}
