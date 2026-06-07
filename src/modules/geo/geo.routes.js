const express = require('express');
const router = express.Router();

// Proxy de geocodificación (autocompletado de direcciones) sobre Nominatim/OpenStreetMap.
// Llamarlo desde el navegador suele fallar (política de uso / falta de User-Agent / límites);
// aquí lo hacemos servidor-a-servidor con User-Agent válido y una caché corta en memoria.

const cache = new Map(); // clave (query) -> { at, data }
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 500;

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.json([]);

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return res.json(hit.data);

  try {
    const url = 'https://nominatim.openstreetmap.org/search'
      + `?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&countrycodes=mx&accept-language=es`;
    const r = await fetch(url, {
      headers: {
        // Nominatim exige identificar la app; sin esto puede responder 403.
        'User-Agent': 'WhatServices/1.0 (+https://whatservice.org)',
        'Accept-Language': 'es',
      },
    });
    if (!r.ok) return res.status(502).json([]);
    const arr = await r.json();
    const data = (Array.isArray(arr) ? arr : []).map((p) => ({
      label: p.display_name,
      city: p.address?.city || p.address?.town || p.address?.village || p.address?.municipality || '',
      postalCode: p.address?.postcode || '',
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lon),
    }));
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(key, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('[geo] error consultando Nominatim:', err.message);
    res.status(502).json([]);
  }
});

module.exports = router;
