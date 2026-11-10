// Usuarios, parámetros, promociones, consultas y reportes
const router = require('express').Router();
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { HttpError } = require('../errors');

const ADMIN = requireRole('administrador');
const GESTION = requireRole('administrador', 'regente');

// ---------------------------------------------------------------- usuarios
router.get('/usuarios', ADMIN, async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id_usuario, u.nombre_completo, u.correo, u.telefono, u.activo, u.ultimo_acceso,
            r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol ORDER BY u.nombre_completo`);
  res.json(rows);
});

router.post('/usuarios', ADMIN, async (req, res) => {
  const { nombre_completo, correo, password, rol, telefono } = req.body;
  const { rows } = await query('SELECT fn_crear_usuario($1,$2,$3,$4) AS id', [nombre_completo, correo, password, rol]);
  if (telefono) await query('UPDATE usuarios SET telefono = $2 WHERE id_usuario = $1', [rows[0].id, telefono]);
  res.status(201).json({ id_usuario: rows[0].id });
});

router.put('/usuarios/:id', ADMIN, async (req, res) => {
  const { nombre_completo, correo, rol, telefono, activo, password } = req.body;
  if (Number(req.params.id) === req.user.id && activo === false) {
    throw new HttpError(400, 'No puede desactivar su propio usuario');
  }
  await tx(async (c) => {
    await c.query(
      `UPDATE usuarios SET nombre_completo = $2, correo = lower($3), telefono = $4, activo = $5,
              id_rol = (SELECT id_rol FROM roles WHERE nombre = $6)
        WHERE id_usuario = $1`,
      [req.params.id, nombre_completo, correo, telefono || null, activo !== false, rol]);
    if (password) {
      if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
      await c.query(`UPDATE usuarios SET password_hash = crypt($2, gen_salt('bf')) WHERE id_usuario = $1`,
        [req.params.id, password]);
    }
  });
  res.json({ ok: true });
});

// -------------------------------------------------------------- parámetros
router.get('/parametros', async (_req, res) => {
  const { rows } = await query('SELECT * FROM parametros ORDER BY clave');
  res.json(rows);
});

router.put('/parametros', ADMIN, async (req, res) => {
  await tx(async (c) => {
    for (const [clave, valor] of Object.entries(req.body || {})) {
      if (['stock_minimo_defecto', 'meses_alerta_venc', 'meses_retiro_estante'].includes(clave) &&
          !(Number.isInteger(Number(valor)) && Number(valor) >= 0)) {
        throw new HttpError(400, `"${clave}" debe ser un número entero`);
      }
      await c.query('UPDATE parametros SET valor = $2 WHERE clave = $1', [clave, String(valor)]);
    }
  });
  res.json({ ok: true });
});

// ------------------------------------------------------------- promociones
router.get('/promociones', async (_req, res) => {
  const { rows } = await query(
    `SELECT pr.*,
            (pr.activo AND CURRENT_DATE BETWEEN pr.fecha_inicio AND pr.fecha_fin) AS vigente,
            COALESCE(json_agg(json_build_object(
                'id_producto', p.id_producto, 'nombre_comercial', p.nombre_comercial,
                'id_lote', l.id_lote, 'numero_lote', l.numero_lote))
              FILTER (WHERE p.id_producto IS NOT NULL), '[]') AS items
       FROM promociones pr
       LEFT JOIN promocion_items pi ON pi.id_promocion = pr.id_promocion
       LEFT JOIN productos p ON p.id_producto = pi.id_producto
       LEFT JOIN lotes l ON l.id_lote = pi.id_lote
      GROUP BY pr.id_promocion ORDER BY pr.fecha_inicio DESC`);
  res.json(rows);
});

async function guardarPromo(c, id, b) {
  await c.query('DELETE FROM promocion_items WHERE id_promocion = $1', [id]);
  for (const it of b.items || []) {
    await c.query('INSERT INTO promocion_items (id_promocion, id_producto, id_lote) VALUES ($1,$2,$3)',
      [id, it.id_producto, it.id_lote || null]);
  }
}

router.post('/promociones', GESTION, async (req, res) => {
  const b = req.body;
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO promociones (titulo, descripcion, descuento_pct, fecha_inicio, fecha_fin, motivo)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_promocion`,
      [b.titulo, b.descripcion || null, b.descuento_pct, b.fecha_inicio, b.fecha_fin, b.motivo || 'comercial']);
    await guardarPromo(c, rows[0].id_promocion, b);
    return rows[0].id_promocion;
  });
  res.status(201).json({ id_promocion: id });
});

