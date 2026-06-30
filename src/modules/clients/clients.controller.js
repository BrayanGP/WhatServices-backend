const Client = require('./client.model');

const register = async (req, res, next) => {
  try {
    const { name, phone, providerId } = req.body;
    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ message: 'Nombre y teléfono son obligatorios.' });
    }
    const client = await Client.create({
      name:       name.trim(),
      phone:      phone.trim(),
      providerId: providerId || undefined,
      source:     'whatsapp_cta',
    });
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
};

module.exports = { register };
