const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

// ── GET /api/auth/me  (validate token + return tier) ────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const tier = req.user?.user_metadata?.subscription_tier || 'free';
  res.json({
    user_id: req.user.sub,
    email: req.user.email,
    tier,
    realtime_enabled: tier !== 'free',
  });
});

module.exports = router;
