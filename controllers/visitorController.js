const asyncHandler = require('express-async-handler');
const Visitor = require('../models/Visitor');

// @desc    Get visitor trends
// @route   GET /api/visitors?period=<7d|30d|90d>
// @access  Private (Admin only)
const getVisitors = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Admin access required');
  }

  const { period } = req.query;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const visitors = await Visitor.find({
      createdAt: { $gte: startDate },
    }).lean();
    res.json(visitors);
  } catch (error) {
    res.status(500);
    throw new Error('Failed to fetch visitor data');
  }
});

// @desc    Get recent visitor activity
// @route   GET /api/visitors/activity?page=<page>&limit=<limit>&count=<true>
// @access  Private (Admin only)
const getVisitorActivity = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Admin access required');
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const count = req.query.count === 'true';

  try {
    if (count) {
      const total = await Visitor.countDocuments();
      return res.json({ count: total });
    }

    const activities = await Visitor.find()
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();
    res.json(activities);
  } catch (error) {
    res.status(500);
    throw new Error('Failed to fetch visitor activity');
  }
});

module.exports = { getVisitors, getVisitorActivity };