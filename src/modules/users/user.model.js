const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['client', 'provider', 'admin', 'staff'], default: 'client' },
  // Para usuarios del panel (staff): rol con módulos asignados
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  avatar: { url: String, publicId: String },
  isBlocked: { type: Boolean, default: false },
  // Restablecimiento de contraseña por código (WhatsApp)
  resetCode: { type: String },
  resetCodeExpires: { type: Date },
  resetCodeAttempts: { type: Number, default: 0 },
}, { timestamps: true });

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
