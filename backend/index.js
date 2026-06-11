const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const cron = require('node-cron');
require('dotenv').config();
const { calculateStatus } = require('./motor');

// ==========================================
// NUEVAS HERRAMIENTAS: AWS S3 y Multer (Carga de archivos)
// ==========================================
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const notificacionesQueue = require('./queue');
require('./cron');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración del piloto automático hacia AWS S3
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// Multer actúa como la "grúa" que sostiene el archivo en la memoria temporal
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 1. CONFIGURACIÓN DE BASE DE DATOS (NUBE)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ==========================================
// 2. MIDDLEWARES (El Guardia de Seguridad)
// ==========================================
const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) return res.status(401).send('Acceso Denegado');
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) { 
    res.status(400).send('Token no válido'); 
  }
};

// ==========================================
// 3. RUTAS PÚBLICAS
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  const { email, password, role, tenant_id } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id, email',
      [email, hashedPassword, role, tenant_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
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

  res.json({ token });
});

// ==========================================
// 📱 RUTA DE LA APP MÓVIL (Recepción de Fotos)
// ==========================================
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    console.log('📸 Foto recibida desde el celular. Subiendo a AWS S3...');

    const fileName = `certificados/${Date.now()}-${req.file.originalname}`;
    
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    await s3.send(new PutObjectCommand(uploadParams));

    console.log('✅ Foto asegurada en S3:', fileName);

    res.json({ 
      success: true, 
      message: 'Archivo subido con éxito',
      url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`
    });

  } catch (error) {
    console.error('❌ Error crítico en la subida:', error);
    res.status(500).json({ error: 'Falla interna en el servidor' });
  }
});

// ==========================================
// 4. RUTAS PROTEGIDAS
// ==========================================
app.get('/api/vessels', verifyToken, async (req, res) => {
  try {
    console.log("🔍 DATOS DEL TOKEN LEYENDO EL RADAR:", req.user);

    let query = `
      SELECT v.*,
        COUNT(CASE WHEN c.status LIKE '%🟢%' THEN 1 END) as count_vigente,
        COUNT(CASE WHEN c.status LIKE '%🟡%' THEN 1 END) as count_peligro,
        COUNT(CASE WHEN c.status LIKE '%🔴%' THEN 1 END) as count_vencido,
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Acceso denegado. Solo administradores" });
  }

  const { email, password, role = 'capitan', assigned_vessel_id } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Falta email o password" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, tenant_id, assigned_vessel_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role, assigned_vessel_id',
      [email, hashedPassword, role, req.user.tenant_id, assigned_vessel_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505' && err.constraint && err.constraint.includes('users_email_key')) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }
    res.status(500).json({ error: err.message });
  }
});

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/certificates', verifyToken, upload.single('file'), async (req, res) => {
  const { vessel_id, type, expiry_date } = req.body;
  let s3FileName = null;

  try {
    const vesselCheck = await pool.query('SELECT id FROM vessels WHERE id = $1 AND tenant_id = $2', [vessel_id, req.user.tenant_id]);
    if (vesselCheck.rows.length === 0) return res.status(403).json({ error: "Acceso denegado" });

    if (req.file) {
      s3FileName = `certificados/${Date.now()}-${req.file.originalname}`;
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3FileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      });
      await s3.send(command); 
    }

    const status = calculateStatus(expiry_date);

    const result = await pool.query(
      'INSERT INTO certificates (vessel_id, type, expiry_date, image_url, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [vessel_id, type, expiry_date, s3FileName, status]
    );

    if (status.includes("🟡") || status.includes("🔴")) {
      await notificacionesQueue.add({
        email: req.user.email || 'gerente@naviera.com', 
        nave: vessel_id,
        mensaje: `El certificado tipo ${type} está en estado: ${status}`
      });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/certificates/:id/renew', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const certInfo = await pool.query(`
      SELECT c.type, v.name, v.registration_number 
      FROM certificates c 
      JOIN vessels v ON c.vessel_id = v.id 
      WHERE c.id = $1 AND v.tenant_id = $2
    `, [id, req.user.tenant_id]);

    if (certInfo.rows.length === 0) return res.status(403).json({ error: "No autorizado" });

    const info = certInfo.rows[0];
    const nuevoEstado = '🔵 EN TRÁMITE';
    
    await pool.query('UPDATE certificates SET status = $1 WHERE id = $2', [nuevoEstado, id]);

    await notificacionesQueue.add({
      email: 'inspecciones@directemar.cl', 
      nave: info.name,
      mensaje: `SOLICITUD DE INSPECCIÓN: El armador de la nave ${info.name} (Matrícula: ${info.registration_number}) solicita formalmente la renovación del certificado: ${info.type}. Por favor, indicar disponibilidad del inspector.`
    });

    res.json({ message: "Renovación en curso", status: nuevoEstado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/onboarding', async (req, res) => {
  const { naviera_name, admin_email, admin_password } = req.body;

  try {
    const tenantResult = await pool.query(
      'INSERT INTO tenants (name, contact_email) VALUES ($1, $2) RETURNING id',
      [naviera_name, admin_email]
    );
    
    const newTenantId = tenantResult.rows[0].id;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(admin_password, salt);

    await pool.query(
      'INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [newTenantId, admin_email, hashedPassword, 'admin']
    );

    res.status(201).json({ 
      message: `✅ Éxito: Naviera '${naviera_name}' operativa. Su gerente ya puede iniciar sesión con ${admin_email}.` 
    });
  } catch (err) {
    console.error("Error en Onboarding:", err);
    res.status(500).json({ error: "Fallo crítico al crear la infraestructura del cliente." });
  }
});

app.delete('/api/vessels/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM vessels WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, req.user.tenant_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Nave no encontrada o no autorizada" });
    }

    res.json({ message: "Nave eliminada con éxito" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. ENCENDIDO DEL MOTOR
// ==========================================

async function alinearTenant() {
  try {
    const nave = await pool.query("SELECT id, tenant_id FROM vessels WHERE name = 'Latitud 41' LIMIT 1");
    
    if (nave.rows.length > 0) {
      await pool.query(
        "UPDATE users SET tenant_id = $1 WHERE email = 'capitan@latitud41.cl'",
        [nave.rows[0].tenant_id]
      );
      console.log("✅ UNIVERSOS ALINEADOS: El Capitán ahora pertenece a la naviera correcta.");
    } else {
      console.log("⚠️ No se encontró la nave Latitud 41.");
    }
  } catch (err) {
    console.error("❌ Error alineando:", err.message);
  }
}

alinearTenant();

app.get('/api/test-email', async (req, res) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Acme <onboarding@resend.dev>',
      to: 'carlos.maldonado@kairosmb.org',
      subject: '⚓ Alerta de Flota: Kairos Maritime',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
          <h2 style="color: #1e3a8a;">Kairos Maritime - Reporte de Estado</h2>
          <p>Estimado Gerente,</p>
          <p>Esta es una alerta de prueba. El sistema de comunicaciones de su flota está <strong>100% operativo</strong>.</p>
        </div>
      `
    });

    if (error) {
      console.error('Error devuelto por Resend:', error);
      return res.status(400).json({ mensaje: 'El cartero falló', detalles: error });
    }

    res.json({ message: '¡Correo disparado con éxito y confirmado por Resend!', data });
  } catch (err) {
    console.error('Error crítico del servidor:', err);
    res.status(500).json({ mensaje: 'Fallo total en la sala de comunicaciones', error: err.message });
  }
});

