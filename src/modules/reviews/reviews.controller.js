const Review = require('./review.model');
const Provider = require('../providers/provider.model');

const getByProvider = async (req, res, next) => {
  try {
    const reviews = await Review.find({ providerId: req.params.id })
      .populate('clientId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json(reviews);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { providerId, rating, comment } = req.body;
    const review = await Review.create({ providerId, clientId: req.user.id, rating, comment });

    const reviews = await Review.find({ providerId });
    const average = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
    await Provider.findByIdAndUpdate(providerId, {
      'rating.average': parseFloat(average.toFixed(1)),
      'rating.count': reviews.length,
    });

    res.status(201).json(review);
  } catch (err) {
    next(err);
  }
};

module.exports = { getByProvider, create };
