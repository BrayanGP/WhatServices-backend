const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const connectDB = require('./config/db');
const { PORT, CLIENT_URL, ADMIN_URL } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const providerRoutes = require('./modules/providers/providers.routes');
const reviewRoutes = require('./modules/reviews/reviews.routes');
const subscriptionRoutes = require('./modules/subscriptions/subscriptions.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const botRoutes = require('./modules/bot/bot.routes');
const waRoutes = require('./modules/wa/wa.routes');
const categoryRoutes = require('./modules/categories/categories.routes');

const app = express();

app.use(cors({
  origin: [CLIENT_URL, ADMIN_URL],
  credentials: true,
}));

// Stripe webhook must receive raw body — mount before express.json()
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bot', botRoutes);
app.use('/wa', waRoutes);

app.use(errorHandler);

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
