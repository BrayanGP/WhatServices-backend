const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ['client', 'bot', 'agent'], required: true },
    text: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  name: { type: String },
  // Instancia de Evolution por la que entro/responde esta conversacion
  instance: { type: String },
  // Estado de la maquina de estados del bot
  step: {
    type: String,
    enum: [
      'IDLE', 'AWAITING_SERVICE', 'AWAITING_MODE', 'AWAITING_ZIP', 'SHOWING_RESULTS',
      'RATING_SCORE', 'RATING_COMMENT', 'HUMAN', 'END',
    ],
    default: 'IDLE',
  },
  // Datos capturados del lead
  selectedService: { type: String },
  postalCode: { type: String },
  // Resultado de proveedores sugeridos en la ultima busqueda
  suggestedProviders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Provider' }],
  // Contexto libre
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Historial de mensajes (para la bandeja del admin)
  messages: [messageSchema],
  // Si un humano tomo el control desde el admin, el bot no responde
  humanTakeover: { type: Boolean, default: false },
  lastActivity: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);
