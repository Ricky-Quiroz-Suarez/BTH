// Productos y tablas de catálogo (categorías, laboratorios, formas, proveedores)
const router = require('express').Router();
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { HttpError } = require('../errors');

const EDITORES = requireRole('administrador', 'regente');

// ---------------------------------------------------------------- productos
router.get('/productos', async (req, res) => {
  const { q, categoria, laboratorio, estado } = req.query;
  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(s.nombre_comercial) LIKE $${params.length} OR lower(s.principio_activo) LIKE $${params.length} OR lower(s.codigo) LIKE $${params.length})`);
  }
  if (categoria) { params.push(categoria); where.push(`p.id_categoria = $${params.length}`); }
  if (laboratorio) { params.push(laboratorio); where.push(`p.id_laboratorio = $${params.length}`); }
  if (estado === 'bajo') where.push('s.stock_disponible <= s.stock_minimo');
  if (estado === 'agotado') where.push('s.stock_disponible = 0');

  const { rows } = await query(
    `SELECT s.*, p.id_categoria, p.id_laboratorio, p.id_forma, p.presentacion,
            p.requiere_receta, p.es_controlado, p.registro_sanitario
       FROM v_stock_producto s JOIN productos p ON p.id_producto = s.id_producto
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY s.nombre_comercial`,
    params
  );
  res.json(rows);
});

router.get('/productos/:id', async (req, res) => {
  const p = await query(
    `SELECT p.*, c.nombre AS categoria, l.nombre AS laboratorio, f.nombre AS forma,
            s.stock_disponible, s.proximo_vencimiento
       FROM productos p
       JOIN categorias c ON c.id_categoria = p.id_categoria
       JOIN laboratorios l ON l.id_laboratorio = p.id_laboratorio
       LEFT JOIN formas_farmaceuticas f ON f.id_forma = p.id_forma
       LEFT JOIN v_stock_producto s ON s.id_producto = p.id_producto
      WHERE p.id_producto = $1`,
    [req.params.id]
  );
  if (!p.rows[0]) throw new HttpError(404, 'Producto no encontrado');
  const lotes = await query(
    `SELECT l.*, sv.semaforo, sv.dias_restantes
       FROM lotes l LEFT JOIN v_semaforo_vencimientos sv ON sv.id_lote = l.id_lote
      WHERE l.id_producto = $1 ORDER BY l.fecha_vencimiento`,
    [req.params.id]
  );
  res.json({ ...p.rows[0], lotes: lotes.rows });
});

const CAMPOS_PRODUCTO = [
  'codigo', 'nombre_comercial', 'principio_activo', 'concentracion', 'presentacion',
  'id_forma', 'id_categoria', 'id_laboratorio', 'registro_sanitario', 'precio_venta',
  'stock_minimo', 'requiere_receta', 'es_controlado', 'imagen_url', 'descripcion',
];

function datosProducto(body) {
  const d = {};
  for (const c of CAMPOS_PRODUCTO) if (body[c] !== undefined) d[c] = body[c] === '' ? null : body[c];
  if (d.es_controlado) d.requiere_receta = true;
  return d;
}

router.post('/productos', EDITORES, async (req, res) => {
  const d = datosProducto(req.body);
  const li = req.body.lote_inicial;
  const id = await tx(async (c) => {
    const cols = Object.keys(d);
    const { rows } = await c.query(
      `INSERT INTO productos (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')})
       RETURNING id_producto`,
      Object.values(d)
    );
    const idp = rows[0].id_producto;
    if (li && li.cantidad > 0) {
      await c.query('SELECT fn_ingreso_inicial($1,$2,$3,$4,$5,$6)', [
        idp, li.numero_lote, li.fecha_vencimiento, li.costo_unitario || 0, li.cantidad, req.user.id,
      ]);
    }
    return idp;
  });
  res.status(201).json({ id_producto: id });
});

router.put('/productos/:id', EDITORES, async (req, res) => {
  const d = datosProducto(req.body);
  const cols = Object.keys(d);
  if (!cols.length) throw new HttpError(400, 'No hay cambios');
  const { rowCount } = await query(
    `UPDATE productos SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id_producto = $1`,
    [req.params.id, ...Object.values(d)]
  );
  if (!rowCount) throw new HttpError(404, 'Producto no encontrado');
  res.json({ ok: true });
});

// No se borra (tiene historial): se desactiva
router.delete('/productos/:id', requireRole('administrador'), async (req, res) => {
  await query('UPDATE productos SET activo = FALSE WHERE id_producto = $1', [req.params.id]);
  res.json({ ok: true });
});

// Stock inicial / lote adicional sin compra
router.post('/productos/:id/lotes', EDITORES, async (req, res) => {
  const b = req.body;
  const { rows } = await query('SELECT fn_ingreso_inicial($1,$2,$3,$4,$5,$6) AS id', [
    req.params.id, b.numero_lote, b.fecha_vencimiento, b.costo_unitario || 0, b.cantidad, req.user.id,
  ]);
  res.status(201).json({ id_lote: rows[0].id });
});

// ------------------------------------------------- catálogos simples (CRUD)
function crud(ruta, tabla, pk, campos, orden, conActivo = true) {
  router.get(`/${ruta}`, async (_req, res) => {
    const { rows } = await query(
      `SELECT * FROM ${tabla} ${conActivo ? 'WHERE activo' : ''} ORDER BY ${orden}`
    );
    res.json(rows);
  });
  router.post(`/${ruta}`, EDITORES, async (req, res) => {
    const cols = campos.filter((c) => req.body[c] !== undefined && req.body[c] !== '');
    const { rows } = await query(
      `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
      cols.map((c) => req.body[c])
    );
    res.status(201).json(rows[0]);
  });
  router.put(`/${ruta}/:id`, EDITORES, async (req, res) => {
    const cols = campos.filter((c) => req.body[c] !== undefined);
    if (!cols.length) throw new HttpError(400, 'No hay cambios');
    const { rows } = await query(
      `UPDATE ${tabla} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE ${pk} = $1 RETURNING *`,
      [req.params.id, ...cols.map((c) => (req.body[c] === '' ? null : req.body[c]))]
    );
    if (!rows[0]) throw new HttpError(404, 'Registro no encontrado');
    res.json(rows[0]);
  });
  router.delete(`/${ruta}/:id`, requireRole('administrador'), async (req, res) => {
    if (conActivo) await query(`UPDATE ${tabla} SET activo = FALSE WHERE ${pk} = $1`, [req.params.id]);
    else await query(`DELETE FROM ${tabla} WHERE ${pk} = $1`, [req.params.id]);
    res.json({ ok: true });
  });
}

crud('categorias', 'categorias', 'id_categoria', ['nombre', 'descripcion', 'icono'], 'nombre');
crud('laboratorios', 'laboratorios', 'id_laboratorio', ['nombre', 'pais'], 'nombre');
crud('formas', 'formas_farmaceuticas', 'id_forma', ['nombre'], 'nombre', false);
crud('proveedores', 'proveedores', 'id_proveedor',
  ['razon_social', 'nit', 'contacto', 'telefono', 'correo', 'direccion'], 'razon_social');

module.exports = router;
