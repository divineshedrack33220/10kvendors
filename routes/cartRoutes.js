const express = require('express');
const router = express.Router();
const { addToCart, removeFromCart, getCart, mergeCart, getAllCarts } = require('../controllers/cartController');
const auth = require('../middleware/auth');

// Route for fetching all carts (for admin dashboard funnel chart)
router.get('/', auth, getAllCarts); // Changed from /all to / for frontend compatibility

// Route for fetching a user's cart
router.get('/me', auth, getCart); // Changed from / to /me to avoid conflict

// Other cart routes
router.post('/add', auth, addToCart); // POST /api/carts/add
router.post('/remove', auth, removeFromCart); // POST /api/carts/remove
router.post('/merge', auth, mergeCart); // POST /api/carts/merge
router.get('/all', auth, getAllCarts); // Optional: keep as fallback

module.exports = router;