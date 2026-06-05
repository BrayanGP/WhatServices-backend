const express = require('express');
const router = express.Router();
const {
  getProviders, resetProviderPassword, toggleVerify, toggleBlockProvider,
  getUsers, toggleBlockUser,
  getCategories, createCategory, updateCategory, reviewCategory,
  getConversations, getConversation, toggleTakeover, replyConversation,
  listInstances, createInstance, connectInstance, instanceState,
  logoutInstance, deleteInstance, setActiveInstance,
  getBotConfig, updateBotConfig,
  getIntents, createIntent, updateIntent, deleteIntent,
  getFlow, saveFlow, publishFlow, unpublishFlow,
  getFlowTemplates, createFlowTemplate, deleteFlowTemplate,
  getStats,
  getRequests, getRequest, updateRequest,
  createUser, updateUserRole, resetUserPassword,
  getModules, getRoles, createRole, updateRole, deleteRole,
} = require('./admin.controller');
const { verifyToken, requireRole } = require('../../middleware/auth');

// Acceso al panel: admin (total) o staff (según su rol). El gating fino es por módulos en el front.
router.use(verifyToken, requireRole('admin', 'staff'));

// Gestión de usuarios y roles: solo admin
const adminOnly = requireRole('admin');

router.get('/providers', getProviders);
router.patch('/providers/:id/reset-password', resetProviderPassword);
router.patch('/providers/:id/verify', toggleVerify);
router.patch('/providers/:id/block', toggleBlockProvider);

router.get('/users', getUsers);
router.post('/users', adminOnly, createUser);
router.patch('/users/:id/role', adminOnly, updateUserRole);
router.patch('/users/:id/reset-password', adminOnly, resetUserPassword);
router.patch('/users/:id/block', adminOnly, toggleBlockUser);

// Roles y módulos (solo admin)
router.get('/modules', getModules);
router.get('/roles', getRoles);
router.post('/roles', adminOnly, createRole);
router.put('/roles/:id', adminOnly, updateRole);
router.delete('/roles/:id', adminOnly, deleteRole);
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.patch('/categories/:id/review', reviewCategory);

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

// Intenciones del bot
router.get('/bot/intents', getIntents);
router.post('/bot/intents', createIntent);
router.put('/bot/intents/:id', updateIntent);
router.delete('/bot/intents/:id', deleteIntent);

// Flujo visual del bot (constructor drag-and-drop)
router.get('/bot/flow', getFlow);
router.put('/bot/flow', saveFlow);
router.post('/bot/flow/publish', publishFlow);
router.post('/bot/flow/unpublish', unpublishFlow);

// Plantillas de flujo propias
router.get('/bot/flow-templates', getFlowTemplates);
router.post('/bot/flow-templates', createFlowTemplate);
router.delete('/bot/flow-templates/:id', deleteFlowTemplate);

module.exports = router;
