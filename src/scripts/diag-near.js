// Diagnóstico de búsqueda por cercanía.
// Uso:  node src/scripts/diag-near.js "Carpinteros" 42700
require('../config/env');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Provider = require('../modules/providers/provider.model');
const { geocodeCp } = require('../utils/geocode');

const haversineKm = (a, b) => {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const run = async () => {
  const service = process.argv[2] || 'Carpinteros';
  const cp = process.argv[3] || '42700';
  await connectDB();

  console.log(`\n=== Geocodificación del CP del cliente: ${cp} ===`);
  const center = await geocodeCp(cp);
  console.log(center ? `OK → ${center.lat}, ${center.lng}` : '❌ NO se pudo geocodificar (Zippopotam/Nominatim no lo resolvieron)');

  console.log(`\n=== Proveedores en categoría "${service}" ===`);
  const all = await Provider.find({ categories: service }).lean();
  console.log(`Total con esa categoría exacta: ${all.length}`);

  for (const p of all) {
    const hasLoc = Array.isArray(p.location?.coordinates) && p.location.coordinates.length === 2;
    // Misma lógica que el bot: CP primero, ubicación solo como respaldo.
    let coords = (p.postalCode ? await geocodeCp(p.postalCode) : null);
    if (!coords && hasLoc) coords = { lng: p.location.coordinates[0], lat: p.location.coordinates[1] };
    const km = center && coords ? haversineKm(center, coords).toFixed(1) + ' km' : 'N/D';
    console.log(`- ${p.businessName} | cp:${p.postalCode || '—'} | avail:${p.availability} | blocked:${p.isBlocked} | ubicExacta:${hasLoc} | dist:${km} | cats:[${(p.categories || []).join(', ')}]`);
  }

  console.log(`\nNota: el bot solo incluye proveedores con avail=available, blocked=false, dist<=20km.`);
  await mongoose.disconnect();
  process.exit(0);
};
run().catch((e) => { console.error('Error:', e); process.exit(1); });
