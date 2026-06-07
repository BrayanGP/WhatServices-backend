const bcrypt = require('bcryptjs');
const Provider = require('./provider.model');
const User = require('../users/user.model');
const Otp = require('../auth/otp.model');
const { signTokens, COOKIE_OPTS } = require('../../utils/tokens');
const { fileUrl } = require('../../middleware/upload');

const OTP_VERIFIED_TTL_MS = 30 * 60 * 1000; // el OTP verificado vale 30 min para completar el registro

// Registro de empleado/proveedor: crea usuario role 'provider' + perfil
const register = async (req, res, next) => {
  try {
    const {
      name, email, phone, password,
      businessName, ownerName, city, postalCode, address, description,
      categories = [], specialties = [], lat, lng,
      acceptedTerms, termsVersion, acceptedPrivacy, privacyVersion,
    } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (!businessName || !city) {
      return res.status(400).json({ message: 'businessName y city son obligatorios' });
    }
    // El usuario debe aceptar los Términos y Condiciones y el Aviso de Privacidad para registrarse.
    if (!acceptedTerms || !acceptedPrivacy) {
      return res.status(400).json({ message: 'Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para continuar.' });
    }

    // Exigir teléfono verificado por OTP
    const d10 = String(phone || '').replace(/\D/g, '').slice(-10);
    const otp = await Otp.findOne({ phone: d10, purpose: 'register' });
    if (!otp || !otp.verified || !otp.verifiedAt || (Date.now() - new Date(otp.verifiedAt).getTime() > OTP_VERIFIED_TTL_MS)) {
      return res.status(403).json({ message: 'Verifica tu teléfono con el código antes de registrarte.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();
    const consent = {
      acceptedTerms: true, termsAcceptedAt: now, termsVersion: termsVersion || '1.0',
      acceptedPrivacy: true, privacyAcceptedAt: now, privacyVersion: privacyVersion || '1.0',
    };

    // ¿Ya hay un usuario con ese teléfono? Puede ser un registro previo que quedó a medias.
    let user = await User.findOne({ phone: new RegExp(`${d10}$`) });
    let createdUser = false;
    if (user) {
      const hasProvider = await Provider.exists({ userId: user._id });
      if (hasProvider) {
        return res.status(409).json({ message: 'Ya tienes una cuenta registrada con este teléfono. Inicia sesión.' });
      }
      if (user.role !== 'provider') {
        return res.status(409).json({ message: 'Este teléfono ya está asociado a otra cuenta. Inicia sesión.' });
      }
      // Registro incompleto: reanudamos con los datos nuevos.
      user.name = name || ownerName || user.name;
      if (email) user.email = email;
      user.passwordHash = passwordHash;
      Object.assign(user, consent);
      await user.save();
    } else {
      user = await User.create({ name: name || ownerName, email, phone, passwordHash, role: 'provider', ...consent });
      createdUser = true;
    }

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
    // Solo guardamos ubicación si hay coordenadas numéricas válidas (p. ej. cuando el
    // proveedor eligió una sugerencia o usó GPS). Si escribió la dirección a mano sin
    // seleccionar, se guarda igual: simplemente sin coordenadas (no se rompe el alta).
    const latN = Number(lat), lngN = Number(lng);
    if (Number.isFinite(latN) && Number.isFinite(lngN)) {
      profile.location = { type: 'Point', coordinates: [lngN, latN] };
    }
    let provider;
    try {
      provider = await Provider.create(profile);
    } catch (e) {
      // Evita dejar un usuario huérfano (sin perfil) si la creación del perfil falla.
      if (createdUser) await User.deleteOne({ _id: user._id }).catch(() => {});
      throw e;
    }
    await Otp.deleteOne({ phone: d10, purpose: 'register' }).catch(() => {}); // OTP de un solo uso

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

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Búsqueda flexible (tipo "like", no exacta) — igual de tolerante que el formulario.
const list = async (req, res, next) => {
  try {
    const { category, city, availability, cp, page = 1, limit = 10 } = req.query;
    const filter = { isBlocked: false };
    const and = [];

    // Servicio: coincidencia parcial e insensible a mayúsculas en categorías,
    // especialidades, descripción o nombre del negocio.
    if (category && String(category).trim()) {
      const rx = new RegExp(escapeRegex(String(category).trim()), 'i');
      and.push({ $or: [{ categories: rx }, { specialties: rx }, { description: rx }, { businessName: rx }] });
    }

    // Ubicación: se cumple si coincide la ciudad/dirección O el código postal (parcial).
    const loc = [];
    if (city && String(city).trim()) {
      const rc = new RegExp(escapeRegex(String(city).trim()), 'i');
      loc.push({ city: rc }, { address: rc });
    }
    if (cp && String(cp).trim()) {
      loc.push({ postalCode: new RegExp('^' + escapeRegex(String(cp).trim())) });
    }
    if (loc.length) and.push({ $or: loc });

    if (and.length) filter.$and = and;
    if (availability) filter.availability = availability;

    const skip = (Number(page) - 1) * Number(limit);
    const [providers, total] = await Promise.all([
      Provider.find(filter)
        .sort({ 'rating.average': -1, 'rating.count': -1, createdAt: -1 })
        .skip(skip).limit(Number(limit)).lean(),
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
