const Review = require('./review.model');
const Provider = require('../providers/provider.model');

// Recalcula y guarda el rating del proveedor
const recalcRating = async (providerId) => {
  const all = await Review.find({ providerId });
  const average = all.length
    ? parseFloat((all.reduce((s, r) => s + r.rating, 0) / all.length).toFixed(1))
    : 0;
  await Provider.findByIdAndUpdate(providerId, {
    'rating.average': average,
    'rating.count': all.length,
  });
};

// GET /reviews/provider/:id
const getByProvider = async (req, res, next) => {
  try {
    const reviews = await Review.find({ providerId: req.params.id })
      .populate('clientId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json(reviews);
  } catch (err) { next(err); }
};

// GET /reviews/provider/:id/device/:deviceId  — devuelve la reseña del dispositivo si existe
const getByDevice = async (req, res, next) => {
  try {
    const review = await Review.findOne({
      providerId: req.params.id,
      deviceId:   req.params.deviceId,
    }).lean();
    res.json(review || null);
  } catch (err) { next(err); }
};

// POST /reviews  — crea o actualiza (upsert por deviceId)
const upsert = async (req, res, next) => {
  try {
    const { providerId, rating, comment, deviceId, reviewerName } = req.body;
    if (!providerId || !rating || !deviceId) {
      return res.status(400).json({ message: 'providerId, rating y deviceId son requeridos' });
    }

    const review = await Review.findOneAndUpdate(
      { providerId, deviceId },
      { rating, comment, reviewerName, source: 'web' },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await recalcRating(providerId);
    res.status(200).json(review);
  } catch (err) { next(err); }
};

module.exports = { getByProvider, getByDevice, upsert };
