// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const VisitorLocation = require('../models/VisitorLocation');
const axios = require('axios');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      // Log anonymous visitor with referral and location
      await logVisitor(req, null);
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      await logVisitor(req, null);
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Log authenticated visitor with referral and location
    await logVisitor(req, user);
    req.user = user;
    next();
  } catch (error) {
    await logVisitor(req, null);
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Log visitor with referral and geolocation
const logVisitor = async (req, user) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const referer = req.headers['referer'] || 'Direct';
    let locationData = { country: 'Unknown', region: 'Unknown', city: 'Unknown', latitude: 0, longitude: 0 };

    if (ip !== '::1' && ip !== '127.0.0.1') {
      const response = await axios.get(`http://ip-api.com/json/${ip}`);
      if (response.data.status === 'success') {
        locationData = {
          country: response.data.country,
          region: response.data.regionName,
          city: response.data.city,
          latitude: response.data.lat,
          longitude: response.data.lon,
        };
      }
    }

    await VisitorLocation.create({
      ip,
      userId: user ? user._id : null,
      referer, // Store referral source
      page: req.originalUrl,
      ...locationData,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error logging visitor:', error.message);
  }
};

module.exports = auth;