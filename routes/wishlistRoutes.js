const express = require('express');
const router = express.Router();
const { getWishlist, toggleWishlist, addToCartFromWishlist } = require('../controllers/wishlistController');
const auth = require('../middleware/auth');

router.get('/me', auth, getWishlist);
router.post('/toggle', auth, toggleWishlist);
router.post('/to-cart', auth, addToCartFromWishlist);

module.exports = router;
