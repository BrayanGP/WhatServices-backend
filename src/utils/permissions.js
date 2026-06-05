const { ALL_MODULE_KEYS } = require('../config/modules');
const Role = require('../modules/admin/role.model');

// Módulos efectivos de un usuario del panel.
// admin = todos; staff = los de su rol; otros = ninguno.
async function modulesForUser(user) {
  if (!user) return [];
  if (user.role === 'admin') return ALL_MODULE_KEYS;
  if (user.roleId) {
    const r = await Role.findById(user.roleId).lean();
    return r?.modules || [];
  }
  return [];
}

module.exports = { modulesForUser };
