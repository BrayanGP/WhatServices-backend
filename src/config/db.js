const mongoose = require('mongoose');
const { MONGODB_URI } = require('./env');

// Conexión singleton: una sola conexión por proceso.
// Si ya está conectado, la reutiliza; si está conectando, devuelve la misma promesa.
let connPromise = null;

const connectDB = async () => {
  // 1 = connected → reutiliza la conexión existente
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  // 2 = connecting → reutiliza la promesa en curso (evita conexiones duplicadas)
  if (connPromise) return connPromise;

  connPromise = mongoose
    .connect(MONGODB_URI)
    .then((m) => {
      console.log(`MongoDB connected: ${m.connection.host}`);
      return m.connection;
    })
    .catch((err) => {
      connPromise = null; // permite reintentar si falló
      throw err;
    });

  return connPromise;
};

module.exports = connectDB;
