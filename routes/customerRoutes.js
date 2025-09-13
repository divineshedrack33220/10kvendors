// routes/customerRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const customerController = require('../controllers/customerController');
const auth = require('../middleware/auth');

router.get('/', auth, customerController.getAllCustomers);
router.get('/inactive', auth, customerController.getInactiveCustomers);
router.get('/most-ordered', auth, customerController.getMostOrderedItems);
router.get('/export', auth, customerController.exportCustomers);
router.get('/:id', auth, customerController.getCustomerById);
router.put('/:id/suspend', auth, customerController.suspendCustomer);
router.post('/broadcast', auth, upload.single('image'), customerController.sendBroadcast);

module.exports = router;