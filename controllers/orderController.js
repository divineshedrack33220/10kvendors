const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Address = require('../models/Address');
const { Parser } = require('json2csv');
const { createNotification } = require('./notificationController');

exports.createOrder = async (req, res) => {
  try {
    const { items, deliveryAddress, paymentMethod, orderNotes } = req.body;
    const user = req.user;

    const validPaymentMethods = ['Pay on Delivery', 'Card Payment', 'Bank Transfer', 'Paystack'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      console.log('Validation failed: Invalid payment method:', paymentMethod);
      return res.status(400).json({ message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}` });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('Validation failed: Items array is required and must not be empty');
      return res.status(400).json({ message: 'Items array is required and must not be empty' });
    }
    for (const item of items) {
      if (!item.product || !mongoose.isValidObjectId(item.product) || item.quantity < 1 || item.price < 0) {
        console.log('Validation failed: Invalid item:', item);
        return res.status(400).json({ message: 'Each item must have a valid product ID, quantity (>= 1), and price (>= 0)' });
      }
    }

    const productIds = items.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== productIds.length) {
      console.log('Validation failed: One or more products not found:', productIds);
      return res.status(400).json({ message: 'One or more products not found' });
    }
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.product.toString());
      if (!product || product.stock < item.quantity) {
        console.log('Validation failed: Insufficient stock for product:', product?.name || item.product);
        return res.status(400).json({ message: `Insufficient stock for product: ${product?.name || 'Unknown'}` });
      }
    }

    if (!mongoose.isValidObjectId(deliveryAddress)) {
      console.log('Validation failed: Invalid deliveryAddress ID:', deliveryAddress);
      return res.status(400).json({ message: 'Invalid delivery address: must be a valid ObjectId' });
    }
    const address = await Address.findById(deliveryAddress);
    if (!address) {
      console.log('Validation failed: Delivery address not found:', deliveryAddress);
      return res.status(404).json({ message: 'Delivery address not found' });
    }
    if (address.user.toString() !== user._id.toString()) {
      console.log('Validation failed: Delivery address does not belong to user:', user._id);
      return res.status(403).json({ message: 'Delivery address does not belong to the user' });
    }
    if (!address.state || !address.country) {
      console.log('Validation failed: Delivery address missing state or country:', address);
      return res.status(400).json({ message: 'Delivery address is invalid (missing state or country)' });
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryFee = 5000;
    const total = subtotal + deliveryFee;

    const order = new Order({
      user: user._id,
      addressId: deliveryAddress,
      items: items.map(item => ({
        product: item.product,
        quantity: item.quantity,
        price: item.price
      })),
      subtotal,
      deliveryFee,
      total,
      paymentMethod,
      orderNotes: orderNotes ? orderNotes.trim() : '',
      tracking: [{ status: paymentMethod === 'Pay on Delivery' ? 'Pending' : 'Awaiting Payment' }],
      paymentStatus: paymentMethod === 'Pay on Delivery' ? 'pending' : 'awaiting_payment',
      orderNumber: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    });

    for (const item of items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
    }

    await order.save();

    try {
      console.log('Attempting to clear cart for user:', user._id);
      const cart = await Cart.findOne({ user: user._id });
      if (!cart) {
        console.warn('No cart found for user:', user._id);
      } else {
        cart.items = [];
        await cart.save();
        console.log('Cart cleared successfully for user:', user._id, 'Cart ID:', cart._id);
        const clearedCart = await Cart.findOne({ user: user._id });
        if (clearedCart && clearedCart.items.length > 0) {
          console.error('Cart not cleared properly:', clearedCart.items);
          throw new Error('Cart items not cleared in database');
        }
      }
    } catch (cartError) {
      console.error('Error clearing cart for user:', user._id, 'Error:', cartError.message);
      req.app.get('io').to('adminRoom').emit('systemAlert', {
        message: `Failed to clear cart for user ${user._id} after order ${order.orderNumber}`,
        error: cartError.message
      });
    }

    const populatedOrder = await Order.findById(order._id).populate('user').populate('addressId');
    if (!populatedOrder) {
      console.error('Failed to populate order:', order._id);
      throw new Error('Failed to populate order');
    }

    req.app.get('io').to('adminRoom').emit('newOrder', {
      _id: populatedOrder._id,
      orderNumber: populatedOrder.orderNumber,
      user: populatedOrder.user ? { name: populatedOrder.user.name, phone: populatedOrder.user.phone || 'N/A' } : { name: 'Unknown', phone: 'N/A' },
      total: populatedOrder.total,
      status: populatedOrder.status,
      createdAt: populatedOrder.createdAt,
      address: populatedOrder.addressId ? `${populatedOrder.addressId.street}, ${populatedOrder.addressId.city}, ${populatedOrder.addressId.state}, ${populatedOrder.addressId.country}` : 'N/A',
    });

    if (populatedOrder.user && populatedOrder.user._id) {
      req.app.get('io').to(`user_${populatedOrder.user._id}`).emit('orderStatusUpdate', populatedOrder);
    }

    await createNotification(
      user._id,
      `Your order #${populatedOrder.orderNumber} has been placed successfully!`,
      'order'
    );

    console.log('Order created successfully:', populatedOrder);
    res.status(201).json(populatedOrder);
  } catch (error) {
    console.error('Error in createOrder:', error.message, error.stack);
    res.status(400).json({ message: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, count, period, orderNumber } = req.query;
    const query = req.user.isAdmin ? {} : { user: req.user._id };
    if (status) query.status = status;
    if (orderNumber) query.orderNumber = { $regex: orderNumber, $options: 'i' };
    if (period) {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      query.createdAt = { $gte: startDate };
    }

    if (count) {
      const totalOrders = await Order.countDocuments(query);
      return res.json({ count: totalOrders });
    }

    const orders = await Order.find(query)
      .populate('items.product user addressId')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error in getOrders:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product user addressId');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!req.user.isAdmin && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error in getOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { status } = req.body;
    const orderId = req.params.id;

    const validStatuses = ['Placed', 'Packed', 'In Transit', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      console.log(`Validation failed: Invalid status "${status}" for order ${orderId}`);
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findById(orderId).populate('user addressId');
    if (!order) {
      console.log(`Order not found: ${orderId}`);
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!order.subtotal) {
      console.warn(`Order ${orderId} missing subtotal, recalculating`);
      order.subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }
    if (!order.total) {
      console.warn(`Order ${orderId} missing total, recalculating`);
      order.total = order.subtotal + (order.deliveryFee || 5000);
    }
    if (!order.addressId || !mongoose.isValidObjectId(order.addressId)) {
      console.warn(`Order ${orderId} missing valid addressId`);
      const userAddress = await Address.findOne({ user: order.user._id });
      if (!userAddress) {
        console.error(`No valid address found for user ${order.user._id} on order ${orderId}`);
        return res.status(400).json({ message: 'Cannot update order: no valid address found for user' });
      }
      order.addressId = userAddress._id;
    }

    order.status = status;
    if (order.tracking[order.tracking.length - 1]?.status !== status) {
      order.tracking.push({ status, date: new Date() });
    }
    if (status === 'Delivered') order.deliveredAt = new Date();

    await order.save();
    console.log(`Order ${order.orderNumber} status updated to ${status}`);

    if (status === 'Packed') {
      await createNotification(
        order.user._id,
        `Your order #${order.orderNumber} is ready for delivery or pickup!`,
        'order'
      );
      console.log(`Notification sent for Packed status on order ${order.orderNumber}`);
    }

    const populatedOrder = await Order.findById(order._id).populate('user addressId');
    req.app.get('io').to('adminRoom').emit('orderStatusUpdate', populatedOrder);
    if (populatedOrder.user && populatedOrder.user._id) {
      req.app.get('io').to(`user_${populatedOrder.user._id}`).emit('orderStatusUpdate', populatedOrder);
      console.log(`Emitted orderStatusUpdate for user_${populatedOrder.user._id} on order ${order.orderNumber}`);
    } else {
      console.warn(`No valid user ID for orderStatusUpdate on order ${order.orderNumber}`);
    }

    res.json(populatedOrder);
  } catch (error) {
    console.error('Error in updateOrderStatus:', error.message, error.stack);
    res.status(400).json({ message: error.message });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    req.app.get('io').to('adminRoom').emit('orderStatusUpdate', order);
    res.json({ message: 'Order deleted' });
  } catch (error) {
    console.error('Error in deleteOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getMetrics = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { period, status } = req.query;
    const dateFilter = {};
    if (period) {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      dateFilter.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }
    if (status) dateFilter.status = status;

    const totalOrders = await Order.countDocuments(dateFilter);
    const completedOrders = await Order.countDocuments({ ...dateFilter, status: 'Delivered' });
    const pendingOrders = await Order.countDocuments({ ...dateFilter, status: { $in: ['Placed', 'Packed', 'In Transit'] } });
    const cancelledOrders = await Order.countDocuments({ ...dateFilter, status: 'Cancelled' });
    const avgOrderValue = await Order.aggregate([
      { $match: { ...dateFilter, status: 'Delivered' } },
      { $group: { _id: null, avg: { $avg: '$total' } } },
      { $project: { _id: 0, avg: 1 } }
    ]).then(results => results[0]?.avg || 0);
    const totalRevenue = await Order.aggregate([
      { $match: { ...dateFilter, status: 'Delivered' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
      { $project: { _id: 0, total: 1 } }
    ]).then(results => results[0]?.total || 0);
    const netRevenue = totalRevenue * 0.9;
    const gmv = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, total: { $sum: '$total' } } },
      { $project: { _id: 0, total: 1 } }
    ]).then(results => results[0]?.total || 0);
    const conversionRate = Number(((completedOrders / (totalOrders || 1)) * 100).toFixed(2));
    const customerCounts = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$user', orderCount: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          newCustomers: { $sum: { $cond: [{ $eq: ['$orderCount', 1] }, 1, 0] } },
          returningCustomers: { $sum: { $cond: [{ $gt: ['$orderCount', 1] }, 1, 0] } }
        }
      }
    ]).then(results => results[0] || { newCustomers: 0, returningCustomers: 0 });
    const clv = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $group: { _id: '$user', totalSpent: { $sum: '$total' } } },
      { $group: { _id: null, avg: { $avg: '$totalSpent' } } },
      { $project: { _id: 0, avg: 1 } }
    ]).then(results => results[0]?.avg || 0);
    const cac = 5000;
    const retentionRate = Number(((customerCounts.returningCustomers / (customerCounts.newCustomers + customerCounts.returningCustomers || 1)) * 100).toFixed(2));
    const bestSellingProducts = await Order.aggregate([
      { $match: dateFilter },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', unitsSold: { $sum: '$items.quantity' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $sort: { unitsSold: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: '$product.name', unitsSold: 1 } }
    ]);
    const lowSellingProducts = await Order.aggregate([
      { $match: dateFilter },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', unitsSold: { $sum: '$items.quantity' } } },
      { $sort: { unitsSold: 1 } },
      { $limit: 5 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { _id: 0, name: '$product.name', unitsSold: 1 } }
    ]);
    const returnRate = Number(((await Order.countDocuments({ ...dateFilter, status: 'Cancelled' })) / (totalOrders || 1) * 100).toFixed(2));
    const inventoryTurnover = 4;
    const failedPayments = await Order.countDocuments({ ...dateFilter, paymentStatus: 'failed' });
    const refundAmounts = await Order.aggregate([
      { $match: { ...dateFilter, status: 'Cancelled' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
      { $project: { _id: 0, total: 1 } }
    ]).then(results => results[0]?.total || 0);
    const chargebackRate = 0.5;
    const ordersByDay = await Order.countDocuments({
      ...dateFilter,
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    const ordersByWeek = await Order.countDocuments({
      ...dateFilter,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    const ordersByMonth = await Order.countDocuments({
      ...dateFilter,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    const peakSalesHours = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]).then(results => results[0]?._id || 'N/A');
    const avgProcessingTime = await Order.aggregate([
      { $match: { ...dateFilter, status: 'Delivered' } },
      {
        $project: {
          processingTime: {
            $divide: [{ $subtract: ['$deliveredAt', '$createdAt'] }, 1000 * 60 * 60]
          }
        }
      },
      { $group: { _id: null, avg: { $avg: '$processingTime' } } },
      { $project: { _id: 0, avg: 1 } }
    ]).then(results => results[0]?.avg || 0);

    res.json({
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      avgOrderValue,
      totalRevenue,
      netRevenue,
      gmv,
      conversionRate,
      newCustomers: customerCounts.newCustomers,
      returningCustomers: customerCounts.returningCustomers,
      clv,
      cac,
      retentionRate,
      bestSellingProducts,
      lowSellingProducts,
      returnRate,
      inventoryTurnover,
      failedPayments,
      refundAmounts,
      chargebackRate,
      ordersByDay,
      ordersByWeek,
      ordersByMonth,
      peakSalesHours,
      avgProcessingTime
    });
  } catch (error) {
    console.error('Error in getMetrics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getCharts = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { period, status } = req.query;
    const dateFilter = {};
    if (period) {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      dateFilter.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }
    if (status) dateFilter.status = status;

    const statusCounts = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } }
    ]).then(results => {
      const statuses = { Placed: 0, Packed: 0, 'In Transit': 0, Delivered: 0, Cancelled: 0 };
      results.forEach(r => (statuses[r.status] = r.count));
      return statuses;
    });

    const salesOverTime = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$total' } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', total: 1 } }
    ]).then(results => ({
      labels: results.map(r => r.date),
      data: results.map(r => r.total)
    }));

    const bestSellingProducts = await Order.aggregate([
      { $match: dateFilter },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', unitsSold: { $sum: '$items.quantity' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $sort: { unitsSold: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: '$product.name', unitsSold: 1 } }
    ]);

    const paymentMethods = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
      { $project: { _id: 0, method: '$_id', count: 1 } }
    ]);

    const customerCounts = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$user', orderCount: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          newCustomers: { $sum: { $cond: [{ $eq: ['$orderCount', 1] }, 1, 0] } },
          returningCustomers: { $sum: { $cond: [{ $gt: ['$orderCount', 1] }, 1, 0] } }
        }
      }
    ]).then(results => results[0] || { newCustomers: 0, returningCustomers: 0 });

    const statusByPeriod = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', ['Placed', 'Packed', 'In Transit']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', completed: 1, pending: 1, cancelled: 1 } }
    ]).then(results => ({
      labels: results.map(r => r.date),
      completed: results.map(r => r.completed),
      pending: results.map(r => r.pending),
      cancelled: results.map(r => r.cancelled)
    }));

    const peakTimes = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, hour: '$_id', count: 1 } }
    ]);

    const cumulativeRevenue = await Order.aggregate([
      { $match: { ...dateFilter, status: 'Delivered' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$total' }
        }
      },
      { $sort: { _id: 1 } },
      {
        $group: {
          _id: null,
          data: { $push: { date: '$_id', total: '$total' } }
        }
      },
      {
        $project: {
          _id: 0,
          labels: '$data.date',
          data: {
            $reduce: {
              input: '$data',
              initialValue: { sum: 0, result: [] },
              in: {
                sum: { $add: ['$$this.total', '$$value.sum'] },
                result: { $concatArrays: ['$$value.result', [{ $add: ['$$this.total', '$$value.sum'] }]] }
              }
            }
          }
        }
      },
      { $project: { labels: 1, data: '$data.result' } }
    ]).then(results => results[0] || { labels: [], data: [] });

    const funnel = {
      visitors: 1000,
      addToCart: await Order.countDocuments({ ...dateFilter, 'items.0': { $exists: true } }),
      checkout: await Order.countDocuments({ ...dateFilter, status: { $in: ['Placed', 'Packed', 'In Transit', 'Delivered'] } }),
      successfulPayment: await Order.countDocuments({ ...dateFilter, status: 'Delivered' })
    };

    const geoData = await Order.aggregate([
      { $match: dateFilter },
      { $lookup: { from: 'addresses', localField: 'addressId', foreignField: '_id', as: 'address' } },
      { $unwind: '$address' },
      { $group: { _id: '$address.city', count: { $sum: 1 } } },
      { $project: { _id: 0, location: '$_id', count: 1 } }
    ]);

    res.json({
      statusCounts,
      salesOverTime,
      bestSellingProducts,
      paymentMethods,
      newCustomers: customerCounts.newCustomers,
      returningCustomers: customerCounts.returningCustomers,
      statusByPeriod,
      peakTimes,
      cumulativeRevenue,
      funnel,
      geoData
    });
  } catch (error) {
    console.error('Error in getCharts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.exportOrders = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('user', 'name email')
      .populate('addressId')
      .lean();
    const fields = [
      { label: 'Order Number', value: 'orderNumber' },
      { label: 'Customer Name', value: 'user.name' },
      { label: 'Customer Email', value: 'user.email' },
      { label: 'Address', value: row => row.addressId ? `${row.addressId.street}, ${row.addressId.city}` : 'N/A' },
      { label: 'Total', value: 'total' },
      { label: 'Status', value: 'status' },
      { label: 'Date', value: 'createdAt' },
    ];
    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(orders.map(order => ({
      ...order,
      createdAt: new Date(order.createdAt).toLocaleDateString(),
    })));

    res.header('Content-Type', 'text/csv');
    res.attachment('orders_data.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error in exportOrders:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.trackOrder = async (req, res) => {
  try {
    const { orderNumber } = req.query;
    const order = await Order.findOne({ orderNumber }).populate('items.product user addressId');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!req.user.isAdmin && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error in trackOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.exportCharts = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { type, status } = req.query;
    const query = status ? { status } : {};

    let data, fields, filename;
    switch (type) {
      case 'status':
        data = await Order.aggregate([
          { $match: query },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $project: { _id: 0, Status: '$_id', Count: '$count' } }
        ]);
        fields = ['Status', 'Count'];
        filename = 'status_counts.csv';
        break;
      case 'products':
        data = await Order.aggregate([
          { $match: query },
          { $unwind: '$items' },
          { $group: { _id: '$items.product', unitsSold: { $sum: '$items.quantity' } } },
          { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
          { $unwind: '$product' },
          { $project: { _id: 0, Product: '$product.name', UnitsSold: '$unitsSold' } }
        ]);
        fields = ['Product', 'UnitsSold'];
        filename = 'products.csv';
        break;
      case 'payment':
        data = await Order.aggregate([
          { $match: query },
          { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
          { $project: { _id: 0, Method: '$_id', Count: '$count' } }
        ]);
        fields = ['Method', 'Count'];
        filename = 'payment_methods.csv';
        break;
      case 'customers':
        data = await Order.aggregate([
          { $match: query },
          { $group: { _id: '$user', orderCount: { $sum: 1 } } },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
          { $unwind: '$user' },
          { $project: { _id: 0, Customer: '$user.name', Orders: '$orderCount' } }
        ]);
        fields = ['Customer', 'Orders'];
        filename = 'customers.csv';
        break;
      case 'statusComparison':
        data = await Order.aggregate([
          { $match: query },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              Completed: { $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] } },
              Pending: { $sum: { $cond: [{ $in: ['$status', ['Placed', 'Packed', 'In Transit']] }, 1, 0] } },
              Cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } }
            }
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, Date: '$_id', Completed: 1, Pending: 1, Cancelled: 1 } }
        ]);
        fields = ['Date', 'Completed', 'Pending', 'Cancelled'];
        filename = 'status_comparison.csv';
        break;
      case 'peakTimes':
        data = await Order.aggregate([
          { $match: query },
          { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, Hour: '$_id', Count: '$count' } }
        ]);
        fields = ['Hour', 'Count'];
        filename = 'peak_times.csv';
        break;
      case 'cumulativeRevenue':
        data = await Order.aggregate([
          { $match: { ...query, status: 'Delivered' } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d',            date: '$createdAt' } },
            total: { $sum: '$total' }
          }
        },
        { $sort: { _id: 1 } },
        {
          $group: {
            _id: null,
            data: { $push: { date: '$_id', total: '$total' } }
          }
        },
        {
          $project: {
            _id: 0,
            data: {
              $reduce: {
                input: '$data',
                initialValue: { sum: 0, result: [] },
                in: {
                  sum: { $add: ['$$this.total', '$$value.sum'] },
                  result: { $concatArrays: ['$$value.result', [{ date: '$$this.date', total: { $add: ['$$this.total', '$$value.sum'] } }]] }
                }
              }
            }
          }
        },
        { $unwind: '$data' },
        { $project: { _id: 0, Date: '$data.date', Total: '$data.total' } }
      ]);
      fields = ['Date', 'Total'];
      filename = 'cumulative_revenue.csv';
      break;
    case 'funnel':
      const funnel = {
        Visitors: 1000,
        AddToCart: await Order.countDocuments({ ...query, 'items.0': { $exists: true } }),
        Checkout: await Order.countDocuments({ ...query, status: { $in: ['Placed', 'Packed', 'In Transit', 'Delivered'] } }),
        SuccessfulPayment: await Order.countDocuments({ ...query, status: 'Delivered' })
      };
      data = Object.entries(funnel).map(([stage, count]) => ({ Stage: stage, Count: count }));
      fields = ['Stage', 'Count'];
      filename = 'funnel.csv';
      break;
    case 'geo':
      data = await Order.aggregate([
        { $match: query },
        { $lookup: { from: 'addresses', localField: 'addressId', foreignField: '_id', as: 'address' } },
        { $unwind: '$address' },
        { $group: { _id: '$address.city', count: { $sum: 1 } } },
        { $project: { _id: 0, Location: '$_id', Count: '$count' } }
      ]);
      fields = ['Location', 'Count'];
      filename = 'geo_data.csv';
      break;
    default:
      return res.status(400).json({ message: 'Invalid export type' });
  }

  const json2csv = new Parser({ fields });
  const csv = json2csv.parse(data);
  res.header('Content-Type', 'text/csv');
  res.attachment(filename);
  res.send(csv);
} catch (error) {
  console.error('Error in exportCharts:', error);
  res.status(400).json({ message: error.message });
}
};