// ==========================================
// ⏰ PILOTO AUTOMÁTICO INTELIGENTE (1 Correo x Certificado)
// ==========================================
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ [Radar Automático] Iniciando escaneo matutino...');
  
  try {
    const result = await pool.query(`
      SELECT 
        c.type AS cert_name, 
        c.expiry_date, 
        v.name AS vessel_name,
        u.email AS gerente_email
      FROM certificates c
      JOIN vessels v ON c.vessel_id = v.id
      JOIN users u ON v.tenant_id = u.tenant_id
      WHERE c.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
      AND u.role = 'admin'
    `);

    const expiringCerts = result.rows;

    if (expiringCerts.length === 0) {
      console.log('✅ [Cron] Flota en regla. No hay vencimientos.');
      return;
    }

    console.log(`⚠️ Se detectaron ${expiringCerts.length} certificados críticos. Disparando correos individuales...`);

    // EL BUCLE: Dispara un correo por cada documento encontrado
    for (const cert of expiringCerts) {
      const fechaFormat = new Date(cert.expiry_date).toLocaleDateString('es-CL');
      const esVencido = new Date(cert.expiry_date) < new Date();
      
      const colorTema = esVencido ? '#ef4444' : '#f59e0b'; // Rojo o Naranja
      const estadoTexto = esVencido ? '🔴 VENCIDO' : '🟡 POR VENCER';

      await resend.emails.send({
        from: 'Kairos Maritime <onboarding@resend.dev>', // Tu remitente
        to: cert.gerente_email, // Le llega al gerente de esa naviera específica
        subject: `⚠️ Alerta: ${cert.vessel_name} - ${cert.cert_name} ${estadoTexto}`,
        html: `
          <div style="font-family: Arial, sans-serif; border: 2px solid ${colorTema}; padding: 20px; border-radius: 8px;">
            <h2 style="color: ${colorTema};">Alerta Crítica de Cumplimiento</h2>
            <p>Estimado Gerente,</p>
            <p>El sistema automático ha detectado una irregularidad en su flota:</p>
            <ul>
              <li><b>Nave:</b> ${cert.vessel_name}</li>
              <li><b>Documento:</b> ${cert.cert_name}</li>
              <li><b>Estado:</b> <span style="color: ${colorTema}; font-weight: bold;">${estadoTexto}</span></li>
              <li><b>Fecha límite:</b> ${fechaFormat}</li>
            </ul>
            <p>Por favor, coordine la inspección para evitar la paralización de la nave.</p>
          </div>
        `
      });
      console.log(`✉️ Correo enviado: ${cert.vessel_name} - ${cert.cert_name}`);
    }

  } catch (err) {
    console.error('❌ [Cron] Falla crítica en el escaneo:', err);
  }
}, {
  scheduled: true,
  timezone: "America/Santiago"
});

