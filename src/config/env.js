require('dotenv').config();

const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  // Cloudinary (legacy)
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  // S3-compatible bucket (Tigris / Railway / AWS)
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  S3_REGION: process.env.S3_REGION || 'auto',
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL, // URL base pública del bucket
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
  WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID,
  WA_ACCESS_TOKEN: process.env.WA_ACCESS_TOKEN,
  WA_VERIFY_TOKEN: process.env.WA_VERIFY_TOKEN || 'verify_token',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  ADMIN_URL: process.env.ADMIN_URL || 'http://localhost:5174',
  // Evolution API (microservicio WhatsApp)
  EVOLUTION_URL: process.env.EVOLUTION_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE || 'whatservices-bot',
  // URL publica del propio backend (para registrar el webhook de Evolution)
  BACKEND_PUBLIC_URL: process.env.BACKEND_PUBLIC_URL,
  // API key que deben enviar los fronts (header x-api-key). Si no se define, la protección queda desactivada.
  API_KEY: process.env.API_KEY,

  // ---- WhatsApp Cloud API (Meta) ----
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || '',
  GRAPH_API_VERSION: process.env.GRAPH_API_VERSION || 'v25.0',
  OTP_TEMPLATE_NAME: process.env.OTP_TEMPLATE_NAME || 'otp_verificacion',
  TEMPLATE_LANG: process.env.TEMPLATE_LANG || 'es_MX',
  // OTP por WhatsApp: desactívalo (OTP_ENABLED=false) hasta que Meta apruebe el template.
  OTP_ENABLED: process.env.OTP_ENABLED !== 'false',
};
