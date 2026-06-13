const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const Provider = require('./provider.model');
const User = require('../users/user.model');
const Otp = require('../auth/otp.model');
const { signTokens, COOKIE_OPTS } = require('../../utils/tokens');
const { fileUrl } = require('../../middleware/upload');
const { CLIENT_URL } = require('../../config/env');

const OTP_VERIFIED_TTL_MS = 30 * 60 * 1000; // el OTP verificado vale 30 min para completar el registro

// Registro de empleado/proveedor: crea usuario role 'provider' + perfil
const register = async (req, res, next) => {
  try {
    const {
      name, phone, password,
      businessName, ownerName, city, postalCode, address, description,
      categories = [], specialties = [], lat, lng,
      acceptedTerms, termsVersion, acceptedPrivacy, privacyVersion,
    } = req.body;
    // Si el email viene vacío, tratarlo como ausente para no chocar con el índice único sparse
    const email = req.body.email?.trim() || undefined;

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
    const { email, ...providerFields } = req.body;
    if (email !== undefined) {
      const cleanEmail = email?.trim() || null;
      if (cleanEmail) {
        const existing = await User.findOne({ email: cleanEmail, _id: { $ne: req.user.id } });
        if (existing) return res.status(409).json({ message: 'Este correo ya está en uso por otra cuenta.' });
      }
      await User.findByIdAndUpdate(req.user.id, { email: cleanEmail });
      providerFields.email = cleanEmail;
    }
    const provider = await Provider.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      providerFields,
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

const { WHATSAPP_ALBUM, DEFAULT_ALBUM, WHATSAPP_MAX, RESERVED_ALBUMS } = Provider;
const MAX_PHOTOS_TOTAL = 60; // tope sano de fotos por proveedor (la galeria 'default' admite muchas)

// Cuantas fotos hay actualmente en un album
const countInAlbum = (provider, album) =>
  (provider.photos || []).filter((p) => (p.albums || []).includes(album)).length;

const uploadPhotos = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ _id: req.params.id, userId: req.user.id });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });

    // Album destino (campo del formulario o query). Por defecto 'default'.
    const album = String(req.body.album || req.query.album || DEFAULT_ALBUM).trim() || DEFAULT_ALBUM;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'No files' });

    // Tope total
    if (provider.photos.length + files.length > MAX_PHOTOS_TOTAL) {
      return res.status(400).json({ message: `Máximo ${MAX_PHOTOS_TOTAL} fotos en total` });
    }
    // El album WhatsApp solo admite 5 (es lo que muestra el bot)
    if (album === WHATSAPP_ALBUM) {
      const room = WHATSAPP_MAX - countInAlbum(provider, WHATSAPP_ALBUM);
      if (files.length > room) {
        return res.status(400).json({ message: `El álbum de WhatsApp admite máximo ${WHATSAPP_MAX} fotos${room > 0 ? ` (te quedan ${room})` : ''}.` });
      }
    }
    // Toda foto pertenece a 'default'; ademas al album destino si es distinto.
    const albums = album && album !== DEFAULT_ALBUM ? [DEFAULT_ALBUM, album] : [DEFAULT_ALBUM];
    const newPhotos = files.map((f) => ({ ...fileUrl(f), albums: [...albums] }));
    provider.photos.push(...newPhotos);

    // Si es un album propio nuevo, registrarlo en la lista del proveedor
    if (album && !RESERVED_ALBUMS.includes(album) && !provider.albums.includes(album)) {
      provider.albums.push(album);
    }
    await provider.save();
    res.json({ photos: provider.photos, albums: provider.albums });
  } catch (err) {
    next(err);
  }
};

