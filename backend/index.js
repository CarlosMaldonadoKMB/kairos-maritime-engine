const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
// 1. CONFIGURACIÓN DE BASE DE DATOS
// ==========================================
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
  // Buscamos al usuario incluyendo su nave asignada
  const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (user.rows.length === 0) return res.status(401).send('Usuario no encontrado');

  const validPass = await bcrypt.compare(password, user.rows[0].password_hash);
  if (!validPass) return res.status(401).send('Contraseña incorrecta');

  // EL TOKEN AHORA LLEVA EL ROL Y LA NAVE ASIGNADA
  const token = jwt.sign({ 
    id: user.rows[0].id, 
    tenant_id: user.rows[0].tenant_id, 
    role: user.rows[0].role,
    assigned_vessel_id: user.rows[0].assigned_vessel_id // <--- LA LLAVE MAESTRA
  }, process.env.JWT_SECRET, { expiresIn: '24h' });

  res.json({ token });
});

// ==========================================
// 4. RUTAS PROTEGIDAS
// ==========================================
// OBTENER FLOTA CON RESUMEN DE SALUD (Semáforo incluido)
app.get('/api/vessels', verifyToken, async (req, res) => {
  try {
    // 🔍 MICROFONO OCULTO (RAYO X) PARA DEBUG
    console.log("🔍 DATOS DEL TOKEN LEYENDO EL RADAR:", req.user);

    // Base de la consulta
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

    // FILTRO TÁCTICO: Si es capitán, solo ve su nave asignada
    if (req.user.role === 'capitan' && req.user.assigned_vessel_id) {
      query += ` AND v.id = $2 `;
      params.push(req.user.assigned_vessel_id);
    }

    query += ` GROUP BY v.id ORDER BY v.name ASC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// REGISTRAR NUEVA NAVE (Astillero Digital)
app.post('/api/vessels', verifyToken, async (req, res) => {
  const { name, registration_number } = req.body;
  
  try {
    // Insertamos la nave vinculándola automáticamente al tenant_id del usuario
    const result = await pool.query(
      'INSERT INTO vessels (tenant_id, name, registration_number) VALUES ($1, $2, $3) RETURNING *',
      [req.user.tenant_id, name, registration_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// NUEVA RUTA: Crear Usuario de Tripulación (por el Admin)
// Debe insertarse justo aquí, debajo de las anteriores rutas protegidas:

app.post('/api/users', verifyToken, async (req, res) => {
  // Solo admins pueden crear usuarios
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Acceso denegado. Solo administradores" });
  }

  const { email, password, role = 'capitan', assigned_vessel_id } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Falta email o password" });
  }

  try {
    // Encriptar el password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar usuario con el mismo tenant_id del admin
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, tenant_id, assigned_vessel_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role, assigned_vessel_id',
      [email, hashedPassword, role, req.user.tenant_id, assigned_vessel_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Detección por unique_violation (correo ya existe)
    if (err.code === '23505' && err.constraint && err.constraint.includes('users_email_key')) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------

// OBTENER CERTIFICADOS CON PASES VIP DE AWS
app.get('/api/vessels/:id/certificates', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const vesselCheck = await pool.query('SELECT id FROM vessels WHERE id = $1 AND tenant_id = $2', [id, req.user.tenant_id]);
    if (vesselCheck.rows.length === 0) return res.status(403).json({ error: "Acceso denegado a esta nave" });

    const result = await pool.query('SELECT * FROM certificates WHERE vessel_id = $1 ORDER BY expiry_date ASC', [id]);

    // MAGIA DE AWS: Por cada certificado, generamos un enlace temporal de 5 minutos
    const certificadosConUrl = await Promise.all(result.rows.map(async (cert) => {
      if (cert.image_url) {
        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: cert.image_url, 
        });
        // 300 segundos = 5 minutos de validez
        cert.file_url = await getSignedUrl(s3, command, { expiresIn: 300 }); 
      }
      return cert;
    }));

    res.json(certificadosConUrl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SUBIR NUEVO CERTIFICADO (Con foto a AWS S3)
app.post('/api/certificates', verifyToken, upload.single('file'), async (req, res) => {
  const { vessel_id, type, expiry_date } = req.body;
  let s3FileName = null;

  try {
    // 1. Validar propiedad de la nave
    const vesselCheck = await pool.query('SELECT id FROM vessels WHERE id = $1 AND tenant_id = $2', [vessel_id, req.user.tenant_id]);
    if (vesselCheck.rows.length === 0) return res.status(403).json({ error: "Acceso denegado" });

    // 2. Si el usuario subió una foto, enviarla a AWS S3
    if (req.file) {
      // Creamos un nombre único usando la fecha actual para que no se sobreescriban
      s3FileName = `certificados/${Date.now()}-${req.file.originalname}`;
      
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3FileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      });
      await s3.send(command); // Despegue hacia la nube
    }

    // 3. Motor de Estados
    const status = calculateStatus(expiry_date);

    // 4. Guardar en PostgreSQL (Guardamos el nombre del archivo, no la foto)
    const result = await pool.query(
      'INSERT INTO certificates (vessel_id, type, expiry_date, image_url, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [vessel_id, type, expiry_date, s3FileName, status]
    );

    // 5. ENVIAR TAREA A LA COLA DE REDIS (Segundo plano)
    if (status.includes("🟡") || status.includes("🔴")) {
      await notificacionesQueue.add({
        email: req.user.email || 'gerente@naviera.com', // Tomamos el email del token
        nave: vessel_id,
        mensaje: `El certificado tipo ${type} está en estado: ${status}`
      });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SOLICITAR RENOVACIÓN A UN CLIC (Cambio a 🔵 EN TRÁMITE)
app.post('/api/certificates/:id/renew', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Obtenemos información del certificado y la nave para el correo
    const certInfo = await pool.query(`
      SELECT c.type, v.name, v.registration_number 
      FROM certificates c 
      JOIN vessels v ON c.vessel_id = v.id 
      WHERE c.id = $1 AND v.tenant_id = $2
    `, [id, req.user.tenant_id]);

    if (certInfo.rows.length === 0) return res.status(403).json({ error: "No autorizado" });

    const info = certInfo.rows[0];

    // 2. Actualizamos el estado en la base de datos a "En Trámite"
    const nuevoEstado = '🔵 EN TRÁMITE';
    await pool.query('UPDATE certificates SET status = $1 WHERE id = $2', [nuevoEstado, id]);

    // 3. Enviamos el trabajo de redacción de correo al Capataz (Redis)
    await notificacionesQueue.add({
      email: 'inspecciones@directemar.cl', // Simulación del correo de la autoridad
      nave: info.name,
      mensaje: `SOLICITUD DE INSPECCIÓN: El armador de la nave ${info.name} (Matrícula: ${info.registration_number}) solicita formalmente la renovación del certificado: ${info.type}. Por favor, indicar disponibilidad del inspector.`
    });

    res.json({ message: "Renovación en curso", status: nuevoEstado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👑 MODO DIOS: Panel de Onboarding (Crear nueva Naviera y su Gerente)
app.post('/api/onboarding', async (req, res) => {
  const { naviera_name, admin_email, admin_password } = req.body;

  try {
    // 1. Registramos la nueva empresa con su correo de contacto obligatorio
    const tenantResult = await pool.query(
      'INSERT INTO tenants (name, contact_email) VALUES ($1, $2) RETURNING id',
      [naviera_name, admin_email]
    );
    
    // AQUÍ ESTABA EL DETALLE: Guardamos el ID que nos devuelve PostgreSQL
    const newTenantId = tenantResult.rows[0].id;

    // 2. Encriptamos la contraseña por seguridad
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(admin_password, salt);

    // 3. Creamos al Gerente y le entregamos las llaves de ese Tenant (usando password_hash)
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

// ELIMINAR NAVE (Desguace)
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

// ⚡ SCRIPT DE REPARACIÓN: Alinear Naviera (Tenant)
async function alinearTenant() {
  try {
    // Buscamos la Latitud 41
    const nave = await pool.query("SELECT id, tenant_id FROM vessels WHERE name = 'Latitud 41' LIMIT 1");
    
    if (nave.rows.length > 0) {
      // Forzamos al capitán a pertenecer a la MISMA naviera de esa nave
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

app.listen(3001, () => {
  console.log('🚀 Kairos Backend navegando en puerto 3001 (Conectado a AWS S3)');
});