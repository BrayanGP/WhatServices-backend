const mongoose = require('mongoose');

// Caché de geocodificación de códigos postales (CP de México → coordenadas).
// Evita repetir consultas al servicio externo y respeta su política de uso.
const geoCpSchema = new mongoose.Schema({
  cp: { type: String, unique: true, index: true },
  lat: { type: Number },
  lng: { type: Number },
  found: { type: Boolean, default: true }, // false = ya se intentó y no se encontró (no reintentar pronto)
}, { timestamps: true });

module.exports = mongoose.model('GeoCp', geoCpSchema);
