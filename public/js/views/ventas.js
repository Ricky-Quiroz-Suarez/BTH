// Punto de venta (dispensación FEFO) e historial de ventas
import { api, qs } from '../api.js';
import { app } from '../app.js';
import {
  esc, bs, fecha, fechaHora, icono, modal, leerForm, accion, vacio, confirmar, toast, hoy, sumarDias,
} from '../ui.js';

let ticket = []; // se conserva si el usuario navega y vuelve

export default async function ventas(el, ctx) {
  const historial = ctx.params[0] === 'historial';
  el.innerHTML = `
    <div class="page-head">
      <div><h1>${historial ? 'Historial de ventas' : 'Vender'}</h1>
        <p>${historial ? 'Toque una venta para ver el detalle por lote.' : 'El sistema descuenta siempre del lote que vence primero.'}</p></div>
      <div class="segmentado" role="tablist">
        <button class="${historial ? '' : 'activo'}" data-ir="ventas">Punto de venta</button>
        <button class="${historial ? 'activo' : ''}" data-ir="ventas/historial">Historial</button>
      </div>
    </div>
    <div id="cont"></div>`;
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => app.ir(b.dataset.ir)));
  const cont = el.querySelector('#cont');
  if (historial) return pintarHistorial(cont, ctx);
  pintarPOS(cont);
}

