const mongoose = require('mongoose');

// Evento de analítica del sitio (page views + pasos del embudo).
const eventSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true }, // 'pageview' | 'search' | 'provider_view' | 'whatsapp_click' | 'otp_verified' | 'register_success' | ...
  path: { type: String, default: '' },                 // ruta visitada
  sessionId: { type: String, index: true },            // visitante anónimo (localStorage)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  source: { type: String, default: 'directo' },        // utm_source o host del referrer
  referrer: { type: String, default: '' },
  ua: { type: String, default: '' },                   // user-agent (para móvil/desktop)
  meta: { type: Object, default: {} },                 // datos extra (categoría buscada, providerId, etc.)
  createdAt: { type: Date, default: Date.now },
});

// Índice + purga automática a los 180 días (TTL) para no crecer sin límite.
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('Event', eventSchema);
