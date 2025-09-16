const express = require('express');
const router = express.Router();
const { register, login, getProfile, updateProfile, changePassword, toggle2FA, getAllUsers } = require('../controllers/userController');
const auth = require('../middleware/auth');

// Debug: Ensure controllers are functions
if (typeof getProfile !== 'function') {
  console.error('getProfile is not a function:', getProfile);
}
if (typeof getAllUsers !== 'function') {
  console.error('getAllUsers is not a function:', getAllUsers);
}

// Routes
router.post('/register', register);
router.post('/login', login);
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.post('/change-password', auth, changePassword);
router.post('/toggle-2fa', auth, toggle2FA);
router.get('/', auth, getAllUsers);

module.exports = router;