const axios = require('axios');
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

const post = async (payload) => {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.error('[meta] Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID');
    return null;
  }
  try {
    const { data } = await axios.post(url(), { messaging_product: 'whatsapp', ...payload }, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return data;
  } catch (err) {
    console.error('[meta] Error:', JSON.stringify(err.response?.data || err.message));
    return null;
  }
};

// Texto libre (solo válido dentro de la ventana de 24 h del usuario)
const sendText = (to, body) =>
  post({ to: waNumber(to), type: 'text', text: { preview_url: true, body: String(body).slice(0, 4096) } });

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

module.exports = { sendText, sendOtp, waNumber };
