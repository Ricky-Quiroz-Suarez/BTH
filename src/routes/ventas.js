// Ventas / dispensación con FEFO automático
const router = require('express').Router();
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { HttpError } = require('../errors');

// Búsqueda rápida para el punto de venta
router.get('/buscar', async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const { rows } = await query(
    `SELECT c.id_producto, c.codigo, c.nombre_comercial, c.principio_activo, c.concentracion,
            c.presentacion, c.laboratorio, c.precio_venta, c.descuento_pct, c.precio_final,
            c.requiere_receta, p.es_controlado, s.stock_disponible, s.proximo_vencimiento
       FROM v_catalogo c
       JOIN v_stock_producto s ON s.id_producto = c.id_producto
       JOIN productos p ON p.id_producto = c.id_producto
      WHERE lower(c.nombre_comercial) LIKE $1 OR lower(c.principio_activo) LIKE $1 OR lower(c.codigo) LIKE $1
      ORDER BY (s.stock_disponible > 0) DESC, c.nombre_comercial
      LIMIT 30`,
    [q]
  );
  res.json(rows);
});

router.get('/clientes', async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const { rows } = await query(
    `SELECT * FROM clientes WHERE lower(nombre) LIKE $1 OR ci_nit LIKE $1 ORDER BY nombre LIMIT 20`, [q]);
  res.json(rows);
});

router.get('/', async (req, res) => {
  const desde = req.query.desde || null;
  const hasta = req.query.hasta || null;
  const { rows } = await query(
    `SELECT v.id_venta, v.fecha, v.metodo_pago, v.estado,
            COALESCE(cl.nombre, 'Consumidor final') AS cliente,
            u.nombre_completo AS vendedor,
            (v.id_receta IS NOT NULL) AS con_receta,
            COALESCE(SUM(d.subtotal), 0) AS total,
            COALESCE(SUM(d.cantidad), 0) AS unidades
       FROM ventas v
       JOIN usuarios u ON u.id_usuario = v.id_usuario
       LEFT JOIN clientes cl ON cl.id_cliente = v.id_cliente
       LEFT JOIN venta_detalle d ON d.id_venta = v.id_venta
      WHERE ($1::date IS NULL OR v.fecha::date >= $1::date)
        AND ($2::date IS NULL OR v.fecha::date <= $2::date)
      GROUP BY v.id_venta, cl.nombre, u.nombre_completo
      ORDER BY v.id_venta DESC LIMIT 500`,
    [desde, hasta]
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const v = await query(
    `SELECT v.*, COALESCE(cl.nombre,'Consumidor final') AS cliente, cl.ci_nit,
            u.nombre_completo AS vendedor, r.numero_receta, r.medico_nombre, r.paciente_nombre
       FROM ventas v JOIN usuarios u ON u.id_usuario = v.id_usuario
       LEFT JOIN clientes cl ON cl.id_cliente = v.id_cliente
       LEFT JOIN recetas r ON r.id_receta = v.id_receta
      WHERE v.id_venta = $1`,
    [req.params.id]
  );
  if (!v.rows[0]) throw new HttpError(404, 'Venta no encontrada');
  const d = await query(
    `SELECT d.*, p.nombre_comercial, p.concentracion, l.numero_lote, l.fecha_vencimiento
       FROM venta_detalle d JOIN productos p ON p.id_producto = d.id_producto
       JOIN lotes l ON l.id_lote = d.id_lote
      WHERE d.id_venta = $1 ORDER BY d.id_detalle`,
    [req.params.id]
  );
  res.json({ ...v.rows[0], items: d.rows, total: d.rows.reduce((a, x) => a + x.subtotal, 0) });
});

router.post('/', async (req, res) => {
  const { items, metodo_pago, cliente, receta } = req.body;
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'El ticket está vacío');

  const id = await tx(async (c) => {
    let idCliente = cliente?.id_cliente || null;
    if (!idCliente && cliente?.nombre) {
      const r = await c.query(
        'INSERT INTO clientes (nombre, ci_nit, telefono) VALUES ($1,$2,$3) RETURNING id_cliente',
        [cliente.nombre, cliente.ci_nit || null, cliente.telefono || null]);
      idCliente = r.rows[0].id_cliente;
    }
    let idReceta = null;
    if (receta && receta.medico_nombre) {
      const r = await c.query(
        `INSERT INTO recetas (numero_receta, fecha_receta, medico_nombre, medico_matricula, paciente_nombre, paciente_ci)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_receta`,
        [receta.numero_receta || null, receta.fecha_receta || new Date().toISOString().slice(0, 10),
          receta.medico_nombre, receta.medico_matricula || null, receta.paciente_nombre, receta.paciente_ci || null]);
      idReceta = r.rows[0].id_receta;
    }
    const v = await c.query(
      'INSERT INTO ventas (id_cliente, id_usuario, id_receta, metodo_pago) VALUES ($1,$2,$3,$4) RETURNING id_venta',
      [idCliente, req.user.id, idReceta, metodo_pago || 'efectivo']);
    const idVenta = v.rows[0].id_venta;
    for (const it of items) {
      await c.query('SELECT fn_vender_producto($1,$2,$3)', [idVenta, it.id_producto, it.cantidad]);
    }
    return idVenta;
  });
  res.status(201).json({ id_venta: id });
});

router.post('/:id/anular', requireRole('administrador'), async (req, res) => {
  await query('SELECT fn_anular_venta($1,$2,$3)', [req.params.id, req.user.id, req.body.motivo || '']);
  res.json({ ok: true });
});

module.exports = router;
