const Queue = require('bull');

// Detectamos la URL de Redis. Si estamos en Render, usará tu nueva variable REDIS_URL.
// Si no, usará la local para tus pruebas en casa.
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Configuramos la conexión con soporte para TLS (requerido por Upstash)
const notificacionesQueue = new Queue('notificaciones-vencimiento', redisUrl, {
  redis: {
    tls: redisUrl.startsWith('rediss://') ? {} : undefined
  }
});

// El "Trabajador Silencioso"
notificacionesQueue.process(async (job) => {
  console.log(`\n[⚙️ TRABAJADOR REDIS] Iniciando Tarea ID: ${job.id}`);
  console.log(`Destinatario: ${job.data.email}`);
  console.log(`Asunto: Alerta de Certificado para la nave ${job.data.nave}`);
  
  // AQUÍ ES DONDE ENTRARÁ RESEND MÁS TARDE
  // Por ahora, mantenemos la simulación de 3 segundos
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log(`[✅ TAREA COMPLETADA] Correo enviado exitosamente a ${job.data.email}\n`);
});

module.exports = notificacionesQueue;