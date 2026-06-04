const Provider = require('../providers/provider.model');
const User = require('../users/user.model');
const Category = require('./category.model');
const Conversation = require('../bot/conversation.model');
const Setting = require('./setting.model');
const evolution = require('../../utils/evolution');
const { sendText } = evolution;

const getProviders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, city, isVerified, isBlocked } = req.query;
    const filter = {};
    if (city) filter.city = new RegExp(city, 'i');
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (isBlocked !== undefined) filter.isBlocked = isBlocked === 'true';
    const skip = (Number(page) - 1) * Number(limit);
    const [providers, total] = await Promise.all([
      Provider.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .populate('userId', 'name email')
        .lean(),
      Provider.countDocuments(filter),
    ]);
    res.json({ providers, total });
  } catch (err) {
    next(err);
  }
};

const toggleVerify = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    provider.isVerified = !provider.isVerified;
    await provider.save();
    res.json({ isVerified: provider.isVerified });
  } catch (err) {
    next(err);
  }
};

const toggleBlockProvider = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    provider.isBlocked = !provider.isBlocked;
    await provider.save();
    res.json({ isBlocked: provider.isBlocked });
  } catch (err) {
    next(err);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find().select('-passwordHash').skip(skip).limit(Number(limit)).lean(),
      User.countDocuments(),
    ]);
    res.json({ users, total });
  } catch (err) {
    next(err);
  }
};

const toggleBlockUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isBlocked = !user.isBlocked;
    await user.save();
    res.json({ isBlocked: user.isBlocked });
  } catch (err) {
    next(err);
  }
};

const getCategories = async (req, res, next) => {
  try {
    res.json(await Category.find().lean());
  } catch (err) {
    next(err);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (err) {
    next(err);
  }
};

// ----- Conversaciones / Leads -----

const getConversations = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, step } = req.query;
    const filter = {};
    if (step) filter.step = step;
    const skip = (Number(page) - 1) * Number(limit);
    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .select('phone name step selectedService postalCode humanTakeover lastActivity')
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Conversation.countDocuments(filter),
    ]);
    res.json({ conversations, total });
  } catch (err) {
    next(err);
  }
};

const getConversation = async (req, res, next) => {
  try {
    const conv = await Conversation.findById(req.params.id)
      .populate('suggestedProviders', 'businessName phone city rating')
      .lean();
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    res.json(conv);
  } catch (err) {
    next(err);
  }
};

const toggleTakeover = async (req, res, next) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    conv.humanTakeover = !conv.humanTakeover;
    conv.step = conv.humanTakeover ? 'HUMAN' : 'IDLE';
    await conv.save();
    res.json({ humanTakeover: conv.humanTakeover });
  } catch (err) {
    next(err);
  }
};

const replyConversation = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Text required' });
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    await sendText(conv.phone, text, conv.instance);
    conv.messages.push({ from: 'agent', text, at: new Date() });
    conv.humanTakeover = true;
    conv.step = 'HUMAN';
    conv.lastActivity = new Date();
    await conv.save();
    res.json({ ok: true, message: conv.messages[conv.messages.length - 1] });
  } catch (err) {
    next(err);
  }
};

// ----- WhatsApp / Instancias (Evolution) -----

const { BACKEND_PUBLIC_URL } = require('../../config/env');

// URL publica del backend para el webhook. Prioriza BACKEND_PUBLIC_URL porque
// el host de la peticion puede venir del proxy del admin (dominio equivocado).
const selfUrl = (req) => {
  if (BACKEND_PUBLIC_URL) return BACKEND_PUBLIC_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
};

const getActiveInstance = async () => {
  const s = await Setting.findOne({ key: 'activeInstance' }).lean();
  return s?.value || evolution.DEFAULT_INSTANCE;
};

const listInstances = async (req, res, next) => {
  try {
    const [{ data }, active] = await Promise.all([
      evolution.fetchInstances(),
      getActiveInstance(),
    ]);
    res.json({ instances: data || [], active });
  } catch (err) {
    next(err);
  }
};

const createInstance = async (req, res, next) => {
  try {
    const { instanceName } = req.body;
    if (!instanceName?.trim()) return res.status(400).json({ message: 'instanceName required' });
    const { ok, data } = await evolution.createInstance(instanceName.trim());
    if (!ok) return res.status(502).json({ message: 'Evolution error', data });
    // Apuntar el webhook de la nueva instancia a este backend
    await evolution.setWebhook(instanceName.trim(), `${selfUrl(req)}/api/bot/webhook`, ['MESSAGES_UPSERT']);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

const connectInstance = async (req, res, next) => {
  try {
    const { data } = await evolution.connectInstance(req.params.name);
    res.json(data); // incluye qrcode base64 / pairing code
  } catch (err) {
    next(err);
  }
};

const instanceState = async (req, res, next) => {
  try {
    const { data } = await evolution.connectionState(req.params.name);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const logoutInstance = async (req, res, next) => {
  try {
    const { data } = await evolution.logoutInstance(req.params.name);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const deleteInstance = async (req, res, next) => {
  try {
    const { data } = await evolution.deleteInstance(req.params.name);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const setActiveInstance = async (req, res, next) => {
  try {
    const { instanceName } = req.body;
    if (!instanceName?.trim()) return res.status(400).json({ message: 'instanceName required' });
    // Asegurar webhook apuntando al backend
    await evolution.setWebhook(instanceName.trim(), `${selfUrl(req)}/api/bot/webhook`, ['MESSAGES_UPSERT']);
    const s = await Setting.findOneAndUpdate(
      { key: 'activeInstance' },
      { value: instanceName.trim() },
      { upsert: true, new: true }
    );
    res.json({ active: s.value });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProviders, toggleVerify, toggleBlockProvider,
  getUsers, toggleBlockUser,
  getCategories, createCategory, updateCategory,
  getConversations, getConversation, toggleTakeover, replyConversation,
  listInstances, createInstance, connectInstance, instanceState,
  logoutInstance, deleteInstance, setActiveInstance,
};
