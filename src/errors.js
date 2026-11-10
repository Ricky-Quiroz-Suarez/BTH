class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Traduce errores de PostgreSQL a mensajes entendibles
function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
  }
  switch (err.code) {
    case 'P0001': // RAISE EXCEPTION de nuestras funciones
      return res.status(400).json({ error: err.message });
    case '23505':
      return res.status(409).json({ error: 'Ya existe un registro con ese valor (' + (err.constraint || 'duplicado') + ')' });
    case '23503':
      return res.status(409).json({ error: 'El registro está relacionado con otros datos y no se puede eliminar o no existe la referencia' });
    case '23514':
      return res.status(400).json({ error: traducirCheck(err.constraint) });
    case '23502':
      return res.status(400).json({ error: 'Falta el campo obligatorio: ' + err.column });
    case '22P02':
    case '22007':
    case '22008':
      return res.status(400).json({ error: 'Formato de dato no válido' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}

function traducirCheck(c = '') {
  if (c.includes('cantidad_actual')) return 'Stock insuficiente en el lote';
  if (c.includes('controlado_receta')) return 'Un medicamento controlado siempre requiere receta';
  if (c.includes('correo')) return 'El correo no tiene un formato válido';
  if (c.includes('promo_fechas')) return 'La fecha de fin debe ser posterior a la de inicio';
  return 'Valor fuera de rango (' + c + ')';
}

module.exports = { HttpError, errorHandler };
