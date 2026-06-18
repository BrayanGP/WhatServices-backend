const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = require('../config/env');

// Formatea a E.164 para SMS a móviles de México (+521 + 10 dígitos), igual que el curl que funcionó.
const toE164Mx = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('521') && d.length === 13) return `+${d}`;
  if (d.startsWith('52') && d.length === 12) return `+521${d.slice(2)}`;
  return `+521${d.slice(-10)}`;
};

// Envía un SMS por Twilio (REST API, sin SDK). Nunca loguea el token. Devuelve la data o null.
const sendSms = async (to, body) => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
    console.error('[twilio] Faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM');
    return null;
  }
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const params = new URLSearchParams({ From: TWILIO_FROM, To: toE164Mx(to), Body: String(body || '') });
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('[twilio] Error', res.status, ':', data?.message || JSON.stringify(data)); return null; }
    console.log('[twilio] SMS enviado | sid:', data.sid, '| to:', toE164Mx(to));
    return data;
  } catch (err) {
    console.error('[twilio] Error de red:', err.message);
    return null;
  }
};

// OTP por SMS (registro / olvidé contraseña). Vigencia 5 minutos.
const sendOtp = (to, code) =>
  sendSms(to, `Tu codigo de verificacion de WhatServices es: ${code}. Expira en 5 minutos. No lo compartas.`);

module.exports = { sendSms, sendOtp, toE164Mx };
