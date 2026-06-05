const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = require('../config/env');

const useCloudinary = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

let storage;
let cloudinary = null;

if (useCloudinary) {
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
  console.log('[upload] Modo: Cloudinary');
} else {
  // Almacenamiento local — carpeta uploads/ en la raíz del proyecto
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
  console.log('[upload] Modo: disco local (configura Cloudinary en .env para producción)');
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (jpg, png, webp)'));
  },
});

const { BACKEND_PUBLIC_URL, PORT } = require('../config/env');
// URL pública de un archivo subido (Cloudinary o disco local)
const fileUrl = (file) => {
  if (useCloudinary) return { url: file.path, publicId: file.filename };
  const base = BACKEND_PUBLIC_URL || `http://localhost:${PORT}`;
  return { url: `${base}/uploads/${file.filename}`, publicId: file.filename };
};

module.exports = { upload, cloudinary, useCloudinary, fileUrl };
