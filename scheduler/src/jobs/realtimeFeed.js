const WebSocket = require('ws');
const redis = require('../redis');
const db    = require('../db');
const { logger } = require('../logger');

// ── Polygon.io WebSocket real-time feed ──────────────────────────────────────
// Streams live trades → writes to market_ticks → publishes to Redis

let polygonWs = null;

function start() {
  const key = process.env.POLYGON_API_KEY;
  polygonWs = new WebSocket(`wss://socket.polygon.io/stocks`);

  polygonWs.on('open', () => {
    logger.info('Polygon WebSocket connected');
    polygonWs.send(JSON.stringify({ action: 'auth', params: key }));
  });

  polygonWs.on('message', async (raw) => {
    try {
      const events = JSON.parse(raw);
      for (const evt of events) {

        if (evt.ev === 'status' && evt.status === 'auth_success') {
          // Subscribe to top stocks after auth
          polygonWs.send(JSON.stringify({
            action: 'subscribe',
            params: 'T.*,Q.*', // All trades + quotes (filter in handler)
          }));
          logger.info('Polygon authenticated, subscribed to feed');
        }

        // Trade event
        if (evt.ev === 'T') {
          const tick = {
            symbol: evt.sym,
            price:  evt.p,
            volume: evt.s,
            ts:     new Date(evt.t).toISOString(),
          };

          // Write to DB
          await db.query(`
            INSERT INTO market_ticks (symbol, price, volume, ts)
            VALUES ($1, $2, $3, $4)
          `, [tick.symbol, tick.price, tick.volume, tick.ts]);

          // Publish to Redis every tick (paid WS clients get it instantly)
          await redis.publish('market:update', JSON.stringify(tick));
        }
      }
    } catch (err) {
      logger.error('Polygon feed parse error', { err: err.message });
    }
  });

  polygonWs.on('close', () => {
    logger.warn('Polygon WebSocket closed, reconnecting in 10s...');
    setTimeout(start, 10_000);
  });

  polygonWs.on('error', (err) => {
    logger.error('Polygon WebSocket error', { err: err.message });
  });
}

// ── Fallback: polling mode (no streaming key) ────────────────────────────────
const axios = require('axios');

async function startPolling(intervalMs = 60_000) {
  logger.info(`Real-time fallback: polling every ${intervalMs / 1000}s`);

  async function poll() {
    try {
      const key = process.env.ALPHA_VANTAGE_KEY;
      const { data } = await axios.get(
        `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${key}`
      );
      const movers = [
        ...(data.top_gainers || []).slice(0, 5),
        ...(data.top_losers  || []).slice(0, 5),
      ];

      await redis.publish('market:update', JSON.stringify({
        event: 'poll_update',
        movers: movers.map(m => ({
          symbol: m.ticker,
          price:  parseFloat(m.price),
          change: parseFloat(m.change_percentage),
        })),
        ts: new Date().toISOString(),
      }));

      logger.debug('Poll update published to Redis');
    } catch (err) {
      logger.error('Polling error', { err: err.message });
    }
  }

  poll();
  setInterval(poll, intervalMs);
}

module.exports = { start, startPolling };
