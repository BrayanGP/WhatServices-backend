const Provider = require('../providers/provider.model');
const Request = require('../requests/request.model');
const { sendText, sendMedia, sendButtons, sendList } = require('../../utils/evolution');
const { CLIENT_URL, BACKEND_PUBLIC_URL } = require('../../config/env');

// Retraso humano entre mensajes para evitar baneos (configurable)
const REPLY_DELAY_MS = parseInt(process.env.BOT_REPLY_DELAY_MS) || 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Rellena placeholders {key} en las plantillas de mensajes
const fill = (tpl, vars = {}) =>
  String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));

const getPostalCode = (text) => {
  const m = String(text || '').match(/\b\d{5}\b/);
  return m ? m[0] : null;
};

const getScore = (text) => {
  const m = String(text || '').match(/[1-5]/);
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
  let m = String(text || '').match(/works:([a-f0-9]{24})/i);
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

module.exports = {
  REPLY_DELAY_MS, sleep, fill, getPostalCode, getScore, findProviders, saveMsg,
  waNumber, buildContact, photoUrl, startRequest, completeRequest, reply,
  sendCatalog, sendResultsNav, sendProviderWorks, parseSelection,
};
