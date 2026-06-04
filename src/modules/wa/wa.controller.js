const QRCode = require('qrcode');
const Setting = require('../admin/setting.model');
const evolution = require('../../utils/evolution');

const norm = (s) => String(s || '').toLowerCase();
const nameOf = (i) => i.name || i.instanceName || i.instance?.instanceName || i.id;
const statusOf = (i) => i.connectionStatus || i.status || i.instance?.status || '';
const jidOf = (i) => i.ownerJid || i.owner || i.number || i.instance?.owner || '';

// Resuelve el numero (solo digitos) de la instancia activa y conectada
const getActiveNumber = async () => {
  const s = await Setting.findOne({ key: 'activeInstance' }).lean();
  const activeName = s?.value || evolution.DEFAULT_INSTANCE;

  const { data } = await evolution.fetchInstances();
  const list = Array.isArray(data) ? data : [];

  // 1) la instancia activa por nombre
  let match = list.find((i) => nameOf(i) === activeName);
  // 2) si no esta o no conectada, cualquier conectada
  if (!match || !['open', 'connected'].includes(norm(statusOf(match)))) {
    match = list.find((i) => ['open', 'connected'].includes(norm(statusOf(i)))) || match;
  }
  if (!match) return null;

  const jid = jidOf(match);
  if (!jid) return null;
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
};

// Redireccion dinamica: el QR de las pancartas apunta aqui (URL fija)
const go = async (req, res) => {
  try {
    const number = await getActiveNumber();
    if (!number) {
      return res
        .status(503)
        .send('El WhatsApp no está disponible en este momento. Intenta más tarde.');
    }
    const text = encodeURIComponent(req.query.text || 'Hola, quiero información de los servicios 👋');
    return res.redirect(302, `https://wa.me/${number}?text=${text}`);
  } catch (err) {
    console.error('[wa/go]', err);
    res.status(500).send('Error');
  }
};

// Redireccion para CALIFICAR a un empleado: su QR personal apunta aqui
const rate = async (req, res) => {
  try {
    const number = await getActiveNumber();
    if (!number) return res.status(503).send('El WhatsApp no está disponible en este momento.');
    const id = req.params.id;
    const text = encodeURIComponent(`Quiero calificar mi servicio #rate-${id}`);
    return res.redirect(302, `https://wa.me/${number}?text=${text}`);
  } catch (err) {
    console.error('[wa/rate]', err);
    res.status(500).send('Error');
  }
};

// PNG del QR personal de calificacion de un empleado
const rateQr = async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const target = `${proto}://${req.get('host')}/wa/rate/${req.params.id}`;
    res.type('png');
    await QRCode.toFileStream(res, target, { width: 600, margin: 2 });
  } catch (err) {
    console.error('[wa/rateQr]', err);
    res.status(500).send('Error');
  }
};

// PNG del QR que codifica la URL fija /wa/go (para imprimir en pancartas)
const qr = async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const target = `${proto}://${req.get('host')}/wa/go`;
    res.type('png');
    await QRCode.toFileStream(res, target, { width: 600, margin: 2 });
  } catch (err) {
    console.error('[wa/qr]', err);
    res.status(500).send('Error');
  }
};

module.exports = { go, qr, rate, rateQr, getActiveNumber };
