const asyncHandler = require('express-async-handler');
const Ad = require('../models/Ad');

// @desc    Get ad metrics and chart data
// @route   GET /api/ads?period=<7d|30d|90d>
// @access  Private (Admin only)
const getAds = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Admin access required');
  }

  const { period } = req.query;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const ads = await Ad.find({
      createdAt: { $gte: startDate },
    }).lean();
    res.json(ads);
  } catch (error) {
    res.status(500);
    throw new Error('Failed to fetch ad data');
  }
});

// @desc    Get recent ad campaigns
// @route   GET /api/ads/campaigns?page=<page>&limit=<limit>&count=<true>
// @access  Private (Admin only)
const getAdCampaigns = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Admin access required');
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const count = req.query.count === 'true';

  try {
    if (count) {
      const total = await Ad.countDocuments();
      return res.json({ count: total });
    }

    const campaigns = await Ad.find()
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();
    res.json(campaigns);
  } catch (error) {
    res.status(500);
    throw new Error('Failed to fetch ad campaigns');
  }
});

module.exports = { getAds, getAdCampaigns };