// ---------------------------------------------------------- punto de venta
function pintarPOS(cont) {
  cont.innerHTML = `
    <div class="pos">
      <div>
        <div class="pos-buscar">
          ${icono('buscar')}
          <input type="search" id="buscar" placeholder="Nombre, principio activo o código. Enter agrega el primero." autofocus autocomplete="off" aria-label="Buscar medicamento">
        </div>
        <div class="resultados" id="res"></div>
      </div>
      <aside class="panel ticket" aria-label="Ticket">
        <div class="panel-head"><h2>Ticket</h2><button class="btn sec mini" id="vaciar">Vaciar</button></div>
        <div class="ticket-items" id="items"></div>
        <div id="receta"></div>
        <div style="padding:0 18px 12px;display:grid;gap:10px">
          <div class="form-grid" style="gap:10px">
            <label class="campo">Cliente (opcional)<input id="cli-nombre" placeholder="Consumidor final"></label>
            <label class="campo">CI o NIT<input id="cli-ci"></label>
          </div>
          <div class="segmentado" id="pago" role="group" aria-label="Método de pago" style="width:100%">
            ${['efectivo', 'qr', 'tarjeta', 'transferencia'].map((m, i) => `<button data-v="${m}" class="${i === 0 ? 'activo' : ''}" style="flex:1;justify-content:center">${m === 'qr' ? 'QR' : m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
          </div>
        </div>
        <div class="t-total"><span class="muted">Total</span><b id="total">Bs 0,00</b></div>
        <div style="padding:0 18px 18px"><button class="btn verde grande" id="cobrar" style="width:100%">Cobrar</button></div>
      </aside>
    </div>`;

  let resultados = [];
  let metodo = 'efectivo';
  const $res = cont.querySelector('#res');
  const $buscar = cont.querySelector('#buscar');

  const buscar = async (q) => {
    resultados = await api.get('/ventas/buscar' + qs({ q }));
    $res.innerHTML = resultados.length ? resultados.map((p, i) => `
      <button class="res-item" data-i="${i}" ${p.stock_disponible > 0 ? '' : 'disabled'}>
        <span><b>${esc(p.nombre_comercial)} ${esc(p.concentracion || '')}</b><br>
          <span class="muted small">${esc(p.principio_activo)}, ${esc(p.laboratorio)}
          ${p.requiere_receta ? ' <span class="chip azul sin-punto">Receta</span>' : ''}</span></span>
        <span class="small ${p.stock_disponible > 0 ? 'muted' : ''}" style="${p.stock_disponible > 0 ? '' : 'color:var(--rojo);font-weight:600'}">${p.stock_disponible > 0 ? p.stock_disponible + ' en stock' : 'Agotado'}</span>
        <span class="precio">${p.descuento_pct ? `<s>${bs(p.precio_venta)}</s>` : ''}${bs(p.precio_final)}</span>
      </button>`).join('') : vacio('Sin resultados', ' Revise la ortografía o busque por principio activo.');
    $res.querySelectorAll('.res-item').forEach((b) => b.addEventListener('click', () => agregar(resultados[b.dataset.i])));
  };

  const agregar = (p) => {
    if (!p || p.stock_disponible <= 0) return;
    const ya = ticket.find((x) => x.id_producto === p.id_producto);
    if (ya) {
      if (ya.cantidad >= p.stock_disponible) return toast(`Solo hay ${p.stock_disponible} unidades de ${p.nombre_comercial}`, 'error');
      ya.cantidad++;
    } else ticket.push({ ...p, cantidad: 1 });
    pintarTicket();
    $buscar.select();
  };

  const pintarTicket = () => {
    const $items = cont.querySelector('#items');
    $items.innerHTML = ticket.length ? ticket.map((it, i) => `
      <div class="t-item">
        <div><b>${esc(it.nombre_comercial)} ${esc(it.concentracion || '')}</b>
          <span class="muted small">${bs(it.precio_final)} c/u${it.descuento_pct ? `, ${it.descuento_pct}% desc.` : ''}</span></div>
        <input type="number" min="1" max="${it.stock_disponible}" value="${it.cantidad}" data-i="${i}" aria-label="Cantidad">
        <span class="num"><b>${bs(it.precio_final * it.cantidad)}</b></span>
        <button class="btn-icono" data-quitar="${i}" aria-label="Quitar">${icono('x')}</button>
      </div>`).join('') : `<div class="vacio" style="padding:24px 18px">Busque un medicamento y tóquelo para agregarlo.</div>`;

    $items.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
      const it = ticket[inp.dataset.i];
      let v = Math.max(1, parseInt(inp.value, 10) || 1);
      if (v > it.stock_disponible) { toast(`Solo hay ${it.stock_disponible} unidades`, 'error'); v = it.stock_disponible; }
      it.cantidad = v;
      pintarTicket();
    }));
    $items.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => {
      ticket.splice(b.dataset.quitar, 1);
      pintarTicket();
    }));

    const total = ticket.reduce((a, x) => a + x.precio_final * x.cantidad, 0);
    cont.querySelector('#total').textContent = bs(total);
    cont.querySelector('#cobrar').textContent = ticket.length ? `Cobrar ${bs(total)}` : 'Cobrar';
    cont.querySelector('#cobrar').disabled = !ticket.length;

    // formulario de receta si algún producto la requiere
    const conReceta = ticket.filter((x) => x.requiere_receta);
    const $rec = cont.querySelector('#receta');
    if (conReceta.length && !$rec.querySelector('form')) {
      $rec.innerHTML = `
        <div class="receta-aviso">
          <h3>Receta médica requerida</h3>
          <form id="f-receta" class="form-grid" style="gap:8px">
            <label class="campo">Médico<input name="medico_nombre" required></label>
            <label class="campo">Matrícula<input name="medico_matricula"></label>
            <label class="campo">Paciente<input name="paciente_nombre" required></label>
            <label class="campo">CI del paciente<input name="paciente_ci"></label>
            <label class="campo">N.º de receta<input name="numero_receta"></label>
            <label class="campo">Fecha de la receta<input name="fecha_receta" type="date" value="${hoy()}" max="${hoy()}"></label>
          </form>
          ${conReceta.some((x) => x.es_controlado) ? '<p class="small" style="margin-top:8px;color:#7A5400">Incluye un controlado: archive la receta física. Quedará en el libro para el SEDES.</p>' : ''}
        </div>`;
    } else if (!conReceta.length) $rec.innerHTML = '';
  };

  let t;
  $buscar.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => buscar($buscar.value.trim()), 180); });
  $buscar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); agregar(resultados.find((r) => r.stock_disponible > 0)); }
  });
  cont.querySelectorAll('#pago button').forEach((b) => b.addEventListener('click', () => {
    metodo = b.dataset.v;
    cont.querySelectorAll('#pago button').forEach((x) => x.classList.toggle('activo', x === b));
  }));
  cont.querySelector('#vaciar').addEventListener('click', () => { ticket = []; pintarTicket(); });

  cont.querySelector('#cobrar').addEventListener('click', async (e) => {
    if (!ticket.length) return;
    const fr = cont.querySelector('#f-receta');
    let receta = null;
    if (fr) {
      receta = leerForm(fr);
      if (!receta.medico_nombre || !receta.paciente_nombre) return toast('Complete médico y paciente de la receta', 'error');
    }
    const nombre = cont.querySelector('#cli-nombre').value.trim();
    const cuerpo = {
      items: ticket.map((x) => ({ id_producto: x.id_producto, cantidad: x.cantidad })),
      metodo_pago: metodo,
      cliente: nombre ? { nombre, ci_nit: cont.querySelector('#cli-ci').value.trim() } : null,
      receta,
    };
    const r = await accion(e.currentTarget, () => api.post('/ventas', cuerpo));
    ticket = [];
    cont.querySelector('#cli-nombre').value = '';
    cont.querySelector('#cli-ci').value = '';
    cont.querySelector('#receta').innerHTML = '';
    pintarTicket();
    buscar($buscar.value.trim());
    app.refrescarBadges();
    verVenta(r.id_venta, { recienCobrada: true });
  });

  pintarTicket();
  buscar('');
}

// --------------------------------------------------------------- historial
async function pintarHistorial(cont, ctx) {
  const f = { desde: sumarDias(hoy(), -7), hasta: hoy() };
  cont.innerHTML = `
    <div class="toolbar">
      <label class="campo">Desde<input type="date" id="desde" value="${f.desde}"></label>
      <label class="campo">Hasta<input type="date" id="hasta" value="${f.hasta}"></label>
    </div>
    <section class="panel"><div class="tabla-wrap" id="tabla"></div></section>`;

  const pintar = async () => {
    const lista = await api.get('/ventas' + qs(f));
    if (!ctx.esVigente()) return;
    const total = lista.filter((v) => v.estado === 'completada').reduce((a, v) => a + v.total, 0);
    cont.querySelector('#tabla').innerHTML = lista.length ? `
      <table>
        <thead><tr><th>N.º</th><th>Fecha</th><th>Cliente</th><th>Atendió</th><th>Pago</th><th class="num">Unidades</th><th class="num">Total</th></tr></thead>
        <tbody>${lista.map((v) => `
          <tr class="click" data-id="${v.id_venta}" tabindex="0" style="${v.estado === 'anulada' ? 'opacity:.55' : ''}">
            <td class="num">${v.id_venta}</td>
            <td>${fechaHora(v.fecha)}</td>
            <td>${esc(v.cliente)} ${v.con_receta ? '<span class="chip azul sin-punto">Receta</span>' : ''}${v.estado === 'anulada' ? ' <span class="chip rojo sin-punto">Anulada</span>' : ''}</td>
            <td>${esc(v.vendedor)}</td>
            <td style="text-transform:capitalize">${v.metodo_pago === 'qr' ? 'QR' : esc(v.metodo_pago)}</td>
            <td class="num">${v.unidades}</td>
            <td class="num"><b>${bs(v.total)}</b></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="6" class="num muted">Total del periodo (sin anuladas)</td><td class="num"><b>${bs(total)}</b></td></tr></tfoot>
      </table>` : vacio('No hay ventas en estas fechas');
    cont.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => verVenta(tr.dataset.id, { alCambiar: pintar }));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') verVenta(tr.dataset.id, { alCambiar: pintar }); });
    });
  };
  cont.querySelector('#desde').addEventListener('change', (e) => { f.desde = e.target.value; pintar(); });
  cont.querySelector('#hasta').addEventListener('change', (e) => { f.hasta = e.target.value; pintar(); });
  pintar();
}

