require('dotenv').config();
const path = require('path');
const express = require('express');
const { requireAuth } = require('./auth');
const { errorHandler } = require('./errors');
const { query } = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));

// API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/publico', require('./routes/publico'));
app.use('/api', requireAuth, require('./routes/catalogo'));
app.use('/api/compras', requireAuth, require('./routes/compras'));
app.use('/api/ventas', requireAuth, require('./routes/ventas'));
app.use('/api', requireAuth, require('./routes/inventario'));
app.use('/api', requireAuth, require('./routes/admin'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(errorHandler);

// Interfaz web
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/catalogo', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'catalogo.html')));

// Marca lotes vencidos al iniciar y luego cada 6 horas
async function marcarVencidos() {
  try {
    const { rows } = await query('SELECT fn_marcar_vencidos() AS n');
    if (rows[0].n) console.log(`Lotes marcados como vencidos: ${rows[0].n}`);
  } catch (e) {
    console.error('No se pudo marcar vencidos:', e.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FarmaStock en http://localhost:${PORT}`);
  marcarVencidos();
  setInterval(marcarVencidos, 6 * 60 * 60 * 1000);
});
