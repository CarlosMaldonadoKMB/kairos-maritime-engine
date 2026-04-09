const cron = require('node-cron');
const { Pool } = require('pg');
require('dotenv').config();
const notificacionesQueue = require('./queue');
const { calculateStatus } = require('./motor');

// Conexión independiente a la Base de Datos para el Vigía
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Programamos la tarea: '0 8 * * *' significa todos los días a las 08:00 AM
cron.schedule('0 8 * * *', async () => {
  console.log('\n🌅 [CRON] Iniciando el escaneo de la flota (Radar Nocturno)...');
  
  try {
    // 1. Obtenemos TODOS los certificados y el nombre de su nave respectiva
    const result = await pool.query(`
      SELECT c.id, c.type, c.expiry_date, c.status AS current_status, v.name AS vessel_name 
      FROM certificates c
      JOIN vessels v ON c.vessel_id = v.id
    `);

    let alertasGeneradas = 0;

    for (let cert of result.rows) {
      // 2. Usamos tu Motor Lógico para ver si el tiempo empeoró el documento
      const nuevoEstado = calculateStatus(cert.expiry_date);

      // 3. Si el estado cambió (ej. ayer era 🟢 y hoy amaneció 🟡)
      if (nuevoEstado !== cert.current_status) {
        
        // Actualizamos la base de datos con el nuevo color
        await pool.query('UPDATE certificates SET status = $1 WHERE id = $2', [nuevoEstado, cert.id]);
        
        // Si el nuevo estado es de peligro, enviamos al Capataz (Redis)
        if (nuevoEstado.includes("🟡") || nuevoEstado.includes("🔴")) {
          await notificacionesQueue.add({
            email: 'gerente@naviera.com', // En el futuro lo sacaremos de la tabla de usuarios
            nave: cert.vessel_name,
            mensaje: `El certificado '${cert.type}' ha cambiado a estado: ${nuevoEstado}`
          });
          console.log(`🚨 Alerta encolada para nave: ${cert.vessel_name} (Cert: ${cert.type})`);
          alertasGeneradas++;
        }
      }
    }
    
    console.log(`✅ [CRON] Escaneo finalizado. Alertas nuevas despachadas: ${alertasGeneradas}\n`);
  } catch (error) {
    console.error('❌ [CRON] Error durante el escaneo:', error.message);
  }
});

console.log('⏰ Vigía Nocturno (Cron) configurado y en espera de las 08:00 AM...');