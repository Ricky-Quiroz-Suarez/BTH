// Conteo físico mensual: se toma una foto del stock, se cuenta y se ajustan diferencias
import { api } from '../api.js';
import { app } from '../app.js';
import { esc, fecha, icono, accion, vacio, confirmar, toast } from '../ui.js';

export default async function conteos(el, ctx) {
  if (ctx.params[0]) return pintarConteo(el, ctx, ctx.params[0]);
  const lista = await api.get('/conteos');
  if (!ctx.esVigente()) return;
  const abierto = lista.find((c) => c.estado === 'abierto');

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Conteo físico</h1><p>Se recomienda una vez al mes. Las diferencias se registran como ajustes en el kardex.</p></div>
      <div class="acciones">${abierto
        ? `<a class="btn" href="#/conteos/${abierto.id_conteo}">Continuar conteo abierto</a>`
        : `<button class="btn" id="iniciar">${icono('mas')}Iniciar conteo</button>`}</div>
    </div>
    <section class="panel"><div class="tabla-wrap">${lista.length ? `
      <table>
        <thead><tr><th>N.º</th><th>Fecha</th><th>Responsable</th><th>Estado</th><th class="num">Lotes contados</th><th class="num">Con diferencia</th><th>Observaciones</th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr class="click" data-id="${c.id_conteo}">
            <td class="num">${c.id_conteo}</td><td>${fecha(c.fecha)}</td><td>${esc(c.usuario)}</td>
            <td><span class="chip ${c.estado === 'abierto' ? 'amarillo' : 'verde'}">${c.estado === 'abierto' ? 'En curso' : 'Cerrado'}</span></td>
            <td class="num">${c.lotes}</td>
            <td class="num">${c.con_diferencia ? `<b style="color:var(--rojo)">${c.con_diferencia}</b>` : '0'}</td>
            <td class="muted">${esc(c.observaciones || '')}</td>
          </tr>`).join('')}</tbody>
      </table>` : vacio('Todavía no hay conteos', ' Inicie el primero para comparar el estante con el sistema.')}</div></section>`;

  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => app.ir('conteos/' + tr.dataset.id)));
  el.querySelector('#iniciar')?.addEventListener('click', async (e) => {
    const r = await accion(e.currentTarget, () => api.post('/conteos', { observaciones: 'Conteo mensual' }), 'Conteo iniciado');
    app.ir('conteos/' + r.id_conteo);
  });
}

async function pintarConteo(el, ctx, id) {
  const c = await api.get('/conteos/' + id);
  if (!ctx.esVigente()) return;
  const abierto = c.estado === 'abierto';
  const cambios = new Map();

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Conteo ${c.id_conteo}, ${fecha(c.fecha)}</h1>
        <p>${abierto ? 'Escriba lo que hay realmente en el estante. Guarde a medida que avanza.' : 'Conteo cerrado: los ajustes ya están en el kardex.'}</p></div>
      <div class="acciones">
        <a class="btn sec" href="#/conteos">Volver</a>
        <button class="btn sec" onclick="window.print()">${icono('imprimir')}Hoja de conteo</button>
        ${abierto ? `<button class="btn" id="guardar">Guardar avance</button>` : ''}
        ${abierto && app.puede('administrador') ? `<button class="btn verde" id="cerrar">Cerrar y ajustar</button>` : ''}
      </div>
    </div>
    <div class="toolbar"><input type="search" id="q" placeholder="Filtrar por medicamento o lote" aria-label="Filtrar"></div>
    <section class="panel"><div class="tabla-wrap"><table>
      <thead><tr><th>Medicamento</th><th>Lote</th><th>Vence</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Observación</th></tr></thead>
      <tbody>${c.items.map((i) => `
        <tr data-fila="${esc((i.nombre_comercial + ' ' + i.numero_lote).toLowerCase())}">
          <td class="td-prod"><b>${esc(i.nombre_comercial)} ${esc(i.concentracion || '')}</b><small class="codigo">${esc(i.codigo)}</small></td>
          <td><span class="codigo">${esc(i.numero_lote)}</span></td>
          <td>${fecha(i.fecha_vencimiento)}</td>
          <td class="num">${i.cantidad_sistema}</td>
          <td class="num">${abierto ? `<input type="number" min="0" data-lote="${i.id_lote}" data-sis="${i.cantidad_sistema}" value="${i.cantidad_fisica}" style="width:90px;text-align:right">` : i.cantidad_fisica}</td>
          <td class="num" data-dif="${i.id_lote}">${dif(i.diferencia)}</td>
          <td>${abierto ? `<input data-obs="${i.id_lote}" value="${esc(i.observacion || '')}" placeholder="Opcional">` : esc(i.observacion || '')}</td>
        </tr>`).join('')}</tbody>
    </table></div></section>`;

  el.querySelector('#q').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    el.querySelectorAll('tr[data-fila]').forEach((tr) => tr.classList.toggle('hidden', !tr.dataset.fila.includes(q)));
  });
  const marcar = (idLote) => {
    const cant = el.querySelector(`[data-lote="${idLote}"]`);
    const obs = el.querySelector(`[data-obs="${idLote}"]`);
    cambios.set(idLote, { id_lote: Number(idLote), cantidad_fisica: Math.max(0, parseInt(cant.value, 10) || 0), observacion: obs.value.trim() });
    el.querySelector(`[data-dif="${idLote}"]`).innerHTML = dif((parseInt(cant.value, 10) || 0) - Number(cant.dataset.sis));
  };
  el.querySelectorAll('[data-lote]').forEach((i) => i.addEventListener('input', () => marcar(i.dataset.lote)));
  el.querySelectorAll('[data-obs]').forEach((i) => i.addEventListener('input', () => marcar(i.dataset.obs)));

  const guardar = async (btn) => {
    if (!cambios.size) return;
    await accion(btn, () => api.put(`/conteos/${id}/items`, { items: [...cambios.values()] }), 'Avance guardado');
    cambios.clear();
  };
  el.querySelector('#guardar')?.addEventListener('click', (e) => guardar(e.currentTarget));
  el.querySelector('#cerrar')?.addEventListener('click', async (e) => {
    await guardar(null);
    const n = [...el.querySelectorAll('[data-lote]')].filter((i) => Number(i.value) !== Number(i.dataset.sis)).length;
    if (!(await confirmar('Cerrar conteo', n
      ? `Se registrarán <b>${n} ajustes</b> en el kardex para igualar el sistema con lo contado. No se puede deshacer.`
      : 'No hay diferencias: el conteo se cerrará sin ajustes.', { boton: 'Cerrar conteo' }))) return;
    const r = await accion(e.currentTarget, () => api.post(`/conteos/${id}/cerrar`));
    toast(`Conteo cerrado con ${r.ajustes} ajustes`);
    app.ir('conteos/' + id);
  });
}

function dif(n) {
  if (!n) return '<span class="muted">0</span>';
  return `<b style="color:${n > 0 ? 'var(--verde-tinta)' : 'var(--rojo)'}">${n > 0 ? '+' : '−'}${Math.abs(n)}</b>`;
}
