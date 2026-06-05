const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  providerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  clientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewerPhone:{ type: String },
  reviewerName: { type: String },
  // Identificador único del dispositivo (localStorage uuid) para limitar a 1 reseña por dispositivo
  deviceId:     { type: String },
  rating:       { type: Number, required: true, min: 1, max: 5 },
  comment:      { type: String },
  source:       { type: String, enum: ['web', 'whatsapp'], default: 'web' },
}, { timestamps: true });

// Índice: máx 1 reseña por deviceId por proveedor
reviewSchema.index({ providerId: 1, deviceId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Review', reviewSchema);
