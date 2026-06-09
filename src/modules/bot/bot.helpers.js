const Provider = require('../providers/provider.model');
const Request = require('../requests/request.model');
const Category = require('../admin/category.model');
// Transporte de WhatsApp: ahora WhatsApp Cloud API (Meta) en vez de Evolution.
const { sendText, sendMedia, sendButtons, sendList, sendPoll } = require('../../utils/whatsappMeta');
const { CLIENT_URL, BACKEND_PUBLIC_URL } = require('../../config/env');

// Sin retraso entre mensajes: con WhatsApp Cloud API (Meta) no se necesita (era anti-baneo de Baileys).
// Fijo en 0 (ignora BOT_REPLY_DELAY_MS) para responder al instante.
const REPLY_DELAY_MS = 0;
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

// Top de proveedores (para variables/carruseles dinámicos).
// mode: 'score' (mejor calificados) | 'near' (más cercanos por CP). service opcional.
const getTopProviders = async ({ service, mode = 'score', postalCode, limit = 5 } = {}) => {
  const base = { availability: 'available', isBlocked: false };
  if (service) base.categories = service;
  if (mode === 'near' && postalCode) {
    let providers = await Provider.find({ ...base, postalCode }).sort({ 'rating.average': -1 }).limit(limit).lean();
    if (providers.length < limit) {
      const ids = providers.map((p) => p._id);
      const extra = await Provider.find({ ...base, _id: { $nin: ids } }).sort({ 'rating.average': -1 }).limit(limit - providers.length).lean();
      providers = [...providers, ...extra];
    }
    return providers;
  }
  return Provider.find(base).sort({ 'rating.average': -1, 'rating.count': -1 }).limit(limit).lean();
};

// Lista de proveedores como texto numerado (para {topRated}/{nearby})
const formatProviderList = (providers = []) =>
  providers.map((p, i) => `${i + 1}. ${p.businessName} ⭐${p.rating?.average || 0}${p.city ? ` · ${p.city}` : ''}`).join('\n');

// Numero en formato WhatsApp (MX por defecto): solo digitos, 10 -> 52+10
const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `52${d}` : d;
};

// Link de contacto: SIEMPRE directo al WhatsApp del proveedor (wa.me genera vista previa;
// el link al backend /wa/choose no renderiza en WhatsApp). La solicitud se registra igual con startRequest.
const buildContact = (conv, p) => {
  const num = waNumber(p.phone);
  const service = conv.selectedService ? ` de ${conv.selectedService}` : '';
  const negocio = p.businessName ? ` (${p.businessName})` : '';
  const saludo = `¡Hola${negocio}! 👋 Te contacto desde WhatServices. Me interesa tu servicio${service}. ¿Tienes disponibilidad? 😊`;
  return `https://wa.me/${num}?text=${encodeURIComponent(saludo)}`;
};

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
    const logo = photoUrl(p.profilePhoto) || photoUrl((p.photos || [])[0]);
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

// Menu de navegacion tras mostrar resultados: LISTA interactiva de Meta (elegir sin escribir número) + fallback de texto.
const sendResultsNav = async (conv, phone, providers, service, cp, cfg) => {
  const link = `${CLIENT_URL}/providers?category=${encodeURIComponent(service)}${cp ? `&cp=${cp}` : ''}`;
  const rows = providers.map((p, i) => ({
    title: `${i + 1}. ${p.businessName}`.slice(0, 24),
    description: `⭐ ${p.rating?.average || 0}/5${p.city ? ` · ${p.city}` : ''}`.slice(0, 72),
    rowId: `works:${p._id}`,
  }));
  rows.push({ title: '🔄 Otra búsqueda', description: 'Buscar otro servicio', rowId: 'menu' });
  let ok = false;
  try {
    ok = await sendList(phone, {
      title: '', description: `👇 Elige un profesional de *${service}* para ver sus *trabajos* 📸 y contacto:`,
      buttonText: 'Ver profesionales', footerText: 'WhatServices',
      sections: [{ title: service.slice(0, 24) || 'Profesionales', rows }],
    }, conv.instance);
  } catch (e) { /* fallback de texto abajo */ }
  saveMsg(conv, 'bot', `[lista] ${providers.length} profesionales de ${service}`);
  if (!ok) await reply(conv, phone, fill(cfg.messages.resultsHint, { count: providers.length, link }));
};

