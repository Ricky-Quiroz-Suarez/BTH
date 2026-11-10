// Panel, lotes, alertas, kardex, bajas y conteos físicos
const router = require('express').Router();
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { HttpError } = require('../errors');

router.get('/dashboard', async (_req, res) => {
  const [resumen, ventasHoy, semaforo, lotes, ultimas, stock] = await Promise.all([
    query(`SELECT
             (SELECT COUNT(*) FROM productos WHERE activo) AS productos,
             (SELECT COALESCE(SUM(cantidad_actual * costo_unitario),0) FROM lotes
               WHERE estado = 'disponible' AND fecha_vencimiento > CURRENT_DATE) AS valor_inventario,
             (SELECT COUNT(*) FROM v_alerta_stock) AS alertas_stock,
             (SELECT COUNT(*) FROM consultas WHERE NOT atendida) AS consultas_pendientes,
             (SELECT COUNT(*) FROM compras WHERE estado = 'enviada') AS compras_por_recibir`),
    query(`SELECT COUNT(DISTINCT v.id_venta) AS ventas, COALESCE(SUM(d.subtotal),0) AS total
             FROM ventas v JOIN venta_detalle d ON d.id_venta = v.id_venta
            WHERE v.estado = 'completada' AND v.fecha::date = CURRENT_DATE`),
    query(`SELECT semaforo, COUNT(*) AS lotes, SUM(cantidad_actual) AS unidades,
                  COALESCE(SUM(valor_en_riesgo),0) AS valor
             FROM v_semaforo_vencimientos GROUP BY semaforo`),
    // lotes de los próximos 12 meses para la regla de vencimientos
    query(`SELECT id_lote, id_producto, nombre_comercial, numero_lote, fecha_vencimiento,
                  cantidad_actual, dias_restantes, semaforo
             FROM v_semaforo_vencimientos
            WHERE dias_restantes <= 365 ORDER BY fecha_vencimiento`),
    query(`SELECT v.id_venta, v.fecha, COALESCE(c.nombre,'Consumidor final') AS cliente,
                  SUM(d.subtotal) AS total
             FROM ventas v JOIN venta_detalle d ON d.id_venta = v.id_venta
             LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
            WHERE v.estado = 'completada'
            GROUP BY v.id_venta, c.nombre ORDER BY v.id_venta DESC LIMIT 6`),
    query('SELECT * FROM v_alerta_stock LIMIT 8'),
  ]);
  res.json({
    ...resumen.rows[0],
    ventas_hoy: ventasHoy.rows[0],
    semaforo: semaforo.rows,
    lotes_por_vencer: lotes.rows,
    ultimas_ventas: ultimas.rows,
    stock_bajo: stock.rows,
  });
});

