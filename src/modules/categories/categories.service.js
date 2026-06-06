const Category = require('../admin/category.model');
const { DEFAULT_CATEGORIES } = require('./default-categories');

// Siembra las categorías por defecto SOLO si no hay ninguna categoría activa.
// Idempotente y respetuoso con el admin: usa $setOnInsert (no reactiva ni modifica
// categorías existentes) y no hace nada si ya hay categorías visibles al público.
async function ensureDefaultCategories() {
  try {
    const activeCount = await Category.countDocuments({
      isActive: true,
      $or: [{ status: 'active' }, { status: { $exists: false } }],
    });
    if (activeCount > 0) return; // ya hay categorías visibles, no tocamos nada

    for (const cat of DEFAULT_CATEGORIES) {
      await Category.updateOne(
        { slug: cat.slug },
        { $setOnInsert: { ...cat, isActive: true, status: 'active' } },
        { upsert: true },
      );
    }
    console.log(`[categories] sembradas categorías por defecto (no había activas)`);
  } catch (err) {
    console.error('[categories] no se pudieron sembrar las categorías por defecto:', err.message);
  }
}

module.exports = { ensureDefaultCategories };
