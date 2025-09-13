const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
  name: {
    type: String, // Campaign name
    required: true,
  },
  platform: {
    type: String, // e.g., 'Facebook', 'Google', 'TikTok'
    required: true,
  },
  spend: {
    type: Number, // Ad spend in NGN
    required: true,
    default: 0,
  },
  impressions: {
    type: Number, // Number of impressions
    required: true,
    default: 0,
  },
  conversions: {
    type: Number, // Number of conversions
    required: true,
    default: 0,
  },
  status: {
    type: String, // e.g., 'Active', 'Paused', 'Completed'
    enum: ['Active', 'Paused', 'Completed'],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Ad', adSchema);