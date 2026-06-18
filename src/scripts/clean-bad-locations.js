// Limpia ubicaciones exactas (location) que no coinciden con el CP del proveedor.
// Caso típico: registros viejos donde se eligió mal la dirección (ej. apunta a otra ciudad).
// Si la location está a más de MAX_KM del centro de su CP, se elimina (la búsqueda usa el CP).
//
// Uso:  node src/scripts/clean-bad-locations.js          (aplica)
//       node src/scripts/clean-bad-locations.js --dry    (solo muestra, no cambia)
require('../config/env');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Provider = require('../modules/providers/provider.model');
const { geocodeCp } = require('../utils/geocode');

const MAX_KM = 50; // tolerancia: más allá se considera inconsistente
const DRY = process.argv.includes('--dry');

const haversineKm = (a, b) => {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const run = async () => {
  await connectDB();
  const provs = await Provider.find({ 'location.coordinates.0': { $exists: true }, postalCode: { $exists: true, $ne: '' } });
  let cleaned = 0;
  for (const p of provs) {
    const center = await geocodeCp(p.postalCode);
    if (!center) continue; // si no se puede geocodificar el CP, no tocamos nada
    const [lng, lat] = p.location.coordinates;
    const km = haversineKm(center, { lat, lng });
    if (km > MAX_KM) {
      console.log(`${DRY ? '[dry] ' : ''}${p.businessName} (cp:${p.postalCode}) ubicación a ${km.toFixed(0)}km → se ${DRY ? 'limpiaría' : 'limpia'}`);
      if (!DRY) { p.location = undefined; p.markModified('location'); await p.save(); cleaned++; }
    }
  }
  console.log(`\n✓ ${DRY ? 'Simulación' : 'Limpieza'} completa. ${DRY ? 'Candidatos' : 'Limpiados'}: ${cleaned}${DRY ? '' : ` / ${provs.length}`}`);
  await mongoose.disconnect();
  process.exit(0);
};
run().catch((e) => { console.error('Error:', e); process.exit(1); });
