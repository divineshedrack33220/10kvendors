require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const webPush = require('web-push');
const mongoose = require('mongoose');
const VisitorLocation = require('./models/VisitorLocation');
const Order = require('./models/Order');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');

const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const chatRoutes = require('./routes/chatRoutes');
const publicRoutes = require('./routes/publicRoutes');
const cartRoutes = require('./routes/cartRoutes');
const authRoutes = require('./routes/authRoutes');
const addressRoutes = require('./routes/addressRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const adRoutes = require('./routes/adRoutes');
const locationRoutes = require('./routes/locationRoutes');
const customerRoutes = require('./routes/customerRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'https://one0kvendor.onrender.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

app.set('io', io);

const log = (...args) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};

webPush.setVapidDetails(
  'mailto:divineshedrack1@gmail.com ',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscription: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now }
});
const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);

app.use(cors({
  origin: ['http://localhost:3000', 'https://one0kvendor.onrender.com'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin/static', express.static(path.join(__dirname, 'admin/static')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDB();

io.on('connection', (socket) => {
  log('WebSocket client connected:', socket.id);

  socket.on('joinAdmin', async (token) => {
    try {
      const decoded = require('jsonwebtoken').verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
      const User = require('./models/User');
      const user = await User.findById(decoded.id);
      if (user && user.isAdmin) {
        socket.join('adminRoom');
        log(`Admin ${user.name} joined adminRoom`);
      } else {
        socket.disconnect();
        log('Unauthorized admin socket disconnected');
      }
    } catch (error) {
      log('Error in joinAdmin:', error.message);
      socket.disconnect();
    }
  });

  socket.on('joinUser', async ({ token }) => {
    try {
      const decoded = require('jsonwebtoken').verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
      const User = require('./models/User');
      const user = await User.findById(decoded.id);
      if (user) {
        socket.join(`user_${user._id}`);
        log(`User ${user.name} joined user_${user._id}`);
      } else {
        socket.disconnect();
        log('Unauthorized user socket disconnected');
      }
    } catch (error) {
      log('Error in joinUser:', error.message);
      socket.disconnect();
    }
  });

  socket.on('categoryUpdate', () => {
    io.to('adminRoom').emit('categoryUpdate');
  });

  socket.on('productUpdate', () => {
    io.to('adminRoom').emit('productUpdate');
  });

  socket.on('orderStatusUpdate', async (order) => {
    try {
      if (!order || typeof order !== 'object' || !order._id) {
        log('Invalid order received in orderStatusUpdate event:', order);
        return;
      }

      let populatedOrder = order;
      if (!order.user || !order.user._id) {
        log('Order missing user field, fetching from DB:', order._id);
        populatedOrder = await Order.findById(order._id).populate('user');
        if (!populatedOrder) {
          log('Order not found in DB:', order._id);
          return;
        }
      }

      io.to('adminRoom').emit('orderStatusUpdate', populatedOrder);

      if (populatedOrder.user && populatedOrder.user._id) {
        io.to(`user_${populatedOrder.user._id}`).emit('orderStatusUpdate', populatedOrder);

        const subscriptions = await PushSubscription.find({ userId: populatedOrder.user._id });
        const payload = JSON.stringify({
          title: '10kVendor Order Update',
          body: `Order #${populatedOrder.orderNumber} is now ${populatedOrder.status}`,
          url: '/orders.html'
        });

        for (const { subscription } of subscriptions) {
          try {
            await webPush.sendNotification(subscription, payload);
            log(`Push notification sent to user ${populatedOrder.user._id}`);
          } catch (error) {
            log(`Failed to send push notification to user ${populatedOrder.user._id}: ${error.message}`);
            await PushSubscription.deleteOne({ subscription });
          }
        }
      } else {
        log('No valid user ID for orderStatusUpdate:', populatedOrder);
      }
    } catch (error) {
      log('Error in orderStatusUpdate event:', error.message);
    }
  });

  socket.on('disconnect', () => {
    log('Client disconnected:', socket.id);
  });
});

app.use(async (req, res, next) => {
  if (req.originalUrl.startsWith('/api/locations')) return next();
  next();
  try {
    const visitor = await VisitorLocation.findOne().sort({ timestamp: -1 }).lean();
    if (visitor) {
      io.to('adminRoom').emit('newVisitor', visitor);
    }
  } catch (error) {
    log('Error fetching visitor location:', error.message);
  }
});

app.post('/api/push/subscribe', auth, express.json(), async (req, res) => {
  try {
    const subscription = req.body;
    const userId = req.user.id;
    if (!subscription) {
      return res.status(400).json({ error: 'Subscription data is required' });
    }

    await PushSubscription.updateOne(
      { userId },
      { $set: { subscription, createdAt: new Date() } },
      { upsert: true }
    );
    log(`Push subscription saved for user ${userId}`);
    res.status(201).json({ message: 'Subscription saved' });
  } catch (error) {
    log('Error saving push subscription:', error.message);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

app.post('/api/push/send', auth, express.json(), async (req, res) => {
  try {
    const { title, body, url, userId } = req.body;
    const payload = JSON.stringify({ title, body, url });

    const query = userId ? { userId } : {};
    const subscriptions = await PushSubscription.find(query);

    if (subscriptions.length === 0) {
      return res.status(404).json({ error: 'No subscriptions found' });
    }

    await Promise.all(
      subscriptions.map(async ({ subscription }) => {
        try {
          await webPush.sendNotification(subscription, payload);
          log(`Push notification sent to subscription`);
        } catch (error) {
          log(`Failed to send push notification: ${error.message}`);
          await PushSubscription.deleteOne({ subscription });
        }
      })
    );

    log(`Sent push notifications to ${subscriptions.length} users`);
    res.status(200).json({ message: 'Notifications sent' });
  } catch (error) {
    log('Error sending push notifications:', error.message);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/carts', cartRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/customers', customerRoutes);

app.use((req, res, next) => {
  log(`404: Route not found for ${req.method} ${req.originalUrl}`);
  res.status(404).send('Route not found');
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => log(`✅ Server running on port ${PORT}`));

