const express = require('express');
const router = express.Router();
const { getByProvider, getByDevice, upsert } = require('./reviews.controller');

router.get('/provider/:id',                 getByProvider);
router.get('/provider/:id/device/:deviceId', getByDevice);
router.post('/',                             upsert);       // público, usa deviceId

module.exports = router;
