// Categorías por defecto de WhatServices (fuente única, usada por el seed y por el
// sembrado idempotente al arrancar el servidor).
const DEFAULT_CATEGORIES = [
  { name: 'Carpinteros', slug: 'carpinteros', icon: '🪚' },
  { name: 'Plomeros', slug: 'plomeros', icon: '🔧' },
  { name: 'Herreros', slug: 'herreros', icon: '⚒️' },
  { name: 'Soldadores', slug: 'soldadores', icon: '🔦' },
  { name: 'Electricistas', slug: 'electricistas', icon: '⚡' },
  { name: 'Albañiles', slug: 'albaniles', icon: '🧱' },
  { name: 'Pintores', slug: 'pintores', icon: '🎨' },
  { name: 'Técnicos', slug: 'tecnicos', icon: '🔌' },
];

module.exports = { DEFAULT_CATEGORIES };
