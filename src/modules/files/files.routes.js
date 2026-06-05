const express = require('express');
const router = express.Router();
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, s3Bucket } = require('../../middleware/upload');

// Proxy de lectura para el bucket privado: GET /files/<key>
// Devuelve la imagen stream-eada desde S3 (sin exponer credenciales ni requerir bucket público).
router.get(/^\/(.+)$/, async (req, res) => {
  if (!s3Client) return res.status(404).send('Storage no disponible');
  const key = decodeURIComponent(req.params[0]);
  try {
    const out = await s3Client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key }));
    res.set('Content-Type', out.ContentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=86400');
    if (out.ContentLength) res.set('Content-Length', String(out.ContentLength));
    out.Body.pipe(res);
  } catch (err) {
    res.status(404).send('Archivo no encontrado');
  }
});

module.exports = router;
