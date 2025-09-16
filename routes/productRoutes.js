// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const { createProduct, getProducts, getProductById, updateProduct, deleteProduct, addStarRating } = require('../controllers/productController');
const auth = require('../middleware/auth');

console.log('✅ Registering product routes');

// Public routes
router.get('/', getProducts);
router.get('/:id', getProductById);

// Authenticated routes
router.post('/', auth, createProduct);
router.put('/:id', auth, updateProduct);
router.delete('/:id', auth, deleteProduct);
router.post('/:id/reviews', auth, addStarRating); // Route for star rating

module.exports = router;