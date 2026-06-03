const express = require('express');
const router = express.Router();
const { verifyWebhook, handleIncoming } = require('./bot.controller');

router.get('/webhook', verifyWebhook);
router.post('/webhook', handleIncoming);

module.exports = router;
