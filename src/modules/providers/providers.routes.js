const express = require('express');
const router = express.Router();
const { register, getMine, list, getOne, create, update, updateAvailability, uploadPhotos, uploadProfilePhoto, profileQr } = require('./providers.controller');
const { verifyToken, requireRole } = require('../../middleware/auth');
const { upload, withFolder } = require('../../middleware/upload');

router.post('/register', register);
router.get('/', list);
router.get('/me', verifyToken, requireRole('provider'), getMine);
router.get('/:id', getOne);
router.post('/', verifyToken, requireRole('provider'), create);
router.put('/:id', verifyToken, requireRole('provider'), update);
router.patch('/:id/availability', verifyToken, requireRole('provider'), updateAvailability);
router.post('/:id/photos', verifyToken, requireRole('provider'),
  withFolder((req) => `proveedores/${req.params.id}/trabajos`), upload.array('photos', 5), uploadPhotos);
router.post('/:id/profile-photo', verifyToken, requireRole('provider'),
  withFolder((req) => `proveedores/${req.params.id}/perfil`), upload.single('photo'), uploadProfilePhoto);
// Público: QR PNG que apunta al perfil del proveedor en el cliente web
router.get('/:id/profile-qr', profileQr);

module.exports = router;