router.put('/promociones/:id', GESTION, async (req, res) => {
  const b = req.body;
  await tx(async (c) => {
    await c.query(
      `UPDATE promociones SET titulo=$2, descripcion=$3, descuento_pct=$4, fecha_inicio=$5,
              fecha_fin=$6, motivo=$7, activo=$8 WHERE id_promocion = $1`,
      [req.params.id, b.titulo, b.descripcion || null, b.descuento_pct, b.fecha_inicio, b.fecha_fin,
        b.motivo || 'comercial', b.activo !== false]);
    await guardarPromo(c, req.params.id, b);
  });
  res.json({ ok: true });
});

router.delete('/promociones/:id', GESTION, async (req, res) => {
  await query('DELETE FROM promociones WHERE id_promocion = $1', [req.params.id]);
  res.json({ ok: true });
});

// --------------------------------------------------------------- consultas
router.get('/consultas', async (_req, res) => {
  const { rows } = await query(
    `SELECT c.*, u.nombre_completo AS atendida_por,
            COALESCE(json_agg(json_build_object('nombre_comercial', p.nombre_comercial, 'cantidad', ci.cantidad))
              FILTER (WHERE p.id_producto IS NOT NULL), '[]') AS items
       FROM consultas c
       LEFT JOIN usuarios u ON u.id_usuario = c.id_usuario_atiende
       LEFT JOIN consulta_items ci ON ci.id_consulta = c.id_consulta
       LEFT JOIN productos p ON p.id_producto = ci.id_producto
      GROUP BY c.id_consulta, u.nombre_completo
      ORDER BY c.atendida, c.fecha DESC LIMIT 300`);
  res.json(rows);
});

router.post('/consultas/:id/atender', async (req, res) => {
  await query('UPDATE consultas SET atendida = TRUE, id_usuario_atiende = $2 WHERE id_consulta = $1',
    [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- reportes
router.get('/reportes/ventas', GESTION, async (req, res) => {
  const { desde, hasta } = req.query;
  const [dias, top, pagos] = await Promise.all([
    query(`SELECT * FROM v_ventas_diarias
            WHERE ($1::date IS NULL OR dia >= $1::date) AND ($2::date IS NULL OR dia <= $2::date)
            ORDER BY dia`, [desde || null, hasta || null]),
    query(`SELECT p.nombre_comercial, p.concentracion, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS total
             FROM venta_detalle d JOIN ventas v ON v.id_venta = d.id_venta AND v.estado = 'completada'
             JOIN productos p ON p.id_producto = d.id_producto
            WHERE ($1::date IS NULL OR v.fecha::date >= $1::date) AND ($2::date IS NULL OR v.fecha::date <= $2::date)
            GROUP BY p.id_producto ORDER BY total DESC LIMIT 10`, [desde || null, hasta || null]),
    query(`SELECT v.metodo_pago, COUNT(DISTINCT v.id_venta) AS ventas, SUM(d.subtotal) AS total
             FROM ventas v JOIN venta_detalle d ON d.id_venta = v.id_venta
            WHERE v.estado = 'completada'
              AND ($1::date IS NULL OR v.fecha::date >= $1::date) AND ($2::date IS NULL OR v.fecha::date <= $2::date)
            GROUP BY v.metodo_pago ORDER BY total DESC`, [desde || null, hasta || null]),
  ]);
  res.json({ dias: dias.rows, top: top.rows, pagos: pagos.rows });
});

router.get('/reportes/controlados', GESTION, async (req, res) => {
  const { anio, trimestre } = req.query;
  const { rows } = await query(
    `SELECT * FROM v_libro_controlados
      WHERE ($1::int IS NULL OR anio = $1::int) AND ($2::int IS NULL OR trimestre = $2::int)`,
    [anio || null, trimestre || null]);
  res.json(rows);
});

router.get('/reportes/inventario', GESTION, async (_req, res) => {
  const { rows } = await query(
    `SELECT c.nombre AS categoria, COUNT(DISTINCT p.id_producto) AS productos,
            COALESCE(SUM(l.cantidad_actual),0) AS unidades,
            COALESCE(SUM(l.cantidad_actual * l.costo_unitario),0) AS valor_costo,
            COALESCE(SUM(l.cantidad_actual * p.precio_venta),0) AS valor_venta
       FROM categorias c
       JOIN productos p ON p.id_categoria = c.id_categoria AND p.activo
       LEFT JOIN lotes l ON l.id_producto = p.id_producto AND l.estado = 'disponible'
                        AND l.fecha_vencimiento > CURRENT_DATE
      GROUP BY c.id_categoria ORDER BY valor_costo DESC`);
  res.json(rows);
});

module.exports = router;
