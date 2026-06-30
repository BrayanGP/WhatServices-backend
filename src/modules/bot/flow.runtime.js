const Fuse = require('fuse.js');
const Provider = require('../providers/provider.model');
const Category = require('../admin/category.model');
const Intent = require('./intent.model');
const Client = require('../clients/client.model');
const { CLIENT_URL } = require('../../config/env');
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const {
  fill, getPostalCode, getScore, findProviders, startRequest, completeRequest,
  reply, sendCatalog, sendResultsNav, sendProviderWorks, parseSelection, sendServicesList,
  sendButtonsNode, sendListNode, sendPollNode, sendCarousel,
  getTopProviders, formatProviderList, photoUrl,
} = require('./bot.helpers');

const MAX_STEPS = 50; // anti-bucle por turno
const WAIT_TYPES = ['ask', 'buttons', 'list', 'poll']; // nodos que pausan esperando respuesta

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---- Captura de respuestas en nodos `ask` ----
const captureValue = (capture, text, lower) => {
  switch (capture) {
    case 'zip': return getPostalCode(text);
    case 'score': return getScore(text);
    case 'mode':
      if (/\b(1|cerca|cercan|near|ubicaci)/i.test(lower)) return 'near';
      if (/\b(2|mejor|mejores|calificad|score|estrella)/i.test(lower)) return 'score';
      return null;
    default: return text; // 'text' o sin captura: siempre válido
  }
};

// ---- Resolución de selección en nodos interactivos (botones/lista/encuesta) ----
// items: [{ id, label }]; prefix: 'btn' | 'row' | 'opt'. Devuelve handle o 'else'.
const resolveSelection = (items, prefix, text, lower) => {
  const list = items || [];
  // por id directo (selectedButtonId / selectedRowId llegan como texto)
  let hit = list.find((it) => String(it.id) === text);
  if (hit) return `${prefix}:${hit.id}`;
  // por número (1..n) — fallback de texto
  const num = lower.match(/^(\d{1,2})$/);
  if (num) { const it = list[Number(num[1]) - 1]; if (it) return `${prefix}:${it.id}`; }
  // por etiqueta (coincidencia insensible a acentos)
  hit = list.find((it) => norm(it.label) && norm(lower).includes(norm(it.label)));
  if (hit) return `${prefix}:${hit.id}`;
  return 'else';
};

// ---- Evaluación de condiciones (if / else-if / case) ----
const fieldValue = (field, ctx) => {
  if (field?.startsWith('vars.')) return ctx.vars[field.slice(5)];
  switch (field) {
    case 'message': return ctx.lower;
    case 'intent': return ctx.intent || '';
    case 'service': return ctx.service || '';
    case 'cp': return ctx.cp || '';
    case 'resultsCount': return ctx.resultsCount || 0;
    case 'hasResults': return (ctx.resultsCount || 0) > 0;
    case 'isOpen': return !!ctx.isOpen;
    default: return '';
  }
};

const evalRule = (rule, ctx) => {
  const fv = fieldValue(rule.field, ctx);
  const val = rule.value;
  switch (rule.op) {
    case 'contains': return norm(fv).includes(norm(val));
    case 'matches': return norm(fv).includes(norm(val)); // contains insensible a acentos
    case 'equals': return norm(fv) === norm(val);
    case 'exists': return fv !== undefined && fv !== null && String(fv).trim() !== '';
    case 'gt': return Number(fv) > Number(val);
    case 'lt': return Number(fv) < Number(val);
    case 'isTrue': return fv === true || fv === 'true';
    case 'isFalse': return !fv || fv === 'false';
    default: return false;
  }
};

const evalCase = (kase, ctx) => {
  const rules = kase.rules || [];
  if (!rules.length) return true; // case sin reglas = comodín
  return (kase.logic === 'OR')
    ? rules.some((r) => evalRule(r, ctx))
    : rules.every((r) => evalRule(r, ctx));
};

// ---- Acciones (reutilizan la lógica del bot actual) ----
const orderedProviders = async (conv) => {
  const ids = (conv.suggestedProviders || []).map(String);
  if (!ids.length) return [];
  const provs = await Provider.find({ _id: { $in: conv.suggestedProviders } }).lean();
  return ids.map((id) => provs.find((p) => String(p._id) === id)).filter(Boolean);
};

