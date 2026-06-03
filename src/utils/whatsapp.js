const { WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN } = require('../config/env');

const sendMessage = async (to, text) => {
  if (!WA_PHONE_NUMBER_ID || !WA_ACCESS_TOKEN) {
    console.warn('[WhatsApp] Not configured, skipping message to', to);
    return;
  }
  const url = `https://graph.facebook.com/v19.0/${WA_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    console.error('[WhatsApp] API error:', err);
  }
};

module.exports = { sendMessage };
