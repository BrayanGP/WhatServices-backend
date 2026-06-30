const express = require('express');
const { register } = require('./clients.controller');

const router = express.Router();

router.post('/register', register);

module.exports = router;
