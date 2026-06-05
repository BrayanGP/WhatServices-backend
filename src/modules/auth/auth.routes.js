const express = require('express');
const router = express.Router();
const { register, login, refresh, logout, me, updateProfile, changePassword, uploadAvatar, forgotPassword, resetPassword } = require('./auth.controller');
const { verifyToken } = require('../../middleware/auth');
const { upload, withFolder } = require('../../middleware/upload');

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Restablecer contraseña por código de WhatsApp (público)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Cuenta personal (cualquier usuario autenticado)
router.get('/me', verifyToken, me);
router.patch('/profile', verifyToken, updateProfile);
router.patch('/password', verifyToken, changePassword);
router.post('/avatar', verifyToken, withFolder((req) => `usuarios/${req.user.id}`), upload.single('photo'), uploadAvatar);

module.exports = router;
