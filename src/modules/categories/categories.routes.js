const express = require('express');
const router = express.Router();
const Category = require('../admin/category.model');

const slugify = (str) =>
  str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// Público: lista de categorías aprobadas
// Incluye docs sin campo status (retrocompatibilidad con datos previos a la migración)
router.get('/', async (req, res, next) => {
  try {
    const categories = await Category
      .find({ isActive: true, $or: [{ status: 'active' }, { status: { $exists: false } }] })
      .select('name slug icon')
      .sort({ name: 1 })
      .lean();
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// Público: sugerir una nueva categoría (queda en status 'pending', sin necesidad de token)
router.post('/suggest', async (req, res, next) => {
  try {
    const { name, icon } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'El nombre es obligatorio' });

    const slug = slugify(name.trim());

    const exists = await Category.findOne({ slug });
    if (exists) {
      return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
    }

    const category = await Category.create({
      name: name.trim(),
      slug,
      icon: icon?.trim() || '🔧',
      isActive: false,
      status: 'pending',
    });

    res.status(201).json({
      message: 'Categoría enviada. El administrador la revisará pronto.',
      category: { _id: category._id, name: category.name, icon: category.icon, status: category.status },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
