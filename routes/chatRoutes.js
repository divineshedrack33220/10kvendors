const express = require('express');
const router = express.Router();
const { createChat, sendMessage, getChat } = require('../controllers/chatController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/', auth, createChat);
router.post('/message', auth, upload.array('images', 5), sendMessage);
router.get('/', auth, getChat);

module.exports = router;