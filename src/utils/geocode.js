const GeoCp = require('../modules/bot/geocp.model');

const fetchJson = async (url, headers = {}) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
};

// Zippopotam: API específica de códigos postales (confiable para CP de México).
// https://api.zippopotam.us/MX/42700 → { places: [{ latitude, longitude }] }
const viaZippopotam = async (code) => {
  const data = await fetchJson(`https://api.zippopotam.us/MX/${code}`);
  const place = data && Array.isArray(data.places) && data.places[0];
  if (!place) return null;
  const lat = Number(place.latitude), lng = Number(place.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

// Nominatim (OpenStreetMap) como respaldo.
const viaNominatim = async (code) => {
  const data = await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&postalcode=${encodeURIComponent(code)}`,
    { 'User-Agent': 'WhatServices/1.0 (contacto@whatservice.org)', 'Accept-Language': 'es' }
  );
  const r = Array.isArray(data) && data[0];
  if (!r || !r.lat || !r.lon) return null;
  const lat = Number(r.lat), lng = Number(r.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

// Geocodifica un código postal de México (5 dígitos) a { lat, lng }.
// Cachea SOLO los aciertos (los fallos se reintentan, no se cachean) para no
// dejar un CP marcado como inexistente por una caída temporal del servicio.
const geocodeCp = async (cp) => {
  const code = String(cp || '').match(/\b\d{5}\b/)?.[0];
  if (!code) return null;

  // 1) Caché (solo positivos)
  try {
    const cached = await GeoCp.findOne({ cp: code }).lean();
    if (cached && cached.found && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
      return { lat: cached.lat, lng: cached.lng };
    }
  } catch (e) { /* sigue */ }

  // 2) Zippopotam → Nominatim
  const coords = (await viaZippopotam(code)) || (await viaNominatim(code));

  // 3) Guarda solo si se encontró
  if (coords) {
    try { await GeoCp.updateOne({ cp: code }, { $set: { ...coords, found: true } }, { upsert: true }); } catch (e) { /* noop */ }
    return coords;
  }
  return null;
};

module.exports = { geocodeCp };
