const Client = require('./client.model');

const register = async (req, res, next) => {
  try {
    const { name, phone, providerId } = req.body;
    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ message: 'Nombre y teléfono son obligatorios.' });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    // Si ya existe, devolvemos el cliente existente (idempotente)
    const existing = await Client.findOne({ phone: cleanPhone });
    if (existing) return res.json(existing);

    const client = await Client.create({
      name:       name.trim(),
      phone:      cleanPhone,
      providerId: providerId || undefined,
      source:     'whatsapp_cta',
    });
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone?.trim()) return res.status(400).json({ message: 'Teléfono requerido.' });
    const cleanPhone = phone.replace(/\D/g, '');
    const client = await Client.findOne({ phone: cleanPhone });
    if (!client) return res.status(404).json({ message: 'not_found' });
    res.json(client);
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login };