// Devuelve un "out handle" para ramificar (o null = salida por defecto)
const runAction = async (node, ctx, conv, phone, cfg) => {
  const data = node.data || {};
  const action = data.action;
  const params = data.params || {};

  if (action === 'matchService') {
    const cat = ctx.matchCategory(ctx.lower);
    if (cat) {
      conv.selectedService = cat.name;
      ctx.service = cat.name;
      ctx.vars.service = cat.name;
      return 'matched';
    }
    return 'notMatched';
  }

  if (action === 'sendServices') {
    await sendServicesList(conv, phone, cfg);
    return null;
  }

  if (action === 'startRequest') {
    if (!conv.currentRequestId && ctx.service) await startRequest(conv, ctx.service);
    return null;
  }

  if (action === 'search') {
    if (!conv.currentRequestId && ctx.service) await startRequest(conv, ctx.service);
    const mode = ctx.vars.searchMode || params.mode || 'score';
    ctx.vars.searchMode = mode;
    const providers = await findProviders(ctx.service, { mode, postalCode: ctx.cp });
    console.log(`[search] service="${ctx.service}" mode=${mode} cp=${ctx.cp} → ${providers.length} result(s): ${providers.map((p) => p.businessName).join(', ') || '—'}`);
    conv.suggestedProviders = providers.map((p) => p._id);
    ctx.resultsCount = providers.length;
    return providers.length ? 'found' : 'empty';
  }

  if (action === 'sendCatalog') {
    const providers = await orderedProviders(conv);
    if (!providers.length) return 'empty';
    const mode = ctx.vars.searchMode || params.mode || 'score';
    await sendCatalog(conv, phone, providers, ctx.service, ctx.cp, cfg);
    await completeRequest(conv, providers, mode);
    return 'found';
  }

  // Lista de proveedores en TEXTO PLANO (numerada). El cliente responde con el número.
  if (action === 'sendResultsText') {
    const providers = await orderedProviders(conv);
    if (!providers.length) return 'empty';
    const mode = ctx.vars.searchMode || params.mode || 'score';
    const lines = formatProviderList(providers);
    await reply(conv, phone, `👇 Estos son los profesionales de *${ctx.service}*:\n\n${lines}\n\n👉 Responde con el *número* del que quieres ver (ej. *1*).\n🔄 Escribe *otro* para otra búsqueda o *salir* para terminar.`);
    await completeRequest(conv, providers, mode);
    return 'found';
  }

  // Solo la LISTA interactiva de proveedores (sin enviar las 5 fotos). Al elegir, showWorks muestra al profesional.
  if (action === 'sendResults') {
    const providers = await orderedProviders(conv);
    if (!providers.length) return 'empty';
    const mode = ctx.vars.searchMode || params.mode || 'score';
    await sendResultsNav(conv, phone, providers, ctx.service, ctx.cp, cfg);
    await completeRequest(conv, providers, mode);
    return 'found';
  }

  if (action === 'showWorks') {
    const ids = (conv.suggestedProviders || []).map(String);
    const sel = parseSelection(ctx.message, ctx.lower, ids);
    if (sel.works) {
      const prov = await Provider.findById(sel.works).lean();
      if (prov) { await sendProviderWorks(conv, phone, prov, cfg); return 'shown'; }
      await reply(conv, phone, 'No encontré ese profesional. Responde con un número de la lista.');
      return 'none';
    }
    if (sel.menu) return 'menu';
    if (sel.back) {
      const providers = await orderedProviders(conv);
      await reply(conv, phone, 'Aquí está de nuevo la lista 👇');
      await sendResultsNav(conv, phone, providers, ctx.service, ctx.cp, cfg);
      return 'back';
    }
    return 'none';
  }

  return null; // acción desconocida: salida por defecto
};