async function verVenta(id, { recienCobrada = false, alCambiar } = {}) {
  const v = await api.get('/ventas/' + id);
  const m = modal({
    titulo: recienCobrada ? 'Venta registrada' : `Venta ${v.id_venta}`,
    subtitulo: `${fechaHora(v.fecha)}, ${esc(v.cliente)}, atendió ${esc(v.vendedor)}`,
    cuerpo: `
      <div class="panel"><div class="tabla-wrap"><table>
        <thead><tr><th>Medicamento</th><th>Lote</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Desc.</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${v.items.map((i) => `
          <tr><td>${esc(i.nombre_comercial)} ${esc(i.concentracion || '')}</td>
              <td><span class="codigo">${esc(i.numero_lote)}</span><br><span class="muted small">vence ${fecha(i.fecha_vencimiento)}</span></td>
              <td class="num">${i.cantidad}</td><td class="num">${bs(i.precio_unitario)}</td>
              <td class="num">${i.descuento_pct ? i.descuento_pct + '%' : '—'}</td><td class="num">${bs(i.subtotal)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="5" class="num"><b>Total</b></td><td class="num"><b style="font-size:16px">${bs(v.total)}</b></td></tr></tfoot>
      </table></div></div>
      ${v.medico_nombre ? `<p class="muted small" style="margin-top:12px">Receta${v.numero_receta ? ' N.º ' + esc(v.numero_receta) : ''}. Médico: ${esc(v.medico_nombre)}. Paciente: ${esc(v.paciente_nombre)}.</p>` : ''}
      ${v.estado === 'anulada' ? '<p class="error-msg" style="margin-top:12px">Esta venta fue anulada y su stock se devolvió a los lotes.</p>' : ''}`,
    pie: `
      <div class="izq">${app.puede('administrador') && v.estado === 'completada' ? `<button class="btn peligro" id="anular">Anular venta</button>` : ''}</div>
      <button class="btn sec" id="imprimir">${icono('imprimir')}Imprimir comprobante</button>
      <button class="btn" data-cerrar>${recienCobrada ? 'Siguiente venta' : 'Cerrar'}</button>`,
  });
  m.el.querySelector('#imprimir').addEventListener('click', () => imprimirComprobante(v));
  m.el.querySelector('#anular')?.addEventListener('click', async (e) => {
    if (!(await confirmar('Anular venta', 'Las unidades vuelven a sus lotes y la venta queda marcada como anulada. Esta acción no se puede deshacer.', { boton: 'Anular venta', peligro: true }))) return;
    await accion(e.currentTarget, () => api.post(`/ventas/${v.id_venta}/anular`, { motivo: 'Anulada desde el historial' }), 'Venta anulada');
    m.cerrar();
    alCambiar?.();
  });
}

function imprimirComprobante(v) {
  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) return toast('Permita las ventanas emergentes para imprimir', 'error');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Venta ${v.id_venta}</title>
    <style>body{font-family:system-ui,sans-serif;font-size:12px;margin:16px;color:#000}h1{font-size:15px;margin:0}
    table{width:100%;border-collapse:collapse;margin:10px 0}td{padding:3px 0;vertical-align:top}.r{text-align:right}
    .t{border-top:1px dashed #000;font-weight:700;font-size:14px}</style></head><body>
    <h1>Farmacia VitalClin</h1><div>Puerto Quijarro, Bolivia</div>
    <p>Comprobante de venta N.º ${v.id_venta}<br>${new Date(v.fecha).toLocaleString('es-BO')}<br>Cliente: ${esc(v.cliente)}${v.ci_nit ? ' (' + esc(v.ci_nit) + ')' : ''}</p>
    <table>${v.items.map((i) => `<tr><td>${i.cantidad} x ${esc(i.nombre_comercial)} ${esc(i.concentracion || '')}<br><small>Lote ${esc(i.numero_lote)}${i.descuento_pct ? `, ${i.descuento_pct}% desc.` : ''}</small></td><td class="r">${bs(i.subtotal)}</td></tr>`).join('')}
    <tr><td class="t">Total</td><td class="t r">${bs(v.total)}</td></tr></table>
    <p>Pago: ${esc(v.metodo_pago)}. Atendió: ${esc(v.vendedor)}</p><p>Gracias por su compra.</p>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}
