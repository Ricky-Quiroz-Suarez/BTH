// Kardex: historial de todos los movimientos de stock
import { api, qs } from '../api.js';
import { esc, fecha, fechaHora, vacio, hoy, sumarDias } from '../ui.js';

export const TIPOS = {
  entrada_compra: 'Compra recibida',
  entrada_inicial: 'Stock inicial',
  entrada_ajuste: 'Ajuste (sobrante)',
  entrada_devol_cliente: 'Venta anulada',
  salida_venta: 'Venta',
  salida_ajuste: 'Ajuste (faltante)',
  salida_vencimiento: 'Baja por vencimiento',
  salida_danado: 'Baja por daño',
  salida_devol_proveedor: 'Devolución al proveedor',
};

export default async function kardex(el, ctx) {
  const f = { producto: '', tipo: '', desde: sumarDias(hoy(), -30), hasta: hoy() };
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Kardex</h1><p>Cada entrada y salida queda registrada con su lote y usuario. No se edita: los errores se corrigen con un ajuste.</p></div>
      <div class="acciones"><button class="btn sec" onclick="window.print()">Imprimir</button></div>
    </div>
    <div class="toolbar">
      <input type="search" id="prod" placeholder="Medicamento o código" aria-label="Medicamento">
      <select id="tipo" aria-label="Tipo de movimiento"><option value="">Todos los movimientos</option>
        ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <label class="campo">Desde<input type="date" id="desde" value="${f.desde}"></label>
      <label class="campo">Hasta<input type="date" id="hasta" value="${f.hasta}"></label>
    </div>
    <section class="panel"><div class="tabla-wrap" id="tabla"></div></section>`;

  const pintar = async () => {
    const lista = await api.get('/kardex' + qs(f));
    if (!ctx.esVigente()) return;
    el.querySelector('#tabla').innerHTML = lista.length ? `
      <table>
        <thead><tr><th>Fecha</th><th>Medicamento</th><th>Lote</th><th>Movimiento</th>
          <th class="num">Entrada</th><th class="num">Salida</th><th class="num">Saldo del lote</th><th>Usuario</th><th>Detalle</th></tr></thead>
        <tbody>${lista.map((k) => `
          <tr>
            <td>${fechaHora(k.fecha)}</td>
            <td class="td-prod"><b>${esc(k.nombre_comercial)}</b><small class="codigo">${esc(k.codigo)}</small></td>
            <td><span class="codigo">${esc(k.numero_lote)}</span><br><span class="muted small">vence ${fecha(k.fecha_vencimiento)}</span></td>
            <td><span class="chip ${k.entrada ? 'verde' : 'azul'} sin-punto">${TIPOS[k.tipo] || k.tipo}</span></td>
            <td class="num" style="color:var(--verde-tinta)">${k.entrada ? '+' + k.entrada : ''}</td>
            <td class="num">${k.salida ? '−' + k.salida : ''}</td>
            <td class="num"><b>${k.saldo_lote}</b></td>
            <td>${esc(k.usuario)}</td>
            <td class="muted small">${esc(k.motivo || '')}</td>
          </tr>`).join('')}</tbody>
      </table>` : vacio('No hay movimientos con estos filtros');
  };

  let t;
  el.querySelector('#prod').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.producto = e.target.value.trim(); pintar(); }, 250); });
  el.querySelector('#tipo').addEventListener('change', (e) => { f.tipo = e.target.value; pintar(); });
  el.querySelector('#desde').addEventListener('change', (e) => { f.desde = e.target.value; pintar(); });
  el.querySelector('#hasta').addEventListener('change', (e) => { f.hasta = e.target.value; pintar(); });
  pintar();
}
