const db    = require('../db');
const redis = require('../redis');
const { logger } = require('../logger');

// ── Oracle Signal Generator ───────────────────────────────────────────────────
// Reads latest market data, applies signal logic, writes oracle_signals to DB

const SIGNAL_THRESHOLDS = {
  strong_bullish:  5.0,   // >5% gain → strong buy signal
  bullish:         2.0,   // >2% gain → buy signal
  bearish:        -2.0,   // <-2%    → sell signal
  strong_bearish: -5.0,   // <-5%    → strong sell signal
};

function classifySignal(changePct) {
  if (changePct >= SIGNAL_THRESHOLDS.strong_bullish) return { type: 'momentum', direction: 'strong_buy',  confidence: 0.85 };
  if (changePct >= SIGNAL_THRESHOLDS.bullish)        return { type: 'momentum', direction: 'buy',         confidence: 0.70 };
  if (changePct <= SIGNAL_THRESHOLDS.strong_bearish) return { type: 'momentum', direction: 'strong_sell', confidence: 0.85 };
  if (changePct <= SIGNAL_THRESHOLDS.bearish)        return { type: 'momentum', direction: 'sell',        confidence: 0.65 };
  return null;
}

async function run() {
  const client = await db.connect();
  try {
    // Get assets with significant moves
    const assets = await client.query(`
      SELECT symbol, name, price, change_pct, sector
      FROM market_snapshots
      WHERE last_updated >= NOW() - INTERVAL '25 hours'
      AND ABS(change_pct) >= 2.0
      ORDER BY ABS(change_pct) DESC
      LIMIT 30
    `);

    const signals = [];
    for (const asset of assets.rows) {
      const sig = classifySignal(asset.change_pct);
      if (!sig) continue;

      const reasoning = `${asset.symbol} moved ${asset.change_pct > 0 ? '+' : ''}${asset.change_pct.toFixed(2)}% ` +
        `in the ${asset.sector || 'market'}. ` +
        `${sig.direction.includes('buy') ? 'Momentum favors upside positioning.' : 'Pressure suggests defensive positioning.'}`;

      await client.query(`
        INSERT INTO oracle_signals
          (symbol, signal_type, direction, confidence, reasoning, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [asset.symbol, sig.type, sig.direction, sig.confidence, reasoning]);

      signals.push({ symbol: asset.symbol, direction: sig.direction, confidence: sig.confidence });
    }

    // Publish Oracle signal event to Redis
    if (signals.length > 0) {
      await redis.publish('oracle:signal', JSON.stringify({
        event: 'new_signals',
        count: signals.length,
        top: signals.slice(0, 5),
        ts: new Date().toISOString(),
      }));
    }

    logger.info('Oracle signals generated', { count: signals.length });
  } finally {
    client.release();
  }
}

module.exports = { run };
