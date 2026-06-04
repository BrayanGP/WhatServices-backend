const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  // clientId opcional: las calificaciones por WhatsApp no tienen cuenta de usuario
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewerPhone: { type: String },
  reviewerName: { type: String },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String },
  source: { type: String, enum: ['web', 'whatsapp'], default: 'web' },
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);
