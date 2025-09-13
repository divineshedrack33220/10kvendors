const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true }, // Reference to Address model
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  }],
  subtotal: { type: Number, required: true, min: 0 }, // Store subtotal before delivery fee
  deliveryFee: { type: Number, default: 5000, min: 0 },
  total: { type: Number, required: true, min: 0 },
  status: { 
    type: String, 
    enum: ['Placed', 'Packed', 'In Transit', 'Delivered', 'Cancelled'], 
    default: 'Placed' 
  },
  paymentMethod: { 
    type: String, 
    enum: ['Pay on Delivery', 'Card Payment', 'Bank Transfer', 'Paystack'], 
    required: true 
  },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'completed', 'failed'], 
    default: 'pending' 
  },
  paymentReference: { type: String }, // Store Paystack transaction reference
  orderNotes: { type: String, trim: true },
  tracking: [{
    status: { type: String, required: true },
    date: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  orderNumber: { type: String, unique: true } // Inline unique index
});

// Ensure unique order number with retry logic
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!isUnique && attempts < maxAttempts) {
      try {
        const count = await mongoose.model('Order').countDocuments();
        this.orderNumber = `ORD-${(count + 1).toString().padStart(6, '0')}`;

        // Verify uniqueness
        const existingOrder = await mongoose.model('Order').findOne({ orderNumber: this.orderNumber });
        if (!existingOrder) {
          isUnique = true;
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          return next(new Error('Failed to generate unique order number after multiple attempts'));
        }
        // Brief wait before retrying
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  next();
});

// Index for payment reference lookups
orderSchema.index({ paymentReference: 1 });

module.exports = mongoose.model('Order', orderSchema);
