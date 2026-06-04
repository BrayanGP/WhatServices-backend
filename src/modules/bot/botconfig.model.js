const mongoose = require('mongoose');

const DEFAULTS = {
  welcome:
    '¡Hola {name}! 👋 Bienvenido a *WhatServices*.\n\nTe conectamos con profesionales de confianza:\n\n{services}\n\n¿Qué servicio necesitas? (ej. "plomería" o "se me rompió un tubo")',
  noService: 'No reconocí ese servicio 🤔. Elige uno:\n\n{services}',
  askMode:
    'Perfecto, *{service}* ✅\n\n¿Cómo prefieres ver las recomendaciones?\n\n1️⃣ Los *5 más cercanos a ti*\n2️⃣ Los *5 mejor calificados*\n\nResponde *1* / *cerca* o *2* / *mejor*.',
  askZip: 'Para buscar cerca de ti, dime tu *código postal* (5 dígitos).',
  noResults: 'Por ahora no tengo profesionales de *{service}* disponibles 😕.',
  outOfHours:
    '¡Gracias por escribir! 🙏 Nuestro horario de atención es de {open}:00 a {close}:00 hrs. Te atenderemos en cuanto abramos.',
};

const botConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'default' },
  enabled: { type: Boolean, default: true },
  messages: {
    welcome: { type: String, default: DEFAULTS.welcome },
    noService: { type: String, default: DEFAULTS.noService },
    askMode: { type: String, default: DEFAULTS.askMode },
    askZip: { type: String, default: DEFAULTS.askZip },
    noResults: { type: String, default: DEFAULTS.noResults },
    outOfHours: { type: String, default: DEFAULTS.outOfHours },
  },
  hours: {
    enabled: { type: Boolean, default: false },
    tz: { type: String, default: 'America/Mexico_City' },
    openHour: { type: Number, default: 8, min: 0, max: 23 },
    closeHour: { type: Number, default: 20, min: 0, max: 23 },
    days: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // 0=Dom .. 6=Sab
  },
}, { timestamps: true });

// Devuelve la config (la crea con defaults si no existe)
botConfigSchema.statics.getSingleton = async function () {
  let cfg = await this.findOne({ key: 'default' });
  if (!cfg) cfg = await this.create({ key: 'default' });
  return cfg;
};

// Indica si estamos dentro del horario de atencion
botConfigSchema.methods.isOpenNow = function () {
  if (!this.hours?.enabled) return true;
  const tz = this.hours.tz || 'America/Mexico_City';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = wdMap[parts.find((p) => p.type === 'weekday')?.value] ?? 0;
  if (!this.hours.days.includes(wd)) return false;
  return hour >= this.hours.openHour && hour < this.hours.closeHour;
};

module.exports = mongoose.model('BotConfig', botConfigSchema);
module.exports.DEFAULTS = DEFAULTS;
