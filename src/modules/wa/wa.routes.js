const express = require('express');
const router = express.Router();
const { go, qr } = require('./wa.controller');

// URLs publicas y fijas para las pancartas
router.get('/go', go);   // redirige al numero activo
router.get('/qr', qr);   // PNG del QR que codifica /wa/go

module.exports = router;
