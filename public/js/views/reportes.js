// Reportes: ventas, inventario valorizado y libro de controlados (SEDES)
import { api, qs } from '../api.js';
import { esc, bs, entero, fecha, fechaHora, icono, vacio, hoy, sumarDias } from '../ui.js';

export default async function reportes(el, ctx) {
  const tab = ['ventas', 'inventario', 'controlados'].includes(ctx.params[0]) ? ctx.params[0] : 'ventas';
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Reportes</h1></div>
      <div class="acciones">
        <div class="segmentado">
          <button data-t="ventas" class="${tab === 'ventas' ? 'activo' : ''}">Ventas</button>
          <button data-t="inventario" class="${tab === 'inventario' ? 'activo' : ''}">Inventario valorizado</button>
          <button data-t="controlados" class="${tab === 'controlados' ? 'activo' : ''}">Libro de controlados</button>
        </div>
        <button class="btn sec" onclick="window.print()">${icono('imprimir')}Imprimir</button>
      </div>
    </div>
    <div id="cont"></div>`;
  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { location.hash = '#/reportes/' + b.dataset.t; }));
  const cont = el.querySelector('#cont');
  if (tab === 'ventas') return repVentas(cont, ctx);
  if (tab === 'inventario') return repInventario(cont, ctx);
  return repControlados(cont, ctx);
}

async function repVentas(cont, ctx) {
  const f = { desde: sumarDias(hoy(), -29), hasta: hoy() };
  cont.innerHTML = `
    <div class="toolbar">
      <label class="campo">Desde<input type="date" id="desde" value="${f.desde}"></label>
      <label class="campo">Hasta<input type="date" id="hasta" value="${f.hasta}"></label>
    </div>
    <div id="r"></div>`;
  const pintar = async () => {
    const d = await api.get('/reportes/ventas' + qs(f));
    if (!ctx.esVigente()) return;
    const total = d.dias.reduce((a, x) => a + x.total_bs, 0);
    const util = d.dias.reduce((a, x) => a + x.utilidad_bruta, 0);
    const nv = d.dias.reduce((a, x) => a + x.nro_ventas, 0);
    const max = Math.max(...d.dias.map((x) => x.total_bs), 1);
    cont.querySelector('#r').innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2>Ventas por día</h2></div>
        <div class="panel-body">
          ${d.dias.length ? `<div class="barras" role="img" aria-label="Ventas por día">${d.dias.map((x) => `
            <div class="b" title="${fecha(x.dia)}: ${bs(x.total_bs)}"><i style="height:${(x.total_bs / max) * 100}%"></i><small>${x.dia.slice(8)}/${x.dia.slice(5, 7)}</small></div>`).join('')}</div>`
            : vacio('Sin ventas en el periodo')}
        </div>
        <div class="cifras">
          <div><small>Total vendido</small><b>${bs(total)}</b></div>
          <div><small>Utilidad bruta</small><b>${bs(util)}</b></div>
          <div><small>Ventas</small><b>${entero(nv)}</b></div>
          <div><small>Ticket promedio</small><b>${bs(nv ? total / nv : 0)}</b></div>
        </div>
      </section>
      <div class="grid-3-2" style="margin-top:18px">
        <section class="panel">
          <div class="panel-head"><h2>Más vendidos</h2></div>
          <div class="tabla-wrap">${d.top.length ? `<table>
            <thead><tr><th>Medicamento</th><th class="num">Unidades</th><th class="num">Total</th></tr></thead>
            <tbody>${d.top.map((t) => `<tr><td>${esc(t.nombre_comercial)} ${esc(t.concentracion || '')}</td><td class="num">${entero(t.unidades)}</td><td class="num">${bs(t.total)}</td></tr>`).join('')}</tbody>
          </table>` : vacio('Sin datos')}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Por método de pago</h2></div>
          <div class="tabla-wrap">${d.pagos.length ? `<table>
            <thead><tr><th>Método</th><th class="num">Ventas</th><th class="num">Total</th></tr></thead>
            <tbody>${d.pagos.map((p) => `<tr><td style="text-transform:capitalize">${p.metodo_pago === 'qr' ? 'QR' : esc(p.metodo_pago)}</td><td class="num">${p.ventas}</td><td class="num">${bs(p.total)}</td></tr>`).join('')}</tbody>
          </table>` : vacio('Sin datos')}</div>
        </section>
      </div>`;
  };
  cont.querySelector('#desde').addEventListener('change', (e) => { f.desde = e.target.value; pintar(); });
  cont.querySelector('#hasta').addEventListener('change', (e) => { f.hasta = e.target.value; pintar(); });
  pintar();
}

