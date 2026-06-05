const bcrypt = require('bcryptjs');
const Provider = require('../providers/provider.model');
const User = require('../users/user.model');
const Category = require('./category.model');
const Conversation = require('../bot/conversation.model');
const BotConfig = require('../bot/botconfig.model');
const Intent = require('../bot/intent.model');
const BotFlow = require('../bot/botflow.model');
const FlowTemplate = require('../bot/flowtemplate.model');
const Request = require('../requests/request.model');
const Role = require('./role.model');
const Setting = require('./setting.model');
const { MODULES } = require('../../config/modules');
const evolution = require('../../utils/evolution');
const { sendText } = evolution;

const getProviders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, city, category, q, loc, isVerified, isBlocked } = req.query;
    const filter = {};
    if (city) filter.city = new RegExp(city, 'i');
    if (category) filter.categories = category; // filtro por giro/oficio
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (isBlocked !== undefined) filter.isBlocked = isBlocked === 'true';
    const and = [];
    if (q) {
      const rx = new RegExp(q, 'i');
      and.push({ $or: [{ businessName: rx }, { ownerName: rx }, { phone: rx }] });
    }
    if (loc) { // filtro por domicilio o codigo postal
      const rl = new RegExp(loc, 'i');
      and.push({ $or: [{ address: rl }, { postalCode: rl }, { city: rl }] });
    }
    if (and.length) filter.$and = and;
    const skip = (Number(page) - 1) * Number(limit);
    const [providers, total] = await Promise.all([
      Provider.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('userId', 'name email phone')
        .lean(),
      Provider.countDocuments(filter),
    ]);
    res.json({ providers, total });
  } catch (err) {
    next(err);
  }
};

// Reinicia la contraseña del proveedor (solo admin/BD). Devuelve la nueva para compartirla.
const resetProviderPassword = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id).lean();
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    if (!provider.userId) return res.status(400).json({ message: 'Este proveedor no tiene cuenta de acceso' });

    // Contraseña legible: Ws + 6 alfanum + símbolo
    const rnd = Math.random().toString(36).slice(-6);
    const newPassword = `Ws${rnd}!`;
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(provider.userId, { passwordHash });

    res.json({ password: newPassword });
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

// Solo usuarios del PANEL (admin/staff), no clientes ni proveedores del front
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const filter = { role: { $in: ['admin', 'staff'] } };
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).select('-passwordHash').populate('roleId', 'name modules').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ users, total });
  } catch (err) {
    next(err);
  }
};

// Crea un usuario del panel (staff con rol asignado)
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, roleId } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email y password son obligatorios' });
    if (password.length < 6) return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Ya existe un usuario con ese correo' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role: 'staff', roleId: roleId || null });
    const out = await User.findById(user._id).select('-passwordHash').populate('roleId', 'name modules').lean();
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
};

// Cambia el rol de un usuario del panel
const updateUserRole = async (req, res, next) => {
  try {
    const { roleId } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'El administrador principal tiene acceso total' });
    user.roleId = roleId || null;
    await user.save();
    const out = await User.findById(user._id).select('-passwordHash').populate('roleId', 'name modules').lean();
    res.json(out);
  } catch (err) {
    next(err);
  }
};

// Reinicia la contraseña de un usuario del panel
const resetUserPassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const rnd = Math.random().toString(36).slice(-6);
    const newPassword = `Ws${rnd}!`;
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ password: newPassword });
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
    const { status } = req.query;
    const filter = status ? { status } : {};
    const categories = await Category.find(filter)
      .populate('suggestedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json(categories);
  } catch (err) {
    next(err);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const category = await Category.create({ ...req.body, status: 'active', isActive: true });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const before = await Category.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'Category not found' });
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });

    // Si cambió el nombre, propagar a todo lo que referencia la categoría por nombre
    const oldName = before.name;
    const newName = category.name;
    if (oldName && newName && oldName !== newName) {
      // Proveedores (categories es arreglo de nombres)
      await Provider.updateMany(
        { categories: oldName },
        { $set: { 'categories.$[el]': newName } },
        { arrayFilters: [{ el: oldName }] },
      );
      // Intenciones del bot que disparan esta categoría
      await Intent.updateMany({ service: oldName }, { $set: { service: newName } });
      // Flujo visual del bot (borrador + publicado): nodos de acción y condiciones
      try {
        const flow = await BotFlow.findOne({ key: 'default' });
        if (flow) {
          const replaceIn = (graph) => {
            (graph?.nodes || []).forEach((n) => {
              if (n.data && n.data.service === oldName) n.data.service = newName;
              if (n.data && Array.isArray(n.data.cases)) {
                n.data.cases.forEach((c) => (c.rules || []).forEach((r) => {
                  if (r.field === 'service' && r.value === oldName) r.value = newName;
                }));
              }
            });
          };
          replaceIn(flow.draft); replaceIn(flow.published);
          flow.markModified('draft'); flow.markModified('published');
          await flow.save();
        }
      } catch (e) { console.error('[updateCategory] sync flujo:', e.message); }
    }
    res.json(category);
  } catch (err) {
    next(err);
  }
};

