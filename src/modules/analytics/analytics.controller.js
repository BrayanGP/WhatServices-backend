const Event = require('./event.model');

const clip = (s, n = 300) => String(s == null ? '' : s).slice(0, n);

// Rango de días → fecha desde
const sinceFrom = (days) => {
  const d = Number(days) > 0 ? Number(days) : 7;
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
};

// ---- Ingesta pública (el front manda eventos) ----
const ingest = async (req, res) => {
  try {
    const { name, path, sessionId, source, referrer, meta } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name requerido' });
    await Event.create({
      name: clip(name, 60),
      path: clip(path, 200),
      sessionId: clip(sessionId, 60),
      userId: req.user?.id || null,
      source: clip(source || 'directo', 60),
      referrer: clip(referrer, 200),
      ua: clip(req.get('user-agent'), 200),
      meta: meta && typeof meta === 'object' ? meta : {},
    });
    res.json({ ok: true });
  } catch (err) {
    // La analítica nunca debe romper la experiencia: responde ok aunque falle.
    res.json({ ok: false });
  }
};

// ---- Resumen para el dashboard ----
const overview = async (req, res, next) => {
  try {
    const since = sinceFrom(req.query.days);
    const base = { createdAt: { $gte: since } };

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

    const [pageviews, uniques, pageviewsToday, byDayRaw, topPathsRaw, topSourcesRaw, byDeviceRaw, topSearchesRaw, topProvidersRaw] = await Promise.all([
      Event.countDocuments({ ...base, name: 'pageview' }),
      Event.distinct('sessionId', base).then((a) => a.filter(Boolean).length),
      Event.countDocuments({ name: 'pageview', createdAt: { $gte: startOfToday } }),
      Event.aggregate([
        { $match: { ...base, name: 'pageview' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'America/Mexico_City' } }, count: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } },
        { $project: { _id: 1, count: 1, visitors: { $size: '$sessions' } } },
        { $sort: { _id: 1 } },
      ]),
      Event.aggregate([
        { $match: { ...base, name: 'pageview' } },
        { $group: { _id: '$path', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 8 },
      ]),
      Event.aggregate([
        { $match: { ...base, name: 'pageview' } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 8 },
      ]),
      Event.aggregate([
        { $match: { ...base, name: 'pageview' } },
        { $group: { _id: { $cond: [{ $regexMatch: { input: { $ifNull: ['$ua', ''] }, regex: /mobile|android|iphone|ipad/i } }, 'Móvil', 'Escritorio'] }, count: { $sum: 1 } } },
      ]),
      Event.aggregate([
        { $match: { ...base, name: 'search', 'meta.category': { $nin: [null, ''] } } },
        { $group: { _id: '$meta.category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 8 },
      ]),
      Event.aggregate([
        { $match: { ...base, name: 'whatsapp_click', 'meta.name': { $nin: [null, ''] } } },
        { $group: { _id: '$meta.name', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 8 },
      ]),
    ]);

    res.json({
      days: Number(req.query.days) || 7,
      pageviews,
      uniques,
      pageviewsToday,
      avgPerVisitor: uniques ? Math.round((pageviews / uniques) * 10) / 10 : 0,
      byDay: byDayRaw.map((d) => ({ date: d._id, views: d.count, visitors: d.visitors })),
      topPaths: topPathsRaw.map((p) => ({ path: p._id || '/', count: p.count })),
      topSources: topSourcesRaw.map((s) => ({ source: s._id || 'directo', count: s.count })),
      byDevice: byDeviceRaw.map((d) => ({ device: d._id, count: d.count })),
      topSearches: topSearchesRaw.map((s) => ({ term: s._id, count: s.count })),
      topProviders: topProvidersRaw.map((p) => ({ name: p._id, count: p.count })),
    });
  } catch (err) {
    next(err);
  }
};

// ---- Embudos de conversión ----
const FUNNELS = {
  cliente: {
    label: 'Clientes',
    steps: [
      { key: 'pageview', label: 'Visitaron el sitio' },
      { key: 'search', label: 'Buscaron un servicio' },
      { key: 'provider_view', label: 'Vieron un perfil' },
      { key: 'whatsapp_click', label: 'Contactaron por WhatsApp' },
    ],
  },
  proveedor: {
    label: 'Proveedores',
    steps: [
      { key: 'unete_view', label: 'Entraron a "Únete"' },
      { key: 'otp_verified', label: 'Verificaron su teléfono' },
      { key: 'register_success', label: 'Completaron registro' },
    ],
  },
};

const funnel = async (req, res, next) => {
  try {
    const since = sinceFrom(req.query.days);
    const out = {};
    for (const [id, f] of Object.entries(FUNNELS)) {
      const steps = [];
      let prev = null;
      for (const s of f.steps) {
        const ids = await Event.distinct('sessionId', { name: s.key, createdAt: { $gte: since } });
        const count = ids.filter(Boolean).length;
        const fromPrev = prev == null ? 100 : (prev ? Math.round((count / prev) * 100) : 0);
        steps.push({ key: s.key, label: s.label, count, pctFromPrev: fromPrev });
        prev = count;
      }
      const first = steps[0]?.count || 0;
      const last = steps[steps.length - 1]?.count || 0;
      const conversion = first ? Math.round((last / first) * 100) : 0;
      out[id] = { label: f.label, steps, conversion };
    }
    res.json({ days: Number(req.query.days) || 7, funnels: out });
  } catch (err) {
    next(err);
  }
};

module.exports = { ingest, overview, funnel };
