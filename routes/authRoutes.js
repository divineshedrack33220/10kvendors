const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const googleAuthController = require('../controllers/googleAuthController');

router.post('/signup', authController.signup); // Line 5 (potential issue)
router.post('/login', authController.login);
router.post('/google', googleAuthController.googleAuth);

module.exports = router;