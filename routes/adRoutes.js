const express = require('express');
const router = express.Router();
const { getAds, getAdCampaigns } = require('../controllers/adController');
const auth = require('../middleware/auth');

// Route for fetching ad metrics and chart data (admin only)
router.get('/', auth, getAds);

// Route for fetching recent ad campaigns (admin only)
router.get('/campaigns', auth, getAdCampaigns);

module.exports = router;