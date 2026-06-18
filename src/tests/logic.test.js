// Tests de lógica pura (sin BD ni red). Runner nativo de Node 20: `npm test`.
// Definimos variables de entorno mínimas para que config/env no falle al cargar
// (no se conecta a nada al hacer require, la conexión es perezosa).
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test';

const test = require('node:test');
const assert = require('node:assert');

const { haversineKm, getPostalCode, getScore, parseSelection } = require('../modules/bot/bot.helpers');
const { toE164Mx } = require('../utils/twilio');

test('haversineKm: mismo punto = 0 km', () => {
  const p = { lat: 20.22, lng: -99.21 };
  assert.equal(Math.round(haversineKm(p, p)), 0);
});

test('haversineKm: Mixquiahuala ↔ Tijuana ~ 2000+ km', () => {
  const mix = { lat: 20.22, lng: -99.21 };
  const tij = { lat: 32.51, lng: -117.02 };
  const km = haversineKm(mix, tij);
  assert.ok(km > 2000 && km < 2500, `esperado ~2200km, dio ${km.toFixed(0)}`);
});

test('haversineKm: dos puntos cercanos < 20 km', () => {
  const a = { lat: 20.22, lng: -99.21 };
  const b = { lat: 20.25, lng: -99.25 }; // ~5 km
  assert.ok(haversineKm(a, b) < 20);
});

test('getPostalCode extrae 5 dígitos', () => {
  assert.equal(getPostalCode('mi cp es 42700 gracias'), '42700');
  assert.equal(getPostalCode('sin codigo'), null);
});

test('getScore extrae 1-5', () => {
  assert.equal(getScore('le doy un 4'), 4);
  assert.equal(getScore('sin numero'), null);
});

test('parseSelection: menú / volver / número', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(parseSelection('otra', 'otra', ids), { menu: true });
  assert.deepEqual(parseSelection('volver', 'volver', ids), { back: true });
  assert.deepEqual(parseSelection('2', '2', ids), { works: 'b' });
});

test('toE164Mx: normaliza a +521 + 10 dígitos', () => {
  assert.equal(toE164Mx('7713034047'), '+5217713034047');
  assert.equal(toE164Mx('+52 771 303 4047'), '+5217713034047');
  assert.equal(toE164Mx('5217713034047'), '+5217713034047');
});
