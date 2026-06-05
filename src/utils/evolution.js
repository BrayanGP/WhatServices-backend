const { EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE } = require('../config/env');

const ready = () => Boolean(EVOLUTION_URL && EVOLUTION_API_KEY);

const evoFetch = async (path, { method = 'GET', body } = {}) => {
  if (!ready()) {
    console.warn('[Evolution] No configurado (EVOLUTION_URL / EVOLUTION_API_KEY).');
    return { ok: false, status: 0, data: { message: 'Evolution not configured' } };
  }
  try {
    const res = await fetch(`${EVOLUTION_URL}${path}`, {
      method,
      headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) console.error('[Evolution]', method, path, res.status, data);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('[Evolution] Excepcion:', method, path, err.message);
    return { ok: false, status: 0, data: { message: err.message } };
  }
};

// Reintenta el POST si falla (el PRIMER envío a un contacto nuevo a veces falla
// porque la sesión de WhatsApp aún no está lista → por eso "había que mandar 2 mensajes").
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evoPost = async (path, body, tries = 3, gap = 1500) => {
  let res = await evoFetch(path, { method: 'POST', body });
  for (let i = 1; i < tries && !res.ok; i += 1) {
    await sleep(gap);
    res = await evoFetch(path, { method: 'POST', body });
  }
  if (!res.ok) console.error('[Evolution] envío falló tras', tries, 'intentos:', path);
  return res.ok;
};

// ---- Mensajes ----
const sendText = async (number, text, instance = EVOLUTION_INSTANCE) =>
  evoPost(`/message/sendText/${instance}`, { number, text });

const sendMedia = async (number, mediaUrl, caption = '', instance = EVOLUTION_INSTANCE) =>
  evoPost(`/message/sendMedia/${instance}`, { number, mediatype: 'image', media: mediaUrl, caption });

// Botones interactivos (reply buttons). Devuelve true si Evolution lo aceptó.
// El llamador SIEMPRE debe tener un fallback de texto por si el dispositivo no los renderiza.
const sendButtons = async (number, { title = '', description = '', footer = '', buttons = [] }, instance = EVOLUTION_INSTANCE) => {
  const { ok } = await evoFetch(`/message/sendButtons/${instance}`, {
    method: 'POST',
    body: { number, title, description, footer, buttons },
  });
  return ok;
};

// Lista interactiva (menú con secciones y filas). Ideal para >3 opciones.
const sendList = async (number, { title = '', description = '', buttonText = 'Ver', footerText = '', sections = [] }, instance = EVOLUTION_INSTANCE) => {
  const { ok } = await evoFetch(`/message/sendList/${instance}`, {
    method: 'POST',
    body: { number, title, description, buttonText, footerText, sections },
  });
  return ok;
};

// Encuesta nativa de WhatsApp. Nota: el VOTO llega por messages.update (poco fiable
// para ramificar). El envío sí funciona; la ramificación usa fallback por texto.
const sendPoll = async (number, { name = '', values = [], selectableCount = 1 }, instance = EVOLUTION_INSTANCE) => {
  const { ok } = await evoFetch(`/message/sendPoll/${instance}`, {
    method: 'POST',
    body: { number, name, selectableCount, values },
  });
  return ok;
};

// ---- Instancias ----
const fetchInstances = () => evoFetch('/instance/fetchInstances');

const createInstance = (instanceName) =>
  evoFetch('/instance/create', {
    method: 'POST',
    body: { instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' },
  });

const connectInstance = (instance) => evoFetch(`/instance/connect/${instance}`);

const connectionState = (instance) => evoFetch(`/instance/connectionState/${instance}`);

const logoutInstance = (instance) =>
  evoFetch(`/instance/logout/${instance}`, { method: 'DELETE' });

const deleteInstance = (instance) =>
  evoFetch(`/instance/delete/${instance}`, { method: 'DELETE' });

const setWebhook = (instance, url, events = ['MESSAGES_UPSERT']) =>
  evoFetch(`/webhook/set/${instance}`, {
    method: 'POST',
    body: { webhook: { enabled: true, url, events } },
  });

module.exports = {
  sendText,
  sendMedia,
  sendButtons,
  sendList,
  sendPoll,
  fetchInstances,
  createInstance,
  connectInstance,
  connectionState,
  logoutInstance,
  deleteInstance,
  setWebhook,
  DEFAULT_INSTANCE: EVOLUTION_INSTANCE,
};