// ============ Motor ============
const runFlow = async ({ conv, phone, text, lower, name, cfg, flow }) => {
  const nodes = flow.nodes || [];
  const edges = flow.edges || [];
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const getNext = (nodeId, handle) => {
    const outs = edges.filter((e) => e.source === nodeId);
    if (handle) {
      const e = outs.find((x) => x.sourceHandle === handle);
      if (e) return nodeMap[e.target];
      // tolerancia: si no hay arista para ese handle, usar la arista por defecto (sin handle)
      const d = outs.find((x) => !x.sourceHandle);
      return d ? nodeMap[d.target] : null;
    }
    const e = outs.find((x) => !x.sourceHandle) || outs[0];
    return e ? nodeMap[e.target] : null;
  };

  // Datos de soporte (categorías + intenciones) para condiciones y matchService
  const categories = await Category.find({ isActive: true }).lean();
  const servicesList = categories.map((c) => `• ${c.icon || ''} ${c.name}`.trim()).join('\n');

  // Servicios que SÍ tienen proveedores disponibles. Se toma de lo que el proveedor
  // REALMENTE tiene guardado (tolerante a acentos/mayúsculas y a categorías que aún no
  // están activas, p. ej. sugeridas en el alta), para no ocultar a nadie con proveedor.
  const provCats = (await Provider.distinct('categories', { availability: 'available', isBlocked: false }))
    .map((s) => String(s || '').trim()).filter(Boolean);
  const catByKey = new Map();
  categories.forEach((c) => {
    catByKey.set(norm(c.name), c);
    if (c.slug) catByKey.set(norm(c.slug), c);
  });
  // Mapa de iconos de TODAS las categorías (incluidas las no activas/sugeridas),
  // para que cada servicio disponible muestre su emoji aunque su categoría aún no esté activa.
  const iconByKey = new Map();
  (await Category.find({}).select('name slug icon').lean()).forEach((c) => {
    if (!c.icon) return;
    iconByKey.set(norm(c.name), c.icon);
    if (c.slug) iconByKey.set(norm(c.slug), c.icon);
  });
  const availableCats = [];
  const seenAvail = new Set();
  provCats.forEach((pc) => {
    const cat = catByKey.get(norm(pc));
    const name = cat ? cat.name : pc;      // sin categoría activa: usa el nombre tal cual del proveedor
    // Emoji: el de la categoría activa → el de la categoría sugerida → uno por defecto.
    const icon = (cat && cat.icon) || iconByKey.get(norm(pc)) || iconByKey.get(norm(name)) || '🔧';
    const key = norm(name);
    if (!key || seenAvail.has(key)) return;
    seenAvail.add(key);
    availableCats.push({ name, icon });
  });
  const servicesAvailableList = availableCats.map((c) => `• ${c.icon || '🔧'} ${c.name}`.trim()).join('\n');

  // Corpus para reconocer el servicio: categorías activas + las que solo existen en
  // proveedores disponibles (así un servicio que SÍ tiene proveedor siempre se reconoce
  // y la búsqueda devuelve resultados con el nombre tal cual lo tiene el proveedor).
  const matchCorpus = [...categories];
  provCats.forEach((pc) => { if (!catByKey.has(norm(pc))) matchCorpus.push({ name: pc, slug: norm(pc) }); });
  const catFuse = new Fuse(matchCorpus, { keys: ['name', 'slug'], threshold: 0.45, ignoreLocation: true });
  const matchCategory = (q) => { const r = catFuse.search(q); return r.length ? r[0].item : null; };

  const intentsDocs = await Intent.find({ active: true }).sort({ priority: -1 }).lean();
  const intentPhrases = [];
  intentsDocs.forEach((it) => (it.examples || []).forEach((ph) => intentPhrases.push({ intent: it, phrase: ph })));
  const intentFuse = new Fuse(intentPhrases, { keys: ['phrase'], threshold: 0.4, ignoreLocation: true });
  const matchedIntent = intentPhrases.length ? (intentFuse.search(lower)[0]?.item.intent) : null;

  const flowState = (conv.context && conv.context.flow) || {};
  const ctx = {
    message: text, lower,
    intent: matchedIntent?.key || '',
    service: conv.selectedService || '',
    cp: conv.postalCode || '',
    resultsCount: (conv.suggestedProviders || []).length,
    isOpen: true, // ya pasamos el control de horario en el controlador
    name: conv.name || name || '',
    phone,
    vars: { ...(flowState.vars || {}) },
    servicesList,
    matchCategory,
  };

  // Variables dinámicas (fecha/hora/saludo) según zona horaria configurada
  const tz = cfg.hours?.tz || 'America/Mexico_City';
  const now = new Date();
  const curHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(now));
  const greeting = curHour < 12 ? 'Buenos días' : curHour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = String(ctx.name || '').trim().split(/\s+/)[0] || '';
  const dateStr = new Intl.DateTimeFormat('es-MX', { timeZone: tz, dateStyle: 'long' }).format(now);
  const timeStr = new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(now);
  // CLIENT_URL puede traer varias URLs separadas por coma (CORS); para los links usamos solo la primera.
  const webBase = String(CLIENT_URL || '').split(',')[0].trim().replace(/\/$/, '');

  // Variables propias definidas por el usuario (base, sobre-escribibles por las del sistema/capturadas)
  const customVars = {};
  (cfg.variables || []).forEach((v) => { if (v && v.key) customVars[v.key] = v.value; });

  // Variables dinámicas que traen datos (solo se consultan si el flujo las usa)
  const flowStr = JSON.stringify(flow || {});
  let topRatedList = '', topRatedCount = 0, nearbyList = '', nearbyCount = 0;
  if (flowStr.includes('{topRated}')) {
    const ps = await getTopProviders({ service: conv.selectedService, mode: 'score', limit: 5 });
    topRatedList = formatProviderList(ps); topRatedCount = ps.length;
  }
  if (flowStr.includes('{nearby}')) {
    const ps = await getTopProviders({ service: conv.selectedService, mode: 'near', postalCode: conv.postalCode, limit: 5 });
    nearbyList = formatProviderList(ps); nearbyCount = ps.length;
  }

  const fillVars = () => {
    // Link "ver en la web": si hay UN solo resultado → perfil directo; si hay varios/ninguno → búsqueda por categoría
    const _results = conv.suggestedProviders || [];
    const _searchUrl = `${webBase}/providers?category=${encodeURIComponent(ctx.service || '')}`;
    const _profileUrl = _results.length === 1 ? `${webBase}/providers/${_results[0]}` : _searchUrl;
    const sys = {
      name: ctx.name, firstName, phone: ctx.phone, greeting,
      service: ctx.service || '', cp: ctx.cp || '',
      count: ctx.resultsCount || 0, services: servicesList, servicesCount: categories.length,
      servicesAvailable: servicesAvailableList, servicesAvailableCount: availableCats.length,
      topRated: topRatedList, topRatedCount, nearby: nearbyList, nearbyCount,
      web: webBase, webProviders: `${webBase}/providers`, webRegister: `${webBase}/unete`,
      webService: _profileUrl, webProfile: _profileUrl, webSearch: _searchUrl,
      date: dateStr, time: timeStr, open: cfg.hours.openHour, close: cfg.hours.closeHour, intent: ctx.intent,
      ...ctx.vars,
    };
    // Resuelve variables propias (2 pasadas → pueden ser dinámicas y referenciar otras variables)
    const out = {};
    for (let pass = 0; pass < 2; pass++) {
      for (const k in customVars) out[k] = fill(String(customVars[k] == null ? '' : customVars[k]), { ...sys, ...out });
    }
    Object.assign(out, sys); // sistema y capturadas ganan ante colisiones
    return out;
  };

  // ---- Punto de inicio: reanudar en un `ask` o empezar en `start` ----
  let current = null;
  const waitingNode = flowState.nodeId ? nodeMap[flowState.nodeId] : null;

  if (waitingNode && WAIT_TYPES.includes(waitingNode.type)) {
    const d = waitingNode.data || {};
    if (waitingNode.type === 'ask') {
      const cap = d.capture;
      const val = captureValue(cap, text, lower);
      if (val == null && cap && cap !== 'text') {
        // respuesta inválida → repetir la pregunta y seguir esperando
        await reply(conv, phone, fill(d.text || 'No te entendí, intenta de nuevo.', fillVars()));
        conv.context = { ...conv.context, flow: { nodeId: waitingNode.id, vars: ctx.vars } };
        conv.markModified('context');
        return;
      }
      ctx.vars[d.saveAs || 'respuesta'] = val;
      if (cap === 'zip') { conv.postalCode = val; ctx.cp = val; }
      if (cap === 'mode') ctx.vars.searchMode = val;
      current = getNext(waitingNode.id);
    } else if (waitingNode.type === 'buttons') {
      current = getNext(waitingNode.id, resolveSelection(d.buttons, 'btn', text, lower));
    } else if (waitingNode.type === 'list') {
      const rows = (d.sections || []).flatMap((s) => s.rows || []);
      current = getNext(waitingNode.id, resolveSelection(rows, 'row', text, lower));
    } else if (waitingNode.type === 'poll') {
      current = getNext(waitingNode.id, resolveSelection(d.options, 'opt', text, lower));
    }
  } else {
    const start = nodes.find((n) => n.type === 'start');
    current = start ? getNext(start.id) : null;
  }

  // ---- Recorrido ----
  let steps = 0;
  while (current && steps < MAX_STEPS) {
    steps += 1;
    const node = current;
    const data = node.data || {};

    if (node.type === 'message') {
      if (data.text) await reply(conv, phone, fill(data.text, fillVars()));
      current = getNext(node.id);
      continue;
    }

    if (node.type === 'ask') {
      // Llegamos a una pregunta → enviar y esperar la siguiente respuesta
      if (data.text) await reply(conv, phone, fill(data.text, fillVars()));
      conv.context = { ...conv.context, flow: { nodeId: node.id, vars: ctx.vars } };
      conv.markModified('context');
      return;
    }

    if (node.type === 'condition') {
      const cases = data.cases || [];
      let handle = 'else';
      for (let i = 0; i < cases.length; i++) {
        if (evalCase(cases[i], ctx)) { handle = `case-${i}`; break; }
      }
      current = getNext(node.id, handle);
      continue;
    }

    if (node.type === 'intent') {
      const sel = (data.intents || []).includes(ctx.intent) && ctx.intent ? `intent:${ctx.intent}` : 'else';
      current = getNext(node.id, sel);
      continue;
    }

    if (node.type === 'buttons') {
      await sendButtonsNode(conv, phone, { text: fill(data.text, fillVars()), buttons: data.buttons || [] }, cfg);
      conv.context = { ...conv.context, flow: { nodeId: node.id, vars: ctx.vars } };
      conv.markModified('context');
      return;
    }

    if (node.type === 'list') {
      await sendListNode(conv, phone, {
        text: fill(data.text, fillVars()), buttonText: data.buttonText, footer: data.footer, sections: data.sections || [],
      }, cfg);
      conv.context = { ...conv.context, flow: { nodeId: node.id, vars: ctx.vars } };
      conv.markModified('context');
      return;
    }

    if (node.type === 'poll') {
      await sendPollNode(conv, phone, { question: fill(data.question, fillVars()), options: data.options || [], multi: data.multi }, cfg);
      conv.context = { ...conv.context, flow: { nodeId: node.id, vars: ctx.vars } };
      conv.markModified('context');
      return;
    }

    if (node.type === 'carousel') {
      const src = data.source || 'static';
      let cards;
      if (src === 'static') {
        cards = (data.cards || []).map((c) => ({ image: c.image, title: fill(c.title, fillVars()), body: fill(c.body, fillVars()) }));
      } else {
        let providers = [];
        if (src === 'results') {
          providers = await orderedProviders(conv);
        } else {
          providers = await getTopProviders({ service: ctx.service, mode: src === 'nearby' ? 'near' : 'score', postalCode: ctx.cp, limit: 5 });
          conv.suggestedProviders = providers.map((p) => p._id); // para que un showWorks posterior funcione
          ctx.resultsCount = providers.length;
        }
        cards = providers.map((p, i) => ({
          image: photoUrl(p.profilePhoto) || photoUrl((p.photos || [])[0]),
          title: `${i + 1}. ${p.businessName}`,
          body: `⭐${p.rating?.average || 0}${p.city ? ` · ${p.city}` : ''}`,
        }));
      }
      await sendCarousel(conv, phone, cards, cfg);
      current = getNext(node.id);
      continue;
    }

    if (node.type === 'action') {
      const out = await runAction(node, ctx, conv, phone, cfg);
      current = getNext(node.id, out);
      continue;
    }

    if (node.type === 'end') {
      conv.step = 'END';
      conv.context = { ...conv.context, flow: {} };
      conv.markModified('context');
      return;
    }

    // tipo desconocido → seguir por defecto
    current = getNext(node.id);
  }

  // Sin más nodos (rama terminó sin `end`): reiniciar en el próximo mensaje
  conv.context = { ...conv.context, flow: {} };
  conv.markModified('context');
};

module.exports = { runFlow, evalRule, evalCase, captureValue, resolveSelection };
