const {
  GRAPH_API_VERSION, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
  OTP_TEMPLATE_NAME, TEMPLATE_LANG,
} = require('../config/env');

const url = () => `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

// Número a formato WhatsApp (MX por defecto): solo dígitos, 10 -> 52+10
const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length === 10 ? `52${d}` : d;
};

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

// POST a la Graph API con fetch nativo. Nunca loguea el token. Devuelve la data o null.
const post = async (payload) => {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.error('[meta] Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID');
    return null;
  }
  const endpoint = url();
  // --- DIAGNÓSTICO (no cambia la lógica) ---
  console.log('[meta][diag] POST', endpoint);
  console.log('[meta][diag] phoneNumberId:', WHATSAPP_PHONE_NUMBER_ID, '| graphVersion:', GRAPH_API_VERSION);
  console.log('[meta][diag] token(10):', String(WHATSAPP_ACCESS_TOKEN).slice(0, 10) + '…', '| len:', String(WHATSAPP_ACCESS_TOKEN).length);
  console.log('[meta][diag] payload:', JSON.stringify({ messaging_product: 'whatsapp', ...payload }));
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    console.log('[meta][diag] status:', res.status, '| body:', JSON.stringify(data));
    if (!res.ok) { console.error('[meta] Error:', JSON.stringify(data)); return null; }
    return data;
  } catch (err) {
    console.error('[meta] Error de red:', err.message);
    return null;
  }
};

// ---- Mensajes (misma firma que utils/evolution para reusar el motor del bot) ----

const sendText = async (number, text /* , instance */) =>
  post({ to: waNumber(number), type: 'text', text: { preview_url: true, body: clip(text, 4096) } });

const sendMedia = async (number, mediaUrl, caption = '' /* , instance */) =>
  post({ to: waNumber(number), type: 'image', image: { link: mediaUrl, caption: clip(caption, 1024) } });

// Botones de respuesta rápida (máx 3). buttons: [{ type:'reply', displayText, id }]
const sendButtons = async (number, { title = '', description = '', footer = '', buttons = [] } /* , instance */) => {
  const body = clip(description || title || ' ', 1024);
  const res = await post({
    to: waNumber(number),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      ...(footer ? { footer: { text: clip(footer, 60) } } : {}),
      action: {
        buttons: (buttons || []).slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: clip(b.id, 256), title: clip(b.displayText || b.label || b.id, 20) },
        })),
      },
    },
  });
  return !!res;
};

// Lista interactiva. sections: [{ title, rows:[{ title, description, rowId }] }]  (máx 10 filas)
const sendList = async (number, { title = '', description = '', buttonText = 'Ver', footerText = '', sections = [] } /* , instance */) => {
  const body = clip(description || title || ' ', 1024);
  let remaining = 10;
  const secs = (sections || []).map((s) => {
    const rows = (s.rows || []).slice(0, Math.max(0, remaining)).map((r) => ({
      id: clip(r.rowId || r.id, 200),
      title: clip(r.title || r.label, 24),
      ...(r.description ? { description: clip(r.description, 72) } : {}),
    }));
    remaining -= rows.length;
    return { title: clip(s.title || ' ', 24), rows };
  }).filter((s) => s.rows.length);
  if (!secs.length) return false;
  const res = await post({
    to: waNumber(number),
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      ...(footerText ? { footer: { text: clip(footerText, 60) } } : {}),
      action: { button: clip(buttonText, 20), sections: secs },
    },
  });
  return !!res;
};

// WhatsApp Cloud API no soporta encuestas nativas → devolvemos false (el motor cae a texto).
const sendPoll = async () => false;

// Marca un mensaje entrante como leído (mejora la calificación de calidad del número).
const markRead = (messageId) => {
  if (!messageId) return Promise.resolve(null);
  return post({ status: 'read', message_id: messageId });
};

// OTP por template de autenticación (business-initiated → evita baneos)
const sendOtp = (to, code) =>
  post({
    to: waNumber(to),
    type: 'template',
    template: {
      name: OTP_TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: String(code) }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(code) }] },
      ],
    },
  });

module.exports = {
  sendText, sendMedia, sendButtons, sendList, sendPoll, sendOtp, markRead, waNumber,
  DEFAULT_INSTANCE: '',
};
