// Rutas sin sesión: catálogo para clientes y formulario de consulta
const router = require('express').Router();
const { query, tx } = require('../db');
const { HttpError } = require('../errors');

router.get('/info', async (_req, res) => {
  const { rows } = await query(
    `SELECT clave, valor FROM parametros WHERE clave IN ('nombre_farmacia','direccion','whatsapp','moneda')`);
  res.json(Object.fromEntries(rows.map((r) => [r.clave, r.valor])));
});

router.get('/categorias', async (_req, res) => {
  // solo categorías con algún medicamento visible al público
  const { rows } = await query(
    `SELECT c.id_categoria, c.nombre, c.icono FROM categorias c
      WHERE c.activo AND EXISTS (SELECT 1 FROM productos p
                                  WHERE p.id_categoria = c.id_categoria AND p.activo AND NOT p.es_controlado)
      ORDER BY c.nombre`);
  res.json(rows);
});

// Los medicamentos controlados no se publican
router.get('/catalogo', async (req, res) => {
  const { q, categoria } = req.query;
  const { rows } = await query(
    `SELECT c.id_producto, c.nombre_comercial, c.principio_activo, c.concentracion, c.presentacion,
            c.forma_farmaceutica, c.categoria, c.laboratorio, c.precio_venta, c.descuento_pct,
            c.precio_final, c.requiere_receta, c.imagen_url, c.disponible
       FROM v_catalogo c JOIN productos p ON p.id_producto = c.id_producto
      WHERE NOT p.es_controlado
        AND ($1::text IS NULL OR lower(c.nombre_comercial) LIKE '%' || lower($1) || '%'
                              OR lower(c.principio_activo) LIKE '%' || lower($1) || '%')
        AND ($2::int IS NULL OR p.id_categoria = $2::int)
      ORDER BY c.disponible DESC, c.nombre_comercial`,
    [q || null, categoria || null]);
  res.json(rows);
});

router.post('/consultas', async (req, res) => {
  const { nombre, correo, telefono, mensaje, canal, items } = req.body || {};
  if (!nombre || !mensaje) throw new HttpError(400, 'Escriba su nombre y su consulta');
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO consultas (nombre, correo, telefono, mensaje, canal) VALUES ($1,$2,$3,$4,$5) RETURNING id_consulta`,
      [nombre.slice(0, 120), correo || null, telefono || null, mensaje.slice(0, 2000), canal === 'whatsapp' ? 'whatsapp' : 'web']);
    for (const it of (items || []).slice(0, 30)) {
      await c.query(
        `INSERT INTO consulta_items (id_consulta, id_producto, cantidad) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [rows[0].id_consulta, it.id_producto, Math.max(1, parseInt(it.cantidad, 10) || 1)]);
    }
    return rows[0].id_consulta;
  });
  res.status(201).json({ id_consulta: id });
});

module.exports = router;
