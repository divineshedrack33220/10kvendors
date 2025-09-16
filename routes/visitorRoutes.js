const express = require('express');
const router = express.Router();
const { getVisitors, getVisitorActivity } = require('../controllers/visitorController');
const auth = require('../middleware/auth');

// Route for fetching visitor trends (admin only)
router.get('/', auth, getVisitors);

// Route for fetching recent visitor activity (admin only)
router.get('/activity', auth, getVisitorActivity);

module.exports = router;