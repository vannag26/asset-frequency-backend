const axios = require('axios');
const db    = require('../db');
const redis = require('../redis');
const { logger } = require('../logger');

// ── Sectors to track ─────────────────────────────────────────────────────────
const SECTORS = [
  'Technology', 'Finance', 'Energy', 'Healthcare',
  'Consumer Discretionary', 'Industrials', 'Real Estate',
  'Materials', 'Utilities', 'Communication Services',
];

// ── Fetch market data from Alpha Vantage ─────────────────────────────────────
async function fetchMarketData() {
  const key = process.env.ALPHA_VANTAGE_KEY;
  if (!key) throw new Error('ALPHA_VANTAGE_KEY not set');

  // Top gainers/losers/most active
  const { data } = await axios.get(
    `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${key}`
  );
  return data;
}

// ── Fetch sector performance ──────────────────────────────────────────────────
async function fetchSectorPerformance() {
  const key = process.env.ALPHA_VANTAGE_KEY;
  const { data } = await axios.get(
    `https://www.alphavantage.co/query?function=SECTOR&apikey=${key}`
  );
  return data;
}

// ── Main daily update job ─────────────────────────────────────────────────────
async function run() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch market movers
    const marketData = await fetchMarketData();
    const allAssets  = [
      ...(marketData.top_gainers  || []),
      ...(marketData.top_losers   || []),
      ...(marketData.most_actively_traded || []),
    ];

    // 2. Upsert market snapshots
    for (const asset of allAssets) {
      await client.query(`
        INSERT INTO market_snapshots
          (symbol, name, price, change_pct, volume, last_updated)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (symbol) DO UPDATE SET
          price = EXCLUDED.price,
          change_pct = EXCLUDED.change_pct,
          volume = EXCLUDED.volume,
          last_updated = NOW()
      `, [
        asset.ticker,
        asset.ticker,
        parseFloat(asset.price) || 0,
        parseFloat(asset.change_percentage?.replace('%', '')) || 0,
        parseInt(asset.volume) || 0,
      ]);
    }

    // 3. Fetch and upsert sector performance
    const sectorData = await fetchSectorPerformance();
    const dayPerf    = sectorData['Rank A: Real-Time Performance'] || {};

    for (const [sector, change] of Object.entries(dayPerf)) {
      if (sector === 'Meta Data') continue;
      await client.query(`
        INSERT INTO industry_snapshots (sector, avg_change_pct, last_updated)
        VALUES ($1, $2, NOW())
        ON CONFLICT (sector) DO UPDATE SET
          avg_change_pct = EXCLUDED.avg_change_pct,
          last_updated = NOW()
      `, [sector, parseFloat(change) || 0]);
    }

    await client.query('COMMIT');
    logger.info('Market snapshots written to DB', { assets: allAssets.length });

    // 4. Publish update event to Redis (triggers WS broadcast to paid users)
    await redis.publish('market:update', JSON.stringify({
      event: 'daily_snapshot',
      asset_count: allAssets.length,
      ts: new Date().toISOString(),
    }));

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { run };
