const jwt = require('jsonwebtoken');
const { HttpError } = require('./errors');

const SECRET = process.env.JWT_SECRET || 'cambiar-este-secreto';
const DURACION = process.env.JWT_EXPIRES || '10h';

function firmar(usuario) {
  return jwt.sign(
    { id: usuario.id_usuario, rol: usuario.rol, nombre: usuario.nombre_completo },
    SECRET,
    { expiresIn: DURACION }
  );
}

// Exige un token válido en "Authorization: Bearer <token>"
function requireAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Inicie sesión para continuar'));
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    next(new HttpError(401, 'La sesión expiró, vuelva a iniciar sesión'));
  }
}

// Restringe por rol: requireRole('administrador', 'regente')
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return next(new HttpError(403, 'Su rol no tiene permiso para esta acción'));
    }
    next();
  };
}

module.exports = { firmar, requireAuth, requireRole };
