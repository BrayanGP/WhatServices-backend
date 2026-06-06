const mongoose = require('mongoose');

// Código OTP por teléfono para verificar antes de registrarse.
const otpSchema = new mongoose.Schema({
  phone: { type: String, index: true },        // últimos 10 dígitos
  purpose: { type: String, default: 'register' },
  codeHash: { type: String },
  expiresAt: { type: Date },
  attempts: { type: Number, default: 0 },
  blockedUntil: { type: Date },
  verified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
}, { timestamps: true });

otpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('Otp', otpSchema);
