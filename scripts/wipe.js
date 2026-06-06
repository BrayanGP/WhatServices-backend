/**
 * 🧨 LIMPIEZA TOTAL — vacía la base de la app (MongoDB) y reinicia Evolution (instancias de WhatsApp).
 *
 * ⚠️ IRREVERSIBLE. Úsalo SOLO cuando quieras empezar de cero.
 *
 * Cómo ejecutar en Railway (servicio WhatServices-backend → pestaña "Console"/"Shell"):
 *     CONFIRM_WIPE=WIPE npm run wipe
 * o bien:
 *     CONFIRM_WIPE=WIPE node scripts/wipe.js
 *
 * Banderas opcionales:
 *     SKIP_EVOLUTION=1   → solo vacía MongoDB (no toca WhatsApp/Evolution)
 *     KEEP=admin,roles   → conserva esas colecciones (no las vacía)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const evolution = require('../src/utils/evolution');

const { MONGODB_URI } = process.env;
const CONFIRM = process.env.CONFIRM_WIPE || process.argv[2];
const SKIP_EVOLUTION = process.env.SKIP_EVOLUTION === '1';
const KEEP = (process.env.KEEP || '').split(',').map((s) => s.trim()).filter(Boolean);

const nameOf = (i) => i.name || i.instanceName || i.instance?.instanceName || i.id;

async function wipeMongo() {
  console.log('→ Conectando a MongoDB…');
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`  Base: ${db.databaseName}`);
  const cols = await db.listCollections().toArray();
  if (!cols.length) { console.log('  (sin colecciones)'); }
  for (const c of cols) {
    if (KEEP.includes(c.name)) { console.log(`  ⏭️  conservada: ${c.name}`); continue; }
    const { deletedCount } = await db.collection(c.name).deleteMany({});
    console.log(`  🗑️  ${c.name}: ${deletedCount} documentos eliminados`);
  }
  await mongoose.disconnect();
  console.log('✅ MongoDB limpiado.');
}

async function wipeEvolution() {
  console.log('→ Reiniciando Evolution (instancias de WhatsApp)…');
  const { ok, data } = await evolution.fetchInstances();
  if (!ok) { console.log('  ⚠️  No se pudo consultar Evolution (¿configurado?). Omitido.'); return; }
  const list = Array.isArray(data) ? data : [];
  if (!list.length) { console.log('  (sin instancias)'); }
  for (const i of list) {
    const name = nameOf(i);
    if (!name) continue;
    try { await evolution.logoutInstance(name); } catch (e) { /* ignore */ }
    try { await evolution.deleteInstance(name); } catch (e) { /* ignore */ }
    console.log(`  🗑️  instancia eliminada: ${name}`);
  }
  console.log('✅ Evolution reiniciado (deberás volver a escanear el QR).');
}

(async () => {
  if (CONFIRM !== 'WIPE') {
    console.error('\n⛔ Abortado. Esto BORRA datos de producción de forma irreversible.');
    console.error('   Para confirmar, ejecuta:  CONFIRM_WIPE=WIPE npm run wipe\n');
    process.exit(1);
  }
  if (!MONGODB_URI) { console.error('⛔ Falta MONGODB_URI'); process.exit(1); }
  try {
    console.log('\n🧨 LIMPIEZA TOTAL iniciada…\n');
    await wipeMongo();
    if (!SKIP_EVOLUTION) await wipeEvolution();
    else console.log('→ Evolution omitido (SKIP_EVOLUTION=1).');
    console.log('\n🎉 Listo. Todo limpio.\n');
    process.exit(0);
  } catch (err) {
    console.error('💥 Error durante la limpieza:', err.message);
    process.exit(1);
  }
})();
