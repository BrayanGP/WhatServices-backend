const bcrypt = require('bcryptjs');
const Provider = require('./provider.model');
const User = require('../users/user.model');
const { signTokens, COOKIE_OPTS } = require('../../utils/tokens');
const { fileUrl } = require('../../middleware/upload');

// Registro de empleado/proveedor: crea usuario role 'provider' + perfil
const register = async (req, res, next) => {
  try {
    const {
      name, email, phone, password,
      businessName, ownerName, city, postalCode, address, description,
      categories = [], specialties = [], lat, lng,
    } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (!businessName || !city) {
      return res.status(400).json({ message: 'businessName y city son obligatorios' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name || ownerName, email, phone, passwordHash, role: 'provider' });

    const profile = {
      userId: user._id,
      businessName,
      ownerName: ownerName || name,
      phone,
      city,
      postalCode,
      address,
      description,
      categories,
      specialties,
    };
    if (lat != null && lng != null) {
      profile.location = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
    }
    const provider = await Provider.create(profile);

    const { accessToken, refreshToken } = signTokens(user);
    res.cookie('refreshToken', refreshToken, COOKIE_OPTS);
    res.status(201).json({
      accessToken,
      user: { id: user._id, name: user.name, role: user.role },
      provider,
    });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const { category, city, availability, cp, page = 1, limit = 10 } = req.query;
    const filter = { isBlocked: false };
    if (category) filter.categories = category;
    if (city) filter.city = new RegExp(city, 'i');
    if (cp) filter.postalCode = cp;
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

const getMine = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ userId: req.user.id }).lean();
    if (!provider) return res.status(404).json({ message: 'No tienes perfil de proveedor' });
    res.json(provider);
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
    const newPhotos = req.files.map((f) => fileUrl(f));
    const allowed = 5 - provider.photos.length;
    provider.photos.push(...newPhotos.slice(0, allowed));
    await provider.save();
    res.json({ photos: provider.photos });
  } catch (err) {
    next(err);
  }
};

const uploadProfilePhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file' });
    const provider = await Provider.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { profilePhoto: fileUrl(req.file) },
      { new: true }
    );
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    res.json({ profilePhoto: provider.profilePhoto });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, getMine, list, getOne, create, update, updateAvailability, uploadPhotos, uploadProfilePhoto };
