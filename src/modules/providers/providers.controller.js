const Provider = require('./provider.model');

const list = async (req, res, next) => {
  try {
    const { category, city, availability, page = 1, limit = 10 } = req.query;
    const filter = { isBlocked: false };
    if (category) filter.categories = category;
    if (city) filter.city = new RegExp(city, 'i');
    if (availability) filter.availability = availability;

    const skip = (Number(page) - 1) * Number(limit);
    const [providers, total] = await Promise.all([
      Provider.find(filter).skip(skip).limit(Number(limit)).lean(),
      Provider.countDocuments(filter),
    ]);
    res.json({ providers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id).lean();
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    res.json(provider);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const provider = await Provider.create({ ...req.body, userId: req.user.id });
    res.status(201).json(provider);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const provider = await Provider.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    res.json(provider);
  } catch (err) {
    next(err);
  }
};

const updateAvailability = async (req, res, next) => {
  try {
    const { availability } = req.body;
    const provider = await Provider.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { availability },
      { new: true }
    );
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    res.json({ availability: provider.availability });
  } catch (err) {
    next(err);
  }
};

const uploadPhotos = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ _id: req.params.id, userId: req.user.id });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    if (provider.photos.length >= 5) {
      return res.status(400).json({ message: 'Maximum 5 photos allowed' });
    }
    const newPhotos = req.files.map((f) => ({ url: f.path, publicId: f.filename }));
    const allowed = 5 - provider.photos.length;
    provider.photos.push(...newPhotos.slice(0, allowed));
    await provider.save();
    res.json({ photos: provider.photos });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, getOne, create, update, updateAvailability, uploadPhotos };
