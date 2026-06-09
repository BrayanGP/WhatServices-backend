const express = require('express');
const router = express.Router();
const { ingest } = require('./analytics.controller');

// Ingesta pública de eventos (protegida por API key del front vía middleware global).
router.post('/', ingest);

module.exports = router;
