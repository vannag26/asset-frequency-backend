const router = require('express').Router();
const { requireAuth, requirePaid } = require('../middleware/auth');
const db = require('../db');

// ── GET /api/strategy/playbooks  (free: titles only, paid: full content) ─────
router.get('/playbooks', requireAuth, async (req, res) => {
  try {
    const tier = req.user?.user_metadata?.subscription_tier || 'free';
    const cols = tier === 'free'
      ? 'id, title, summary, sector, created_at'
      : '*';
    const rows = await db.query(
      `SELECT ${cols} FROM strategy_playbooks ORDER BY created_at DESC LIMIT 20`
    );
    res.json({ data: rows.rows, tier });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch playbooks' });
  }
});

// ── GET /api/strategy/playbooks/:id  (full detail — paid only) ───────────────
router.get('/playbooks/:id', requirePaid, async (req, res) => {
  try {
    const row = await db.query(
      `SELECT * FROM strategy_playbooks WHERE id = $1`, [req.params.id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch playbook' });
  }
});

module.exports = router;