// ==========================================
// 🚀 RUTA DEMO: DISPARADOR MANUAL DE CORREOS
// ==========================================
app.get('/api/trigger-demo', async (req, res) => {
  console.log('🚀 [DEMO] Forzando escaneo y envío de correos en vivo...');
  
  try {
    const result = await pool.query(`
      SELECT 
        c.type AS cert_name, 
        c.expiry_date, 
        v.name AS vessel_name,
        u.email AS gerente_email
      FROM certificates c
      JOIN vessels v ON c.vessel_id = v.id
      JOIN users u ON v.tenant_id = u.tenant_id
      WHERE c.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
      AND u.role = 'admin'
    `);

    const expiringCerts = result.rows;

    if (expiringCerts.length === 0) {
      return res.json({ mensaje: "Todo en regla. No hay certificados vencidos para alertar." });
    }

    for (const cert of expiringCerts) {
      const fechaFormat = new Date(cert.expiry_date).toLocaleDateString('es-CL');
      const esVencido = new Date(cert.expiry_date) < new Date();
      const colorTema = esVencido ? '#ef4444' : '#f59e0b'; 
      const estadoTexto = esVencido ? '🔴 VENCIDO' : '🟡 POR VENCER';

      await resend.emails.send({
        from: 'Kairos Maritime <onboarding@resend.dev>', 
        to: cert.gerente_email, 
        subject: `⚠️ Alerta: ${cert.vessel_name} - ${cert.cert_name} ${estadoTexto}`,
        html: `
          <div style="font-family: Arial, sans-serif; border: 2px solid ${colorTema}; padding: 20px; border-radius: 8px;">
            <h2 style="color: ${colorTema};">Alerta Crítica de Cumplimiento</h2>
            <p>Estimado Gerente,</p>
            <p>El sistema automático ha detectado una irregularidad en su flota:</p>
            <ul>
              <li><b>Nave:</b> ${cert.vessel_name}</li>
              <li><b>Documento:</b> ${cert.cert_name}</li>
              <li><b>Estado:</b> <span style="color: ${colorTema}; font-weight: bold;">${estadoTexto}</span></li>
              <li><b>Fecha límite:</b> ${fechaFormat}</li>
            </ul>
            <p>Por favor, coordine la inspección para evitar la paralización de la nave.</p>
          </div>
        `
      });
    }

    res.json({ 
      exito: true, 
      mensaje: `¡Bombardeo exitoso! Se enviaron ${expiringCerts.length} correos de alerta a la gerencia.` 
    });

  } catch (err) {
    console.error('❌ Error en el disparador manual:', err);
    res.status(500).json({ error: "Fallo al disparar los correos" });
  }
});

app.listen(3001, () => {
  console.log('🚀 Kairos Backend navegando en puerto 3001 (Conectado a AWS S3)');
});