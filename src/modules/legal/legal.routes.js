const express = require('express');
const router = express.Router();
const { DOCS, getLegalDocs } = require('./legal.service');

// GET /legal/docs → URLs públicas y versión de cada documento legal.
router.get('/docs', (_req, res) => {
  res.json(getLegalDocs());
});

// GET /legal/download/:doc → genera y entrega el PDF como descarga.
// Sirve de respaldo cuando el bucket no está configurado o no es público.
router.get('/download/:doc', (req, res) => {
  const doc = DOCS[req.params.doc];
  if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
  const pdf = doc.build();
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${doc.filename}"`);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(pdf);
});

module.exports = router;
