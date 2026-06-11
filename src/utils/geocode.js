const GeoCp = require('../modules/bot/geocp.model');

// Geocodifica un código postal de México (5 dígitos) a coordenadas { lat, lng }.
// Usa Nominatim (OpenStreetMap), gratis y sin API key, con caché en BD para no
// repetir consultas (su política pide pocas consultas + User-Agent).
// Devuelve { lat, lng } o null si no se pudo resolver.
const geocodeCp = async (cp) => {
  const code = String(cp || '').match(/\b\d{5}\b/)?.[0];
  if (!code) return null;

  // 1) Caché
  try {
    const cached = await GeoCp.findOne({ cp: code }).lean();
    if (cached) return cached.found ? { lat: cached.lat, lng: cached.lng } : null;
  } catch (e) { /* sigue a la consulta externa */ }

  // 2) Consulta externa (con timeout para no atorar al bot)
  let lat = null, lng = null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&postalcode=${encodeURIComponent(code)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WhatServices/1.0 (contacto@whatservice.org)', 'Accept-Language': 'es' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr[0] && arr[0].lat && arr[0].lon) {
        lat = Number(arr[0].lat); lng = Number(arr[0].lon);
      }
    }
  } catch (e) { /* sin red / abort → cae a null */ }

  // 3) Guarda en caché (positivo o negativo) y devuelve
  const found = Number.isFinite(lat) && Number.isFinite(lng);
  try { await GeoCp.updateOne({ cp: code }, { $set: { lat, lng, found } }, { upsert: true }); } catch (e) { /* noop */ }
  return found ? { lat, lng } : null;
};

module.exports = { geocodeCp };
