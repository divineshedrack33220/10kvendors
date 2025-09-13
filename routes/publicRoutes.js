const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const router = express.Router();

// Public product routes
router.get('/products', async (req, res) => {
    try {
        const { priceRange, sort, category, search, ids } = req.query;
        let query = {};
        if (priceRange) {
            const [min, max] = priceRange.split('-').map(Number);
            query.price = { $gte: min, $lte: max };
        }
        if (category) query.category = category;
        if (search) query.name = { $regex: search, $options: 'i' };
        if (ids) query._id = { $in: ids.split(',') };

        const sortOptions = {};
        if (sort === 'discount-desc') sortOptions.discount = -1;
        if (sort === 'rating-desc') sortOptions.rating = -1;

        const products = await Product.find(query).sort(sortOptions);
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Public category routes
router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find().select('name icon itemCount');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;