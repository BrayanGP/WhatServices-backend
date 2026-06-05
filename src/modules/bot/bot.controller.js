const Fuse = require('fuse.js');
const Conversation = require('./conversation.model');
const Provider = require('../providers/provider.model');
const Category = require('../admin/category.model');
const Review = require('../reviews/review.model');
const BotConfig = require('./botconfig.model');
const Intent = require('./intent.model');
const Request = require('../requests/request.model');
const { sendText, sendMedia, sendButtons, sendList } = require('../../utils/evolution');
const { CLIENT_URL, BACKEND_PUBLIC_URL } = require('../../config/env');

// Retraso humano entre mensajes para evitar baneos (configurable)
const REPLY_DELAY_MS = parseInt(process.env.BOT_REPLY_DELAY_MS) || 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Rellena placeholders {key} en las plantillas de mensajes
const fill = (tpl, vars = {}) =>
  String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));

// ----- Helpers -----

const extractIncoming = (req) => {
  const data = req.body?.data;
  if (!data) return null;
  const remoteJid = data.key?.remoteJid || '';
  if (remoteJid.endsWith('@g.us') || remoteJid.includes('broadcast')) return null;
  const phone = remoteJid.split('@')[0];
  const fromMe = data.key?.fromMe === true;
  const text =
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    data.message?.imageMessage?.caption ||
    // respuestas a listas / botones interactivos
    data.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    data.message?.listResponseMessage?.title ||
    data.message?.buttonsResponseMessage?.selectedButtonId ||
    data.message?.templateButtonReplyMessage?.selectedId ||
    '';
  return { phone, fromMe, text: text.trim(), name: data.pushName };
};

const getPostalCode = (text) => {
  const m = text.match(/\b\d{5}\b/);
  return m ? m[0] : null;
};

// detecta una calificacion entrante: "#rate-<idprovider>" en el texto del deep link
const getRateProviderId = (text) => {
  const m = text.match(/#rate-([a-f0-9]{24})/i);
  return m ? m[1] : null;
};

const getScore = (text) => {
  const m = text.match(/[1-5]/);
  return m ? Number(m[0]) : null;
};

// Busca proveedores de un servicio. mode: 'near' (por CP) | 'score' (mejor rating)
const findProviders = async (service, { mode, postalCode } = {}) => {
  const base = { categories: service, availability: 'available', isBlocked: false };
  if (mode === 'near' && postalCode) {
    let providers = await Provider.find({ ...base, postalCode })
      .sort({ 'rating.average': -1 }).limit(5).lean();
    if (providers.length < 5) {
      const ids = providers.map((p) => p._id);
      const extra = await Provider.find({ ...base, _id: { $nin: ids } })
        .sort({ 'rating.average': -1 }).limit(5 - providers.length).lean();
      providers = [...providers, ...extra];
    }
    return providers;
  }
  // score
  return Provider.find(base).sort({ 'rating.average': -1, 'rating.count': -1 }).limit(5).lean();
};

const saveMsg = (conv, from, text) => conv.messages.push({ from, text, at: new Date() });

// Numero en formato WhatsApp (MX por defecto): solo digitos, 10 -> 52+10
const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `52${d}` : d;
};

// Link de contacto: pasa por el backend para registrar la eleccion del cliente y redirige al WhatsApp del proveedor.
const buildContact = (conv, p) =>
  (BACKEND_PUBLIC_URL && conv.currentRequestId)
    ? `${BACKEND_PUBLIC_URL.replace(/\/$/, '')}/wa/choose/${conv.currentRequestId}/${p._id}`
    : `https://wa.me/${waNumber(p.phone)}`;

const photoUrl = (ph) => (typeof ph === 'string' ? ph : ph?.url || '');

// Crea una solicitud en cuanto el cliente elige un servicio (queda registrada SIEMPRE)
const startRequest = async (conv, service) => {
  try {
    const r = await Request.create({
      conversationId: conv._id,
      phone: conv.phone,
      name: conv.name,
      service,
      status: 'nueva',
      statusHistory: [{ status: 'nueva', at: new Date() }],
    });
    conv.currentRequestId = r._id;
  } catch (err) {
    console.error('[Bot] No se pudo crear solicitud:', err.message);
  }
};

// Completa la solicitud cuando se entregan recomendaciones
const completeRequest = async (conv, providers, mode) => {
  try {
    if (!conv.currentRequestId) return;
    await Request.findByIdAndUpdate(conv.currentRequestId, {
      postalCode: conv.postalCode,
      mode,
      suggestedProviders: providers.map((p) => p._id),
    });
  } catch (err) {
    console.error('[Bot] No se pudo completar solicitud:', err.message);
  }
};

