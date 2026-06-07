const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../users/user.model');
const Provider = require('../providers/provider.model');
const Otp = require('./otp.model');
const Setting = require('../admin/setting.model');
const evolution = require('../../utils/evolution');
const { modulesForUser } = require('../../utils/permissions');
const { fileUrl } = require('../../middleware/upload');
const { JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV } = require('../../config/env');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  // 'none' permite enviar la cookie cross-site (front y backend en dominios distintos)
  sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
};

const signTokens = (user) => {
  const payload = { id: user._id, role: user.role };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

const register = async (req, res, next) => {
  try {
    const { name, phone, email, password, acceptedTerms, termsVersion, acceptedPrivacy, privacyVersion } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    // Registra la aceptación de Términos/Privacidad si el formulario las envía (el alta por admin no las manda).
    const consent = {};
    if (acceptedTerms) {
      consent.acceptedTerms = true; consent.termsAcceptedAt = new Date(); consent.termsVersion = termsVersion || '1.0';
    }
    if (acceptedPrivacy) {
      consent.acceptedPrivacy = true; consent.privacyAcceptedAt = new Date(); consent.privacyVersion = privacyVersion || '1.0';
    }
    const user = await User.create({ name, phone, email, passwordHash, ...consent });
    const { accessToken, refreshToken } = signTokens(user);
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json({
      accessToken,
      user: { id: user._id, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;
    // Cliente inicia con teléfono; admin/staff con correo. Acepta cualquiera.
    let user = null;
    if (phone && String(phone).trim()) {
      const d10 = String(phone).replace(/\D/g, '').slice(-10);
      if (d10.length >= 10) user = await User.findOne({ phone: new RegExp(`${d10}$`) });
    } else if (email && String(email).trim()) {
      const e = String(email).trim();
      user = await User.findOne({ email: new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    }
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Account blocked' });
    }
    const { accessToken, refreshToken } = signTokens(user);
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    const modules = await modulesForUser(user);
    res.json({ accessToken, user: { id: user._id, name: user.name, role: user.role, modules } });
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token' });
    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user || user.isBlocked) return res.status(401).json({ message: 'Unauthorized' });
    const { accessToken, refreshToken } = signTokens(user);
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
};

const logout = (req, res) => {
  res.clearCookie('refreshToken', COOKIE_OPTS);
  res.json({ message: 'Logged out' });
};

// ----- Cuenta personal (cualquier usuario autenticado) -----

const me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash').populate('roleId', 'name').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const modules = await modulesForUser(user);
    res.json({
      id: user._id, name: user.name, email: user.email, phone: user.phone,
      role: user.role, roleName: user.roleId?.name, avatar: user.avatar, modules,
    });
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    const update = {};
    if (name?.trim()) update.name = name.trim();
    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-passwordHash').lean();
    res.json({ id: user._id, name: user.name, email: user.email, avatar: user.avatar });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!(await user.comparePassword(currentPassword || ''))) {
      return res.status(400).json({ message: 'La contraseña actual es incorrecta' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file' });
    const avatar = fileUrl(req.file);
    await User.findByIdAndUpdate(req.user.id, { avatar });
    res.json({ avatar });
  } catch (err) {
    next(err);
  }
};

// ----- Restablecer contraseña por código de WhatsApp -----

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const waNumber = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `52${d}` : d; };

// Paso 1: solicitar código. Se envía por WhatsApp al teléfono registrado.
const forgotPassword = async (req, res, next) => {
  try {
    const d10 = last10(req.body?.phone);
    if (d10.length < 10) return res.status(400).json({ message: 'Teléfono inválido' });
    const user = await User.findOne({ phone: new RegExp(`${d10}$`) });
    // Respondemos ok siempre (no revelar si el número existe)
    if (user && !user.isBlocked) {
      const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
      user.resetCode = await bcrypt.hash(code, 10);
      user.resetCodeExpires = new Date(Date.now() + 5 * 60 * 1000);
      user.resetCodeAttempts = 0;
      await user.save();
      try {
        const s = await Setting.findOne({ key: 'activeInstance' }).lean();
        const instance = s?.value || evolution.DEFAULT_INSTANCE;
        await evolution.sendText(
          waNumber(req.body.phone),
          `🔐 Tu código para restablecer tu contraseña en *WhatServices* es: *${code}*\n\nVence en 5 minutos. Si no fuiste tú, ignora este mensaje.`,
          instance,
        );
      } catch (e) { console.error('[forgotPassword] no se pudo enviar código:', e.message); }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// Paso 2: verificar código y establecer nueva contraseña.
const resetPassword = async (req, res, next) => {
  try {
    const { phone, code, password } = req.body || {};
    if (!password || password.length < 6) return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    const d10 = last10(phone);
    const user = await User.findOne({ phone: new RegExp(`${d10}$`) });
    if (!user || !user.resetCode || !user.resetCodeExpires || user.resetCodeExpires < new Date()) {
      return res.status(400).json({ message: 'Código inválido o expirado. Solicítalo de nuevo.' });
    }
    if ((user.resetCodeAttempts || 0) >= 5) {
      return res.status(429).json({ message: 'Demasiados intentos. Solicita un nuevo código.' });
    }
    const ok = await bcrypt.compare(String(code || ''), user.resetCode);
    if (!ok) {
      user.resetCodeAttempts = (user.resetCodeAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: 'Código incorrecto' });
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    user.resetCodeAttempts = 0;
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ----- OTP de registro (verificar teléfono antes de enrolarse) -----

const OTP_TTL_MS = 5 * 60 * 1000;     // vigencia del código
const OTP_BLOCK_MS = 10 * 60 * 1000;  // bloqueo tras fallos
const OTP_MAX = 3;                      // intentos antes de bloquear

const sendOtpInstance = async () => {
  const s = await Setting.findOne({ key: 'activeInstance' }).lean();
  return s?.value || evolution.DEFAULT_INSTANCE;
};

const registerSendOtp = async (req, res, next) => {
  try {
    const d10 = last10(req.body?.phone);
    if (d10.length < 10) return res.status(400).json({ message: 'Teléfono inválido (10 dígitos)' });
    const existing = await User.findOne({ phone: new RegExp(`${d10}$`) });
    if (existing) {
      // Se bloquea solo si ya hay una cuenta utilizable: otro tipo de cuenta,
      // o un proveedor que YA tiene su perfil. Si quedó un registro incompleto
      // (proveedor sin perfil), se permite reanudar verificando el teléfono.
      const hasProvider = existing.role === 'provider' && (await Provider.exists({ userId: existing._id }));
      if (existing.role !== 'provider' || hasProvider) {
        return res.status(409).json({ message: 'Ya existe una cuenta con ese teléfono. Inicia sesión.' });
      }
    }

    const now = Date.now();
    let otp = await Otp.findOne({ phone: d10, purpose: 'register' });
    if (otp?.blockedUntil && otp.blockedUntil.getTime() > now) {
      return res.status(429).json({ message: 'Demasiados intentos. Intenta más tarde.', remainingMs: otp.blockedUntil.getTime() - now });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const set = { phone: d10, purpose: 'register', codeHash, expiresAt: new Date(now + OTP_TTL_MS), verified: false, verifiedAt: null };
    // si el bloqueo ya expiró (o no existía), reiniciamos intentos
    if (!otp || (otp.blockedUntil && otp.blockedUntil.getTime() <= now)) { set.attempts = 0; set.blockedUntil = null; }
    otp = await Otp.findOneAndUpdate({ phone: d10, purpose: 'register' }, set, { upsert: true, new: true });
    try {
      await evolution.sendText(waNumber(req.body.phone),
        `🔐 Tu código de verificación para registrarte en *WhatServices* es: *${code}*\n\nVence en 5 minutos.`,
        await sendOtpInstance());
    } catch (e) { console.error('[otp] no se pudo enviar:', e.message); }
    res.json({ ok: true, expiresInMs: OTP_TTL_MS });
  } catch (err) {
    next(err);
  }
};

const registerVerifyOtp = async (req, res, next) => {
  try {
    const { phone, code } = req.body || {};
    const d10 = last10(phone);
    const now = Date.now();
    const otp = await Otp.findOne({ phone: d10, purpose: 'register' });
    if (otp?.blockedUntil && otp.blockedUntil.getTime() > now) {
      return res.status(429).json({ message: 'Bloqueado por intentos fallidos.', remainingMs: otp.blockedUntil.getTime() - now });
    }
    if (!otp || !otp.codeHash || !otp.expiresAt || otp.expiresAt.getTime() < now) {
      return res.status(400).json({ message: 'El código expiró. Reenvíalo.' });
    }
    const ok = await bcrypt.compare(String(code || ''), otp.codeHash);
    if (!ok) {
      otp.attempts = (otp.attempts || 0) + 1;
      let blocked = false;
      if (otp.attempts >= OTP_MAX) { otp.blockedUntil = new Date(now + OTP_BLOCK_MS); blocked = true; }
      await otp.save();
      if (blocked) return res.status(429).json({ message: 'Demasiados intentos. Espera 10 minutos.', remainingMs: OTP_BLOCK_MS });
      return res.status(400).json({ message: 'Código incorrecto', attemptsLeft: OTP_MAX - otp.attempts });
    }
    otp.verified = true; otp.verifiedAt = new Date(); otp.attempts = 0; otp.codeHash = undefined; otp.blockedUntil = null;
    await otp.save();
    res.json({ ok: true, verified: true });
  } catch (err) {
    next(err);
  }
};

// Estado del bloqueo/verificación (para restaurar el timer al recargar la página)
const registerOtpStatus = async (req, res, next) => {
  try {
    const d10 = last10(req.query.phone);
    if (d10.length < 10) return res.json({ blocked: false, verified: false, remainingMs: 0 });
    const otp = await Otp.findOne({ phone: d10, purpose: 'register' }).lean();
    const now = Date.now();
    const remainingMs = otp?.blockedUntil ? Math.max(0, otp.blockedUntil.getTime() - now) : 0;
    res.json({ blocked: remainingMs > 0, remainingMs, verified: !!otp?.verified });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register, login, refresh, logout, me, updateProfile, changePassword, uploadAvatar,
  forgotPassword, resetPassword, registerSendOtp, registerVerifyOtp, registerOtpStatus,
};
