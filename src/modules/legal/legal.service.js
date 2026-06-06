// Servicio de documentos legales: genera los PDF, los sube al bucket de forma
// idempotente (reutilizando el cliente S3 del middleware de upload) y expone
// las URLs públicas para el endpoint GET /legal/docs.

const { PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, s3Bucket, storageMode } = require('../../middleware/upload');
const { S3_PUBLIC_URL, BACKEND_PUBLIC_URL, PORT } = require('../../config/env');
const { VERSION } = require('./legal.content');
const { buildTermsPdf, buildPrivacyPdf } = require('./legal.pdf');

// Definición de los dos documentos. La "key" es la ruta dentro del bucket.
const DOCS = {
  terms: {
    name: 'terms',
    key: `legal/terminos-y-condiciones-v${VERSION}.pdf`,
    filename: `terminos-y-condiciones-v${VERSION}.pdf`,
    build: buildTermsPdf,
  },
  privacy: {
    name: 'privacy',
    key: `legal/aviso-de-privacidad-v${VERSION}.pdf`,
    filename: `aviso-de-privacidad-v${VERSION}.pdf`,
    build: buildPrivacyPdf,
  },
};

// URL pública de un documento.
// - Si el bucket tiene URL pública (S3_PUBLIC_URL), se enlaza el objeto directo.
// - Si hay S3 pero sin URL pública, se sirve por el proxy del backend (/files/<key>).
// - Sin S3 (local/cloudinary), el backend lo genera y entrega en /legal/download/<name>.
function publicUrl(doc) {
  const base = (BACKEND_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  if (storageMode === 's3') {
    if (S3_PUBLIC_URL) return `${S3_PUBLIC_URL.replace(/\/$/, '')}/${doc.key}`;
    return `${base}/files/${doc.key}`;
  }
  return `${base}/legal/download/${doc.name}`;
}

function getLegalDocs() {
  return {
    terms: { url: publicUrl(DOCS.terms), version: VERSION },
    privacy: { url: publicUrl(DOCS.privacy), version: VERSION },
  };
}

async function existsInBucket(key) {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: s3Bucket, Key: key }));
    return true;
  } catch (_e) {
    return false; // 404 (u otro error) → tratamos como inexistente
  }
}

// Sube ambos PDF al bucket si aún no existen (idempotente). Devuelve las URLs.
async function ensureLegalDocs() {
  if (storageMode !== 's3' || !s3Client) {
    console.log('[legal] S3 no configurado; los PDF se sirven desde el backend (/legal/download/...)');
    return getLegalDocs();
  }
  for (const doc of Object.values(DOCS)) {
    try {
      if (await existsInBucket(doc.key)) {
        console.log(`[legal] ya existe en el bucket: ${doc.key}`);
        continue;
      }
      await s3Client.send(new PutObjectCommand({
        Bucket: s3Bucket,
        Key: doc.key,
        Body: doc.build(),
        ContentType: 'application/pdf',
        // Fuerza la DESCARGA del PDF al abrir el enlace.
        ContentDisposition: `attachment; filename="${doc.filename}"`,
        ACL: 'public-read',
        CacheControl: 'public, max-age=86400',
      }));
      console.log(`[legal] subido al bucket: ${doc.key}`);
    } catch (err) {
      console.error(`[legal] no se pudo subir ${doc.key}:`, err.message);
    }
  }
  return getLegalDocs();
}

module.exports = { DOCS, VERSION, getLegalDocs, ensureLegalDocs };