// Eliminar una foto por publicId (de TODOS los albumes a los que pertenece)
const deletePhoto = async (req, res, next) => {
  try {
    const publicId = req.body.publicId || req.query.publicId;
    if (!publicId) return res.status(400).json({ message: 'publicId requerido' });
    const provider = await Provider.findOne({ _id: req.params.id, userId: req.user.id });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    provider.photos = (provider.photos || []).filter((p) => p.publicId !== publicId);
    await provider.save();
    res.json({ photos: provider.photos, albums: provider.albums });
  } catch (err) {
    next(err);
  }
};

// Cambiar a que albumes pertenece una foto (p. ej. agregar/quitar de WhatsApp)
const updatePhotoAlbums = async (req, res, next) => {
  try {
    const { publicId, albums } = req.body || {};
    if (!publicId || !Array.isArray(albums)) return res.status(400).json({ message: 'publicId y albums requeridos' });
    const provider = await Provider.findOne({ _id: req.params.id, userId: req.user.id });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    const photo = (provider.photos || []).find((p) => p.publicId === publicId);
    if (!photo) return res.status(404).json({ message: 'Foto no encontrada' });

    // Normaliza: siempre en 'default'; sin duplicados
    let next_ = Array.from(new Set([DEFAULT_ALBUM, ...albums.map((a) => String(a).trim()).filter(Boolean)]));
    // Tope del album WhatsApp
    if (next_.includes(WHATSAPP_ALBUM) && !(photo.albums || []).includes(WHATSAPP_ALBUM)) {
      if (countInAlbum(provider, WHATSAPP_ALBUM) >= WHATSAPP_MAX) {
        return res.status(400).json({ message: `El álbum de WhatsApp ya tiene ${WHATSAPP_MAX} fotos. Quita una primero.` });
      }
    }
    photo.albums = next_;
    provider.markModified('photos');
    await provider.save();
    res.json({ photos: provider.photos, albums: provider.albums });
  } catch (err) {
    next(err);
  }
};

// Crear un album propio (vacio)
const createAlbum = async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Nombre requerido' });
    if (RESERVED_ALBUMS.map((a) => a.toLowerCase()).includes(name.toLowerCase())) {
      return res.status(400).json({ message: 'Ese nombre está reservado' });
    }
    const provider = await Provider.findOne({ _id: req.params.id, userId: req.user.id });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    if (!provider.albums.includes(name)) provider.albums.push(name);
    await provider.save();
    res.json({ albums: provider.albums });
  } catch (err) {
    next(err);
  }
};

// Eliminar un album propio (no los predefinidos). Las fotos quedan en 'default'.
const deleteAlbum = async (req, res, next) => {
  try {
    const name = String(req.body.name || req.query.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Nombre requerido' });
    if (RESERVED_ALBUMS.includes(name)) return res.status(400).json({ message: 'No se puede eliminar un álbum predefinido' });
    const provider = await Provider.findOne({ _id: req.params.id, userId: req.user.id });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    provider.albums = (provider.albums || []).filter((a) => a !== name);
    (provider.photos || []).forEach((p) => { p.albums = (p.albums || []).filter((a) => a !== name); });
    provider.markModified('photos');
    await provider.save();
    res.json({ photos: provider.photos, albums: provider.albums });
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

// GET /providers/:id/profile-qr  — PNG del QR que apunta al perfil público del proveedor
const profileQr = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id).select('businessName').lean();
    if (!provider) return res.status(404).json({ message: 'Provider not found' });

    const profileUrl = `${CLIENT_URL}/providers/${req.params.id}`;

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="qr-${provider.businessName?.replace(/\s+/g, '-').toLowerCase() || req.params.id}.png"`
    );
    await QRCode.toFileStream(res, profileUrl, {
      width: 600,
      margin: 2,
      color: { dark: '#1a3a2a', light: '#ffffff' }, // verde oscuro de la marca
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register, getMine, list, getOne, create, update, updateAvailability,
  uploadPhotos, deletePhoto, updatePhotoAlbums, createAlbum, deleteAlbum,
  uploadProfilePhoto, profileQr,
};
