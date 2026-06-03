const Provider = require('../providers/provider.model');
const User = require('../users/user.model');
const Category = require('./category.model');

const getProviders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, city, isVerified, isBlocked } = req.query;
    const filter = {};
    if (city) filter.city = new RegExp(city, 'i');
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (isBlocked !== undefined) filter.isBlocked = isBlocked === 'true';
    const skip = (Number(page) - 1) * Number(limit);
    const [providers, total] = await Promise.all([
      Provider.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .populate('userId', 'name email')
        .lean(),
      Provider.countDocuments(filter),
    ]);
    res.json({ providers, total });
  } catch (err) {
    next(err);
  }
};

const toggleVerify = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    provider.isVerified = !provider.isVerified;
    await provider.save();
    res.json({ isVerified: provider.isVerified });
  } catch (err) {
    next(err);
  }
};

const toggleBlockProvider = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    provider.isBlocked = !provider.isBlocked;
    await provider.save();
    res.json({ isBlocked: provider.isBlocked });
  } catch (err) {
    next(err);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find().select('-passwordHash').skip(skip).limit(Number(limit)).lean(),
      User.countDocuments(),
    ]);
    res.json({ users, total });
  } catch (err) {
    next(err);
  }
};

const toggleBlockUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isBlocked = !user.isBlocked;
    await user.save();
    res.json({ isBlocked: user.isBlocked });
  } catch (err) {
    next(err);
  }
};

const getCategories = async (req, res, next) => {
  try {
    res.json(await Category.find().lean());
  } catch (err) {
    next(err);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProviders, toggleVerify, toggleBlockProvider,
  getUsers, toggleBlockUser,
  getCategories, createCategory, updateCategory,
};
