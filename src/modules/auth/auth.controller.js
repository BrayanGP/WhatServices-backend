const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../users/user.model');
const { JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV } = require('../../config/env');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  // 'none' permite enviar la cookie cross-site (front y backend en dominios distintos)
  sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
};

const signTokens = (user) => {
  const payload = { id: user._id, role: user.role };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

const register = async (req, res, next) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, phone, email, passwordHash });
    const { accessToken, refreshToken } = signTokens(user);
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json({
      accessToken,
      user: { id: user._id, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Account blocked' });
    }
    const { accessToken, refreshToken } = signTokens(user);
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ accessToken, user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token' });
    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user || user.isBlocked) return res.status(401).json({ message: 'Unauthorized' });
    const { accessToken, refreshToken } = signTokens(user);
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
};

const logout = (req, res) => {
  res.clearCookie('refreshToken', COOKIE_OPTS);
  res.json({ message: 'Logged out' });
};

module.exports = { register, login, refresh, logout };
