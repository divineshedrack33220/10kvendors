const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

exports.register = async (req, res) => {
  try {
    const { name, email, password, address, isAdmin } = req.body; // Allow isAdmin for testing
    const user = new User({ name, email, password, address, isAdmin: isAdmin || false });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({ user, token });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (phone) user.phone = phone;
    await user.save();

    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New password and confirmation do not match' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error in changePassword:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.toggle2FA = async (req, res) => {
  try {
    const { enable } = req.body;
    if (typeof enable !== 'boolean') {
      return res.status(400).json({ message: 'Enable must be a boolean' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.is2FAEnabled = enable;
    await user.save();
    res.json({ message: `Two-factor authentication ${enable ? 'enabled' : 'disabled'}` });
  } catch (error) {
    console.error('Error in toggle2FA:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const users = await User.find().select('name email createdAt');
    res.json(users);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Debug: Log exports
console.log('userController exports:', Object.keys(module.exports));