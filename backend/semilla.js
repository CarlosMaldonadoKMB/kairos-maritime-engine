require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Conexión a Neon usando la URL de tu .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function plantarSemilla() {
  try {
    console.log("Iniciando inyección de datos en Neon...");

    // 1. Crear la Naviera
    const navieraRes = await pool.query(
      `INSERT INTO tenants (name, contact_email) VALUES ('Naviera Mora B2B', 'contacto@mora.cl') RETURNING id`
    );
    const tenantId = navieraRes.rows[0].id;

    // 2. Encriptar contraseña y crear Usuario Gerente
    const passwordHash = await bcrypt.hash('123456', 10);
    await pool.query(
      `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, 'admin@mora.cl', $2, 'gerente')`,
      [tenantId, passwordHash]
    );

    // 3. Crear una Nave de prueba
    await pool.query(
      `INSERT INTO vessels (tenant_id, name, registration_number) VALUES ($1, 'Latitud 41', 'LOG-0001')`,
      [tenantId]
    );

    console.log("✅ ¡Éxito! Naviera Mora B2B y cuenta admin@mora.cl (clave: 123456) creadas en la nube.");
  } catch (error) {
    console.error("❌ Error en la maniobra:", error);
  } finally {
    pool.end();
  }
}

plantarSemilla();