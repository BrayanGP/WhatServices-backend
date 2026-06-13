const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessName: { type: String, required: true },
  ownerName: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String },
  city: { type: String, required: true },
  postalCode: { type: String, index: true },
  // GeoJSON Point [lng, lat] para busqueda por cercania ($near).
  // Sin default en `type`: así, si no hay coordenadas, el campo `location` no se
  // materializa como un Point vacio (que rompe el indice 2dsphere al guardar).
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
  },
  email: { type: String },
  description: { type: String },
  categories: [String],
  specialties: [String],
  profilePhoto: { url: String, publicId: String }, // foto que se muestra en el catalogo de WhatsApp
  // Galeria de trabajos. Cada foto puede pertenecer a varios albumes (categorias del proveedor).
  // 'default' = todas (N fotos). 'WhatsApp' = las que muestra el bot (max 5, no se borra el album).
  photos: [{ url: String, publicId: String, albums: { type: [String], default: ['default'] } }],
  albums: { type: [String], default: [] },          // categorias propias creadas por el proveedor (ademas de las predefinidas)
  availability: {
    type: String,
    enum: ['available', 'busy', 'inactive'],
    default: 'available',
  },
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  subscription: {
    status: {
      type: String,
      enum: ['trial', 'active', 'suspended', 'cancelled'],
      default: 'trial',
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    currentPeriodEnd: Date,
    stripeCustomerId: String,
    stripeSubscriptionId: String,
  },
  isVerified: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

// Indice geoespacial para busquedas por cercania (sparse: ignora docs sin location)
providerSchema.index({ location: '2dsphere' }, { sparse: true });

const Provider = mongoose.model('Provider', providerSchema);

// Albumes predefinidos (no se pueden eliminar). WhatsApp tiene tope de 5 fotos (las que muestra el bot).
Provider.WHATSAPP_ALBUM = 'WhatsApp';
Provider.DEFAULT_ALBUM = 'default';
Provider.WHATSAPP_MAX = 5;
Provider.RESERVED_ALBUMS = [Provider.WHATSAPP_ALBUM, Provider.DEFAULT_ALBUM];

module.exports = Provider;
