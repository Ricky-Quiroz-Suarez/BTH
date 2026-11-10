// Módulo de abastecimiento: órdenes de compra y recepción de mercadería
const router = require('express').Router();
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { HttpError } = require('../errors');

router.use(requireRole('administrador', 'regente'));

router.get('/', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.estado) { params.push(req.query.estado); where = 'WHERE estado = $1'; }
  const { rows } = await query(
    `SELECT * FROM v_compras_resumen ${where} ORDER BY id_compra DESC LIMIT 300`, params);
  res.json(rows);
});

router.get('/sugerencia', async (_req, res) => {
  const { rows } = await query('SELECT * FROM v_sugerencia_pedido');
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const c = await query(
    `SELECT c.*, p.razon_social AS proveedor, u.nombre_completo AS usuario
       FROM compras c JOIN proveedores p ON p.id_proveedor = c.id_proveedor
       JOIN usuarios u ON u.id_usuario = c.id_usuario WHERE c.id_compra = $1`,
    [req.params.id]
  );
  if (!c.rows[0]) throw new HttpError(404, 'Compra no encontrada');
  const d = await query(
    `SELECT d.*, p.codigo, p.nombre_comercial, p.concentracion, p.precio_venta
       FROM compra_detalle d JOIN productos p ON p.id_producto = d.id_producto
      WHERE d.id_compra = $1 ORDER BY d.id_detalle`,
    [req.params.id]
  );
  res.json({ ...c.rows[0], items: d.rows });
});

async function guardarItems(c, idCompra, items) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Agregue al menos un producto');
  await c.query('DELETE FROM compra_detalle WHERE id_compra = $1', [idCompra]);
  for (const it of items) {
    await c.query(
      `INSERT INTO compra_detalle (id_compra, id_producto, cantidad_pedida, costo_unitario, porcentaje_margen)
       VALUES ($1,$2,$3,$4,$5)`,
      [idCompra, it.id_producto, it.cantidad_pedida, it.costo_unitario || 0,
        it.porcentaje_margen === '' || it.porcentaje_margen == null ? null : it.porcentaje_margen]
    );
  }
}

router.post('/', async (req, res) => {
  const { id_proveedor, observaciones, items } = req.body;
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO compras (id_proveedor, id_usuario, observaciones) VALUES ($1,$2,$3) RETURNING id_compra`,
      [id_proveedor, req.user.id, observaciones || null]
    );
    await guardarItems(c, rows[0].id_compra, items);
    return rows[0].id_compra;
  });
  res.status(201).json({ id_compra: id });
});

router.put('/:id', async (req, res) => {
  const { id_proveedor, observaciones, items } = req.body;
  await tx(async (c) => {
    const { rows } = await c.query('SELECT estado FROM compras WHERE id_compra = $1 FOR UPDATE', [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Compra no encontrada');
    if (!['borrador', 'enviada'].includes(rows[0].estado)) throw new HttpError(400, 'Solo se editan órdenes en borrador o enviadas');
    await c.query('UPDATE compras SET id_proveedor = $2, observaciones = $3 WHERE id_compra = $1',
      [req.params.id, id_proveedor, observaciones || null]);
    await guardarItems(c, req.params.id, items);
  });
  res.json({ ok: true });
});

router.post('/:id/enviar', async (req, res) => {
  const { rowCount } = await query(
    `UPDATE compras SET estado = 'enviada' WHERE id_compra = $1 AND estado = 'borrador'`, [req.params.id]);
  if (!rowCount) throw new HttpError(400, 'Solo se envían órdenes en borrador');
  res.json({ ok: true });
});

router.post('/:id/anular', async (req, res) => {
  const { rowCount } = await query(
    `UPDATE compras SET estado = 'anulada' WHERE id_compra = $1 AND estado IN ('borrador','enviada')`, [req.params.id]);
  if (!rowCount) throw new HttpError(400, 'Esta compra ya no se puede anular');
  res.json({ ok: true });
});

// Recepción: completa lote, vencimiento y cantidades reales; luego crea el stock
router.post('/:id/recibir', async (req, res) => {
  const { tipo_comprobante, nro_comprobante, items } = req.body;
  if (!tipo_comprobante) throw new HttpError(400, 'Indique si llegó con factura o nota de venta');
  const lineas = await tx(async (c) => {
    for (const it of items || []) {
      await c.query(
        `UPDATE compra_detalle
            SET cantidad_recibida = $3, numero_lote = $4, fecha_vencimiento = $5,
                costo_unitario = $6, porcentaje_margen = $7
          WHERE id_detalle = $1 AND id_compra = $2`,
        [it.id_detalle, req.params.id, it.cantidad_recibida, (it.numero_lote || '').trim() || null,
          it.fecha_vencimiento || null, it.costo_unitario,
          it.porcentaje_margen === '' || it.porcentaje_margen == null ? null : it.porcentaje_margen]
      );
    }
    const { rows } = await c.query('SELECT fn_recibir_compra($1,$2,$3,$4) AS n',
      [req.params.id, req.user.id, tipo_comprobante, nro_comprobante || null]);
    return rows[0].n;
  });
  res.json({ ok: true, lineas });
});

module.exports = router;
