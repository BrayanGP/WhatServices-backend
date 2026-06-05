const mongoose = require('mongoose');

const intentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, unique: true, trim: true },
  description: { type: String },
  examples: { type: [String], default: [] },     // frases de ejemplo (fuzzy)
  response: { type: String },                     // respuesta del bot (admite variables {name} {service})
  service: { type: String },                      // opcional: categoría que dispara la búsqueda
  priority: { type: Number, default: 10 },        // mayor = se evalúa primero
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Intent', intentSchema);
