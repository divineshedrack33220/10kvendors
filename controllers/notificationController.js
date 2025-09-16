const Notification = require('../models/Notification');
const User = require('../models/User');

exports.createNotification = async (userId, message, type = 'order') => {
  try {
    const notification = new Notification({ userId, message, type });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw new Error('Failed to create notification');
  }
};

exports.createAdvertisementNotification = async (req, res) => {
  try {
    const { message } = req.body;
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const users = await User.find({});
    const notifications = await Promise.all(
      users.map(user =>
        Notification.create({ userId: user._id, message, type: 'advertisement' })
      )
    );

    res.status(201).json({ message: 'Advertisement notification sent', notifications });
  } catch (error) {
    res.status(400).json({ message: 'Failed to send advertisement notification', error: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    res.json(notifications);
  } catch (error) {
    res.status(400).json({ message: 'Failed to fetch notifications', error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (error) {
    res.status(400).json({ message: 'Failed to mark notification as read', error: error.message });
  }
};