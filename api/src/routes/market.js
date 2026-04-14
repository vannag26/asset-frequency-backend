const router = require('express').Router();
const { requireAuth, requirePaid } = require('../middleware/auth');
const db = require('../db');

// ── GET /api/market/snapshot  (free: daily cached data) ──────────────────────
router.get('/snapshot', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT symbol, name, price, change_pct, volume, sector, last_updated
      FROM market_snapshots
      WHERE last_updated >= NOW() - INTERVAL '25 hours'
      ORDER BY ABS(change_pct) DESC
      LIMIT 50
    `);
    res.json({ data: rows.rows, tier: 'daily', updated_at: rows.rows[0]?.last_updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// ── GET /api/market/movers  (free: top movers from daily snapshot) ────────────
router.get('/movers', requireAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const rows = await db.query(`
      SELECT symbol, name, price, change_pct, sector
      FROM market_snapshots
      WHERE last_updated >= NOW() - INTERVAL '25 hours'
      ORDER BY ABS(change_pct) DESC
      LIMIT $1
    `, [Math.min(Number(limit), 50)]);
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movers' });
  }
});

// ── GET /api/market/live  (paid only — real-time tick data) ──────────────────
router.get('/live', requirePaid, async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT symbol, price, bid, ask, volume, ts
      FROM market_ticks
      WHERE ts >= NOW() - INTERVAL '5 minutes'
      ORDER BY ts DESC
    `);
    res.json({ data: rows.rows, tier: 'realtime' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch live data' });
  }
});

module.exports = router;
