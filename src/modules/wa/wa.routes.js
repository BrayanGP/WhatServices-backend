const express = require('express');
const router = express.Router();
const { go, qr, rate, rateQr } = require('./wa.controller');

// URLs publicas y fijas para las pancartas
router.get('/go', go);   // redirige al numero activo
router.get('/qr', qr);   // PNG del QR que codifica /wa/go

// QR personal de calificacion por empleado
router.get('/rate/:id', rate);       // redirige a WhatsApp para calificar
router.get('/rate/:id/qr', rateQr);  // PNG del QR personal del empleado

module.exports = router;
