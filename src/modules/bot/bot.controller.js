const Fuse = require('fuse.js');
const Conversation = require('./conversation.model');
const Provider = require('../providers/provider.model');
const Category = require('../admin/category.model');
const { sendText } = require('../../utils/evolution');
const { CLIENT_URL } = require('../../config/env');

// ----- Helpers -----

const extractIncoming = (req) => {
  // Formato Evolution: { event, instance, data: { key, pushName, message } }
  const data = req.body?.data;
  if (!data) return null;
  const remoteJid = data.key?.remoteJid || '';
  // Ignorar grupos y estados
  if (remoteJid.endsWith('@g.us') || remoteJid.includes('broadcast')) return null;
  const phone = remoteJid.split('@')[0];
  const fromMe = data.key?.fromMe === true;
  const text =
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    data.message?.imageMessage?.caption ||
    '';
  return { phone, fromMe, text: text.trim(), name: data.pushName };
};

const getPostalCode = (text) => {
  const m = text.match(/\b\d{5}\b/);
  return m ? m[0] : null;
};

// Busca proveedores de un servicio priorizando por codigo postal, luego ciudad, luego rating
const findNearbyProviders = async (service, postalCode) => {
  const base = {
    categories: service,
    availability: 'available',
    isBlocked: false,
  };
  // 1) Mismo CP
  let providers = await Provider.find({ ...base, postalCode })
    .sort({ 'rating.average': -1 })
    .limit(5)
    .lean();

  // 2) Completar con otros del mismo servicio (mejor rating) si faltan
  if (providers.length < 5) {
    const ids = providers.map((p) => p._id);
    const extra = await Provider.find({ ...base, _id: { $nin: ids } })
      .sort({ 'rating.average': -1 })
      .limit(5 - providers.length)
      .lean();
    providers = [...providers, ...extra];
  }
  return providers;
};

const saveMsg = (conv, from, text) => {
  conv.messages.push({ from, text, at: new Date() });
};

const reply = async (conv, phone, text) => {
  saveMsg(conv, 'bot', text);
  await sendText(phone, text);
};

// ----- Webhook verification (compat) -----
const verifyWebhook = (req, res) => res.sendStatus(200);

// ----- Webhook receiver (Evolution) -----
const handleIncoming = async (req, res) => {
  res.sendStatus(200); // responder rapido a Evolution

  try {
    const event = req.body?.event;
    if (event && !['messages.upsert', 'MESSAGES_UPSERT'].includes(event)) return;

    const msg = extractIncoming(req);
    if (!msg || msg.fromMe || !msg.text) return;

    const { phone, text, name } = msg;

    let conv = await Conversation.findOne({ phone });
    if (!conv) conv = await Conversation.create({ phone, name });
    if (name && !conv.name) conv.name = name;
    conv.lastActivity = new Date();
    saveMsg(conv, 'client', text);

    // Si un humano tomo el control, no responde el bot
    if (conv.humanTakeover) {
      await conv.save();
      return;
    }

    const categories = await Category.find({ isActive: true }).lean();
    const lower = text.toLowerCase();

    // Fuzzy match contra nombre + slug de categorias
    const fuse = new Fuse(categories, {
      keys: ['name', 'slug'],
      threshold: 0.45,
      ignoreLocation: true,
    });
    const matchCategory = () => {
      const r = fuse.search(lower);
      return r.length ? r[0].item : null;
    };

    const servicesList = categories.map((c) => `• ${c.icon || ''} ${c.name}`.trim()).join('\n');

    // ---- FSM ----
    if (conv.step === 'IDLE' || conv.step === 'END') {
      // intento directo: tal vez ya escribio un servicio
      const matched = matchCategory();
      if (matched) {
        conv.selectedService = matched.name;
        conv.step = 'AWAITING_ZIP';
        await reply(conv, phone,
          `¡Genial! Buscas *${matched.name}* 👍\n\n¿Quieres que busque profesionales *cerca de ti*? Dime tu *código postal* (5 dígitos).`);
      } else {
        conv.step = 'AWAITING_SERVICE';
        await reply(conv, phone,
          `¡Hola${name ? ' ' + name : ''}! 👋 Bienvenido a *WhatServices*.\n\nTe conectamos con profesionales de confianza para tu hogar:\n\n${servicesList}\n\n¿Qué servicio necesitas? Escríbelo (ej. "plomería" o "se me rompió un tubo").`);
      }
    } else if (conv.step === 'AWAITING_SERVICE') {
      const matched = matchCategory();
      if (matched) {
        conv.selectedService = matched.name;
        conv.step = 'AWAITING_ZIP';
        await reply(conv, phone,
          `Perfecto, *${matched.name}* ✅\n\nPara encontrar profesionales cerca, dime tu *código postal* (5 dígitos).`);
      } else {
        await reply(conv, phone,
          `No reconocí ese servicio 🤔. Elige uno de la lista:\n\n${servicesList}`);
      }
    } else if (conv.step === 'AWAITING_ZIP') {
      const cp = getPostalCode(text);
      if (!cp) {
        await reply(conv, phone, 'Por favor envíame tu *código postal* (5 dígitos), por ejemplo: 06000.');
      } else {
        conv.postalCode = cp;
        const providers = await findNearbyProviders(conv.selectedService, cp);
        conv.suggestedProviders = providers.map((p) => p._id);

        if (!providers.length) {
          await reply(conv, phone,
            `Por ahora no tengo profesionales de *${conv.selectedService}* disponibles en tu zona 😕. Intenta más tarde o escribe otro servicio.`);
          conv.step = 'END';
        } else {
          let body = `Estos son los *${providers.length}* profesionales de *${conv.selectedService}* mejor valorados para ti:\n\n`;
          providers.forEach((p, i) => {
            body += `*${i + 1}. ${p.businessName}*\n📞 ${p.phone}\n⭐ ${p.rating?.average || 0}/5${p.city ? ` · ${p.city}` : ''}\n\n`;
          });
          const link = `${CLIENT_URL}/providers?category=${encodeURIComponent(conv.selectedService)}&cp=${cp}`;
          body += `👉 Ve sus perfiles, trabajos y fotos aquí:\n${link}\n\nEscribe otro servicio si necesitas algo más.`;
          await reply(conv, phone, body);
          conv.step = 'SHOWING_RESULTS';
        }
      }
    } else if (conv.step === 'SHOWING_RESULTS') {
      const matched = matchCategory();
      if (matched) {
        conv.selectedService = matched.name;
        conv.step = 'AWAITING_ZIP';
        await reply(conv, phone,
          `¡Claro! Ahora *${matched.name}* ✅\n\n¿En qué *código postal* lo necesitas?`);
      } else {
        await reply(conv, phone,
          `¿Necesitas otro servicio? Dímelo (ej. ${categories.slice(0, 3).map((c) => c.name).join(', ')}...).`);
      }
    }

    await conv.save();
  } catch (err) {
    console.error('[Bot] Error:', err);
  }
};

module.exports = { verifyWebhook, handleIncoming };
