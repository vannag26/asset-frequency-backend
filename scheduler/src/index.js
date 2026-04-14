require('dotenv').config();
const cron   = require('node-cron');
const { logger } = require('./logger');
const dailyUpdate    = require('./jobs/dailyUpdate');
const realtimeFeed   = require('./jobs/realtimeFeed');
const oracleSignals  = require('./jobs/oracleSignals');

// ── Daily update: 6:00 AM UTC every day ─────────────────────────────────────
// Fetches fresh market data, industry snapshots, writes to Postgres
const DAILY_CRON = process.env.DAILY_UPDATE_CRON || '0 6 * * *';
cron.schedule(DAILY_CRON, async () => {
  logger.info('Starting daily market update...');
  try {
    await dailyUpdate.run();
    logger.info('Daily update complete');
  } catch (err) {
    logger.error('Daily update failed', { err: err.message });
  }
}, { timezone: 'UTC' });

// ── Oracle signals: every 4 hours ───────────────────────────────────────────
cron.schedule('0 */4 * * *', async () => {
  logger.info('Running Oracle signal generation...');
  try {
    await oracleSignals.run();
    logger.info('Oracle signals updated');
  } catch (err) {
    logger.error('Oracle signals failed', { err: err.message });
  }
}, { timezone: 'UTC' });

logger.info('Scheduler started', {
  dailyCron: DAILY_CRON,
  realtimeFeed: 'starting now',
});

// ── Real-time feed: runs continuously, publishes to Redis ───────────────────
// Only runs if POLYGON_API_KEY or another streaming key is set
if (process.env.POLYGON_API_KEY) {
  realtimeFeed.start();
} else {
  logger.warn('No POLYGON_API_KEY set — real-time feed disabled. Paid subscribers will see 15-min delayed data.');
  // Fallback: poll every 60 seconds and publish to Redis as "realtime"
  realtimeFeed.startPolling(60_000);
}

// ── Run daily update immediately on first boot (so data is fresh) ────────────
setTimeout(async () => {
  logger.info('Running initial data load on startup...');
  try {
    await dailyUpdate.run();
    await oracleSignals.run();
    logger.info('Initial data load complete');
  } catch (err) {
    logger.error('Initial data load failed', { err: err.message });
  }
}, 5_000);