// Aprobar o rechazar una categoría sugerida
const reviewCategory = async (req, res, next) => {
  try {
    const { action } = req.body; // 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'action debe ser "approve" o "reject"' });
    }
    const update = action === 'approve'
      ? { status: 'active', isActive: true }
      : { status: 'rejected', isActive: false };

    const category = await Category.findByIdAndUpdate(req.params.id, update, { new: true });
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

// ----- Solicitudes -----

const getRequests = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, service } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (service) filter.service = service;
    const skip = (Number(page) - 1) * Number(limit);
    const [requests, total] = await Promise.all([
      Request.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('assignedProvider', 'businessName phone')
        .lean(),
      Request.countDocuments(filter),
    ]);
    res.json({ requests, total });
  } catch (err) {
    next(err);
  }
};

const getRequest = async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('suggestedProviders', 'businessName phone city rating')
      .populate('assignedProvider', 'businessName phone city rating')
      .lean();
    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json(request);
  } catch (err) {
    next(err);
  }
};

const updateRequest = async (req, res, next) => {
  try {
    const { status, assignedProvider, note } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (assignedProvider !== undefined) request.assignedProvider = assignedProvider || null;
    if (status && status !== request.status) {
      request.status = status;
    }
    request.statusHistory.push({ status: request.status, note: note || '', at: new Date() });
    await request.save();
    const populated = await request.populate('assignedProvider', 'businessName phone');
    res.json(populated);
  } catch (err) {
    next(err);
  }
};

// ----- Dashboard / Estadisticas -----

const Review = require('../reviews/review.model');
const TZ = 'America/Mexico_City';

