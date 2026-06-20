const express = require('express');
const router = express.Router();
const { getByProvider, getByDevice, upsert } = require('./reviews.controller');
const { upload, withFolder } = require('../../middleware/upload');

router.get('/provider/:id',                 getByProvider);
router.get('/provider/:id/device/:deviceId', getByDevice);
// Público (usa deviceId). Acepta hasta 4 fotos en el campo "photos".
router.post('/',
  withFolder((req) => `resenas/${req.body.providerId || 'otros'}`),
  upload.array('photos', 4),
  upsert);

module.exports = router;
