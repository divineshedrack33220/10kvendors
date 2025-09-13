const express = require('express');
const router = express.Router();
const { getPayments, getPaymentById, addPayment, updatePayment, deletePayment } = require('../controllers/paymentController');
const auth = require('../middleware/auth');

router.post('/', auth, addPayment);
router.get('/', auth, getPayments);
router.get('/:id', auth, getPaymentById);
router.put('/:id', auth, updatePayment);
router.delete('/:id', auth, deletePayment);

module.exports = router;