const axios = require('axios');
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Address = require('../models/Address');
const PaymentMethod = require('../models/PaymentMethod');
const Order = require('../models/Order');
const User = require('../models/User');

exports.getCheckoutData = async (req, res) => {
  try {
    console.log('Fetching checkout data for user:', req.user._id);

    // Fetch cart
    let cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty', redirect: '/cart.html' });
    }

    // Fetch default address
    const defaultAddress = await Address.findOne({ user: req.user._id, isDefault: true });
    const addresses = await Address.find({ user: req.user._id });

    // Fetch payment methods
    const paymentMethods = await PaymentMethod.find({ user: req.user._id });

    // Fetch user for email
    const user = await User.findById(req.user._id).select('email');

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const deliveryFee = 5000;
    const total = subtotal + deliveryFee;

    res.json({
      cart: cart.items,
      defaultAddress: defaultAddress || (addresses.length > 0 ? addresses[0] : null),
      addresses,
      user: { email: user.email },
      paymentMethods,
      summary: {
        subtotal,
        deliveryFee,
        total,
        itemCount: cart.items.length
      }
    });
  } catch (error) {
    console.error('Error in getCheckoutData:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, orderNotes } = req.body;

    // Validate inputs
    if (!addressId || !paymentMethod) {
      console.log('Validation failed:', { addressId, paymentMethod });
      return res.status(400).json({ message: 'Address and payment method are required' });
    }
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      console.log('Invalid address ID:', addressId);
      return res.status(400).json({ message: 'Invalid address ID' });
    }
    if (!['Pay on Delivery', 'Card Payment', 'Bank Transfer', 'Paystack'].includes(paymentMethod)) {
      console.log('Invalid payment method:', paymentMethod);
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    // Fetch cart
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      console.log('Cart is empty for user:', req.user._id);
      return res.status(400).json({ message: 'Cart is empty', redirect: '/cart.html' });
    }

    // Fetch address
    const address = await Address.findOne({ _id: addressId, user: req.user._id });
    if (!address) {
      console.log('Address not found:', addressId);
      return res.status(404).json({ message: 'Address not found' });
    }

    // Validate payment method (excluding Paystack and Pay on Delivery)
    if (paymentMethod !== 'Pay on Delivery' && paymentMethod !== 'Paystack') {
      const payment = await PaymentMethod.findOne({ user: req.user._id, type: paymentMethod === 'Card Payment' ? 'card' : 'bank' });
      if (!payment) {
        console.log('Payment method not found for type:', paymentMethod);
        return res.status(400).json({ message: `Please add a ${paymentMethod.toLowerCase()} method` });
      }
    }

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const deliveryFee = 5000;
    const total = subtotal + deliveryFee;

    // Create order
    const order = new Order({
      user: req.user._id,
      addressId: address._id,
      items: cart.items.map(item => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.product.price
      })),
      subtotal,
      deliveryFee,
      total,
      paymentMethod,
      paymentStatus: paymentMethod === 'Paystack' ? 'pending' : 'completed',
      orderNotes: orderNotes?.trim(),
      tracking: [{ status: 'Placed', date: new Date() }]
    });

    await order.save();
    await order.populate('items.product');
    console.log('Order created successfully:', order.orderNumber);

    // Clear cart
    try {
      console.log('Clearing cart for user:', req.user._id);
      cart.items = [];
      await cart.save();
      console.log('Cart cleared successfully for user:', req.user._id);
    } catch (cartError) {
      console.error('Error clearing cart:', cartError.message);
      // Notify admin for investigation
      const io = req.app.get('io');
      io.to('adminRoom').emit('systemAlert', {
        message: `Cart clearing failed for user ${req.user._id} after order ${order.orderNumber}`,
        error: cartError.message
      });
    }

    // Emit WebSocket event
    const io = req.app.get('io');
    io.to('adminRoom').emit('orderStatusUpdate', order);
    io.to(`user_${req.user._id}`).emit('orderStatusUpdate', order);

    res.status(201).json({ _id: order._id, orderNumber: order.orderNumber });
  } catch (error) {
    console.error('Error in createOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { reference, orderId } = req.body;
    const userId = req.user._id;
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_');

    // Validate inputs
    if (!reference || !orderId) {
      console.log('Validation failed:', { reference, orderId });
      return res.status(400).json({ message: 'Reference and order ID are required' });
    }
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log('Invalid order ID:', orderId);
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    // Fetch order
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.paymentMethod !== 'Paystack') {
      console.log('Invalid payment method for order:', order.paymentMethod);
      return res.status(400).json({ message: 'Order does not use Paystack payment method' });
    }

    // Verify payment with Paystack
    const maxRetries = 3;
    let attempt = 0;
    let verificationResponse;

    while (attempt < maxRetries) {
      try {
        verificationResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
        });
        console.log(`Paystack verification attempt ${attempt + 1}/${maxRetries} succeeded`);
        break;
      } catch (error) {
        attempt++;
        const errorDetails = error.response ? {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        } : { message: error.message, stack: error.stack };
        console.error(`Paystack verification attempt ${attempt}/${maxRetries} failed:`, errorDetails);
        if (attempt >= maxRetries) {
          console.error('Paystack verification failed after all retries:', errorDetails);
          return res.status(500).json({
            message: 'Payment verification failed after multiple attempts',
            error: errorDetails,
            isTestMode
          });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!verificationResponse) {
      console.error('No verification response received after retries');
      return res.status(500).json({
        message: 'Payment verification failed: No response from Paystack',
        isTestMode
      });
    }

    if (verificationResponse.data.status && verificationResponse.data.data.status === 'success') {
      // Validate amount
      const paidAmount = verificationResponse.data.data.amount / 100; // Convert from kobo to NGN
      if (paidAmount !== order.total) {
        console.log('Payment amount mismatch:', { paidAmount, orderTotal: order.total });
        order.paymentStatus = 'failed';
        order.paymentReference = reference;
        await order.save();
        return res.status(400).json({ message: 'Payment amount mismatch' });
      }

      // Update order
      order.paymentStatus = 'completed';
      order.paymentReference = reference;
      order.tracking.push({ status: 'Payment Confirmed', date: new Date() });
      await order.save();

      // Emit WebSocket event
      const io = req.app.get('io');
      io.to('adminRoom').emit('orderStatusUpdate', order);
      io.to(`user_${userId}`).emit('orderStatusUpdate', order);

      console.log('Payment verified successfully for order:', order.orderNumber);
      res.json({ status: 'success', orderNumber: order.orderNumber });
    } else {
      order.paymentStatus = 'failed';
      order.paymentReference = reference;
      await order.save();
      console.log('Payment verification failed for order:', order.orderNumber);
      return res.status(400).json({ message: 'Payment verification failed' });
    }
  } catch (error) {
    console.error('Error in verifyPayment:', error);
    res.status(500).json({
      message: 'Payment verification failed',
      error: error.message,
      isTestMode: process.env.NODE_ENV === 'test' || process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_')
    });
  }
};