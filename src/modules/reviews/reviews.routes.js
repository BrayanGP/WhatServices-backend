const express = require('express');
const router = express.Router();
const { getByProvider, create } = require('./reviews.controller');
const { verifyToken, requireRole } = require('../../middleware/auth');

router.get('/provider/:id', getByProvider);
router.post('/', verifyToken, requireRole('client'), create);

module.exports = router;
