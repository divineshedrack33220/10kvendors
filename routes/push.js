const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define a schema for push subscriptions
const pushSubscriptionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subscription: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now }
});

const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);

// Middleware to verify JWT (assuming you have an auth middleware)
const authMiddleware = require('../middleware/auth'); // Adjust path as needed

// Endpoint to save push subscription
router.post('/push-subscription', authMiddleware, async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription) {
            return res.status(400).json({ error: 'Subscription data is required' });
        }

        // Save or update subscription in MongoDB
        await PushSubscription.updateOne(
            { userId: req.user._id }, // Assuming authMiddleware sets req.user
            { $set: { subscription, createdAt: new Date() } },
            { upsert: true }
        );

        res.status(200).json({ message: 'Subscription saved' });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

module.exports = router;