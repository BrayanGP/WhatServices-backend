const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const connectDB = require('./config/db');
const { PORT, CLIENT_URL, ADMIN_URL, API_KEY, BACKEND_PUBLIC_URL } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const providerRoutes = require('./modules/providers/providers.routes');
const reviewRoutes = require('./modules/reviews/reviews.routes');
const subscriptionRoutes = require('./modules/subscriptions/subscriptions.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const botRoutes = require('./modules/bot/bot.routes');
const waRoutes = require('./modules/wa/wa.routes');
const categoryRoutes = require('./modules/categories/categories.routes');
const fileRoutes = require('./modules/files/files.routes');

const app = express();

const allowlist = [CLIENT_URL, ADMIN_URL].filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // permitir sin origin (curl, server-to-server, apps móviles), los dominios configurados y *.up.railway.app
    if (!origin || allowlist.includes(origin) || /\.up\.railway\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false); // origen no permitido → el navegador bloquea
  },
  credentials: true,
}));

// Stripe webhook must receive raw body — mount before express.json()
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Servir archivos subidos localmente (solo cuando Cloudinary no está configurado)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ---- API key: protege /api cuando API_KEY está definido ----
// Exentos: preflight CORS y webhooks server-to-server (no pueden enviar el header).
const API_KEY_EXEMPT = ['/api/bot/webhook', '/api/subscriptions/webhook'];
app.use((req, res, next) => {
  if (!API_KEY) return next();                       // desactivado si no hay key
  if (req.method === 'OPTIONS') return next();        // preflight
  if (!req.path.startsWith('/api/')) return next();   // solo protege la API JSON
  if (API_KEY_EXEMPT.includes(req.path)) return next();
  if (req.get('x-api-key') === API_KEY) return next();
  return res.status(401).json({ message: 'API key inválida o ausente' });
});

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bot', botRoutes);
app.use('/wa', waRoutes);
app.use('/files', fileRoutes);

app.use(errorHandler);

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    // Keep-alive: evita que el servicio se duerma por inactividad (causa de "no contesta al primer mensaje").
    if (BACKEND_PUBLIC_URL && process.env.KEEP_ALIVE !== 'false') {
      const url = `${BACKEND_PUBLIC_URL.replace(/\/$/, '')}/health`;
      setInterval(() => { fetch(url).catch(() => {}); }, 4 * 60 * 1000);
    }
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
