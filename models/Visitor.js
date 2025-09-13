const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  visitorId: {
    type: String, // Can be user._id or a unique identifier for anonymous visitors
    required: true,
  },
  action: {
    type: String, // e.g., 'page_view', 'click', 'login'
    required: true,
  },
  page: {
    type: String, // e.g., '/home', '/product/123'
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Visitor', visitorSchema);