const getStats = async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

    const [
      providers, users, conversations, categories, reviews, requests,
      requestsByDay, providersByDay, topServices, peakHours, topProviders,
      // operativos
      newRequests, requestsToday, pendingProviders, humanConversations,
      recentRequests, pendingProvidersList, messagesTodayAgg,
    ] = await Promise.all([
      Provider.countDocuments(),
      User.countDocuments(),
      Conversation.countDocuments(),
      Category.countDocuments({ isActive: true }),
      Review.countDocuments(),
      Request.countDocuments(),

      // Solicitudes por dia (14d) — historial real
      Request.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      // Profesionales nuevos por dia (14d)
      Provider.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      // Servicios mas pedidos (historial completo desde solicitudes)
      Request.aggregate([
        { $match: { service: { $ne: null } } },
        { $group: { _id: '$service', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),

      // Horarios pico (por hora local de la solicitud)
      Request.aggregate([
        { $group: { _id: { $hour: { date: '$createdAt', timezone: TZ } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      // Ranking de profesionales por rating
      Provider.find({ 'rating.count': { $gt: 0 } })
        .sort({ 'rating.average': -1, 'rating.count': -1 })
        .limit(8)
        .select('businessName city rating categories')
        .lean(),

      // --- Operativos ---
      Request.countDocuments({ status: 'nueva' }),
      Request.countDocuments({ createdAt: { $gte: startOfDay } }),
      Provider.countDocuments({ isVerified: false, isBlocked: false }),
      Conversation.countDocuments({ humanTakeover: true }),

      // Bandeja: ultimas solicitudes con su proveedor elegido
      Request.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('assignedProvider', 'businessName')
        .select('name phone service status assignedProvider createdAt')
        .lean(),

      // Profesionales por aprobar
      Provider.find({ isVerified: false, isBlocked: false })
        .sort({ createdAt: -1 })
        .limit(6)
        .select('businessName categories city')
        .lean(),

      // Mensajes de hoy (todas las conversaciones)
      Conversation.aggregate([
        { $unwind: '$messages' },
        { $match: { 'messages.at': { $gte: startOfDay } } },
        { $count: 'count' },
      ]),
    ]);

    const messagesToday = messagesTodayAgg[0]?.count || 0;
    const botResolvedPct = conversations > 0
      ? Math.round(((conversations - humanConversations) / conversations) * 100)
      : 0;

    res.json({
      totals: { providers, users, conversations, categories, reviews, requests },
      requestsByDay,
      providersByDay,
      topServices,
      peakHours,
      topProviders,
      ops: {
        newRequests,
        requestsToday,
        pendingProviders,
        humanConversations,
        messagesToday,
        botResolvedPct,
        recentRequests,
        pendingProvidersList,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ----- Configuracion del bot -----

const getBotConfig = async (req, res, next) => {
  try {
    const cfg = await BotConfig.getSingleton();
    res.json(cfg);
  } catch (err) {
    next(err);
  }
};

const updateBotConfig = async (req, res, next) => {
  try {
    const { enabled, useButtons, messages, hours, variables } = req.body;
    const cfg = await BotConfig.getSingleton();
    if (enabled !== undefined) cfg.enabled = enabled;
    if (useButtons !== undefined) cfg.useButtons = useButtons;
    if (variables !== undefined) {
      cfg.variables = (Array.isArray(variables) ? variables : [])
        .filter((v) => v && v.key && String(v.key).trim())
        .map((v) => ({ key: String(v.key).trim(), value: String(v.value ?? '') }));
    }
    if (messages) cfg.messages = { ...cfg.messages.toObject(), ...messages };
    if (hours) cfg.hours = { ...cfg.hours.toObject(), ...hours };
    await cfg.save();
    res.json(cfg);
  } catch (err) {
    next(err);
  }
};

// ----- Intenciones del bot -----

const slugify = (s) => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const getIntents = async (req, res, next) => {
  try {
    const intents = await Intent.find().sort({ priority: -1, name: 1 }).lean();
    res.json(intents);
  } catch (err) {
    next(err);
  }
};

const createIntent = async (req, res, next) => {
  try {
    const { name, key, description, examples, response, service, priority, active } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'El nombre es obligatorio' });
    const intent = await Intent.create({
      name: name.trim(),
      key: (key?.trim() || slugify(name)),
      description,
      examples: Array.isArray(examples) ? examples : String(examples || '').split('\n').map((s) => s.trim()).filter(Boolean),
      response,
      service: service || undefined,
      priority: priority != null ? Number(priority) : 10,
      active: active !== undefined ? active : true,
    });
    res.status(201).json(intent);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Ya existe una intención con esa clave' });
    next(err);
  }
};

const updateIntent = async (req, res, next) => {
  try {
    const { name, key, description, examples, response, service, priority, active } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (key !== undefined) update.key = key;
    if (description !== undefined) update.description = description;
    if (examples !== undefined) {
      update.examples = Array.isArray(examples) ? examples : String(examples || '').split('\n').map((s) => s.trim()).filter(Boolean);
    }
    if (response !== undefined) update.response = response;
    if (service !== undefined) update.service = service || undefined;
    if (priority !== undefined) update.priority = Number(priority);
    if (active !== undefined) update.active = active;
    const intent = await Intent.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!intent) return res.status(404).json({ message: 'Intención no encontrada' });
    res.json(intent);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Ya existe una intención con esa clave' });
    next(err);
  }
};

const deleteIntent = async (req, res, next) => {
  try {
    await Intent.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// Intenciones por defecto que usan las plantillas (saludo/despedida/ayuda). Idempotente por clave.
const DEFAULT_INTENTS = [
  { name: 'Saludo', key: 'saludo', priority: 20, response: '{greeting}, {firstName}! 😊',
    examples: ['hola', 'holi', 'buenas', 'buen día', 'buenos días', 'buenas tardes', 'buenas noches', 'qué tal', 'hey', 'saludos'] },
  { name: 'Despedida', key: 'despedida', priority: 20, response: '¡Gracias por usar *WhatServices*! 👋 Aquí estaré cuando me necesites.',
    examples: ['adios', 'adiós', 'salir', 'gracias', 'bye', 'hasta luego', 'nos vemos', 'chao', 'ya no', 'terminar', 'cancelar', 'fin'] },
  { name: 'Ayuda', key: 'ayuda', priority: 15, response: '',
    examples: ['ayuda', 'help', 'no sé', 'no se', 'cómo funciona', 'como funciona', 'qué haces', 'información', 'info', 'menú', 'menu'] },
  { name: 'Hablar con humano', key: 'hablar-humano', priority: 25, response: '¡Claro! Te paso con un asesor humano. 🙋 En un momento te contactan.',
    examples: ['humano', 'asesor', 'persona', 'agente', 'quiero hablar con alguien', 'atención a cliente', 'soporte humano'] },
];

const ensureDefaultIntents = async (req, res, next) => {
  try {
    let created = 0;
    for (const d of DEFAULT_INTENTS) {
      const exists = await Intent.findOne({ key: d.key });
      if (!exists) { await Intent.create({ ...d, active: true }); created += 1; }
    }
    const intents = await Intent.find().sort({ priority: -1, name: 1 }).lean();
    res.json({ created, intents });
  } catch (err) {
    next(err);
  }
};

// ----- Flujo visual del bot (constructor drag-and-drop) -----

const getFlow = async (req, res, next) => {
  try {
    const doc = await BotFlow.getSingleton();
    res.json({ draft: doc.draft, isPublished: doc.isPublished, version: doc.version });
  } catch (err) {
    next(err);
  }
};

const saveFlow = async (req, res, next) => {
  try {
    const { nodes = [], edges = [] } = req.body || {};
    const doc = await BotFlow.getSingleton();
    doc.draft = { nodes, edges };
    await doc.save();
    res.json({ draft: doc.draft, isPublished: doc.isPublished, version: doc.version });
  } catch (err) {
    next(err);
  }
};

const publishFlow = async (req, res, next) => {
  try {
    const { nodes, edges } = req.body || {};
    const doc = await BotFlow.getSingleton();
    // Si mandan grafo en el body, se guarda como borrador antes de publicar
    if (Array.isArray(nodes) && Array.isArray(edges)) doc.draft = { nodes, edges };
    if (!(doc.draft.nodes || []).some((n) => n.type === 'start')) {
      return res.status(400).json({ message: 'El flujo necesita un nodo de inicio (start) para publicarse.' });
    }
    doc.published = { nodes: doc.draft.nodes, edges: doc.draft.edges };
    doc.isPublished = true;
    doc.version = (doc.version || 0) + 1;
    await doc.save();
    res.json({ draft: doc.draft, isPublished: doc.isPublished, version: doc.version });
  } catch (err) {
    next(err);
  }
};

const unpublishFlow = async (req, res, next) => {
  try {
    const doc = await BotFlow.getSingleton();
    doc.isPublished = false;
    await doc.save();
    res.json({ draft: doc.draft, isPublished: doc.isPublished, version: doc.version });
  } catch (err) {
    next(err);
  }
};

// ----- Plantillas de flujo (propias) -----

const getFlowTemplates = async (req, res, next) => {
  try {
    const tpls = await FlowTemplate.find().sort({ createdAt: -1 }).lean();
    res.json(tpls);
  } catch (err) {
    next(err);
  }
};

const createFlowTemplate = async (req, res, next) => {
  try {
    const { name, description, icon, nodes = [], edges = [] } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'El nombre es obligatorio' });
    const tpl = await FlowTemplate.create({
      name: name.trim(), description: description || '', icon: icon || '⭐',
      graph: { nodes, edges }, createdBy: req.user?.id,
    });
    res.status(201).json(tpl);
  } catch (err) {
    next(err);
  }
};

const deleteFlowTemplate = async (req, res, next) => {
  try {
    await FlowTemplate.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ----- Roles y módulos -----

const getModules = async (req, res, next) => {
  try { res.json(MODULES); } catch (err) { next(err); }
};

const getRoles = async (req, res, next) => {
  try {
    const roles = await Role.find().sort({ name: 1 }).lean();
    res.json(roles);
  } catch (err) {
    next(err);
  }
};

const createRole = async (req, res, next) => {
  try {
    const { name, modules = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Nombre requerido' });
    const role = await Role.create({ name: name.trim(), modules });
    res.status(201).json(role);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Ya existe un rol con ese nombre' });
    next(err);
  }
};

const updateRole = async (req, res, next) => {
  try {
    const { name, modules } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (modules !== undefined) update.modules = modules;
    const role = await Role.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.json(role);
  } catch (err) {
    next(err);
  }
};

const deleteRole = async (req, res, next) => {
  try {
    const inUse = await User.countDocuments({ roleId: req.params.id });
    if (inUse > 0) return res.status(400).json({ message: `No se puede eliminar: ${inUse} usuario(s) usan este rol` });
    await Role.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProviders, resetProviderPassword, toggleVerify, toggleBlockProvider,
  createUser, updateUserRole, resetUserPassword,
  getModules, getRoles, createRole, updateRole, deleteRole,
  getUsers, toggleBlockUser,
  getCategories, createCategory, updateCategory, reviewCategory,
  getConversations, getConversation, toggleTakeover, replyConversation,
  listInstances, createInstance, connectInstance, instanceState,
  logoutInstance, deleteInstance, setActiveInstance,
  getBotConfig, updateBotConfig,
  getIntents, createIntent, updateIntent, deleteIntent, ensureDefaultIntents,
  getFlow, saveFlow, publishFlow, unpublishFlow,
  getFlowTemplates, createFlowTemplate, deleteFlowTemplate,
  getStats,
  getRequests, getRequest, updateRequest,
};
