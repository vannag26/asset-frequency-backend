const { WebSocketServer } = require('ws');
const Redis = require('ioredis');
const { verifyToken } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

// ── Redis subscriber (receives events from scheduler) ────────────────────────
const sub = new Redis(process.env.REDIS_URL, {
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

const CHANNELS = ['market:update', 'oracle:signal', 'industry:update'];

sub.subscribe(...CHANNELS, (err) => {
  if (err) logger.error('Redis subscribe error', { err: err.message });
  else logger.info('WebSocket server subscribed to Redis channels', { CHANNELS });
});

// ── Per-channel client sets ──────────────────────────────────────────────────
const rooms = {};
CHANNELS.forEach(ch => { rooms[ch] = new Set(); });

// ── Broadcast incoming Redis events to subscribed WS clients ─────────────────
sub.on('message', (channel, message) => {
  const clients = rooms[channel];
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({ channel, data: JSON.parse(message), ts: Date.now() });
  let sent = 0;

  clients.forEach(ws => {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(payload);
      sent++;
    }
  });

  logger.debug(`Broadcast ${channel} → ${sent} clients`);
});

// ── WebSocket server setup ───────────────────────────────────────────────────
function initWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/live' });

  wss.on('connection', (ws, req) => {
    // ── Authenticate on connection ──────────────────────────────────────────
    const url    = new URL(req.url, 'http://localhost');
    const token  = url.searchParams.get('token');
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      ws.send(JSON.stringify({ error: 'Unauthorized. Pass ?token=<JWT>' }));
      return ws.close(4001, 'Unauthorized');
    }

    const tier = payload?.user_metadata?.subscription_tier
               || payload?.subscription_tier
               || 'free';

    if (tier === 'free') {
      ws.send(JSON.stringify({
        error: 'Real-time updates require a paid subscription.',
        upgrade_url: 'https://www.theassetfrequency.com/access',
      }));
      return ws.close(4003, 'Upgrade required');
    }

    // ── Subscribe paid user to all channels ─────────────────────────────────
    CHANNELS.forEach(ch => rooms[ch].add(ws));
    logger.info('WS client connected', { userId: payload.sub, tier });

    ws.send(JSON.stringify({ event: 'connected', channels: CHANNELS, tier }));

    // ── Heartbeat ───────────────────────────────────────────────────────────
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
      CHANNELS.forEach(ch => rooms[ch].delete(ws));
      logger.info('WS client disconnected', { userId: payload.sub });
    });

    ws.on('error', (err) => logger.error('WS error', { err: err.message }));
  });

  // ── Heartbeat interval (drop dead connections) ───────────────────────────
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  logger.info('WebSocket server ready on /live');
  return wss;
}

module.exports = { initWebSocket };