// ------------------------------------------------------------------- lotes
router.get('/lotes', async (req, res) => {
  const { semaforo, q } = req.query;
  const params = [];
  const where = [];
  if (semaforo) { params.push(semaforo); where.push(`sv.semaforo = $${params.length}`); }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(sv.nombre_comercial) LIKE $${params.length} OR lower(sv.numero_lote) LIKE $${params.length} OR lower(sv.principio_activo) LIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT sv.*, l.estado, l.costo_unitario
       FROM v_semaforo_vencimientos sv JOIN lotes l ON l.id_lote = sv.id_lote
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY sv.fecha_vencimiento`,
    params
  );
  res.json(rows);
});

// Retirar del estante (deja de venderse, sigue en inventario hasta la baja o devolución)
router.post('/lotes/:id/retirar', requireRole('administrador', 'regente'), async (req, res) => {
  const { rowCount } = await query(
    `UPDATE lotes SET estado = 'retirado' WHERE id_lote = $1 AND estado = 'disponible'`, [req.params.id]);
  if (!rowCount) throw new HttpError(400, 'El lote no está disponible');
  res.json({ ok: true });
});

router.post('/lotes/:id/reactivar', requireRole('administrador', 'regente'), async (req, res) => {
  const { rowCount } = await query(
    `UPDATE lotes SET estado = 'disponible'
      WHERE id_lote = $1 AND estado = 'retirado' AND fecha_vencimiento > CURRENT_DATE`, [req.params.id]);
  if (!rowCount) throw new HttpError(400, 'Solo se reactivan lotes retirados y no vencidos');
  res.json({ ok: true });
});

router.post('/lotes/:id/baja', requireRole('administrador'), async (req, res) => {
  const { cantidad, tipo, motivo } = req.body;
  if (!(cantidad > 0)) throw new HttpError(400, 'Indique la cantidad a dar de baja');
  await query('SELECT fn_baja_lote($1,$2,$3,$4,$5)', [req.params.id, cantidad, tipo, req.user.id, motivo || null]);
  res.json({ ok: true });
});

// ----------------------------------------------------------------- alertas
router.get('/alertas', async (_req, res) => {
  const [stock, venc] = await Promise.all([
    query('SELECT * FROM v_alerta_stock'),
    query('SELECT * FROM v_alerta_vencimiento'),
  ]);
  res.json({ stock: stock.rows, vencimiento: venc.rows });
});

// ------------------------------------------------------------------ kardex
router.get('/kardex', async (req, res) => {
  const { producto, tipo, desde, hasta } = req.query;
  const { rows } = await query(
    `SELECT k.* FROM v_kardex k
      WHERE ($1::text IS NULL OR k.codigo = $1 OR lower(k.nombre_comercial) LIKE '%' || lower($1) || '%')
        AND ($2::text IS NULL OR k.tipo = $2)
        AND ($3::date IS NULL OR k.fecha::date >= $3::date)
        AND ($4::date IS NULL OR k.fecha::date <= $4::date)
      ORDER BY k.fecha DESC, k.id_movimiento DESC LIMIT 500`,
    [producto || null, tipo || null, desde || null, hasta || null]
  );
  res.json(rows);
});

// ---------------------------------------------------------- conteo físico
router.get('/conteos', async (_req, res) => {
  const { rows } = await query(
    `SELECT c.*, u.nombre_completo AS usuario,
            COUNT(d.id_lote) AS lotes,
            COUNT(d.id_lote) FILTER (WHERE d.diferencia <> 0) AS con_diferencia
       FROM conteos c JOIN usuarios u ON u.id_usuario = c.id_usuario
       LEFT JOIN conteo_detalle d ON d.id_conteo = c.id_conteo
      GROUP BY c.id_conteo, u.nombre_completo ORDER BY c.id_conteo DESC`);
  res.json(rows);
});

router.post('/conteos', requireRole('administrador', 'regente'), async (req, res) => {
  const id = await tx(async (c) => {
    const abierto = await c.query(`SELECT id_conteo FROM conteos WHERE estado = 'abierto'`);
    if (abierto.rows[0]) throw new HttpError(400, `Ya hay un conteo abierto (#${abierto.rows[0].id_conteo})`);
    const { rows } = await c.query(
      'INSERT INTO conteos (id_usuario, observaciones) VALUES ($1,$2) RETURNING id_conteo',
      [req.user.id, req.body.observaciones || null]);
    // se toma una foto del stock de todos los lotes con existencias
    await c.query(
      `INSERT INTO conteo_detalle (id_conteo, id_lote, cantidad_sistema, cantidad_fisica)
       SELECT $1, id_lote, cantidad_actual, cantidad_actual FROM lotes WHERE cantidad_actual > 0`,
      [rows[0].id_conteo]);
    return rows[0].id_conteo;
  });
  res.status(201).json({ id_conteo: id });
});

router.get('/conteos/:id', async (req, res) => {
  const c = await query('SELECT * FROM conteos WHERE id_conteo = $1', [req.params.id]);
  if (!c.rows[0]) throw new HttpError(404, 'Conteo no encontrado');
  const d = await query(
    `SELECT d.*, p.codigo, p.nombre_comercial, p.concentracion, l.numero_lote, l.fecha_vencimiento
       FROM conteo_detalle d JOIN lotes l ON l.id_lote = d.id_lote
       JOIN productos p ON p.id_producto = l.id_producto
      WHERE d.id_conteo = $1 ORDER BY p.nombre_comercial, l.fecha_vencimiento`,
    [req.params.id]);
  res.json({ ...c.rows[0], items: d.rows });
});

router.put('/conteos/:id/items', requireRole('administrador', 'regente'), async (req, res) => {
  await tx(async (c) => {
    const e = await c.query('SELECT estado FROM conteos WHERE id_conteo = $1', [req.params.id]);
    if (e.rows[0]?.estado !== 'abierto') throw new HttpError(400, 'El conteo ya está cerrado');
    for (const it of req.body.items || []) {
      await c.query(
        `UPDATE conteo_detalle SET cantidad_fisica = $3, observacion = $4
          WHERE id_conteo = $1 AND id_lote = $2`,
        [req.params.id, it.id_lote, it.cantidad_fisica, it.observacion || null]);
    }
  });
  res.json({ ok: true });
});

router.post('/conteos/:id/cerrar', requireRole('administrador'), async (req, res) => {
  const { rows } = await query('SELECT fn_cerrar_conteo($1,$2) AS n', [req.params.id, req.user.id]);
  res.json({ ok: true, ajustes: rows[0].n });
});

module.exports = router;
