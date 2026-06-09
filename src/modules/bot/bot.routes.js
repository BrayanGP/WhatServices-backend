const express = require('express');
const router = express.Router();
const { verifyWebhook, handleIncoming, verifyMeta, handleMeta } = require('./bot.controller');

// Webhook Evolution (legacy)
router.get('/webhook', verifyWebhook);
router.post('/webhook', handleIncoming);

// Webhook WhatsApp Cloud API (Meta)
router.get('/meta/webhook', verifyMeta);
router.post('/meta/webhook', handleMeta);

module.exports = router;
