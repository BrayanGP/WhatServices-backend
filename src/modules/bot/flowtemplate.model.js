const mongoose = require('mongoose');

// Plantillas de flujo creadas por el usuario (además de las integradas en el front).
const flowTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '⭐' },
  graph: {
    nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    edges: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('FlowTemplate', flowTemplateSchema);
