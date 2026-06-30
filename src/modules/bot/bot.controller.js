const Fuse = require('fuse.js');
const Conversation = require('./conversation.model');
const Provider = require('../providers/provider.model');
const Category = require('../admin/category.model');
const Review = require('../reviews/review.model');
const BotConfig = require('./botconfig.model');
const Intent = require('./intent.model');
const BotFlow = require('./botflow.model');
const Client = require('../clients/client.model');
const { runFlow } = require('./flow.runtime');
const meta = require('../../utils/whatsappMeta');
const { CLIENT_URL, WHATSAPP_VERIFY_TOKEN } = require('../../config/env');
const {
  fill, getPostalCode, getScore, findProviders,
  startRequest, completeRequest, reply, sendCatalog, sendProviderWorks,
  sendResultsNav, parseSelection, saveMsg,
} = require('./bot.helpers');

// ----- Helpers de webhook -----

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const extractIncoming = (req) => {
  const data = req.body?.data;
  if (!data) return null;
  const remoteJid = data.key?.remoteJid || '';
  if (remoteJid.endsWith('@g.us') || remoteJid.includes('broadcast')) return null;
  const phone = remoteJid.split('@')[0];
  const fromMe = data.key?.fromMe === true;
  const text =
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    data.message?.imageMessage?.caption ||
    // respuestas a listas / botones interactivos
    data.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    data.message?.listResponseMessage?.title ||
    data.message?.buttonsResponseMessage?.selectedButtonId ||
    data.message?.templateButtonReplyMessage?.selectedId ||
    '';
  return { phone, fromMe, text: text.trim(), name: data.pushName };
};

