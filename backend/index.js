const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const cron = require('node-cron');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

require('dotenv').config();
const { calculateStatus } = require('./motor');
const notificacionesQueue = require('./queue');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 🛰️ CONFIGURACIÓN DE PROVEEDORES (NUBE)
// ==========================================
const resend = new Resend(process.env.RESEND_API_KEY);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const upload = multer({ storage: multer.memoryStorage() });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Dominios globales centralizados para evitar errores de tipeo
const EMAIL_REMITENTE = 'Kairos Engine <alertas@kairosmb.org>';

// ==========================================
// 🛡️ MIDDLEWARES (Filtros de Seguridad)
// ==========================================
const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) return res.status(401).send('Acceso Denegado. Token faltante.');
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) { 
    res.status(400).send('Token no válido o expirado.'); 
  }
};

// Renombramos a verifyAdminOrHigher para que sea más descriptivo
const verifyAdminOrHigher = (req, res, next) => {
  // Permitimos si el rol es superadmin O si es el admin de una naviera
  if (req.user.role === 'superadmin' || req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ error: 'Acceso restringido. Requiere rango de Administrador.' });
  }
};

// ==========================================
// 🔐 SISTEMA DE AUTENTICACIÓN (PÚBLICO)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) return res.status(401).send('Usuario no encontrado');

    const validPass = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!validPass) return res.status(401).send('Contraseña incorrecta');

    const token = jwt.sign({ 
      id: user.rows[0].id, 
      tenant_id: user.rows[0].tenant_id, 
      role: user.rows[0].role,
      assigned_vessel_id: user.rows[0].assigned_vessel_id
    }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({ token, role: user.rows[0].role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 👑 PANEL SUPER ADMINISTRADOR (EXCLUSIVO)
// ==========================================
// Esta ruta automatiza el despliegue de nuevos clientes desde la web
app.post('/api/superadmin/create-tenant', async (req, res) => {
  const { naviera_name, admin_email, admin_password } = req.body;

  if (!naviera_name || !admin_email || !admin_password) {
    return res.status(400).json({ error: 'Faltan campos críticos para crear la naviera.' });
  }

  try {
    // 1. Insertar la empresa (Tenant)
    const tenantResult = await pool.query(
      'INSERT INTO tenants (name, contact_email) VALUES ($1, $2) RETURNING id',
      [naviera_name, admin_email]
    );
    const newTenantId = tenantResult.rows[0].id;

    // 2. Hashear contraseña e insertar al Gerente (Admin)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(admin_password, salt);

    await pool.query(
      'INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [newTenantId, admin_email, hashedPassword, 'admin']
    );

    res.status(201).json({ 
      success: true,
      message: `Naviera '${naviera_name}' desplegada. Gerente habilitado: ${admin_email}` 
    });
  } catch (err) {
    console.error("Error en Despliegue de Tenant:", err);
    res.status(500).json({ error: "Fallo crítico en la base de datos al crear cliente." });
  }
});

// Antes: app.post('/api/capitanes', verifyToken, verifySuperAdmin, ...
// Ahora:
app.post('/api/capitanes', verifyToken, verifyAdminOrHigher, async (req, res) => {
  const { email, password, tenant_id, assigned_vessel_id } = req.body;

  // SEGURIDAD EXTRA: Evitar que un admin cree capitanes para OTRA naviera
  // Si el usuario es 'admin', forzamos a que el tenant_id sea el suyo propio
  const targetTenantId = req.user.role === 'admin' ? req.user.tenant_id : tenant_id;

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO users (tenant_id, email, password_hash, role, assigned_vessel_id) VALUES ($1, $2, $3, $4, $5)',
      [targetTenantId, email, hashedPassword, 'capitan', assigned_vessel_id]
    );

    res.status(201).json({ success: true, message: "Capitán creado exitosamente." });
  } catch (err) {
    console.error("Error al crear capitán:", err);
    res.status(500).json({ error: "No se pudo registrar el capitán." });
  }
});

// ==========================================
// 🚢 OPERACIONES DE LA FLOTA (PROTEGIDAS MULTI-TENANT)
// ==========================================
// ==========================================
// 🚢 OPERACIONES DE LA FLOTA (PROTEGIDAS MULTI-TENANT)
// ==========================================
app.get('/api/vessels', verifyToken, async (req, res) => {
  try {
    // 🧠 MOTOR SQL DE TIEMPO REAL: Ahora cuenta basado en la FECHA, no en el texto guardado (salvo para Trámite)
    let query = `
      SELECT v.*,
        COUNT(CASE WHEN c.status NOT LIKE '%🔵%' AND c.expiry_date > CURRENT_DATE + INTERVAL '30 days' THEN 1 END) as count_vigente,
        COUNT(CASE WHEN c.status NOT LIKE '%🔵%' AND c.expiry_date >= CURRENT_DATE AND c.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 1 END) as count_peligro,
        COUNT(CASE WHEN c.status NOT LIKE '%🔵%' AND c.expiry_date < CURRENT_DATE THEN 1 END) as count_vencido,
        COUNT(CASE WHEN c.status LIKE '%🔵%' THEN 1 END) as count_tramite,
        COUNT(c.id) as total_certs
      FROM vessels v
      LEFT JOIN certificates c ON v.id = c.vessel_id
      WHERE v.tenant_id = $1
    `;
    const params = [req.user.tenant_id];

    if (req.user.role === 'capitan' && req.user.assigned_vessel_id) {
      query += ` AND v.id = $2 `;
      params.push(req.user.assigned_vessel_id);
    }

    query += ` GROUP BY v.id ORDER BY v.name ASC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vessels', verifyToken, async (req, res) => {
  const { name, registration_number } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO vessels (tenant_id, name, registration_number) VALUES ($1, $2, $3) RETURNING *',
      [req.user.tenant_id, name, registration_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/vessels/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM vessels WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, req.user.tenant_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Nave no encontrada o no autorizada" });
    res.json({ message: "Nave eliminada con éxito" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 📜 CONTROL DE CERTIFICADOS (AWS S3 INTEGRADO)
// ==========================================
app.get('/api/vessels/:id/certificates', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const vesselCheck = await pool.query('SELECT id FROM vessels WHERE id = $1 AND tenant_id = $2', [id, req.user.tenant_id]);
    if (vesselCheck.rows.length === 0) return res.status(403).json({ error: "Acceso denegado a esta nave" });

    const result = await pool.query('SELECT * FROM certificates WHERE vessel_id = $1 ORDER BY expiry_date ASC', [id]);

    const certificadosConUrl = await Promise.all(result.rows.map(async (cert) => {
      if (cert.image_url) {
        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: cert.image_url, 
        });
        cert.file_url = await getSignedUrl(s3, command, { expiresIn: 300 }); 
      }
      return cert;
    }));

    res.json(certificadosConUrl);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/certificates', verifyToken, upload.single('file'), async (req, res) => {
  const { vessel_id, type, expiry_date } = req.body;
  let s3FileName = null;

  try {
    // 1. Monitor de entrada: Imprimirá en Render lo que está recibiendo
    console.log(`📥 Procesando certificado [${type}] para la nave ID: ${vessel_id}`);

    const vesselCheck = await pool.query('SELECT id FROM vessels WHERE id = $1 AND tenant_id = $2', [vessel_id, req.user.tenant_id]);
    if (vesselCheck.rows.length === 0) return res.status(403).json({ error: "Acceso denegado a esta nave" });

    // 2. AWS S3 (Si el capitán manda foto desde el móvil)
    if (req.file) {
      s3FileName = `certificados/${Date.now()}-${req.file.originalname}`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3FileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })); 
    }

    // 3. Calculamos semáforo y guardamos en Neon
    const status = calculateStatus(expiry_date);
    const result = await pool.query(
      'INSERT INTO certificates (vessel_id, type, expiry_date, image_url, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [vessel_id, type, expiry_date, s3FileName, status]
    );

    // 4. Redis (Intentamos enviar a la cola, pero si falla NO rompemos la app)
    try {
      if (status.includes("🟡") || status.includes("🔴")) {
        await notificacionesQueue.add({
          email: req.user.email || 'gerente@naviera.com', 
          nave: vessel_id,
          mensaje: `El certificado tipo ${type} está en estado: ${status}`
        });
      }
    } catch (queueErr) {
      console.log("⚠️ Advertencia: El sistema de colas (Redis) no está activo, pero el certificado se guardó.");
    }

    console.log("✅ Certificado guardado con éxito:", result.rows[0]);
    res.status(201).json(result.rows[0]);
    
  } catch (err) { 
    // 🚨 El megáfono: Ahora Render SÍ nos gritará cuál es el error exacto
    console.error("❌ ERROR CRÍTICO AL GUARDAR CERTIFICADO:", err);
    res.status(500).json({ error: err.message }); 
  }
});

// ==========================================
// 📱 RECEPCIÓN DESDE APP MÓVIL (CAPITANES)
// ==========================================
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const fileName = `certificados/${Date.now()}-${req.file.originalname}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    res.json({ 
      success: true, 
      url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Falla interna en la carga hacia AWS S3' });
  }
});

// ==========================================
// ⏰ PILOTO AUTOMÁTICO INTEGRADO (BI-SEMANAL)
// ==========================================
// Configurado quirúrgicamente para ejecutarse Lunes (1) y Jueves (4) a las 08:00 AM hora de Chile
cron.schedule('0 8 * * 1,4', async () => {
  console.log('🤖 [Radar Automático] Iniciando escaneo bi-semanal de cumplimiento marítimo...');
  try {
    const result = await pool.query(`
      SELECT c.type AS cert_name, c.expiry_date, v.name AS vessel_name, u.email AS gerente_email
      FROM certificates c
      JOIN vessels v ON c.vessel_id = v.id
      JOIN users u ON v.tenant_id = u.tenant_id
      WHERE c.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND u.role = 'admin'
    `);

    if (result.rows.length === 0) return console.log('✅ [Cron] Flota al día. No hay alertas.');

    for (const cert of result.rows) {
      const fechaFormat = new Date(cert.expiry_date).toLocaleDateString('es-CL');
      const esVencido = new Date(cert.expiry_date) < new Date();
      const colorTema = esVencido ? '#ef4444' : '#f59e0b'; 
      const estadoTexto = esVencido ? '🔴 VENCIDO' : '🟡 POR VENCER';

      await resend.emails.send({
        from: EMAIL_REMITENTE,
        to: cert.gerente_email,
        subject: `⚠️ Alerta de Control: ${cert.vessel_name} - ${cert.cert_name} ${estadoTexto}`,
        html: `<div style="font-family: Arial, sans-serif; border: 2px solid ${colorTema}; padding: 20px; border-radius: 8px;">
                 <h2 style="color: ${colorTema};">Alerta Crítica de Cumplimiento</h2>
                 <p>Estimado Gerente, se ha detectado el siguiente estado crítico en su flota:</p>
                 <ul>
                   <li><b>Nave:</b> ${cert.vessel_name}</li>
                   <li><b>Documento:</b> ${cert.cert_name}</li>
                   <li><b>Estado:</b> <span style="color: ${colorTema}; font-weight: bold;">${estadoTexto}</span></li>
                   <li><b>Vence el:</b> ${fechaFormat}</li>
                 </ul>
               </div>`
      });
    }
  } catch (err) { console.error('❌ Error en ejecución del Cron automático:', err); }
}, { scheduled: true, timezone: "America/Santiago" });

// ==========================================
// 🚀 ENLACES DE DIAGNÓSTICO Y CONTROL MANUAL
// ==========================================
app.get('/api/trigger-demo', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.type AS cert_name, c.expiry_date, v.name AS vessel_name, u.email AS gerente_email
      FROM certificates c
      JOIN vessels v ON c.vessel_id = v.id
      JOIN users u ON v.tenant_id = u.tenant_id
      WHERE c.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND u.role = 'admin'
    `);

    if (result.rows.length === 0) return res.json({ mensaje: "Todo en regla. No hay vencimientos." });

    for (const cert of result.rows) {
      const fechaFormat = new Date(cert.expiry_date).toLocaleDateString('es-CL');
      const esVencido = new Date(cert.expiry_date) < new Date();
      const colorTema = esVencido ? '#ef4444' : '#f59e0b'; 

      await resend.emails.send({
        from: EMAIL_REMITENTE,
        to: cert.gerente_email,
        subject: `⚠️ Modo Demo: Alerta de Flota ${cert.vessel_name}`,
        html: `<p>Aviso manual forzado para la nave: <b>${cert.vessel_name}</b> (${cert.cert_name}) - Vence: ${fechaFormat}</p>`
      });
    }
    res.json({ exito: true, mensaje: `Correos despachados usando dominio verificado.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// ⚡ INICIALIZACIÓN DEL SERVIDOR
// ==========================================
app.listen(3001, () => {
  console.log('🚀 Kairos Backend navegando firmemente en el puerto 3001...');
});