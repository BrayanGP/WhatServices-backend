const mongoose = require('mongoose');

// Un nodo del lienzo: { id, type, position:{x,y}, data:{...} }
// Una arista: { id, source, target, sourceHandle, label }
// Se guardan como Mixed para no acoplar el motor al esquema visual.
const graphSchema = new mongoose.Schema({
  nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  edges: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { _id: false });

const botFlowSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'default' },
  name: { type: String, default: 'Flujo principal' },                           // nombre de la plantilla/flujo en edición
  draft: { type: graphSchema, default: () => ({ nodes: [], edges: [] }) },      // lo que se edita
  published: { type: graphSchema, default: () => ({ nodes: [], edges: [] }) },  // lo que ejecuta el bot
  isPublished: { type: Boolean, default: false },
  version: { type: Number, default: 0 },
}, { timestamps: true });

// Devuelve el documento (lo crea vacío si no existe)
botFlowSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: 'default' });
  if (!doc) doc = await this.create({ key: 'default' });
  return doc;
};

// Devuelve el grafo publicado SOLO si está activo y tiene un nodo start; si no, null (→ FSM legacy).
botFlowSchema.statics.getPublished = async function () {
  const doc = await this.findOne({ key: 'default' }).lean();
  if (!doc || !doc.isPublished) return null;
  const nodes = doc.published?.nodes || [];
  if (!nodes.some((n) => n.type === 'start')) return null;
  return doc.published;
};

module.exports = mongoose.model('BotFlow', botFlowSchema);
