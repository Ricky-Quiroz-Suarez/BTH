// Panel principal: regla de vencimientos (FEFO), cifras del día y pendientes
import { api } from '../api.js';
import { app } from '../app.js';
import { esc, bs, entero, fechaHora, icono, mesCorto, SEMAFORO, vacio, diasTexto } from '../ui.js';

const ALTO_FILA = 32;
const MAX_FILAS = 5;

export default async function dashboard(el, ctx) {
  const d = await api.get('/dashboard');
  if (!ctx.esVigente()) return;

  const nombre = app.usuario.nombre_completo.split(' ')[0];
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const porSem = Object.fromEntries(d.semaforo.map((s) => [s.semaforo, s]));
  const vencidos = d.lotes_por_vencer.filter((l) => l.dias_restantes <= 0);
  const futuros = d.lotes_por_vencer.filter((l) => l.dias_restantes > 0);
  const gestion = app.puede('administrador', 'regente');

  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${saludo}, ${esc(nombre)}</h1>
        <p>${new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      <div class="acciones">
        <a class="btn verde" href="#/ventas">${icono('venta')}Nueva venta</a>
      </div>
    </div>

    <section class="panel" aria-labelledby="t-regla">
      <div class="panel-head">
        <div>
          <h2 id="t-regla">Lo que vence en los próximos 12 meses</h2>
          <p class="muted small">Cada marca es un lote con unidades en estante. Toque una para ver el medicamento.</p>
        </div>
        <a class="btn sec mini" href="#/lotes">Ver todos los lotes</a>
      </div>
      <div class="regla">
        ${vencidos.length ? `
          <div class="regla-vencidos">${icono('alerta')}
            <span><b>${vencidos.length} lote${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''}</b> con unidades en inventario. Deben darse de baja.</span>
            <a class="btn sec mini" style="margin-left:auto" href="#/lotes/negro">Revisar</a>
          </div>` : ''}
        ${futuros.length ? `
          <div class="regla-pista">
            <div class="regla-lotes" id="regla-lotes"></div>
            <div class="regla-zonas" aria-hidden="true">
              <span style="width:25%;background:#E99A9A"></span>
              <span style="width:25%;background:#F1CC6E"></span>
              <span style="width:50%;background:#8FE0AE"></span>
            </div>
            <div class="regla-meses" id="regla-meses" aria-hidden="true"></div>
          </div>` : vacio('No hay lotes que venzan en el próximo año', '')}
        <div class="regla-pie">
          <span><b>${entero(porSem.rojo?.unidades)}</b> unidades para retirar (3 meses o menos)</span>
          <span><b>${entero(porSem.amarillo?.unidades)}</b> unidades a priorizar (3 a 6 meses)</span>
          <span><b>${bs((porSem.rojo?.valor || 0) + (porSem.amarillo?.valor || 0))}</b> de costo en riesgo</span>
        </div>
      </div>
      <div class="cifras">
        <div><small>Ventas de hoy</small><b>${bs(d.ventas_hoy.total)}</b><small>${entero(d.ventas_hoy.ventas)} ventas</small></div>
        <div><small>Inventario a costo</small><b>${bs(d.valor_inventario)}</b><small>${entero(d.productos)} medicamentos</small></div>
        <div><small>Por reponer</small><b class="${d.alertas_stock ? 'alerta' : ''}">${entero(d.alertas_stock)}</b><small>en o bajo el stock mínimo</small></div>
        <div><small>Pedidos por recibir</small><b>${entero(d.compras_por_recibir)}</b><small>órdenes enviadas a proveedores</small></div>
      </div>
    </section>

    <div class="grid-2" style="margin-top:18px">
      <section class="panel">
        <div class="panel-head">
          <h2>Por reponer</h2>
          ${gestion && d.stock_bajo.length ? `<a class="btn mini" href="#/compras/sugerida">Preparar pedido</a>` : ''}
        </div>
        ${d.stock_bajo.length ? `<ul class="lista">${d.stock_bajo.map((p) => `
          <li>
            <div class="grow"><b>${esc(p.nombre_comercial)}</b><span class="muted small">${esc(p.laboratorio)}</span></div>
            <span class="chip ${p.stock_disponible === 0 ? 'rojo' : 'amarillo'}">${p.stock_disponible === 0 ? 'Agotado' : `Quedan ${p.stock_disponible}`}</span>
          </li>`).join('')}</ul>` : vacio('Todo el stock está sobre el mínimo')}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Últimas ventas</h2><a class="btn sec mini" href="#/ventas/historial">Historial</a></div>
        ${d.ultimas_ventas.length ? `<ul class="lista">${d.ultimas_ventas.map((v) => `
          <li>
            <div class="grow"><b>${esc(v.cliente)}</b><span class="muted small">Venta ${v.id_venta}, ${fechaHora(v.fecha)}</span></div>
            <span class="num"><b>${bs(v.total)}</b></span>
          </li>`).join('')}</ul>` : vacio('Aún no hay ventas', 'Registre la primera desde Vender.')}
      </section>
    </div>`;

  if (futuros.length) montarRegla(el, futuros);
}

function montarRegla(el, lotes) {
  const cont = el.querySelector('#regla-lotes');
  const meses = el.querySelector('#regla-meses');

  // etiquetas de mes en el primer día de cada mes
  const hoy = new Date();
  const marcas = [];
  for (let i = 1; i <= 12; i++) {
    const m = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    const dias = (m - hoy) / 86400000;
    if (dias > 0 && dias < 365) marcas.push({ x: (dias / 365) * 100, txt: mesCorto(m.getMonth()) + (m.getMonth() === 0 ? ' ' + String(m.getFullYear()).slice(2) : '') });
  }
  meses.innerHTML = marcas.map((m) => `<span style="left:${m.x}%">${m.txt}</span>`).join('');

  cont.innerHTML = lotes.map((l, i) => `
    <button class="pin" data-i="${i}" style="--c:${SEMAFORO[l.semaforo].color}"
      title="${esc(l.nombre_comercial)}, lote ${esc(l.numero_lote)}: vence en ${diasTexto(l.dias_restantes)}"
      aria-label="${esc(l.nombre_comercial)}, lote ${esc(l.numero_lote)}, ${l.cantidad_actual} unidades, vence en ${diasTexto(l.dias_restantes)}">
      <span class="pin-etiqueta">${esc(corto(l.nombre_comercial))}<small>${entero(l.cantidad_actual)} u</small></span>
      <span class="pin-tallo"></span>
    </button>`).join('');

  cont.querySelectorAll('.pin').forEach((p) =>
    p.addEventListener('click', () => app.ir('productos/' + lotes[p.dataset.i].id_producto)));

  const acomodar = () => {
    if (!cont.isConnected) return obs.disconnect(); // el usuario ya salió del panel
    const ancho = cont.clientWidth;
    const puestos = []; // { ini, fin, x, fila } de cada pin ya ubicado
    let usadas = 0;
    let ocultos = 0;
    const libre = (ini, fin, x, fila) => puestos.every((q) => {
      if (q.fila === fila) return fin + 6 < q.ini || ini > q.fin + 6;          // etiquetas en la misma fila
      if (q.fila > fila) return q.x < ini - 4 || q.x > fin + 4;               // su tallo cruza mi etiqueta
      return x < q.ini - 4 || x > q.fin + 4;                                  // mi tallo cruza su etiqueta
    });
    // de derecha a izquierda: los lotes cercanos quedan en escalera sin cruzar tallos
    [...cont.querySelectorAll('.pin')].reverse().forEach((p) => {
      const l = lotes[p.dataset.i];
      const x = (Math.min(l.dias_restantes, 365) / 365) * ancho;
      p.classList.remove('flip', 'hidden');
      const w = p.querySelector('.pin-etiqueta').offsetWidth;
      const flip = x + w > ancho;
      const ini = flip ? x - w : x;
      const fin = flip ? x : x + w;
      let fila = 0;
      while (fila < MAX_FILAS && !libre(ini, fin, x, fila)) fila++;
      if (fila === MAX_FILAS) { p.classList.add('hidden'); ocultos++; return; }
      puestos.push({ ini, fin, x, fila });
      usadas = Math.max(usadas, fila + 1);
      p.classList.toggle('flip', flip);
      p.style.left = x + 'px';
      p.style.height = (fila + 1) * ALTO_FILA + 'px';
    });
    cont.style.height = usadas * ALTO_FILA + 'px';

    // nombres de mes: ocultar los que se enciman en pantallas angostas
    let finPrevio = -Infinity;
    meses.querySelectorAll('span').forEach((s) => {
      s.style.visibility = '';
      const r = s.getBoundingClientRect();
      if (r.left < finPrevio + 6) s.style.visibility = 'hidden';
      else finPrevio = r.right;
    });
    let aviso = el.querySelector('#regla-ocultos');
    if (ocultos) {
      if (!aviso) {
        aviso = document.createElement('a');
        aviso.id = 'regla-ocultos';
        aviso.href = '#/lotes';
        aviso.className = 'small';
        el.querySelector('.regla-pie').append(aviso);
      }
      aviso.textContent = `y ${ocultos} lotes más en la lista`;
    } else aviso?.remove();
  };
  const obs = new ResizeObserver(acomodar);
  acomodar();
  obs.observe(cont);
}

// "Jarabe para la tos Alcos" -> "Jarabe para la tos"
function corto(nombre) {
  return nombre.length > 22 ? nombre.slice(0, 20).trim() + '…' : nombre;
}
