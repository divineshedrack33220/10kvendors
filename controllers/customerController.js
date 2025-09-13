// controllers/customerController.js
const User = require('../models/User');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const cloudinary = require('../config/cloudinary');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

exports.getAllCustomers = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { search, orderId } = req.query;
    let query = { isAdmin: false };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { _id: mongoose.Types.ObjectId.isValid(search) ? search : null }
      ].filter(Boolean);
    }

    if (orderId) {
      const orders = await Order.find({ orderNumber: { $regex: orderId, $options: 'i' } }).select('user');
      const userIds = orders.map(o => o.user);
      query._id = { $in: userIds };
    }

    const customers = await User.find(query).select('name email phone address createdAt isSuspended');
    res.json(customers);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const customer = await User.findOne({ _id: req.params.id, isAdmin: false })
      .select('name email phone address createdAt isSuspended');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const orders = await Order.find({ user: customer._id });
    res.json({ ...customer.toObject(), orders });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.suspendCustomer = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const { suspended } = req.body;
    const customer = await User.findOneAndUpdate(
      { _id: req.params.id, isAdmin: false },
      { isSuspended: suspended },
      { new: true }
    );
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getInactiveCustomers = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = await Order.distinct('user', { createdAt: { $gte: thirtyDaysAgo } });
    const inactiveCustomers = await User.find({
      isAdmin: false,
      _id: { $nin: activeUsers }
    }).select('name email createdAt');
    res.json(inactiveCustomers);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getMostOrderedItems = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const mostOrdered = await Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.product', totalQuantity: { $sum: '$items.quantity' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);
    res.json(mostOrdered);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.exportCustomers = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { search, orderId } = req.query;
    let query = { isAdmin: false };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { _id: mongoose.Types.ObjectId.isValid(search) ? search : null }
      ].filter(Boolean);
    }

    if (orderId) {
      const orders = await Order.find({ orderNumber: { $regex: orderId, $options: 'i' } }).select('user');
      const userIds = orders.map(o => o.user);
      query._id = { $in: userIds };
    }

    const customers = await User.find(query).select('name email phone address createdAt isSuspended');

    // Simple CSV generation without external libs
    let csv = 'Name,Email,Phone,Address,CreatedAt,Suspended\n';
    customers.forEach(c => {
      csv += `${c.name},${c.email},${c.phone || ''},${c.address || ''},${c.createdAt},${c.isSuspended}\n`;
    });

    const filePath = path.join(__dirname, '../temp/customers.csv');
    fs.writeFileSync(filePath, csv);

    res.download(filePath, 'customers.csv', (err) => {
      if (err) console.error(err);
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.sendBroadcast = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const { message, filterType, image } = req.body; // image is base64 or url, but assume upload

    let users;
    if (filterType === 'inactive') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const activeUsers = await Order.distinct('user', { createdAt: { $gte: thirtyDaysAgo } });
      users = await User.find({ isAdmin: false, _id: { $nin: activeUsers } });
    } else {
      users = await User.find({ isAdmin: false });
    }

    let imageUrl = null;
    if (req.files && req.files.image) {
      const result = await cloudinary.uploader.upload(req.files.image.path);
      imageUrl = result.secure_url;
    }

    const notifications = await Promise.all(
      users.map(user =>
        Notification.create({ userId: user._id, message, type: 'broadcast', imageUrl })
      )
    );

    res.status(201).json({ message: 'Broadcast sent', notifications });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};