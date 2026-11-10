// Crea las tablas de FarmaStock en la base indicada en DATABASE_URL (.env)
//   npm run db:init          -> esquema + datos de ejemplo
//   npm run db:init:limpia   -> solo esquema + un usuario administrador
// ATENCIÓN: borra y vuelve a crear el esquema "farmastock" (se pierden los datos).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const conEjemplos = !process.argv.includes('--limpia');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const leer = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8');
  try {
    console.log('Creando esquema…');
    await c.query(leer('01_esquema.sql'));
    if (conEjemplos) {
      console.log('Cargando datos de ejemplo…');
      await c.query(leer('02_datos_ejemplo.sql'));
      console.log('Listo. Usuarios: admin@vitalclin.bo, shirley@vitalclin.bo, ventas@vitalclin.bo (contraseña VitalClin2026)');
    } else {
      const correo = process.env.ADMIN_CORREO || 'admin@vitalclin.bo';
      const clave = process.env.ADMIN_PASSWORD || 'VitalClin2026';
      await c.query('SET search_path TO farmastock, public');
      await c.query("SELECT fn_crear_usuario('Administrador', $1, $2, 'administrador')", [correo, clave]);
      console.log(`Listo. Ingrese con ${correo} y cambie la contraseña en Ajustes.`);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
