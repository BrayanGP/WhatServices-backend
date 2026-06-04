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

// ---- Mensajes ----
const sendText = async (number, text, instance = EVOLUTION_INSTANCE) => {
  const { ok } = await evoFetch(`/message/sendText/${instance}`, {
    method: 'POST',
    body: { number, text },
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
  fetchInstances,
  createInstance,
  connectInstance,
  connectionState,
  logoutInstance,
  deleteInstance,
  setWebhook,
  DEFAULT_INSTANCE: EVOLUTION_INSTANCE,
};
