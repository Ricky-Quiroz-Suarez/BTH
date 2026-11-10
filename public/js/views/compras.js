// Abastecimiento: órdenes de compra a distribuidores y recepción de mercadería
import { api, qs } from '../api.js';
import { app } from '../app.js';
import {
  esc, bs, fecha, icono, modal, accion, vacio, confirmar, toast, opciones, hoy,
} from '../ui.js';
import { listaProductos, datalistProductos, productoDesdeTexto, etiquetaProducto } from './comun.js';

const ESTADOS = {
  borrador: { t: 'Borrador', c: '' },
  enviada: { t: 'Enviada, por recibir', c: 'amarillo' },
  recibida: { t: 'Recibida', c: 'verde' },
  anulada: { t: 'Anulada', c: 'negro' },
};

export default async function compras(el, ctx) {
  const f = { estado: '' };
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Compras</h1><p>Órdenes a Droguería INTI, BAGÓ, COFAR, TERBOL y otros distribuidores.</p></div>
      <div class="acciones">
        <button class="btn sec" id="sugerida">Pedido sugerido</button>
        <button class="btn" id="nueva">${icono('mas')}Nueva orden</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="segmentado" id="est" role="group" aria-label="Estado">
        <button class="activo" data-v="">Todas</button>
        ${Object.entries(ESTADOS).map(([k, v]) => `<button data-v="${k}">${k === 'enviada' ? 'Por recibir' : v.t}</button>`).join('')}
      </div>
    </div>
    <section class="panel"><div class="tabla-wrap" id="tabla"></div></section>`;

  const pintar = async () => {
    const lista = await api.get('/compras' + qs(f));
    if (!ctx.esVigente()) return;
    el.querySelector('#tabla').innerHTML = lista.length ? `
      <table>
        <thead><tr><th>N.º</th><th>Proveedor</th><th>Fecha de orden</th><th>Recepción</th><th>Comprobante</th><th>Estado</th><th class="num">Ítems</th><th class="num">Total</th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr class="click" data-id="${c.id_compra}" tabindex="0">
            <td class="num">${c.id_compra}</td>
            <td><b>${esc(c.proveedor)}</b></td>
            <td>${fecha(c.fecha_orden)}</td>
            <td>${c.fecha_recepcion ? fecha(c.fecha_recepcion) : '—'}</td>
            <td>${c.tipo_comprobante ? `${c.tipo_comprobante === 'factura' ? 'Factura' : 'Nota de venta'} ${esc(c.nro_comprobante || '')}` : '—'}</td>
            <td><span class="chip ${ESTADOS[c.estado].c}">${ESTADOS[c.estado].t}</span></td>
            <td class="num">${c.items}</td>
            <td class="num"><b>${bs(c.total)}</b></td>
          </tr>`).join('')}</tbody>
      </table>` : vacio('No hay órdenes en este estado', ' Cree una nueva orden o use el pedido sugerido.');
    el.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => verCompra(tr.dataset.id, pintar));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') verCompra(tr.dataset.id, pintar); });
    });
  };

  el.querySelectorAll('#est button').forEach((b) => b.addEventListener('click', () => {
    f.estado = b.dataset.v;
    el.querySelectorAll('#est button').forEach((x) => x.classList.toggle('activo', x === b));
    pintar();
  }));
  el.querySelector('#nueva').addEventListener('click', () => formOrden(null, pintar));
  el.querySelector('#sugerida').addEventListener('click', () => ordenSugerida(pintar));

  await pintar();
  const p = ctx.params[0];
  if (p === 'sugerida') ordenSugerida(pintar);
  else if (p === 'nueva') formOrden(null, pintar);
  else if (p) verCompra(p, pintar);
}

async function ordenSugerida(alCambiar) {
  const [sug, proveedores] = await Promise.all([api.get('/compras/sugerencia'), api.get('/proveedores')]);
  if (!sug.length) return toast('No hay productos bajo el stock mínimo');
  // proveedor más frecuente entre los sugeridos
  const cuenta = {};
  sug.forEach((s) => { if (s.ultimo_proveedor) cuenta[s.ultimo_proveedor] = (cuenta[s.ultimo_proveedor] || 0) + 1; });
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0];
  const prov = proveedores.find((p) => p.razon_social === top);
  formOrden({
    id_proveedor: prov?.id_proveedor,
    observaciones: 'Reposición de stock bajo',
    items: sug.map((s) => ({ id_producto: s.id_producto, cantidad_pedida: s.cantidad_sugerida, costo_unitario: s.ultimo_costo || '' })),
  }, alCambiar, 'Cantidades calculadas para llegar al doble del mínimo. Ajuste lo que necesite.');
}

