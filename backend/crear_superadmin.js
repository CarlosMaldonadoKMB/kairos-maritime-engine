require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function forjarLlaveMaestra() {
  // 🔐 CONFIGURA AQUÍ TUS CREDENCIALES DEFINITIVAS:
  const SUPER_EMAIL = 'carlos.maldonado@kairosmb.org'; // Tu correo de fundador
  const SUPER_PASSWORD = 'KMEAdmin1603*';        // Pon una contraseña fuerte

  console.log('⚡ [HQ] Forjando la cuenta de Super Administrador...');

  try {
    // Hasheamos la contraseña de forma segura con bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(SUPER_PASSWORD, salt);

    // Insertamos directamente en la tabla de usuarios
    // tenant_id queda en NULL porque tú eres el dueño del SaaS global, no de una naviera específica
    const query = `
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ($1, $2, 'superadmin', NULL)
      RETURNING id, email, role;
    `;

    const result = await pool.query(query, [SUPER_EMAIL, hashedPassword]);
    
    console.log('\n🟩 ¡MISIÓN CUMPLIDA! Llave Maestra forjada con éxito.');
    console.log(`📧 Correo: ${result.rows[0].email}`);
    console.log(`👑 Rango:  ${result.rows[0].role}`);
    console.log('\nYa puedes borrar este archivo de tu computadora.');

  } catch (err) {
    if (err.code === '23505') {
      console.error('❌ Error: Ese correo ya está registrado en el sistema.');
    } else {
      console.error('❌ Error crítico en la sala de máquinas:', err.message);
    }
  } finally {
    pool.end();
  }
}

forjarLlaveMaestra();