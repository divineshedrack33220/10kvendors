require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const webPush = require('web-push'); // Added for push notifications
const VisitorLocation = require('./models/VisitorLocation');
const Order = require('./models/Order');

// Connect DB
const connectDB = require('./config/db');

// Middleware
const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');

// Routes
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
    origin: ['http://localhost:3000', 'http://localhost:5000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

// Attach io to app for use in controllers
app.set('io', io);

// Simple logger toggle (disable logs in production)
const log = (...args) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};

// Configure VAPID keys for push notifications
webPush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Store push subscriptions (in-memory; use MongoDB in production)
let pushSubscriptions = [];

// Global Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin/static', express.static(path.join(__dirname, 'admin/static')));

// Fallback for root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Connect to MongoDB
connectDB();

// WebSocket for real-time updates
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

// Notify admins of new visitor
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

// Push notification routes
app.post('/api/push/subscribe', auth, express.json(), async (req, res) => {
  try {
    const subscription = req.body;
    const userId = req.user.id; // From auth middleware
    pushSubscriptions.push({ userId, subscription });
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

    // Filter subscriptions by userId if provided, else send to all
    const targetSubscriptions = userId
      ? pushSubscriptions.filter(sub => sub.userId === userId)
      : pushSubscriptions;

    if (targetSubscriptions.length === 0) {
      return res.status(404).json({ error: 'No subscriptions found' });
    }

    await Promise.all(
      targetSubscriptions.map(({ subscription }) =>
        webPush.sendNotification(subscription, payload).catch(error => {
          log(`Failed to send push notification: ${error.message}`);
          // Remove invalid subscription
          pushSubscriptions = pushSubscriptions.filter(
            sub => sub.subscription !== subscription
          );
        })
      )
    );

    log(`Sent push notifications to ${targetSubscriptions.length} users`);
    res.status(200).json({ message: 'Notifications sent' });
  } catch (error) {
    log('Error sending push notifications:', error.message);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

// API Routes
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

// Debug 404 routes
app.use((req, res, next) => {
  log(`404: Route not found for ${req.method} ${req.originalUrl}`);
  res.status(404).send('Route not found');
});

app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => log(`✅ Server running on port ${PORT}`));