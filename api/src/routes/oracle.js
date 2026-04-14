const router = require('express').Router();
const { requireAuth, requirePaid } = require('../middleware/auth');
const db = require('../db');

// ── GET /api/oracle/signals  (free: last 24h signals, basic) ─────────────────
router.get('/signals', requireAuth, async (req, res) => {
  try {
    const tier = req.user?.user_metadata?.subscription_tier || 'free';
    const hoursBack = tier === 'free' ? 24 : 1;
    const rows = await db.query(`
      SELECT id, symbol, signal_type, direction, confidence, reasoning, created_at
      FROM oracle_signals
      WHERE created_at >= NOW() - INTERVAL '${hoursBack} hours'
      ORDER BY confidence DESC, created_at DESC
      LIMIT $1
    `, [tier === 'free' ? 10 : 50]);
    res.json({ data: rows.rows, tier, hours_back: hoursBack });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// ── GET /api/oracle/signals/:id  (full signal detail — paid only) ────────────
router.get('/signals/:id', requirePaid, async (req, res) => {
  try {
    const row = await db.query(
      `SELECT * FROM oracle_signals WHERE id = $1`, [req.params.id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Signal not found' });
    res.json({ data: row.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch signal' });
  }
});

// ── GET /api/oracle/forecast/:symbol  (paid only) ───────────────────────────
router.get('/forecast/:symbol', requirePaid, async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT symbol, horizon, direction, target_price, probability, basis, created_at
      FROM oracle_forecasts
      WHERE symbol = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [req.params.symbol.toUpperCase()]);
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

module.exports = router;
