const express = require('express');
const router = express.Router();
const { getCheckoutData, createOrder, verifyPayment } = require('../controllers/checkoutController');
const auth = require('../middleware/auth');

router.get('/', auth, getCheckoutData);
router.post('/order', auth, createOrder);
router.post('/verify-payment', auth, verifyPayment); // New endpoint for Paystack verification

module.exports = router;