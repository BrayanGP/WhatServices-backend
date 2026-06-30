const bcrypt  = require('bcryptjs');
const Client  = require('./client.model');
const Otp     = require('../auth/otp.model');
const twilio  = require('../../utils/twilio');
const { OTP_ENABLED } = require('../../config/env');

const PURPOSE     = 'client_register';
const OTP_TTL_MS  = 5 * 60 * 1000;
const OTP_BLOCK_MS = 10 * 60 * 1000;
const OTP_MAX     = 3;
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// ── Registro (idempotente — requiere OTP verificado) ──────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, phone, providerId } = req.body;
    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ message: 'Nombre y teléfono son obligatorios.' });
    }
    const cleanPhone = last10(phone);

    // Si ya existe, devolvemos el cliente (login silencioso)
    const existing = await Client.findOne({ phone: cleanPhone });
    if (existing) return res.json(existing);

    // Verificar que el OTP fue confirmado (solo cuando OTP está activo)
    if (OTP_ENABLED) {
      const otp = await Otp.findOne({ phone: cleanPhone, purpose: PURPOSE });
      if (!otp?.verified) {
        return res.status(403).json({ message: 'Debes verificar tu número antes de registrarte.' });
      }
    }

    const client = await Client.create({
      name:       name.trim(),
      phone:      cleanPhone,
      providerId: providerId || undefined,
      source:     'whatsapp_cta',
    });
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
};

// ── Login (buscar por teléfono) ───────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone?.trim()) return res.status(400).json({ message: 'Teléfono requerido.' });
    const cleanPhone = last10(phone);
    const client = await Client.findOne({ phone: cleanPhone });
    if (!client) return res.status(404).json({ message: 'not_found' });
    res.json(client);
  } catch (err) {
    next(err);
  }
};

// ── Enviar OTP por SMS ────────────────────────────────────────────────────────
const sendOtp = async (req, res, next) => {
  try {
    const d10 = last10(req.body?.phone);
    if (d10.length < 10) return res.status(400).json({ message: 'Teléfono inválido (10 dígitos).' });

    // Si el número ya está registrado como cliente no necesita OTP
    const existing = await Client.findOne({ phone: d10 });
    if (existing) return res.status(409).json({ message: 'Este número ya tiene cuenta. Inicia sesión.' });

    // OTP desactivado → marcar como verificado y continuar
    if (!OTP_ENABLED) {
      await Otp.findOneAndUpdate(
        { phone: d10, purpose: PURPOSE },
        { phone: d10, purpose: PURPOSE, verified: true, verifiedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60 * 1000), attempts: 0, blockedUntil: null, codeHash: '' },
        { upsert: true, new: true },
      );
      return res.json({ ok: true, otpDisabled: true });
    }

    const now = Date.now();
    let otp = await Otp.findOne({ phone: d10, purpose: PURPOSE });
    if (otp?.blockedUntil && otp.blockedUntil.getTime() > now) {
      return res.status(429).json({ message: 'Demasiados intentos. Intenta más tarde.', remainingMs: otp.blockedUntil.getTime() - now });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const set = { phone: d10, purpose: PURPOSE, codeHash, expiresAt: new Date(now + OTP_TTL_MS), verified: false, verifiedAt: null };
    if (!otp || (otp.blockedUntil && otp.blockedUntil.getTime() <= now)) { set.attempts = 0; set.blockedUntil = null; }
    await Otp.findOneAndUpdate({ phone: d10, purpose: PURPOSE }, set, { upsert: true, new: true });

    try {
      await twilio.sendOtp(req.body.phone, code);
    } catch (e) { console.error('[otp/client] SMS no enviado:', e.message); }

    res.json({ ok: true, expiresInMs: OTP_TTL_MS });
  } catch (err) {
    next(err);
  }
};

// ── Verificar OTP ─────────────────────────────────────────────────────────────
const verifyOtp = async (req, res, next) => {
  try {
    const { phone, code } = req.body || {};
    if (!OTP_ENABLED) return res.json({ ok: true, verified: true, otpDisabled: true });
    const d10 = last10(phone);
    const now = Date.now();
    const otp = await Otp.findOne({ phone: d10, purpose: PURPOSE });
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

module.exports = { register, login, sendOtp, verifyOtp };
