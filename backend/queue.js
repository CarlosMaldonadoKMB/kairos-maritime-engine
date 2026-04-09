const Queue = require('bull');

// Conectamos a nuestro contenedor Redis que dejamos corriendo en la Fase 1
const notificacionesQueue = new Queue('notificaciones-vencimiento', 'redis://127.0.0.1:6379');

// El "Trabajador Silencioso"
// Este código se ejecuta en segundo plano SIN congelar la web
notificacionesQueue.process(async (job) => {
  console.log(`\n[⚙️ TRABAJADOR REDIS] Iniciando Tarea ID: ${job.id}`);
  console.log(`Destinatario: ${job.data.email}`);
  console.log(`Asunto: Alerta de Certificado para la nave ${job.data.nave}`);
  
  // Simulamos el tiempo que tarda un servidor de correo real en enviar un email (3 segundos)
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log(`[✅ TAREA COMPLETADA] Correo enviado exitosamente a ${job.data.email}\n`);
});

module.exports = notificacionesQueue;