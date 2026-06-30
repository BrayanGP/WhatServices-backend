const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  phone:      { type: String, required: true, trim: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider' },
  source:     { type: String, default: 'whatsapp_cta' },
}, { timestamps: true });

module.exports = mongoose.model('Client', clientSchema);
