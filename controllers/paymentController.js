const PaymentMethod = require('../models/PaymentMethod');
const mongoose = require('mongoose');

exports.getPayments = async (req, res) => {
  try {
    console.log('Fetching payment methods for user:', req.user._id); // Debug log
    const payments = await PaymentMethod.find({ user: req.user._id });
    res.json(payments);
  } catch (error) {
    console.error('Error in getPayments:', error); // Debug log
    res.status(400).json({ message: error.message });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid payment ID:', id); // Debug log
      return res.status(400).json({ message: 'Invalid payment method ID' });
    }
    console.log('Fetching payment ID:', id); // Debug log
    const payment = await PaymentMethod.findOne({ _id: id, user: req.user._id });
    if (!payment) {
      console.log('Payment not found for ID:', id); // Debug log
      return res.status(404).json({ message: 'Payment method not found' });
    }
    res.json(payment);
  } catch (error) {
    console.error('Error in getPaymentById:', error); // Debug log
    res.status(400).json({ message: error.message });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const { type, cardNumber, expiry, cvv, phone, accountNumber, bankName, isDefault } = req.body;

    // Validate inputs
    if (!type || !['card', 'mobile', 'bank'].includes(type)) {
      console.log('Validation failed: Invalid type', { type }); // Debug log
      return res.status(400).json({ message: 'Invalid payment type' });
    }
    if (type === 'card') {
      if (!cardNumber || !/^\d{16}$/.test(cardNumber)) {
        console.log('Validation failed: Invalid card number', { cardNumber }); // Debug log
        return res.status(400).json({ message: 'Valid 16-digit card number is required' });
      }
      if (!expiry || !/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(expiry)) {
        console.log('Validation failed: Invalid expiry', { expiry }); // Debug log
        return res.status(400).json({ message: 'Valid expiry date (MM/YY) is required' });
      }
      if (!cvv || !/^\d{3,4}$/.test(cvv)) {
        console.log('Validation failed: Invalid CVV', { cvv }); // Debug log
        return res.status(400).json({ message: 'Valid CVV (3-4 digits) is required' });
      }
    } else if (type === 'mobile') {
      if (!phone || !/^\+?[1-9]\d{1,14}$/.test(phone)) {
        console.log('Validation failed: Invalid phone', { phone }); // Debug log
        return res.status(400).json({ message: 'Valid phone number (e.g., +2341234567890) is required' });
      }
    } else if (type === 'bank') {
      if (!accountNumber || !/^\d{10}$/.test(accountNumber)) {
        console.log('Validation failed: Invalid account number', { accountNumber }); // Debug log
        return res.status(400).json({ message: 'Valid 10-digit account number is required' });
      }
      if (!bankName) {
        console.log('Validation failed: Missing bank name', { bankName }); // Debug log
        return res.status(400).json({ message: 'Bank name is required' });
      }
    }
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
      console.log('Invalid user ID:', req.user._id); // Debug log
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    console.log('Adding payment method for user:', req.user._id, req.body); // Debug log
    const payment = new PaymentMethod({
      user: req.user._id,
      type,
      cardNumber: cardNumber?.trim(),
      expiry: expiry?.trim(),
      cvv: cvv?.trim(),
      phone: phone?.trim(),
      accountNumber: accountNumber?.trim(),
      bankName: bankName?.trim(),
      isDefault: !!isDefault,
    });

    // If setting as default, unset other default payment methods
    if (isDefault) {
      console.log('Unsetting other default payment methods for user:', req.user._id); // Debug log
      await PaymentMethod.updateMany(
        { user: req.user._id, isDefault: true },
        { isDefault: false }
      );
    }

    await payment.save();
    console.log('Payment method saved successfully:', payment); // Debug log
    res.status(201).json(payment);
  } catch (error) {
    console.error('Error in addPayment:', error); // Debug log
    res.status(400).json({ message: error.message });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, cardNumber, expiry, cvv, phone, accountNumber, bankName, isDefault } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid payment ID:', id); // Debug log
      return res.status(400).json({ message: 'Invalid payment method ID' });
    }
    if (!type || !['card', 'mobile', 'bank'].includes(type)) {
      console.log('Validation failed: Invalid type', { type }); // Debug log
      return res.status(400).json({ message: 'Invalid payment type' });
    }
    if (type === 'card') {
      if (!cardNumber || !/^\d{16}$/.test(cardNumber)) {
        console.log('Validation failed: Invalid card number', { cardNumber }); // Debug log
        return res.status(400).json({ message: 'Valid 16-digit card number is required' });
      }
      if (!expiry || !/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(expiry)) {
        console.log('Validation failed: Invalid expiry', { expiry }); // Debug log
        return res.status(400).json({ message: 'Valid expiry date (MM/YY) is required' });
      }
      if (!cvv || !/^\d{3,4}$/.test(cvv)) {
        console.log('Validation failed: Invalid CVV', { cvv }); // Debug log
        return res.status(400).json({ message: 'Valid CVV (3-4 digits) is required' });
      }
    } else if (type === 'mobile') {
      if (!phone || !/^\+?[1-9]\d{1,14}$/.test(phone)) {
        console.log('Validation failed: Invalid phone', { phone }); // Debug log
        return res.status(400).json({ message: 'Valid phone number (e.g., +2341234567890) is required' });
      }
    } else if (type === 'bank') {
      if (!accountNumber || !/^\d{10}$/.test(accountNumber)) {
        console.log('Validation failed: Invalid account number', { accountNumber }); // Debug log
        return res.status(400).json({ message: 'Valid 10-digit account number is required' });
      }
      if (!bankName) {
        console.log('Validation failed: Missing bank name', { bankName }); // Debug log
        return res.status(400).json({ message: 'Bank name is required' });
      }
    }

    console.log('Updating payment ID:', id, req.body); // Debug log
    const payment = await PaymentMethod.findOne({ _id: id, user: req.user._id });

    if (!payment) {
      console.log('Payment not found for ID:', id); // Debug log
      return res.status(404).json({ message: 'Payment method not found' });
    }

    payment.type = type;
    payment.cardNumber = type === 'card' ? cardNumber?.trim() : undefined;
    payment.expiry = type === 'card' ? expiry?.trim() : undefined;
    payment.cvv = type === 'card' ? cvv?.trim() : undefined;
    payment.phone = type === 'mobile' ? phone?.trim() : undefined;
    payment.accountNumber = type === 'bank' ? accountNumber?.trim() : undefined;
    payment.bankName = type === 'bank' ? bankName?.trim() : undefined;
    if (isDefault !== undefined) {
      if (isDefault) {
        console.log('Unsetting other default payment methods for user:', req.user._id); // Debug log
        await PaymentMethod.updateMany(
          { user: req.user._id, isDefault: true },
          { isDefault: false }
        );
      }
      payment.isDefault = !!isDefault;
    }

    await payment.save();
    console.log('Payment method updated successfully:', payment); // Debug log
    res.json(payment);
  } catch (error) {
    console.error('Error in updatePayment:', error); // Debug log
    res.status(400).json({ message: error.message });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid payment ID:', id); // Debug log
      return res.status(400).json({ message: 'Invalid payment method ID' });
    }
    console.log('Deleting payment ID:', id); // Debug log
    const payment = await PaymentMethod.findOneAndDelete({ _id: id, user: req.user._id });

    if (!payment) {
      console.log('Payment not found for ID:', id); // Debug log
      return res.status(404).json({ message: 'Payment method not found' });
    }

    console.log('Payment method deleted successfully:', id); // Debug log
    res.json({ message: 'Payment method deleted successfully' });
  } catch (error) {
    console.error('Error in deletePayment:', error); // Debug log
    res.status(400).json({ message: error.message });
  }
};