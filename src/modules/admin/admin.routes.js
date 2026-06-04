const express = require('express');
const router = express.Router();
const {
  getProviders, toggleVerify, toggleBlockProvider,
  getUsers, toggleBlockUser,
  getCategories, createCategory, updateCategory,
  getConversations, getConversation, toggleTakeover, replyConversation,
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

module.exports = router;
