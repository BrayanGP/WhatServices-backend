const express = require('express');
const router = express.Router();
const { go, qr, qrUnete, rate, rateQr, choose } = require('./wa.controller');

// URLs publicas y fijas para las pancartas
router.get('/go', go);          // redirige al numero activo
router.get('/qr', qr);          // PNG del QR de conversacion (codifica /wa/go)
router.get('/qr-unete', qrUnete); // PNG del QR de registro de empleados

// QR personal de calificacion por empleado
router.get('/rate/:id', rate);       // redirige a WhatsApp para calificar
router.get('/rate/:id/qr', rateQr);  // PNG del QR personal del empleado

// El cliente elige un proveedor del catalogo -> registra y redirige
router.get('/choose/:requestId/:providerId', choose);

module.exports = router;