async function repInventario(cont, ctx) {
  const d = await api.get('/reportes/inventario');
  if (!ctx.esVigente()) return;
  const t = d.reduce((a, x) => ({ u: a.u + x.unidades, c: a.c + x.valor_costo, v: a.v + x.valor_venta }), { u: 0, c: 0, v: 0 });
  cont.innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><h2>Inventario valorizado por categoría</h2><p class="muted small">Solo lotes vendibles (no vencidos ni retirados), al ${fecha(hoy())}.</p></div></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Categoría</th><th class="num">Medicamentos</th><th class="num">Unidades</th><th class="num">Valor a costo</th><th class="num">Valor a precio de venta</th><th class="num">Margen potencial</th></tr></thead>
        <tbody>${d.map((x) => `<tr><td>${esc(x.categoria)}</td><td class="num">${x.productos}</td><td class="num">${entero(x.unidades)}</td>
          <td class="num">${bs(x.valor_costo)}</td><td class="num">${bs(x.valor_venta)}</td><td class="num">${bs(x.valor_venta - x.valor_costo)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>Total</b></td><td></td><td class="num"><b>${entero(t.u)}</b></td><td class="num"><b>${bs(t.c)}</b></td><td class="num"><b>${bs(t.v)}</b></td><td class="num"><b>${bs(t.v - t.c)}</b></td></tr></tfoot>
      </table></div>
    </section>`;
}

async function repControlados(cont, ctx) {
  const anio = new Date().getFullYear();
  const f = { anio, trimestre: Math.floor(new Date().getMonth() / 3) + 1 };
  cont.innerHTML = `
    <div class="toolbar">
      <label class="campo">Año<input type="number" id="anio" value="${f.anio}" style="width:110px"></label>
      <label class="campo">Trimestre<select id="tri">${[1, 2, 3, 4].map((t) => `<option value="${t}" ${t === f.trimestre ? 'selected' : ''}>${t}.º trimestre</option>`).join('')}</select></label>
    </div>
    <div id="r"></div>`;
  const pintar = async () => {
    const d = await api.get('/reportes/controlados' + qs(f));
    if (!ctx.esVigente()) return;
    cont.querySelector('#r').innerHTML = `
      <section class="panel">
        <div class="panel-head"><div><h2>Dispensación de medicamentos controlados</h2>
          <p class="muted small">Farmacia VitalClin, ${f.trimestre}.º trimestre de ${f.anio}. Para entregar al SEDES junto con las recetas archivadas.</p></div></div>
        <div class="tabla-wrap">${d.length ? `<table>
          <thead><tr><th>Fecha</th><th>Medicamento</th><th>Lote</th><th class="num">Cant.</th><th>Receta</th><th>Médico</th><th>Paciente</th><th>Dispensó</th></tr></thead>
          <tbody>${d.map((x) => `<tr>
            <td>${fechaHora(x.fecha)}</td><td>${esc(x.nombre_comercial)} ${esc(x.concentracion || '')}<br><span class="muted small">${esc(x.principio_activo)}</span></td>
            <td class="codigo">${esc(x.numero_lote)}</td><td class="num">${x.cantidad}</td>
            <td>${esc(x.numero_receta || '—')}<br><span class="muted small">${fecha(x.fecha_receta)}</span></td>
            <td>${esc(x.medico_nombre || '')}<br><span class="muted small">${esc(x.medico_matricula || '')}</span></td>
            <td>${esc(x.paciente_nombre || '')}<br><span class="muted small">${esc(x.paciente_ci || '')}</span></td>
            <td>${esc(x.dispensado_por)}</td></tr>`).join('')}</tbody>
        </table>` : vacio('Sin dispensaciones de controlados en este trimestre')}</div>
      </section>`;
  };
  cont.querySelector('#anio').addEventListener('change', (e) => { f.anio = e.target.value; pintar(); });
  cont.querySelector('#tri').addEventListener('change', (e) => { f.trimestre = e.target.value; pintar(); });
  pintar();
}
