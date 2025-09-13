// models/VisitorLocation.js (unchanged)
const mongoose = require('mongoose');
const visitorLocationSchema = new mongoose.Schema({
  ip: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referer: { type: String, default: 'Direct' },
  page: { type: String, required: true },
  country: { type: String, required: true },
  region: { type: String },
  city: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  timestamp: { type: Date, default: Date.now },
});
module.exports = mongoose.model('VisitorLocation', visitorLocationSchema);