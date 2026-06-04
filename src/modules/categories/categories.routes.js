const express = require('express');
const router = express.Router();
const Category = require('../admin/category.model');

// Publico: lista de servicios activos (para registro de empleados y filtros del cliente)
router.get('/', async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).select('name slug icon').sort({ name: 1 }).lean();
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
