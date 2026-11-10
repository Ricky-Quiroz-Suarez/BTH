// Utilidades de interfaz: formato, modales, avisos, íconos
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const fmtNum = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const bs = (n) => 'Bs ' + fmtNum.format(Number(n) || 0);
export const entero = (n) => new Intl.NumberFormat('es-BO').format(Number(n) || 0);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fecha(f) {
  if (!f) return '—';
  const [y, m, d] = String(f).slice(0, 10).split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${y}`;
}
export function fechaHora(f) {
  if (!f) return '—';
  const d = new Date(f);
  return d.toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const sumarDias = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
export const mesCorto = (i) => MESES[i];

// ------------------------------------------------------------- semáforo
export const SEMAFORO = {
  negro: { texto: 'Vencido', color: '#3B4552' },
  rojo: { texto: 'Retirar', color: '#D14343' },
  amarillo: { texto: 'Por vencer', color: '#D99A0B' },
  verde: { texto: 'Vigente', color: '#22C55E' },
};
export function chipSemaforo(s, dias) {
  const info = SEMAFORO[s] || SEMAFORO.verde;
  const texto = dias != null && s !== 'negro' ? `Vence en ${diasTexto(dias)}` : info.texto;
  return `<span class="chip ${s}" title="${info.texto}">${texto}</span>`;
}
export function diasTexto(d) {
  if (d <= 0) return 'vencido';
  if (d < 60) return `${d} días`;
  return `${Math.round(d / 30.4)} meses`;
}
export function stockBar(stock, minimo) {
  const cls = stock === 0 ? 'cero' : stock <= minimo ? 'bajo' : '';
  const pct = Math.min(100, Math.round((stock / Math.max(minimo * 3, 1)) * 100));
  return `<span class="stock-bar ${cls}"><span class="num">${entero(stock)}</span><i><span style="width:${pct}%"></span></i></span>`;
}

// ---------------------------------------------------------------- avisos
export function toast(msg, tipo = 'ok') {
  let zona = $('.toast-zona');
  if (!zona) {
    zona = document.createElement('div');
    zona.className = 'toast-zona';
    zona.setAttribute('role', 'status');
    document.body.append(zona);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (tipo === 'error' ? ' error' : '');
  t.textContent = msg;
  zona.append(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3500);
}

// ---------------------------------------------------------------- modal
// modal({ titulo, subtitulo, cuerpo, pie, ancho }) -> { el, cerrar }
export function modal({ titulo, subtitulo = '', cuerpo = '', pie = '', ancho = false, alCerrar }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <div class="modal-head">
        <div><h2 id="modal-t">${esc(titulo)}</h2>${subtitulo ? `<p>${subtitulo}</p>` : ''}</div>
        <button class="btn-icono" data-cerrar aria-label="Cerrar">${icono('x')}</button>
      </div>
      <div class="modal-body">${cuerpo}</div>
      ${pie ? `<div class="modal-pie">${pie}</div>` : ''}
    </div>`;
  const previo = document.activeElement;
  const cerrar = () => {
    fondo.remove();
    document.removeEventListener('keydown', tecla);
    previo?.focus?.();
    alCerrar?.();
  };
  const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
  // al navegar a otra sección se cierra sin ejecutar alCerrar (no tocar la URL nueva)
  fondo.cerrarSilencioso = () => { fondo.remove(); document.removeEventListener('keydown', tecla); };
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
  fondo.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
  document.addEventListener('keydown', tecla);
  document.body.append(fondo);
  const foco = fondo.querySelector('[autofocus], .modal-body input, .modal-body select, .modal-body textarea');
  (foco || fondo.querySelector('[data-cerrar]')).focus();
  return { el: fondo, cerrar };
}

// Confirmación propia (sin window.confirm)
export function confirmar(titulo, texto, { boton = 'Confirmar', peligro = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal({
      titulo,
      cuerpo: `<p>${texto}</p>`,
      pie: `<button class="btn sec" data-cerrar>Cancelar</button>
            <button class="btn ${peligro ? 'peligro' : ''}" data-ok>${esc(boton)}</button>`,
      alCerrar: () => resolve(ok),
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; m.cerrar(); });
  });
}

// Lee los campos con name="" de un formulario como objeto
export function leerForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number') o[el.name] = el.value === '' ? '' : Number(el.value);
    else o[el.name] = el.value.trim();
  }
  return o;
}

// Ejecuta una acción mostrando error si falla; desactiva el botón mientras tanto
export async function accion(boton, fn, mensajeOk) {
  if (boton) boton.disabled = true;
  try {
    const r = await fn();
    if (mensajeOk) toast(mensajeOk);
    return r;
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  } finally {
    if (boton) boton.disabled = false;
  }
}

export const opciones = (lista, valor, campoId, campoTexto, vacio) =>
  (vacio ? `<option value="">${esc(vacio)}</option>` : '') +
  lista.map((x) => `<option value="${x[campoId]}" ${String(x[campoId]) === String(valor ?? '') ? 'selected' : ''}>${esc(x[campoTexto])}</option>`).join('');

export const vacio = (titulo, texto = '') => `<div class="vacio"><b>${esc(titulo)}</b>${esc(texto)}</div>`;

// ---------------------------------------------------------------- íconos
const P = {
  panel: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  venta: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  caja: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  capsula: '<path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z"/><path d="m8.5 8.5 7 7"/>',
  camion: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  etiqueta: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
  mensaje: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  grafico: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  buscar: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  basura: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  imprimir: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  wsp: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z"/>',
  cruz: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
};
export const icono = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
