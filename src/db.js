const { Pool } = require('pg');

// Fechas DATE como texto 'YYYY-MM-DD' (evita corrimientos de zona horaria)
const { types } = require('pg');
types.setTypeParser(1082, (v) => v);
// NUMERIC como número de JS (montos pequeños, sin riesgo de precisión)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT / COUNT

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: '-c search_path=farmastock,public -c timezone=America/La_Paz',
});

const query = (text, params) => pool.query(text, params);

// Ejecuta fn(client) dentro de una transacción
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