// Envía las categorías disponibles (con proveedores) como LISTA interactiva de Meta.
// Al tocar una fila, el id = nombre de la categoría → matchService la reconoce.
const sendServicesList = async (conv, phone, cfg) => {
  const withProviders = await Provider.distinct('categories', { isBlocked: false });
  const set = new Set((withProviders || []).map((c) => String(c)));
  let cats = await Category.find({ status: 'active', isActive: true }).sort({ name: 1 }).lean();
  cats = cats.filter((c) => set.has(c.name));
  if (!cats.length) {
    await reply(conv, phone, 'Por ahora no hay servicios disponibles. Escríbeme *hola* más tarde. 🙏');
    return;
  }
  const rows = cats.slice(0, 10).map((c) => ({
    title: `${c.icon || '•'} ${c.name}`.trim().slice(0, 24),
    description: '',
    rowId: c.name,
  }));
  let ok = false;
  try {
    ok = await sendList(phone, {
      title: '', description: '¿Qué servicio necesitas? 🔍 Elige una categoría:',
      buttonText: 'Ver servicios', footerText: 'WhatServices',
      sections: [{ title: 'Servicios', rows }],
    }, conv.instance);
  } catch (e) { /* fallback de texto abajo */ }
  saveMsg(conv, 'bot', '[lista servicios]');
  if (!ok) {
    const list = cats.map((c) => `• ${c.icon || ''} ${c.name}`.trim()).join('\n');
    await reply(conv, phone, `¿Qué servicio necesitas? 🔍\n\n${list}`);
  }
};

