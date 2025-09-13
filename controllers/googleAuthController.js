const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { createNotification } = require('./notificationController');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleAuth = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'No token provided' });

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        name,
        email,
        password: 'google-auth-' + googleId,
        googleId,
        picture,
      });
      await user.save();
      // Create signup notification
      await createNotification(user._id, `Welcome to 10kVendor, ${name}! You signed up with Google.`, 'order');
    } else if (!user.googleId) {
      user.googleId = googleId;
      user.picture = picture;
      await user.save();
      // Create notification for linking Google account
      await createNotification(user._id, `Your 10kVendor account is now linked with Google.`, 'order');
    }

    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ user, token: jwtToken });
  } catch (error) {
    res.status(400).json({ message: 'Google authentication failed', error: error.message });
  }
};