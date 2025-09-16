const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrder, updateOrderStatus, deleteOrder, getMetrics, getCharts, exportOrders, exportCharts, trackOrder } = require('../controllers/orderController');
const auth = require('../middleware/auth');

router.post('/', auth, createOrder);
router.get('/', auth, getOrders);
router.get('/charts', auth, getCharts);
router.get('/metrics', auth, getMetrics);
router.get('/export', auth, exportOrders);
router.get('/export-:type', auth, exportCharts);
router.get('/track', auth, trackOrder);
router.get('/:id', auth, getOrder);
router.patch('/:id', auth, updateOrderStatus);
router.delete('/:id', auth, deleteOrder);

module.exports = router;