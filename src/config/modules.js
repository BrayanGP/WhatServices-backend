// Módulos del panel admin que se pueden asignar a roles
const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'providers', label: 'Proveedores' },
  { key: 'users', label: 'Usuarios' },
  { key: 'roles', label: 'Roles' },
  { key: 'conversations', label: 'Conversaciones' },
  { key: 'requests', label: 'Solicitudes' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'bot', label: 'Bot' },
  { key: 'subscriptions', label: 'Suscripciones' },
  { key: 'categories', label: 'Categorías' },
  { key: 'settings', label: 'Configuración' },
];

const ALL_MODULE_KEYS = MODULES.map((m) => m.key);

module.exports = { MODULES, ALL_MODULE_KEYS };
