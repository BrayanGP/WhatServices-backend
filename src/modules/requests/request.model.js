const mongoose = require('mongoose');

const historySchema = new mongoose.Schema(
  {
    status: String,
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
  phone: { type: String, index: true },
  name: { type: String },
  service: { type: String },
  postalCode: { type: String },
  mode: { type: String, enum: ['near', 'score'] },
  suggestedProviders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Provider' }],
  assignedProvider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider' },
  status: {
    type: String,
    enum: ['nueva', 'contactado', 'asignada', 'completada', 'cancelada'],
    default: 'nueva',
    index: true,
  },
  statusHistory: [historySchema],
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);
