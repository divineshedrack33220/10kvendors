const express = require('express');
const router = express.Router();
const { getAddresses, getAddressById, addAddress, updateAddress, deleteAddress } = require('../controllers/addressController');
const auth = require('../middleware/auth');

router.post('/', auth, addAddress);
router.get('/', auth, getAddresses);
router.get('/:id', auth, getAddressById);
router.put('/:id', auth, updateAddress);
router.delete('/:id', auth, deleteAddress);

module.exports = router;