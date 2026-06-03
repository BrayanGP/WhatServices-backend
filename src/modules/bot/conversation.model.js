const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  step: { type: String, default: 'IDLE' },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastActivity: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Conversation', conversationSchema);