// ------------------------------------------------------------ crear/editar
async function formOrden(c, alCambiar, aviso = '') {
  const [proveedores, productos] = await Promise.all([api.get('/proveedores'), listaProductos(true)]);
  const editando = !!c?.id_compra;
  c = c || { items: [] };
  let filas = c.items.length ? c.items.map((i) => ({ ...i })) : [{}];

  const m = modal({
    titulo: editando ? `Editar orden ${c.id_compra}` : 'Nueva orden de compra',
    subtitulo: aviso,
    ancho: true,
    cuerpo: `
      <div class="form-grid" style="margin-bottom:16px">
        <label class="campo">Proveedor<select id="prov">${opciones(proveedores, c.id_proveedor, 'id_proveedor', 'razon_social', 'Elegir proveedor…')}</select></label>
        <label class="campo">Observaciones<input id="obs" value="${esc(c.observaciones)}"></label>
      </div>
      ${datalistProductos('dl-prod', productos)}
      <div class="panel"><div class="tabla-wrap"><table>
        <thead><tr><th style="width:45%">Medicamento</th><th class="num">Cantidad</th><th class="num">Costo unit. (Bs)</th><th class="num">Margen %</th><th class="num">Subtotal</th><th></th></tr></thead>
        <tbody id="filas"></tbody>
        <tfoot><tr><td><button class="btn sec mini" id="add">${icono('mas')}Agregar medicamento</button></td><td colspan="3" class="num"><b>Total</b></td><td class="num"><b id="tot"></b></td><td></td></tr></tfoot>
      </table></div></div>
      <p class="muted small" style="margin-top:8px">El margen es opcional: si lo indica, al recibir se actualiza el precio de venta (costo + margen).</p>`,
    pie: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="guardar">${editando ? 'Guardar cambios' : 'Guardar orden'}</button>`,
  });

  const $f = m.el.querySelector('#filas');
  const pintarFilas = () => {
    $f.innerHTML = filas.map((it, i) => {
      const p = productos.find((x) => x.id_producto === it.id_producto);
      return `<tr>
        <td><input list="dl-prod" data-i="${i}" data-k="prod" value="${p ? esc(etiquetaProducto(p)) : ''}" placeholder="Escriba para buscar…"></td>
        <td><input type="number" min="1" data-i="${i}" data-k="cantidad_pedida" value="${it.cantidad_pedida ?? ''}" style="width:90px;text-align:right"></td>
        <td><input type="number" min="0" step="0.01" data-i="${i}" data-k="costo_unitario" value="${it.costo_unitario ?? ''}" style="width:110px;text-align:right"></td>
        <td><input type="number" min="0" step="1" data-i="${i}" data-k="porcentaje_margen" value="${it.porcentaje_margen ?? ''}" style="width:80px;text-align:right"></td>
        <td class="num">${bs((it.cantidad_pedida || 0) * (it.costo_unitario || 0))}</td>
        <td><button class="btn-icono" data-quitar="${i}" aria-label="Quitar">${icono('x')}</button></td>
      </tr>`;
    }).join('');
    m.el.querySelector('#tot').textContent = bs(filas.reduce((a, x) => a + (x.cantidad_pedida || 0) * (x.costo_unitario || 0), 0));
    $f.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
      const it = filas[inp.dataset.i];
      if (inp.dataset.k === 'prod') {
        const p = productoDesdeTexto(inp.value, productos);
        it.id_producto = p?.id_producto;
        if (!p && inp.value) toast('Elija un medicamento de la lista', 'error');
      } else it[inp.dataset.k] = inp.value === '' ? '' : Number(inp.value);
      pintarFilas();
    }));
    $f.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => {
      filas.splice(b.dataset.quitar, 1);
      if (!filas.length) filas.push({});
      pintarFilas();
    }));
  };
  pintarFilas();
  m.el.querySelector('#add').addEventListener('click', () => { filas.push({}); pintarFilas(); $f.querySelector('tr:last-child input')?.focus(); });

  m.el.querySelector('#guardar').addEventListener('click', async (e) => {
    const id_proveedor = m.el.querySelector('#prov').value;
    const items = filas.filter((x) => x.id_producto);
    if (!id_proveedor) return toast('Elija el proveedor', 'error');
    if (!items.length) return toast('Agregue al menos un medicamento', 'error');
    if (items.some((x) => !(x.cantidad_pedida > 0))) return toast('Todas las cantidades deben ser mayores a cero', 'error');
    const cuerpo = { id_proveedor, observaciones: m.el.querySelector('#obs').value, items };
    const r = await accion(e.currentTarget, () => editando ? api.put('/compras/' + c.id_compra, cuerpo) : api.post('/compras', cuerpo),
      editando ? 'Orden actualizada' : 'Orden guardada como borrador');
    m.cerrar();
    await alCambiar();
    verCompra(editando ? c.id_compra : r.id_compra, alCambiar);
  });
}

// ------------------------------------------------------------------ detalle
async function verCompra(id, alCambiar) {
  const [c, proveedores] = await Promise.all([api.get('/compras/' + id), api.get('/proveedores')]);
  history.replaceState(null, '', '#/compras/' + id);
  const prov = proveedores.find((p) => p.id_proveedor === c.id_proveedor);
  const total = c.items.reduce((a, x) => a + x.subtotal, 0);
  const recibida = c.estado === 'recibida';

  const m = modal({
    titulo: `Orden ${c.id_compra}: ${c.proveedor}`,
    subtitulo: `<span class="chip ${ESTADOS[c.estado].c}">${ESTADOS[c.estado].t}</span> Creada el ${fecha(c.fecha_orden)} por ${esc(c.usuario)}${c.observaciones ? '. ' + esc(c.observaciones) : ''}`,
    ancho: true,
    cuerpo: `
      <div class="panel"><div class="tabla-wrap"><table>
        <thead><tr><th>Medicamento</th><th class="num">Pedido</th>${recibida ? '<th class="num">Recibido</th><th>Lote</th><th>Vence</th>' : ''}<th class="num">Costo</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${c.items.map((i) => `
          <tr><td class="td-prod"><b>${esc(i.nombre_comercial)} ${esc(i.concentracion || '')}</b><small class="codigo">${esc(i.codigo)}</small></td>
            <td class="num">${i.cantidad_pedida}</td>
            ${recibida ? `<td class="num">${i.cantidad_recibida}</td><td><span class="codigo">${esc(i.numero_lote)}</span></td><td>${fecha(i.fecha_vencimiento)}</td>` : ''}
            <td class="num">${bs(i.costo_unitario)}</td><td class="num">${bs(i.subtotal)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="${recibida ? 6 : 3}" class="num"><b>Total</b></td><td class="num"><b>${bs(total)}</b></td></tr></tfoot>
      </table></div></div>
      ${recibida ? `<p class="muted small" style="margin-top:10px">Recibida el ${fecha(c.fecha_recepcion)} con ${c.tipo_comprobante === 'factura' ? 'factura' : 'nota de venta'} ${esc(c.nro_comprobante || '')}.</p>` : ''}`,
    pie: `
      <div class="izq">${['borrador', 'enviada'].includes(c.estado) ? '<button class="btn peligro" data-a="anular">Anular</button>' : ''}</div>
      ${['borrador', 'enviada'].includes(c.estado) ? `
        ${prov?.telefono ? `<button class="btn sec" data-a="wsp">${icono('wsp')}Enviar por WhatsApp</button>` : ''}
        <button class="btn sec" data-a="editar">${icono('editar')}Editar</button>` : ''}
      ${c.estado === 'borrador' ? '<button class="btn" data-a="enviar">Marcar como enviada</button>' : ''}
      ${c.estado === 'enviada' ? '<button class="btn verde" data-a="recibir">Recibir mercadería</button>' : ''}
      ${['recibida', 'anulada'].includes(c.estado) ? '<button class="btn" data-cerrar>Cerrar</button>' : ''}`,
    alCerrar: () => history.replaceState(null, '', '#/compras'),
  });

  const on = (a, fn) => m.el.querySelector(`[data-a="${a}"]`)?.addEventListener('click', fn);
  on('editar', () => { m.cerrar(); formOrden(c, alCambiar); });
  on('enviar', async (e) => {
    await accion(e.currentTarget, () => api.post(`/compras/${c.id_compra}/enviar`), 'Orden marcada como enviada');
    m.cerrar(); await alCambiar(); verCompra(c.id_compra, alCambiar);
  });
  on('anular', async (e) => {
    if (!(await confirmar('Anular orden', 'La orden quedará anulada y no podrá recibirse.', { boton: 'Anular orden', peligro: true }))) return;
    await accion(null, () => api.post(`/compras/${c.id_compra}/anular`), 'Orden anulada');
    m.cerrar(); alCambiar();
  });
  on('wsp', () => {
    const txt = `Farmacia VitalClin - Pedido N.º ${c.id_compra}\n` +
      c.items.map((i) => `- ${i.cantidad_pedida} x ${i.nombre_comercial} ${i.concentracion || ''}`).join('\n') + '\nGracias.';
    window.open(`https://wa.me/${prov.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  });
  on('recibir', () => { m.cerrar(); formRecepcion(c, alCambiar); });
}

// --------------------------------------------------------------- recepción
function formRecepcion(c, alCambiar) {
  const filas = c.items.map((i) => ({
    id_detalle: i.id_detalle, nombre: `${i.nombre_comercial} ${i.concentracion || ''}`, precio_actual: i.precio_venta,
    cantidad_recibida: i.cantidad_pedida, numero_lote: '', fecha_vencimiento: '', costo_unitario: i.costo_unitario,
    porcentaje_margen: i.porcentaje_margen ?? '',
  }));
  let tipo = 'factura';

  const m = modal({
    titulo: `Recibir orden ${c.id_compra}`,
    subtitulo: `${esc(c.proveedor)}. Copie el lote y el vencimiento de cada caja. Si algo llegó dañado o incompleto, ajuste la cantidad recibida.`,
    ancho: true,
    cuerpo: `
      <div class="form-grid" style="margin-bottom:16px">
        <div class="campo"><span style="font-size:12.5px;font-weight:600;color:var(--gris)">Comprobante</span>
          <div class="segmentado" id="tipo"><button class="activo" data-v="factura">Factura</button><button data-v="nota_venta">Nota de venta</button></div></div>
        <label class="campo">Número de comprobante<input id="nro"></label>
      </div>
      <div class="panel"><div class="tabla-wrap"><table>
        <thead><tr><th>Medicamento</th><th class="num">Recibido</th><th>Lote</th><th>Vence</th><th class="num">Costo</th><th class="num">Margen %</th><th class="num">Nuevo precio</th></tr></thead>
        <tbody>${filas.map((f, i) => `
          <tr>
            <td><b>${esc(f.nombre)}</b><br><span class="muted small">Pedido: ${c.items[i].cantidad_pedida}</span></td>
            <td><input type="number" min="0" data-i="${i}" data-k="cantidad_recibida" value="${f.cantidad_recibida}" style="width:80px;text-align:right"></td>
            <td><input data-i="${i}" data-k="numero_lote" placeholder="Lote" style="width:120px"></td>
            <td><input type="date" min="${hoy()}" data-i="${i}" data-k="fecha_vencimiento" style="width:150px"></td>
            <td><input type="number" min="0" step="0.01" data-i="${i}" data-k="costo_unitario" value="${f.costo_unitario}" style="width:90px;text-align:right"></td>
            <td><input type="number" min="0" step="1" data-i="${i}" data-k="porcentaje_margen" value="${f.porcentaje_margen}" style="width:70px;text-align:right"></td>
            <td class="num" data-precio="${i}"></td>
          </tr>`).join('')}</tbody>
      </table></div></div>`,
    pie: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn verde" id="ok">Confirmar recepción</button>`,
  });

  const precio = (i) => {
    const f = filas[i];
    const td = m.el.querySelector(`[data-precio="${i}"]`);
    td.innerHTML = f.porcentaje_margen !== ''
      ? `<b>${bs(f.costo_unitario * (1 + f.porcentaje_margen / 100))}</b>`
      : `<span class="muted">${bs(f.precio_actual)}</span>`;
  };
  filas.forEach((_, i) => precio(i));
  m.el.querySelectorAll('input[data-k]').forEach((inp) => inp.addEventListener('input', () => {
    const f = filas[inp.dataset.i];
    f[inp.dataset.k] = inp.type === 'number' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value.trim();
    precio(inp.dataset.i);
  }));
  m.el.querySelectorAll('#tipo button').forEach((b) => b.addEventListener('click', () => {
    tipo = b.dataset.v;
    m.el.querySelectorAll('#tipo button').forEach((x) => x.classList.toggle('activo', x === b));
  }));

  m.el.querySelector('#ok').addEventListener('click', async (e) => {
    const falta = filas.find((f) => f.cantidad_recibida > 0 && (!f.numero_lote || !f.fecha_vencimiento));
    if (falta) return toast(`Falta lote o vencimiento de ${falta.nombre}`, 'error');
    if (!filas.some((f) => f.cantidad_recibida > 0)) return toast('No hay unidades recibidas', 'error');
    const r = await accion(e.currentTarget, () => api.post(`/compras/${c.id_compra}/recibir`, {
      tipo_comprobante: tipo, nro_comprobante: m.el.querySelector('#nro').value.trim(), items: filas,
    }));
    toast(`Mercadería recibida: ${r.lineas} lotes ingresados al inventario`);
    m.cerrar();
    await alCambiar();
    app.refrescarBadges();
  });
}
