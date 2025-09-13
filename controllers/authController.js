const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { createNotification } = require('./notificationController');

exports.signup = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'User already exists' });

    user = new User({ name, email, password, phone });
    await user.save();

    // Create signup notification
    await createNotification(user._id, `Welcome to 10kVendor, ${name}! Your account has been created successfully.`, 'order');

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
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};