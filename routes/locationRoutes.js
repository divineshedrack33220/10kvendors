// routes/locationRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const VisitorLocation = require('../models/VisitorLocation');
const { Parser } = require('json2csv');

// Get referral and location analytics (admin-only)
router.get('/', auth, async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Admin access required');
  }
  try {
    const period = req.query.period || '30d';
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Apply filters if provided
    const filter = { timestamp: { $gte: startDate } };
    if (req.query.country) filter.country = req.query.country;
    if (req.query.region) filter.region = req.query.region;

    // Aggregate by referer
    const refererStats = await VisitorLocation.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$referer',
          count: { $sum: 1 },
          locations: { $addToSet: { country: '$country', region: '$region', city: '$city' } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Aggregate by location
    const locationStats = await VisitorLocation.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { country: '$country', region: '$region', city: '$city', latitude: '$latitude', longitude: '$longitude' },
          count: { $sum: 1 },
          referers: { $addToSet: '$referer' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      referers: refererStats.map(r => ({
        referer: r._id,
        visits: r.count,
        locations: r.locations,
      })),
      locations: locationStats.map(l => ({
        country: l._id.country,
        region: l._id.region,
        city: l._id.city,
        latitude: l._id.latitude,
        longitude: l._id.longitude,
        visits: l.count,
        referers: l.referers,
      })),
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get paginated visitor details
router.get('/details', auth, async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Admin access required');
  }
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;
  const filter = {};
  if (req.query.country) filter.country = req.query.country;
  if (req.query.region) filter.region = req.query.region;

  try {
    const visitors = await VisitorLocation.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .select('referer page country region city timestamp');
    const total = await VisitorLocation.countDocuments(filter);
    res.json({ visitors, total });
  } catch (error) {
    console.error('Error fetching visitor details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Export visitor data as CSV
router.get('/export', auth, async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Admin access required');
  }
  try {
    const filter = {};
    if (req.query.country) filter.country = req.query.country;
    if (req.query.region) filter.region = req.query.region;

    const visitors = await VisitorLocation.find(filter)
      .select('referer page country region city timestamp')
      .lean();
    const fields = ['referer', 'page', 'country', 'region', 'city', 'timestamp'];
    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(visitors);

    res.header('Content-Type', 'text/csv');
    res.attachment('visitor_data.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;