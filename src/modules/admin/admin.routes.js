const express = require('express');
const router = express.Router();
const {
  getProviders, toggleVerify, toggleBlockProvider,
  getUsers, toggleBlockUser,
  getCategories, createCategory, updateCategory,
  getConversations, getConversation, toggleTakeover, replyConversation,
  listInstances, createInstance, connectInstance, instanceState,
  logoutInstance, deleteInstance, setActiveInstance,
  getBotConfig, updateBotConfig,
  getStats,
  getRequests, getRequest, updateRequest,
} = require('./admin.controller');
const { verifyToken, requireRole } = require('../../middleware/auth');

router.use(verifyToken, requireRole('admin'));

router.get('/providers', getProviders);
router.patch('/providers/:id/verify', toggleVerify);
router.patch('/providers/:id/block', toggleBlockProvider);
router.get('/users', getUsers);
router.patch('/users/:id/block', toggleBlockUser);
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);

router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.patch('/conversations/:id/takeover', toggleTakeover);
router.post('/conversations/:id/reply', replyConversation);

// WhatsApp / instancias
router.get('/wa/instances', listInstances);
router.post('/wa/instances', createInstance);
router.get('/wa/instances/:name/connect', connectInstance);
router.get('/wa/instances/:name/state', instanceState);
router.delete('/wa/instances/:name/logout', logoutInstance);
router.delete('/wa/instances/:name', deleteInstance);
router.put('/wa/active', setActiveInstance);

// Solicitudes
router.get('/requests', getRequests);
router.get('/requests/:id', getRequest);
router.patch('/requests/:id', updateRequest);

// Dashboard
router.get('/stats', getStats);

// Configuracion del bot
router.get('/bot-config', getBotConfig);
router.put('/bot-config', updateBotConfig);

module.exports = router;