const reply = async (conv, phone, text) => {
  await sleep(REPLY_DELAY_MS); // retraso humano anti-baneo
  saveMsg(conv, 'bot', text);
  await sendText(phone, text, conv.instance);
};

// Envia el catalogo: foto de perfil + datos por cada proveedor
const sendCatalog = async (conv, phone, providers, service, cp, cfg) => {
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    const contact = buildContact(conv, p);
    const caption =
      `*${i + 1}. ${p.businessName}*\n` +
      `⭐ ${p.rating?.average || 0}/5 (${p.rating?.count || 0})` +
      `${p.city ? ` · ${p.city}` : ''}\n` +
      `💬 Contactar: ${contact}`;
    const logo = photoUrl(p.profilePhoto);
    if (logo) {
      await sleep(REPLY_DELAY_MS); // retraso humano anti-baneo
      await sendMedia(phone, logo, caption, conv.instance);
      saveMsg(conv, 'bot', `[foto] ${caption}`);
    } else {
      await reply(conv, phone, caption);
    }
  }
  await sendResultsNav(conv, phone, providers, service, cp, cfg);
};

// Menu de navegacion tras mostrar resultados: lista interactiva (best-effort) + texto SIEMPRE
const sendResultsNav = async (conv, phone, providers, service, cp, cfg) => {
  const link = `${CLIENT_URL}/providers?category=${encodeURIComponent(service)}${cp ? `&cp=${cp}` : ''}`;
  if (cfg.useButtons) {
    const rows = providers.map((p, i) => ({
      title: `${i + 1}. ${p.businessName}`.slice(0, 24),
      description: `⭐ ${p.rating?.average || 0}/5${p.city ? ` · ${p.city}` : ''}`.slice(0, 72),
      rowId: `works:${p._id}`,
    }));
    rows.push({ title: '🔄 Otro servicio', description: 'Nueva búsqueda', rowId: 'menu' });
    await sleep(REPLY_DELAY_MS);
    try {
      await sendList(phone, {
        title: 'Ver trabajos',
        description: 'Elige un profesional para ver fotos de sus trabajos.',
        buttonText: 'Ver opciones',
        footerText: 'WhatServices',
        sections: [{ title: service, rows }],
      }, conv.instance);
    } catch (e) { /* si no renderiza, queda el texto */ }
  }
  // fallback de texto SIEMPRE (responder por numero funciona aunque no haya botones)
  await reply(conv, phone, fill(cfg.messages.resultsHint, { count: providers.length, link }));
};

// Muestra los trabajos de un proveedor + navegacion (volver / otro)
const sendProviderWorks = async (conv, phone, provider, cfg) => {
  const contact = buildContact(conv, provider);
  const photos = (provider.photos || []).map(photoUrl).filter(Boolean);
  if (photos.length) {
    await reply(conv, phone, fill(cfg.messages.worksIntro, { business: provider.businessName }));
    for (const url of photos) {
      await sleep(REPLY_DELAY_MS);
      await sendMedia(phone, url, '', conv.instance);
      saveMsg(conv, 'bot', '[trabajo]');
    }
    await reply(conv, phone, `💬 Contactar a *${provider.businessName}*: ${contact}`);
  } else {
    await reply(conv, phone, fill(cfg.messages.noWorks, { business: provider.businessName, contact }));
  }
  if (cfg.useButtons) {
    await sleep(REPLY_DELAY_MS);
    try {
      await sendButtons(phone, {
        description: '¿Qué deseas hacer?',
        footer: 'WhatServices',
        buttons: [
          { type: 'reply', displayText: '🔙 Volver a la lista', id: 'back' },
          { type: 'reply', displayText: '🔄 Otro servicio', id: 'menu' },
        ],
      }, conv.instance);
    } catch (e) { /* fallback de texto abajo */ }
  }
  await reply(conv, phone, fill(cfg.messages.worksNav));
};

// Interpreta la respuesta del cliente en la pantalla de resultados
const parseSelection = (text, lower, ids) => {
  let m = text.match(/works:([a-f0-9]{24})/i);
  if (m) return { works: m[1] };
  if (/^menu$/i.test(text) || /\b(otro|otra|nuevo|nueva)\b/i.test(lower)) return { menu: true };
  if (/^back$/i.test(text) || /\b(volver|regresar|atras|atrás|lista)\b/i.test(lower)) return { back: true };
  m = lower.match(/(?:ver\s+)?trabajos?\s*(\d{1,2})/) || lower.match(/^(\d{1,2})$/);
  if (m) {
    const idx = Number(m[1]) - 1;
    if (idx >= 0 && idx < ids.length) return { works: ids[idx] };
  }
  return {};
};

// ----- Webhook -----
const verifyWebhook = (req, res) => res.sendStatus(200);

