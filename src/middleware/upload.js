const path = require('path');
const fs = require('fs');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const {
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
  S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_REGION, S3_PUBLIC_URL,
  BACKEND_PUBLIC_URL, PORT,
} = require('../config/env');

let storage;
let cloudinary = null;
let storageMode = 'local';

if (S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY && S3_BUCKET_NAME) {
  // --- Modo S3-compatible (Tigris / Railway / AWS) ---
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION || 'auto',
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
  });

  storage = multerS3({
    s3,
    bucket: S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const folder = (req.uploadFolder || 'otros').replace(/^\/+|\/+$/g, '');
      cb(null, `${folder}/${unique}`);
    },
  });
  storageMode = 's3';
  console.log('[upload] Modo: S3-compatible →', S3_ENDPOINT);

} else if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  // --- Modo Cloudinary (legacy) ---
  const { CloudinaryStorage } = require('multer-storage-cloudinary');
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  storage = new CloudinaryStorage({
    cloudinary,
    params: (req, _file) => ({
      folder: (req.uploadFolder || 'otros'),
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 1200, crop: 'limit' }],
    }),
  });
  storageMode = 'cloudinary';
  console.log('[upload] Modo: Cloudinary');

} else {
  // --- Modo disco local (desarrollo sin credenciales) ---
  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      const folder = (req.uploadFolder || 'otros').replace(/^\/+|\/+$/g, '');
      const dir = path.join(uploadsDir, folder);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, unique);
    },
  });
  storageMode = 'local';
  console.log('[upload] Modo: disco local (configura S3 o Cloudinary en .env para producción)');
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/jpeg|jpg|png|webp/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (jpg, png, webp)'));
  },
});

const useCloudinary = storageMode === 'cloudinary';

// Middleware: define la carpeta destino antes de subir.
// Uso: withFolder((req) => `proveedores/${req.params.id}/trabajos`)
const withFolder = (fn) => (req, res, next) => {
  try { req.uploadFolder = fn(req); } catch { req.uploadFolder = 'otros'; }
  next();
};

// URL pública de un archivo subido, según el modo de almacenamiento
const uploadsRoot = path.join(__dirname, '../../uploads');
const fileUrl = (file) => {
  if (storageMode === 's3') {
    const url = file.location || (S3_PUBLIC_URL ? `${S3_PUBLIC_URL.replace(/\/$/, '')}/${file.key}` : file.key);
    return { url, publicId: file.key };
  }
  if (storageMode === 'cloudinary') {
    return { url: file.path, publicId: file.filename };
  }
  // local: reflejar subcarpeta en la URL
  const base = BACKEND_PUBLIC_URL || `http://localhost:${PORT}`;
  const rel = file.destination ? path.relative(uploadsRoot, file.destination).replace(/\\/g, '/') : '';
  const sub = rel ? `${rel}/` : '';
  return { url: `${base}/uploads/${sub}${file.filename}`, publicId: `${sub}${file.filename}` };
};

module.exports = { upload, cloudinary, storageMode, useCloudinary, fileUrl, withFolder };
