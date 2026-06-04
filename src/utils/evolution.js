const { EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE } = require('../config/env');

/**
 * Envia un mensaje de texto por la Evolution API.
 * @param {string} number - numero destino (solo digitos, ej. 5215512345678)
 * @param {string} text - cuerpo del mensaje
 */
const sendText = async (number, text) => {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    console.warn('[Evolution] No configurado (EVOLUTION_URL / EVOLUTION_API_KEY). Skip ->', number);
    return;
  }
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        apikey: EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number, text }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Evolution] Error al enviar:', res.status, err);
    }
    return res.ok;
  } catch (err) {
    console.error('[Evolution] Excepcion al enviar:', err.message);
    return false;
  }
};

module.exports = { sendText };
