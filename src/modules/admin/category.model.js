const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  icon: { type: String, default: '🔧' },
  isActive: { type: Boolean, default: true },
  // 'active' = aprobada, 'pending' = esperando aprobación del admin, 'rejected' = rechazada
  status: {
    type: String,
    enum: ['active', 'pending', 'rejected'],
    default: 'active',
  },
  // Proveedor que sugirió la categoría (solo si viene del flujo de sugerencia)
  suggestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
