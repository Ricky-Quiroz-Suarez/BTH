const router = require('express').Router();
const { query } = require('../db');
const { firmar, requireAuth } = require('../auth');
const { HttpError } = require('../errors');

router.post('/login', async (req, res) => {
  const { correo, password } = req.body || {};
  if (!correo || !password) throw new HttpError(400, 'Ingrese correo y contraseña');

  const { rows } = await query('SELECT fn_login($1, $2, $3) AS id', [correo, password, req.ip]);
  if (!rows[0].id) throw new HttpError(401, 'Correo o contraseña incorrectos');

  const u = await query(
    `SELECT u.id_usuario, u.nombre_completo, u.correo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1`,
    [rows[0].id]
  );
  res.json({ token: firmar(u.rows[0]), usuario: u.rows[0] });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT u.id_usuario, u.nombre_completo, u.correo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = $1 AND u.activo`,
    [req.user.id]
  );
  if (!rows[0]) throw new HttpError(401, 'Usuario desactivado');
  res.json(rows[0]);
});

router.post('/cambiar-password', requireAuth, async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!nueva || nueva.length < 8) throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres');
  const { rowCount } = await query(
    `UPDATE usuarios SET password_hash = crypt($2, gen_salt('bf'))
      WHERE id_usuario = $1 AND password_hash = crypt($3, password_hash)`,
    [req.user.id, nueva, actual || '']
  );
  if (!rowCount) throw new HttpError(400, 'La contraseña actual no es correcta');
  res.json({ ok: true });
});

module.exports = router;
