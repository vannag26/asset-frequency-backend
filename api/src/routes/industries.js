const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

// ── GET /api/industries  (all sectors with performance, free daily) ──────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT sector, avg_change_pct, top_mover_symbol, top_mover_change,
             signal_count, sentiment, last_updated
      FROM industry_snapshots
      WHERE last_updated >= NOW() - INTERVAL '25 hours'
      ORDER BY ABS(avg_change_pct) DESC
    `);
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch industries' });
  }
});

// ── GET /api/industries/:sector  (sector detail + top assets) ────────────────
router.get('/:sector', requireAuth, async (req, res) => {
  try {
    const sector = req.params.sector;
    const [snapshot, assets] = await Promise.all([
      db.query(
        `SELECT * FROM industry_snapshots WHERE sector = $1
         AND last_updated >= NOW() - INTERVAL '25 hours'`, [sector]
      ),
      db.query(
        `SELECT symbol, name, price, change_pct, volume
         FROM market_snapshots WHERE sector = $1
         AND last_updated >= NOW() - INTERVAL '25 hours'
         ORDER BY ABS(change_pct) DESC LIMIT 20`, [sector]
      ),
    ]);
    res.json({
      sector: snapshot.rows[0] || null,
      assets: assets.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sector' });
  }
});

module.exports = router;
