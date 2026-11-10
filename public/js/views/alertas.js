// Alertas: quiebre de stock (<= mínimo) y vencimientos (<= 6 meses)
import { api } from '../api.js';
import { app } from '../app.js';
import { esc, bs, fecha, vacio, chipSemaforo } from '../ui.js';

export default async function alertas(el, ctx) {
  const a = await api.get('/alertas');
  if (!ctx.esVigente()) return;
  const gestion = app.puede('administrador', 'regente');
  const urgentes = a.vencimiento.filter((l) => l.semaforo !== 'amarillo');
  const atencion = a.vencimiento.filter((l) => l.semaforo === 'amarillo');

  const tablaVenc = (lista) => `
    <table>
      <thead><tr><th>Medicamento</th><th>Lote</th><th>Vence</th><th>Estado</th><th class="num">Unidades</th><th class="num">Valor a costo</th></tr></thead>
      <tbody>${lista.map((l) => `
        <tr class="click" data-prod="${l.id_producto}">
          <td class="td-prod"><b>${esc(l.nombre_comercial)}</b><small>${esc(l.laboratorio)}</small></td>
          <td><span class="codigo">${esc(l.numero_lote)}</span></td>
          <td>${fecha(l.fecha_vencimiento)}</td>
          <td>${chipSemaforo(l.semaforo, l.dias_restantes)}</td>
          <td class="num">${l.cantidad_actual}</td>
          <td class="num">${bs(l.valor_en_riesgo)}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Alertas</h1><p>Revise esta lista al inicio de cada semana.</p></div>
    </div>
    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <div><h2>Retirar del estante o dar de baja</h2>
            <p class="muted small">Lotes vencidos o con 3 meses o menos de vida útil. Gestione la devolución con el proveedor.</p></div>
          ${urgentes.length ? `<a class="btn sec mini" href="#/lotes/rojo">Gestionar lotes</a>` : ''}
        </div>
        <div class="tabla-wrap">${urgentes.length ? tablaVenc(urgentes) : vacio('Nada que retirar')}</div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div><h2>Stock en o bajo el mínimo</h2>
            <p class="muted small">El mínimo por defecto es 10 unidades; puede ajustarse en cada medicamento.</p></div>
          ${gestion && a.stock.length ? `<a class="btn mini" href="#/compras/sugerida">Preparar pedido</a>` : ''}
        </div>
        <div class="tabla-wrap">${a.stock.length ? `
          <table>
            <thead><tr><th>Medicamento</th><th>Laboratorio</th><th>Estado</th><th class="num">Stock</th><th class="num">Mínimo</th></tr></thead>
            <tbody>${a.stock.map((p) => `
              <tr class="click" data-prod="${p.id_producto}">
                <td class="td-prod"><b>${esc(p.nombre_comercial)}</b><small>${esc(p.principio_activo)}</small></td>
                <td>${esc(p.laboratorio)}</td>
                <td><span class="chip ${p.semaforo}">${p.stock_disponible === 0 ? 'Agotado' : 'Stock bajo'}</span></td>
                <td class="num"><b>${p.stock_disponible}</b></td>
                <td class="num">${p.stock_minimo}</td>
              </tr>`).join('')}</tbody>
          </table>` : vacio('Todo el stock está sobre el mínimo')}</div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div><h2>Priorizar la venta</h2>
            <p class="muted small">Vencen en 3 a 6 meses. Buen momento para una promoción de salida rápida.</p></div>
          ${gestion && atencion.length ? `<a class="btn sec mini" href="#/promociones/nueva">Crear promoción</a>` : ''}
        </div>
        <div class="tabla-wrap">${atencion.length ? tablaVenc(atencion) : vacio('Ningún lote en este rango')}</div>
      </section>
    </div>`;

  el.querySelectorAll('[data-prod]').forEach((tr) => tr.addEventListener('click', () => app.ir('productos/' + tr.dataset.prod)));
}
