// Selector de medicamento reutilizable (input + datalist)
import { api } from '../api.js';
import { esc } from '../ui.js';

let cache = null;
export async function listaProductos(forzar = false) {
  if (!cache || forzar) cache = await api.get('/productos');
  return cache;
}

export const etiquetaProducto = (p) =>
  `${p.nombre_comercial} ${p.concentracion || ''} (${p.codigo})`.replace(/\s+/g, ' ');

export function datalistProductos(id, productos) {
  return `<datalist id="${id}">${productos.map((p) => `<option value="${esc(etiquetaProducto(p))}">`).join('')}</datalist>`;
}

export function productoDesdeTexto(texto, productos) {
  return productos.find((p) => etiquetaProducto(p) === texto.trim()) || null;
}
