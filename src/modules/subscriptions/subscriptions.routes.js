const express = require('express');
const router = express.Router();
const { getMySubscription, createCheckout, webhook } = require('./subscriptions.controller');
const { verifyToken, requireRole } = require('../../middleware/auth');

router.get('/me', verifyToken, requireRole('provider'), getMySubscription);
router.post('/checkout', verifyToken, requireRole('provider'), createCheckout);
router.post('/webhook', express.raw({ type: 'application/json' }), webhook);

module.exports = router;
