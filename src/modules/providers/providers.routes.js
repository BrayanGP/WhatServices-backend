const express = require('express');
const router = express.Router();
const { list, getOne, create, update, updateAvailability, uploadPhotos } = require('./providers.controller');
const { verifyToken, requireRole } = require('../../middleware/auth');
const { upload } = require('../../middleware/upload');

router.get('/', list);
router.get('/:id', getOne);
router.post('/', verifyToken, requireRole('provider'), create);
router.put('/:id', verifyToken, requireRole('provider'), update);
router.patch('/:id/availability', verifyToken, requireRole('provider'), updateAvailability);
router.post('/:id/photos', verifyToken, requireRole('provider'), upload.array('photos', 5), uploadPhotos);

module.exports = router;