// detecta una calificacion entrante: "#rate-<idprovider>" en el texto del deep link
const getRateProviderId = (text) => {
  const m = text.match(/#rate-([a-f0-9]{24})/i);
  return m ? m[1] : null;
};

// Reinicia el flujo si pasaron mas de 5 min sin actividad (conversacion "expirada")
const SESSION_TTL_MS = parseInt(process.env.BOT_SESSION_TTL_MS) || 5 * 60 * 1000;

// ----- Cola por conversación -----
// Serializa el procesamiento por número: si llegan mensajes al mismo tiempo,
// se atienden de uno en uno (evita choques al guardar la misma conversación).
const queues = new Map();
const enqueue = (phone, task) => {
  const prev = queues.get(phone) || Promise.resolve();
  const next = prev.then(task, task).finally(() => { if (queues.get(phone) === next) queues.delete(phone); });
  queues.set(phone, next);
  return next;
};

// ----- Webhook -----
const verifyWebhook = (req, res) => res.sendStatus(200);

const handleIncoming = (req, res) => {
  res.sendStatus(200);
  try {
    const event = req.body?.event;
    if (event && !['messages.upsert', 'MESSAGES_UPSERT'].includes(event)) return;
    const msg = extractIncoming(req);
    if (!msg || msg.fromMe || !msg.text) return;
    const instance = req.body?.instance;
    // encolar por número → cada conversación se procesa a su tiempo
    enqueue(msg.phone, () => processIncoming(msg, instance));
  } catch (err) {
    console.error('[Bot] Error encolando:', err);
  }
};

const processIncoming = async (msg, instance) => {
  try {
    const { phone, text, name } = msg;
    console.log('[Bot] entrante:', phone, '·', String(text || '').slice(0, 60));

    let conv = await Conversation.findOne({ phone });
    if (!conv) conv = await Conversation.create({ phone, name, instance });
    if (name && !conv.name) conv.name = name;
    if (instance) conv.instance = instance;

    // Reinicio por inactividad: si pasaron >5 min, empezar la conversación de cero
    const idle = conv.lastActivity ? (Date.now() - new Date(conv.lastActivity).getTime()) : 0;
    if (idle > SESSION_TTL_MS && !['RATING_SCORE', 'RATING_COMMENT'].includes(conv.step)) {
      conv.step = 'IDLE';
      conv.selectedService = undefined;
      conv.suggestedProviders = [];
      conv.context = {};
      conv.markModified('context');
    }

    conv.lastActivity = new Date();
    saveMsg(conv, 'client', text);

    if (conv.humanTakeover) { await conv.save(); return; }

    // ---- Registro del cliente (boot de WhatsApp) ----
    // Si el cliente nunca se ha registrado, pedimos su nombre antes de continuar.
    // Se ejecuta solo cuando la conversación está en IDLE (saludo / primer mensaje).
    if (conv.step === 'IDLE') {
      const clientExists = await Client.exists({ phone: last10(phone) });
      if (!clientExists) {
        // Si WhatsApp nos dio el nombre (pushName), registrar silenciosamente sin interrumpir.
        if (name && name.trim()) {
          await Client.create({ name: name.trim(), phone: last10(phone), source: 'whatsapp_bot' }).catch(() => {});
          // continúa al flujo normal
        } else {
          // Sin nombre: pedirlo explícitamente
          conv.step = 'AWAITING_CLIENT_NAME';
          await reply(conv, phone, '¡Hola! 👋 Antes de continuar, ¿cómo te llamas?');
          await conv.save();
          return;
        }
      }
    }

    // Captura de nombre cuando lo estaba esperando
    if (conv.step === 'AWAITING_CLIENT_NAME') {
      const clientName = text.trim();
      if (clientName.length < 2) {
        await reply(conv, phone, 'Por favor escríbenos tu nombre para continuar. 😊');
        await conv.save();
        return;
      }
      await Client.findOneAndUpdate(
        { phone: last10(phone) },
        { name: clientName, phone: last10(phone), source: 'whatsapp_bot' },
        { upsert: true, new: true },
      );
      if (!conv.name) conv.name = clientName;
      conv.step = 'IDLE'; // continúa al flujo normal como si fuera el primer saludo
    }

    // ---- Configuracion del bot (on/off + horario) ----
    const cfg = await BotConfig.getSingleton();
    if (!cfg.enabled) { await conv.save(); return; } // bot apagado: no responde

    if (!cfg.isOpenNow()) {
      await reply(conv, phone, fill(cfg.messages.outOfHours, { open: cfg.hours.openHour, close: cfg.hours.closeHour }));
      conv.step = 'END';
      await conv.save();
      return;
    }

    const lower = text.toLowerCase();

    // ---- Entrada de CALIFICACION (QR del empleado) ----  [siempre prioritaria sobre el flujo]
    const rateId = getRateProviderId(text);
    if (rateId && !['RATING_SCORE', 'RATING_COMMENT'].includes(conv.step)) {
      const prov = await Provider.findById(rateId).lean();
      if (prov) {
        conv.context = { ...conv.context, ratingProviderId: rateId, ratingProviderName: prov.businessName };
        conv.step = 'RATING_SCORE';
        await reply(conv, phone,
          `¡Gracias por usar *${prov.businessName}*! 🙌\n\n¿Cómo calificarías el servicio? Responde con un número del *1 al 5* (5 = excelente).`);
        await conv.save();
        return;
      }
    }

    if (conv.step === 'RATING_SCORE') {
      const score = getScore(text);
      if (!score) {
        await reply(conv, phone, 'Por favor responde con un número del *1 al 5*.');
      } else {
        conv.context = { ...conv.context, ratingScore: score };
        conv.step = 'RATING_COMMENT';
        await reply(conv, phone, `¡Gracias! ⭐ ${score}/5\n\n¿Quieres dejar un *comentario*? Escríbelo, o pon *no* para terminar.`);
      }
      await conv.save();
      return;
    }

    if (conv.step === 'RATING_COMMENT') {
      const comment = ['no', 'n', 'nada'].includes(lower) ? '' : text;
      const providerId = conv.context?.ratingProviderId;
      const score = conv.context?.ratingScore;
      if (providerId && score) {
        await Review.create({
          providerId, rating: score, comment,
          reviewerPhone: phone, reviewerName: conv.name, source: 'whatsapp',
        });
        const reviews = await Review.find({ providerId });
        const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
        await Provider.findByIdAndUpdate(providerId, {
          'rating.average': parseFloat(avg.toFixed(1)),
          'rating.count': reviews.length,
        });
      }
      conv.context = {};
      conv.step = 'END';
      await reply(conv, phone, '¡Listo! Tu calificación quedó registrada. 🙏 Gracias por ayudar a otros a elegir mejor.');
      await conv.save();
      return;
    }

    // ---- Comandos globales: terminar o reiniciar con un saludo ----
    // Funcionan en cualquier punto, tanto con el flujo visual como con la FSM.
    const cleaned = lower.trim();
    // "salir", "finalizar", "terminar", etc. (mensaje compuesto solo por el comando)
    const isExitCmd = /^(?:ya\s+)?(?:salir|finalizar|finaliza|finalizado|terminar|termina|terminado|cancelar|cancela|cancelado|fin|adi[oó]s|chao|chau|bye|hasta\s+luego|hasta\s+pronto)[.!\s]*$/i.test(cleaned);
    // saludo / reinicio: "hola", "buenas", "buenos días", "menú inicio", "reiniciar", etc.
    const isGreeting = /^(?:hola+|holi|holis|ola|buenas?(?:\s+(?:d[ií]as|tardes|noches))?|buenos?\s+d[ií]as|hey|hi|hello|saludos|qu[eé]\s+tal|qu[ieé]bole|inicio|reiniciar|empezar|comenzar)[.!\s]*$/i.test(cleaned);

    if (isExitCmd) {
      conv.step = 'END';
      conv.selectedService = undefined;
      conv.suggestedProviders = [];
      conv.postalCode = undefined;
      conv.context = {};
      conv.markModified('context');
      await reply(conv, phone, fill(cfg.messages.goodbye, { name: conv.name || name || '' }));
      await conv.save();
      return;
    }
    if (isGreeting) {
      // Reinicia la conversación desde cero; abajo el flujo/FSM mostrará la bienvenida.
      conv.step = 'IDLE';
      conv.selectedService = undefined;
      conv.suggestedProviders = [];
      conv.postalCode = undefined;
      conv.context = {};
      conv.markModified('context');
    }

    // ---- Flujo visual publicado (opt-in): si existe, lo ejecuta el motor ----
    const flow = await BotFlow.getPublished();
    if (flow) {
      await runFlow({ conv, phone, text, lower, name, cfg, flow });
      await conv.save();
      return;
    }

    // ================= FSM LEGACY (sin flujo publicado) =================
    const categories = await Category.find({ isActive: true }).lean();
    const fuse = new Fuse(categories, { keys: ['name', 'slug'], threshold: 0.45, ignoreLocation: true });
    const matchCategory = () => {
      const r = fuse.search(lower);
      return r.length ? r[0].item : null;
    };
    const servicesList = categories.map((c) => `• ${c.icon || ''} ${c.name}`.trim()).join('\n');

    const intents = await Intent.find({ active: true }).sort({ priority: -1 }).lean();
    const intentPhrases = [];
    intents.forEach((it) => (it.examples || []).forEach((ph) => intentPhrases.push({ intent: it, phrase: ph })));
    const intentFuse = new Fuse(intentPhrases, { keys: ['phrase'], threshold: 0.4, ignoreLocation: true });
    const matchIntent = () => {
      if (!intentPhrases.length) return null;
      const r = intentFuse.search(lower);
      return r.length ? r[0].item.intent : null;
    };

    const baseVars = {
      name: conv.name || name || '',
      phone,
      services: servicesList,
      open: cfg.hours.openHour,
      close: cfg.hours.closeHour,
    };

    const askMode = async (serviceName) => {
      conv.selectedService = serviceName;
      conv.step = 'AWAITING_MODE';
      await startRequest(conv, serviceName);
      await reply(conv, phone, fill(cfg.messages.askMode, { service: serviceName }));
    };

    const applyIntent = async (intent) => {
      if (intent.response) await reply(conv, phone, fill(intent.response, { ...baseVars, service: intent.service || '' }));
      if (intent.service) await askMode(intent.service);
    };

    if (conv.step === 'IDLE' || conv.step === 'END') {
      const intent = matchIntent();
      if (intent) {
        await applyIntent(intent);
      } else {
        const matched = matchCategory();
        if (matched) await askMode(matched.name);
        else {
          conv.step = 'AWAITING_SERVICE';
          await reply(conv, phone, fill(cfg.messages.welcome, baseVars));
        }
      }
    } else if (conv.step === 'AWAITING_SERVICE') {
      const intent = matchIntent();
      if (intent) {
        await applyIntent(intent);
      } else {
        const matched = matchCategory();
        if (matched) await askMode(matched.name);
        else await reply(conv, phone, fill(cfg.messages.noService, { services: servicesList }));
      }
    } else if (conv.step === 'AWAITING_MODE') {
      const wantsNear = /\b(1|cerca|cercanos|cercano|near|ubicaci)/i.test(lower);
      const wantsScore = /\b(2|mejor|mejores|calificad|score|estrella)/i.test(lower);
      if (wantsNear) {
        conv.step = 'AWAITING_ZIP';
        await reply(conv, phone, fill(cfg.messages.askZip));
      } else if (wantsScore) {
        const providers = await findProviders(conv.selectedService, { mode: 'score' });
        conv.suggestedProviders = providers.map((p) => p._id);
        if (!providers.length) {
          await reply(conv, phone, fill(cfg.messages.noResults, { service: conv.selectedService }));
          conv.step = 'END';
        } else {
          await reply(conv, phone, `Estos son los *${providers.length}* mejor calificados en *${conv.selectedService}*:`);
          await sendCatalog(conv, phone, providers, conv.selectedService, null, cfg);
          await completeRequest(conv, providers, 'score');
          conv.step = 'SHOWING_RESULTS';
        }
      } else {
        await reply(conv, phone, 'Responde *1* (más cercanos) o *2* (mejor calificados).');
      }
    } else if (conv.step === 'AWAITING_ZIP') {
      const cp = getPostalCode(text);
      if (!cp) {
        await reply(conv, phone, 'Envíame tu *código postal* (5 dígitos), por ejemplo: 06000.');
      } else {
        conv.postalCode = cp;
        const providers = await findProviders(conv.selectedService, { mode: 'near', postalCode: cp });
        conv.suggestedProviders = providers.map((p) => p._id);
        if (!providers.length) {
          await reply(conv, phone, fill(cfg.messages.noResults, { service: conv.selectedService }));
          conv.step = 'END';
        } else {
          await reply(conv, phone, `Estos son los *${providers.length}* profesionales de *${conv.selectedService}* más cercanos a ti:`);
          await sendCatalog(conv, phone, providers, conv.selectedService, cp, cfg);
          await completeRequest(conv, providers, 'near');
          conv.step = 'SHOWING_RESULTS';
        }
      }
    } else if (conv.step === 'SHOWING_RESULTS') {
      const ids = (conv.suggestedProviders || []).map(String);
      const sel = parseSelection(text, lower, ids);
      if (sel.works) {
        const prov = await Provider.findById(sel.works).lean();
        if (prov) await sendProviderWorks(conv, phone, prov, cfg);
        else await reply(conv, phone, 'No encontré ese profesional. Responde con un número de la lista.');
      } else if (sel.back) {
        const provs = await Provider.find({ _id: { $in: conv.suggestedProviders } }).lean();
        const ordered = ids.map((id) => provs.find((p) => String(p._id) === id)).filter(Boolean);
        await reply(conv, phone, 'Aquí está de nuevo la lista 👇');
        await sendResultsNav(conv, phone, ordered, conv.selectedService, conv.postalCode, cfg);
      } else if (sel.menu) {
        conv.step = 'AWAITING_SERVICE';
        await reply(conv, phone, fill(cfg.messages.welcome, baseVars));
      } else {
        const intent = matchIntent();
        if (intent) {
          await applyIntent(intent);
        } else {
          const matched = matchCategory();
          if (matched) await askMode(matched.name);
          else {
            const link = `${CLIENT_URL}/providers?category=${encodeURIComponent(conv.selectedService || '')}`;
            await reply(conv, phone, fill(cfg.messages.resultsHint, { count: ids.length, link }));
          }
        }
      }
    }

    await conv.save();
  } catch (err) {
    console.error('[Bot] Error:', err);
  }
};

// ===================== WhatsApp Cloud API (Meta) =====================

// GET /api/whatsapp/webhook → verificación de Meta
const verifyMeta = (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
};

// Extrae el mensaje entrante del payload de Meta (texto, botón o fila de lista).
const metaExtract = (req) => {
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  if (!value || value.statuses) return null;        // ignora entregado/leído
  const m = value.messages?.[0];
  if (!m) return null;
  const phone = m.from;
  const name = value.contacts?.[0]?.profile?.name || '';
  let text = '';
  if (m.type === 'text') text = m.text?.body || '';
  else if (m.type === 'interactive') {
    const r = m.interactive?.button_reply || m.interactive?.list_reply;
    text = r?.id || r?.title || '';                  // el id mapea a btn:/row: del flujo
  } else if (m.type === 'button') text = m.button?.payload || m.button?.text || '';
  return { id: m.id, phone, fromMe: false, text: String(text).trim(), name };
};

// Dedupe: Meta reintenta el webhook → evita procesar el mismo mensaje 2 veces (anti-spam/baneo).
const seenIds = new Set();
const seenOnce = (id) => {
  if (!id) return false;
  if (seenIds.has(id)) return true;
  seenIds.add(id);
  if (seenIds.size > 1000) seenIds.delete(seenIds.values().next().value);
  return false;
};

// POST /api/bot/meta/webhook → eventos entrantes
const handleMeta = (req, res) => {
  res.sendStatus(200); // responder rápido (Meta reintenta si tarda)
  try {
    if (req.body?.object !== 'whatsapp_business_account') return;
    const msg = metaExtract(req);
    if (!msg || !msg.text) return;
    if (seenOnce(msg.id)) return;                     // ya procesado → no responder de nuevo
    meta.markRead(msg.id).catch(() => {});            // marcar leído (calidad)
    enqueue(msg.phone, () => processIncoming(msg, undefined));
  } catch (err) {
    console.error('[Meta] webhook:', err.message);
  }
};

module.exports = { verifyWebhook, handleIncoming, verifyMeta, handleMeta };
