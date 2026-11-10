// Lotes con semáforo de vencimiento: retirar del estante, reactivar y dar de baja
import { api, qs } from '../api.js';
import { app } from '../app.js';
import { esc, bs, fecha, modal, leerForm, accion, vacio, chipSemaforo, toast, SEMAFORO } from '../ui.js';
import { abrirFicha } from './productos.js';

const FILTROS = [
  { v: '', t: 'Todos' },
  { v: 'negro', t: 'Vencidos' },
  { v: 'rojo', t: 'Retirar (3 meses o menos)' },
  { v: 'amarillo', t: 'Por vencer (6 meses o menos)' },
  { v: 'verde', t: 'Vigentes' },
];

export default async function inventario(el, ctx) {
  const f = { semaforo: FILTROS.some((x) => x.v === ctx.params[0]) ? ctx.params[0] : '', q: '' };
  const gestion = app.puede('administrador', 'regente');
  const admin = app.puede('administrador');

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Lotes y vencimientos</h1>
        <p>Ordenados por fecha de vencimiento: el primero de la lista es el primero que debe salir.</p></div>
    </div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Medicamento o número de lote" aria-label="Buscar lote">
      <div class="segmentado" id="sem" role="group" aria-label="Semáforo">
        ${FILTROS.map((x) => `<button data-v="${x.v}" class="${x.v === f.semaforo ? 'activo' : ''}">${x.v ? `<i style="width:8px;height:8px;border-radius:50%;background:${SEMAFORO[x.v].color}"></i>` : ''}${x.t}</button>`).join('')}
      </div>
    </div>
    <section class="panel"><div class="tabla-wrap" id="tabla"></div></section>`;

  const pintar = async () => {
    const lista = await api.get('/lotes' + qs(f));
    if (!ctx.esVigente()) return;
    const valor = lista.reduce((a, l) => a + l.valor_en_riesgo, 0);
    el.querySelector('#tabla').innerHTML = lista.length ? `
      <table>
        <thead><tr><th>Medicamento</th><th>Lote</th><th>Vence</th><th>Semáforo</th>
          <th class="num">Unidades</th><th class="num">Valor a costo</th><th>En estante</th>${gestion ? '<th></th>' : ''}</tr></thead>
        <tbody>${lista.map((l) => `
          <tr>
            <td class="td-prod"><b><a href="#" data-prod="${l.id_producto}">${esc(l.nombre_comercial)}</a></b><small>${esc(l.laboratorio)}</small></td>
            <td><span class="codigo">${esc(l.numero_lote)}</span></td>
            <td>${fecha(l.fecha_vencimiento)}</td>
            <td>${chipSemaforo(l.semaforo, l.dias_restantes)}</td>
            <td class="num">${l.cantidad_actual}</td>
            <td class="num">${bs(l.valor_en_riesgo)}</td>
            <td>${l.estado === 'retirado' ? '<span class="chip negro sin-punto">Retirado</span>' : l.estado === 'vencido' ? '<span class="chip negro sin-punto">Bloqueado</span>' : '<span class="muted small">Sí</span>'}</td>
            ${gestion ? `<td class="num">
              ${l.estado === 'disponible' && l.semaforo !== 'verde' ? `<button class="btn sec mini" data-retirar="${l.id_lote}">Retirar</button>` : ''}
              ${l.estado === 'retirado' && l.semaforo !== 'negro' ? `<button class="btn sec mini" data-reactivar="${l.id_lote}">Volver al estante</button>` : ''}
              ${admin ? `<button class="btn peligro mini" data-baja="${l.id_lote}">Dar de baja</button>` : ''}
            </td>` : ''}
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="5" class="num muted">${lista.length} lotes</td><td class="num"><b>${bs(valor)}</b></td><td colspan="${gestion ? 2 : 1}"></td></tr></tfoot>
      </table>` : vacio('No hay lotes en este grupo', f.semaforo === 'negro' ? ' No hay medicamentos vencidos en inventario.' : '');

    el.querySelectorAll('[data-prod]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      abrirFicha(a.dataset.prod, pintar, { volver: location.hash });
    }));
    el.querySelectorAll('[data-retirar]').forEach((b) => b.addEventListener('click', () =>
      accion(b, () => api.post(`/lotes/${b.dataset.retirar}/retirar`), 'Lote retirado del estante: ya no se vende').then(pintar)));
    el.querySelectorAll('[data-reactivar]').forEach((b) => b.addEventListener('click', () =>
      accion(b, () => api.post(`/lotes/${b.dataset.reactivar}/reactivar`), 'El lote vuelve a venderse').then(pintar)));
    el.querySelectorAll('[data-baja]').forEach((b) => b.addEventListener('click', () =>
      formBaja(lista.find((l) => String(l.id_lote) === b.dataset.baja), pintar)));
  };

  let t;
  el.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); pintar(); }, 220); });
  el.querySelectorAll('#sem button').forEach((b) => b.addEventListener('click', () => {
    f.semaforo = b.dataset.v;
    el.querySelectorAll('#sem button').forEach((x) => x.classList.toggle('activo', x === b));
    history.replaceState(null, '', '#/lotes' + (f.semaforo ? '/' + f.semaforo : ''));
    pintar();
  }));
  pintar();
}

function formBaja(l, alCambiar) {
  const m = modal({
    titulo: 'Dar de baja',
    subtitulo: `${esc(l.nombre_comercial)}, lote ${esc(l.numero_lote)}. Quedan ${l.cantidad_actual} unidades.`,
    cuerpo: `
      <form id="fb" class="form-grid">
        <label class="campo">Motivo
          <select name="tipo">
            <option value="salida_vencimiento" ${l.semaforo === 'negro' ? 'selected' : ''}>Vencimiento</option>
            <option value="salida_devol_proveedor" ${l.semaforo === 'rojo' ? 'selected' : ''}>Devolución o cambio al proveedor</option>
            <option value="salida_danado">Producto dañado</option>
          </select></label>
        <label class="campo">Cantidad<input name="cantidad" type="number" min="1" max="${l.cantidad_actual}" value="${l.cantidad_actual}"></label>
        <label class="campo span-2">Detalle (opcional)<input name="motivo" placeholder="N.º de nota de devolución, observaciones…"></label>
      </form>`,
    pie: `<button class="btn sec" data-cerrar>Cancelar</button><button class="btn peligro" id="ok">Dar de baja</button>`,
  });
  m.el.querySelector('#ok').addEventListener('click', async (e) => {
    const d = leerForm(m.el.querySelector('#fb'));
    if (!(d.cantidad > 0 && d.cantidad <= l.cantidad_actual)) return toast(`La cantidad debe estar entre 1 y ${l.cantidad_actual}`, 'error');
    await accion(e.currentTarget, () => api.post(`/lotes/${l.id_lote}/baja`, d), 'Baja registrada en el kardex');
    m.cerrar();
    alCambiar();
    app.refrescarBadges();
  });
}