const handleIncoming = async (req, res) => {
  res.sendStatus(200);

  try {
    const event = req.body?.event;
    if (event && !['messages.upsert', 'MESSAGES_UPSERT'].includes(event)) return;

    const msg = extractIncoming(req);
    if (!msg || msg.fromMe || !msg.text) return;

    const { phone, text, name } = msg;
    const instance = req.body?.instance;

    let conv = await Conversation.findOne({ phone });
    if (!conv) conv = await Conversation.create({ phone, name, instance });
    if (name && !conv.name) conv.name = name;
    if (instance) conv.instance = instance;
    conv.lastActivity = new Date();
    saveMsg(conv, 'client', text);

    if (conv.humanTakeover) { await conv.save(); return; }

    // ---- Configuracion del bot (on/off + horario) ----
    const cfg = await BotConfig.getSingleton();
    if (!cfg.enabled) { await conv.save(); return; } // bot apagado: no responde

    if (!cfg.isOpenNow()) {
      await reply(conv, phone, fill(cfg.messages.outOfHours, { open: cfg.hours.openHour, close: cfg.hours.closeHour }));
      conv.step = 'END';
      await conv.save();
      return;
    }

    const lower = text.toLowerCase();

    // ---- Entrada de CALIFICACION (QR del empleado) ----
    const rateId = getRateProviderId(text);
    if (rateId && !['RATING_SCORE', 'RATING_COMMENT'].includes(conv.step)) {
      const prov = await Provider.findById(rateId).lean();
      if (prov) {
        conv.context = { ...conv.context, ratingProviderId: rateId, ratingProviderName: prov.businessName };
        conv.step = 'RATING_SCORE';
        await reply(conv, phone,
          `¡Gracias por usar *${prov.businessName}*! 🙌\n\n¿Cómo calificarías el servicio? Responde con un número del *1 al 5* (5 = excelente).`);
        await conv.save();
        return;
      }
    }

    if (conv.step === 'RATING_SCORE') {
      const score = getScore(text);
      if (!score) {
        await reply(conv, phone, 'Por favor responde con un número del *1 al 5*.');
      } else {
        conv.context = { ...conv.context, ratingScore: score };
        conv.step = 'RATING_COMMENT';
        await reply(conv, phone, `¡Gracias! ⭐ ${score}/5\n\n¿Quieres dejar un *comentario*? Escríbelo, o pon *no* para terminar.`);
      }
      await conv.save();
      return;
    }

    if (conv.step === 'RATING_COMMENT') {
      const comment = ['no', 'n', 'nada'].includes(lower) ? '' : text;
      const providerId = conv.context?.ratingProviderId;
      const score = conv.context?.ratingScore;
      if (providerId && score) {
        await Review.create({
          providerId, rating: score, comment,
          reviewerPhone: phone, reviewerName: conv.name, source: 'whatsapp',
        });
        const reviews = await Review.find({ providerId });
        const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
        await Provider.findByIdAndUpdate(providerId, {
          'rating.average': parseFloat(avg.toFixed(1)),
          'rating.count': reviews.length,
        });
      }
      conv.context = {};
      conv.step = 'END';
      await reply(conv, phone, '¡Listo! Tu calificación quedó registrada. 🙏 Gracias por ayudar a otros a elegir mejor.');
      await conv.save();
      return;
    }

    // ---- Datos compartidos del flujo de servicio ----
    const categories = await Category.find({ isActive: true }).lean();
    const fuse = new Fuse(categories, { keys: ['name', 'slug'], threshold: 0.45, ignoreLocation: true });
    const matchCategory = () => {
      const r = fuse.search(lower);
      return r.length ? r[0].item : null;
    };
    const servicesList = categories.map((c) => `• ${c.icon || ''} ${c.name}`.trim()).join('\n');

    // Intenciones (frases de ejemplo -> respuesta), evaluadas por prioridad
    const intents = await Intent.find({ active: true }).sort({ priority: -1 }).lean();
    const intentPhrases = [];
    intents.forEach((it) => (it.examples || []).forEach((ph) => intentPhrases.push({ intent: it, phrase: ph })));
    const intentFuse = new Fuse(intentPhrases, { keys: ['phrase'], threshold: 0.4, ignoreLocation: true });
    const matchIntent = () => {
      if (!intentPhrases.length) return null;
      const r = intentFuse.search(lower);
      return r.length ? r[0].item.intent : null;
    };

    const baseVars = {
      name: conv.name || name || '',
      phone,
      services: servicesList,
      open: cfg.hours.openHour,
      close: cfg.hours.closeHour,
    };

    const askMode = async (serviceName) => {
      conv.selectedService = serviceName;
      conv.step = 'AWAITING_MODE';
      await startRequest(conv, serviceName); // registra la solicitud desde ya
      await reply(conv, phone, fill(cfg.messages.askMode, { service: serviceName }));
    };

    // Aplica una intencion: responde y, si tiene servicio asociado, dispara la busqueda
    const applyIntent = async (intent) => {
      if (intent.response) await reply(conv, phone, fill(intent.response, { ...baseVars, service: intent.service || '' }));
      if (intent.service) await askMode(intent.service);
    };

    // ---- Flujo de busqueda de servicio ----
    if (conv.step === 'IDLE' || conv.step === 'END') {
      const intent = matchIntent();
      if (intent) {
        await applyIntent(intent);
      } else {
        const matched = matchCategory();
        if (matched) await askMode(matched.name);
        else {
          conv.step = 'AWAITING_SERVICE';
          await reply(conv, phone, fill(cfg.messages.welcome, baseVars));
        }
      }
    } else if (conv.step === 'AWAITING_SERVICE') {
      const intent = matchIntent();
      if (intent) {
        await applyIntent(intent);
      } else {
        const matched = matchCategory();
        if (matched) await askMode(matched.name);
        else await reply(conv, phone, fill(cfg.messages.noService, { services: servicesList }));
      }
    } else if (conv.step === 'AWAITING_MODE') {
      const wantsNear = /\b(1|cerca|cercanos|cercano|near|ubicaci)/i.test(lower);
      const wantsScore = /\b(2|mejor|mejores|calificad|score|estrella)/i.test(lower);
      if (wantsNear) {
        conv.step = 'AWAITING_ZIP';
        await reply(conv, phone, fill(cfg.messages.askZip));
      } else if (wantsScore) {
        const providers = await findProviders(conv.selectedService, { mode: 'score' });
        conv.suggestedProviders = providers.map((p) => p._id);
        if (!providers.length) {
          await reply(conv, phone, fill(cfg.messages.noResults, { service: conv.selectedService }));
          conv.step = 'END';
        } else {
          await reply(conv, phone, `Estos son los *${providers.length}* mejor calificados en *${conv.selectedService}*:`);
          await sendCatalog(conv, phone, providers, conv.selectedService, null, cfg);
          await completeRequest(conv, providers, 'score');
          conv.step = 'SHOWING_RESULTS';
        }
      } else {
        await reply(conv, phone, 'Responde *1* (más cercanos) o *2* (mejor calificados).');
      }
    } else if (conv.step === 'AWAITING_ZIP') {
      const cp = getPostalCode(text);
      if (!cp) {
        await reply(conv, phone, 'Envíame tu *código postal* (5 dígitos), por ejemplo: 06000.');
      } else {
        conv.postalCode = cp;
        const providers = await findProviders(conv.selectedService, { mode: 'near', postalCode: cp });
        conv.suggestedProviders = providers.map((p) => p._id);
        if (!providers.length) {
          await reply(conv, phone, fill(cfg.messages.noResults, { service: conv.selectedService }));
          conv.step = 'END';
        } else {
          await reply(conv, phone, `Estos son los *${providers.length}* profesionales de *${conv.selectedService}* más cercanos a ti:`);
          await sendCatalog(conv, phone, providers, conv.selectedService, cp, cfg);
          await completeRequest(conv, providers, 'near');
          conv.step = 'SHOWING_RESULTS';
        }
      }
    } else if (conv.step === 'SHOWING_RESULTS') {
      const ids = (conv.suggestedProviders || []).map(String);
      const sel = parseSelection(text, lower, ids);
      if (sel.works) {
        const prov = await Provider.findById(sel.works).lean();
        if (prov) await sendProviderWorks(conv, phone, prov, cfg);
        else await reply(conv, phone, 'No encontré ese profesional. Responde con un número de la lista.');
      } else if (sel.back) {
        const provs = await Provider.find({ _id: { $in: conv.suggestedProviders } }).lean();
        const ordered = ids.map((id) => provs.find((p) => String(p._id) === id)).filter(Boolean);
        await reply(conv, phone, 'Aquí está de nuevo la lista 👇');
        await sendResultsNav(conv, phone, ordered, conv.selectedService, conv.postalCode, cfg);
      } else if (sel.menu) {
        conv.step = 'AWAITING_SERVICE';
        await reply(conv, phone, fill(cfg.messages.welcome, baseVars));
      } else {
        const intent = matchIntent();
        if (intent) {
          await applyIntent(intent);
        } else {
          const matched = matchCategory();
          if (matched) await askMode(matched.name);
          else {
            const link = `${CLIENT_URL}/providers?category=${encodeURIComponent(conv.selectedService || '')}`;
            await reply(conv, phone, fill(cfg.messages.resultsHint, { count: ids.length, link }));
          }
        }
      }
    }

    await conv.save();
  } catch (err) {
    console.error('[Bot] Error:', err);
  }
};

module.exports = { verifyWebhook, handleIncoming };
