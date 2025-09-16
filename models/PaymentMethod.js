const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['card', 'mobile', 'bank'],
    required: true,
  },
  cardNumber: {
    type: String,
    required: function() { return this.type === 'card'; },
    trim: true,
  },
  expiry: {
    type: String,
    required: function() { return this.type === 'card'; },
    trim: true,
  },
  cvv: {
    type: String,
    required: function() { return this.type === 'card'; },
    trim: true,
  },
  phone: {
    type: String,
    required: function() { return this.type === 'mobile'; },
    trim: true,
  },
  accountNumber: {
    type: String,
    required: function() { return this.type === 'bank'; },
    trim: true,
  },
  bankName: {
    type: String,
    required: function() { return this.type === 'bank'; },
    trim: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);