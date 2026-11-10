// Consultas que dejan los clientes desde el catálogo público
import { api } from '../api.js';
import { app } from '../app.js';
import { esc, fechaHora, icono, accion, vacio } from '../ui.js';

export default async function consultas(el, ctx) {
  const lista = await api.get('/consultas');
  if (!ctx.esVigente()) return;
  const pendientes = lista.filter((c) => !c.atendida).length;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Consultas de clientes</h1>
        <p>${pendientes ? `${pendientes} sin responder.` : 'Todas las consultas están respondidas.'} Llegan desde el <a href="/catalogo" target="_blank">catálogo en línea</a>.</p></div>
    </div>
    <section class="panel">${lista.length ? `<ul class="lista">${lista.map((c) => `
      <li style="align-items:flex-start;${c.atendida ? 'opacity:.6' : ''}">
        <div class="grow">
          <b>${esc(c.nombre)} <span class="muted small" style="font-weight:500">${fechaHora(c.fecha)}</span></b>
          <p style="margin:4px 0">${esc(c.mensaje)}</p>
          ${c.items.length ? `<p class="small muted">Le interesa: ${c.items.map((i) => `${i.cantidad} x ${esc(i.nombre_comercial)}`).join(', ')}</p>` : ''}
          <p class="small muted">${[c.telefono, c.correo].filter(Boolean).map(esc).join(', ') || 'Sin datos de contacto'}${c.atendida ? `. Atendida por ${esc(c.atendida_por || '')}` : ''}</p>
        </div>
        <div class="acciones">
          ${c.telefono ? `<a class="btn sec mini" target="_blank" rel="noopener" href="https://wa.me/${esc(c.telefono.replace(/\D/g, ''))}">${icono('wsp')}WhatsApp</a>` : ''}
          ${c.correo ? `<a class="btn sec mini" href="mailto:${esc(c.correo)}">Correo</a>` : ''}
          ${!c.atendida ? `<button class="btn mini" data-id="${c.id_consulta}">Marcar respondida</button>` : ''}
        </div>
      </li>`).join('')}</ul>` : vacio('Aún no hay consultas', ' Comparta el enlace del catálogo con sus clientes.')}</section>`;

  el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', async () => {
    await accion(b, () => api.post(`/consultas/${b.dataset.id}/atender`), 'Consulta marcada como respondida');
    app.refrescarBadges();
    consultas(el, ctx);
  }));
}
