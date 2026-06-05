const path = require('path');
const fs = require('fs');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const {
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
  S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_REGION,
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
    key: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      // Carpeta dedicada dentro del bucket
      cb(null, `whatservices/providers/${unique}`);
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
    params: {
      folder: 'whatservices/providers',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 1200, crop: 'limit' }],
    },
  });
  storageMode = 'cloudinary';
  console.log('[upload] Modo: Cloudinary');

} else {
  // --- Modo disco local (desarrollo sin credenciales) ---
  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
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

module.exports = { upload, cloudinary, storageMode };
