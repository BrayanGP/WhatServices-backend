// Migracion: organiza las fotos existentes de los proveedores en albumes.
// - Toda foto queda en el album 'default' (galeria completa, N fotos).
// - Si el proveedor no tiene fotos marcadas en 'WhatsApp', se marcan las primeras 5
//   (esas son las que muestra el bot).
// Idempotente: se puede correr varias veces sin duplicar.
//
// Uso:  node src/scripts/migrate-photo-albums.js
require('../config/env');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Provider = require('../modules/providers/provider.model');

const { WHATSAPP_ALBUM, DEFAULT_ALBUM, WHATSAPP_MAX } = Provider;

const run = async () => {
  await connectDB();
  const providers = await Provider.find({ 'photos.0': { $exists: true } });
  let changed = 0;

  for (const p of providers) {
    let dirty = false;

    // 1) Asegurar que toda foto pertenezca al menos a 'default'
    p.photos.forEach((ph) => {
      if (!Array.isArray(ph.albums) || ph.albums.length === 0) { ph.albums = [DEFAULT_ALBUM]; dirty = true; }
      else if (!ph.albums.includes(DEFAULT_ALBUM)) { ph.albums.unshift(DEFAULT_ALBUM); dirty = true; }
    });

    // 2) Si nadie esta en WhatsApp, marcar las primeras 5
    const hasWa = p.photos.some((ph) => (ph.albums || []).includes(WHATSAPP_ALBUM));
    if (!hasWa) {
      p.photos.slice(0, WHATSAPP_MAX).forEach((ph) => {
        if (!ph.albums.includes(WHATSAPP_ALBUM)) { ph.albums.push(WHATSAPP_ALBUM); dirty = true; }
      });
    }

    if (dirty) {
      p.markModified('photos');
      await p.save();
      changed++;
    }
  }

  console.log(`✓ Migración completa. Proveedores actualizados: ${changed} / ${providers.length}`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((e) => { console.error('✗ Error en migración:', e); process.exit(1); });
