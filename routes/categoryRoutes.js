// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const { createCategory, getCategories, updateCategory, deleteCategory } = require('../controllers/categoryController');
const auth = require('../middleware/auth');

router.post('/', auth, createCategory); // Admin-only: Create category
router.get('/', auth, getCategories); // Admin-only: List categories
router.put('/:id', auth, updateCategory); // Admin-only: Update category
router.delete('/:id', auth, deleteCategory); // Admin-only: Delete category

module.exports = router;