// Muestra al profesional (tarjeta: logo + datos + contacto) + sus trabajos + navegacion.
const sendProviderWorks = async (conv, phone, provider, cfg) => {
  const contact = buildContact(conv, provider);
  // Tarjeta del profesional (logo de perfil + nombre + calificación + ciudad + contacto)
  const head = `*${provider.businessName}*\n⭐ ${provider.rating?.average || 0}/5 (${provider.rating?.count || 0})${provider.city ? ` · ${provider.city}` : ''}\n💬 Contactar: ${contact}`;
  const logo = photoUrl(provider.profilePhoto);
  if (logo) { await sendMedia(phone, logo, head, conv.instance); saveMsg(conv, 'bot', `[perfil] ${head}`); }
  else await reply(conv, phone, head);
  // Trabajos
  const photos = (provider.photos || []).map(photoUrl).filter(Boolean);
  if (photos.length) {
    await reply(conv, phone, fill(cfg.messages.worksIntro, { business: provider.businessName }));
    for (const url of photos) {
      await sleep(REPLY_DELAY_MS);
      await sendMedia(phone, url, '', conv.instance);
      saveMsg(conv, 'bot', '[trabajo]');
    }
  } else {
    await reply(conv, phone, `*${provider.businessName}* aún no ha subido fotos de sus trabajos. 📷`);
  }
  // Botones interactivos de Meta (volver a la lista / nueva búsqueda) + fallback de texto.
  let ok = false;
  try {
    ok = await sendButtons(phone, {
      description: '¿Qué deseas hacer?', footer: 'WhatServices',
      buttons: [
        { type: 'reply', displayText: '🔙 Volver a la lista', id: 'back' },
        { type: 'reply', displayText: '🔄 Otra búsqueda', id: 'menu' },
      ],
    }, conv.instance);
  } catch (e) { /* fallback de texto abajo */ }
  if (!ok) await reply(conv, phone, fill(cfg.messages.worksNav));
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

// ---- Componentes interactivos (con fallback a texto numerado) ----

// Botones de respuesta rápida (máx 3). text ya viene con variables resueltas.
const sendButtonsNode = async (conv, phone, { text = '', buttons = [] }, cfg) => {
  await sleep(REPLY_DELAY_MS);
  const list = (buttons || []).slice(0, 3);
  let ok = false;
  try {
    ok = await sendButtons(phone, {
      description: text || ' ', footer: 'WhatServices',
      buttons: list.map((b) => ({ type: 'reply', displayText: b.label, id: b.id })),
    }, conv.instance);
  } catch (e) { /* fallback abajo */ }
  saveMsg(conv, 'bot', `[botones] ${text}\n` + list.map((b) => `• ${b.label}`).join('\n'));
  if (!ok) await reply(conv, phone, `${text}\n\n` + list.map((b, i) => `${i + 1}. ${b.label}`).join('\n'));
};

// Lista interactiva con secciones/filas.
const sendListNode = async (conv, phone, { text = '', buttonText = 'Ver opciones', footer = 'WhatServices', sections = [] }, cfg) => {
  await sleep(REPLY_DELAY_MS);
  const secs = (sections || []).map((s) => ({
    title: s.title || '',
    rows: (s.rows || []).map((r) => ({ title: r.label, description: r.description || '', rowId: r.id })),
  }));
  let ok = false;
  try {
    ok = await sendList(phone, { title: '', description: text || ' ', buttonText, footerText: footer, sections: secs }, conv.instance);
  } catch (e) { /* fallback abajo */ }
  const flat = (sections || []).flatMap((s) => s.rows || []);
  saveMsg(conv, 'bot', `[lista] ${text}\n` + flat.map((r) => `• ${r.label}`).join('\n'));
  if (!ok) await reply(conv, phone, `${text}\n\n` + flat.map((r, i) => `${i + 1}. ${r.label}`).join('\n'));
};

// Encuesta nativa (el voto puede no ramificar; siempre se manda fallback con números).
const sendPollNode = async (conv, phone, { question = '', options = [], multi = false }, cfg) => {
  await sleep(REPLY_DELAY_MS);
  const values = (options || []).map((o) => o.label);
  let ok = false;
  try {
    ok = await sendPoll(phone, { name: question, values, selectableCount: multi ? values.length : 1 }, conv.instance);
  } catch (e) { /* fallback abajo */ }
  saveMsg(conv, 'bot', `[encuesta] ${question}\n` + (options || []).map((o) => `• ${o.label}`).join('\n'));
  if (!ok) await reply(conv, phone, `${question}\n\n` + (options || []).map((o, i) => `${i + 1}. ${o.label}`).join('\n'));
};

// Carrusel = galería de tarjetas (secuencia imagen + texto). WhatsApp no tiene carrusel nativo en Baileys.
const sendCarousel = async (conv, phone, cards = [], cfg) => {
  for (const c of (cards || [])) {
    const caption = [c.title ? `*${c.title}*` : '', c.body || ''].filter(Boolean).join('\n');
    if (c.image) {
      await sleep(REPLY_DELAY_MS);
      try { await sendMedia(phone, c.image, caption, conv.instance); } catch (e) { /* ignore */ }
      saveMsg(conv, 'bot', `[tarjeta] ${caption}`);
    } else if (caption) {
      await reply(conv, phone, caption);
    }
  }
};

module.exports = {
  REPLY_DELAY_MS, sleep, fill, getPostalCode, getScore, findProviders, saveMsg,
  waNumber, buildContact, photoUrl, startRequest, completeRequest, reply,
  sendCatalog, sendResultsNav, sendProviderWorks, parseSelection, sendServicesList,
  sendButtonsNode, sendListNode, sendPollNode, sendCarousel,
  getTopProviders, formatProviderList,
};
