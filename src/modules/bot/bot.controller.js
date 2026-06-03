const Conversation = require('./conversation.model');
const Provider = require('../providers/provider.model');
const Category = require('../admin/category.model');
const { sendMessage } = require('../../utils/whatsapp');
const { WA_VERIFY_TOKEN } = require('../../config/env');

const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

const handleIncoming = async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const msg = entry?.changes?.[0]?.value?.messages?.[0];
    if (!msg || msg.type !== 'text') return;

    const phone = msg.from;
    const text = msg.text.body.trim().toLowerCase();

    let conv = await Conversation.findOne({ phone });
    if (!conv) conv = await Conversation.create({ phone });
    conv.lastActivity = new Date();

    const categories = await Category.find({ isActive: true }).lean();

    const matchCategory = () =>
      categories.find(
        (c) => text.includes(c.slug) || text.includes(c.name.toLowerCase())
      );

    const sendProviders = async (categoryName) => {
      const providers = await Provider.find({
        categories: categoryName,
        availability: 'available',
        isVerified: true,
        isBlocked: false,
      })
        .limit(3)
        .lean();

      if (!providers.length) {
        await sendMessage(phone, `No encontré ${categoryName} disponibles en este momento. Intenta más tarde.`);
        conv.step = 'IDLE';
      } else {
        let reply = `Encontré estos *${categoryName}* disponibles:\n\n`;
        providers.forEach((p, i) => {
          reply += `${i + 1}. *${p.businessName}*\n📞 ${p.phone}\n⭐ ${p.rating.average}/5\n\n`;
        });
        reply += '¿Deseas contactar a alguno? Escribe otro servicio o *más* para ver más opciones.';
        await sendMessage(phone, reply);
        conv.step = 'SHOWING_RESULTS';
        conv.context = { category: categoryName };
      }
    };

    if (conv.step === 'IDLE' || conv.step === 'END') {
      const matched = matchCategory();
      if (matched) {
        await sendProviders(matched.name);
      } else {
        const list = categories.map((c) => `• ${c.icon || ''} ${c.name}`).join('\n');
        await sendMessage(
          phone,
          `¡Hola! Soy el asistente de *WhatServices* 👋\n\n¿Qué servicio necesitas?\n\n${list}\n\nEscribe el nombre del servicio que buscas.`
        );
        conv.step = 'AWAITING_SERVICE';
      }
    } else if (conv.step === 'AWAITING_SERVICE') {
      const matched = matchCategory();
      if (matched) {
        await sendProviders(matched.name);
      } else {
        const list = categories.map((c) => `• ${c.name}`).join('\n');
        await sendMessage(phone, `No reconocí ese servicio. Elige uno de la lista:\n\n${list}`);
      }
    } else if (conv.step === 'SHOWING_RESULTS') {
      conv.step = 'END';
      await sendMessage(
        phone,
        '¡Gracias por usar WhatServices! 😊 Escribe cualquier mensaje para buscar otro servicio.'
      );
    }

    await conv.save();
  } catch (err) {
    console.error('[Bot] Error:', err);
  }
};

module.exports = { verifyWebhook, handleIncoming };
