// routes/config.js
const express = require('express');
const router = express.Router();

router.get('/config', (req, res) => {
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_');
  res.json({
    PAYSTACK_PUBLIC_KEY: isTestMode
      ? process.env.PAYSTACK_PUBLIC_KEY_TEST
      : process.env.PAYSTACK_PUBLIC_KEY_LIVE,
    IS_TEST_MODE: isTestMode
  });
});

module.exports = router;