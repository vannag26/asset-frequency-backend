require('dotenv').config();
const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { logger } = require('./middleware/logger');
const { initWebSocket } = require('./ws/realtime');
const marketRoutes   = require('./routes/market');
const industryRoutes = require('./routes/industries');
const oracleRoutes   = require('./routes/oracle');
const strategyRoutes = require('./routes/strategy');
const authRoutes     = require('./routes/auth');

const app    = express();
const server = http.createServer(app);

// ── Security & Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    'https://www.theassetfrequency.com',
    'https://theassetfrequency.com',
    /\.lovable\.app$/,           // Lovable preview domains
    'http://localhost:3000',      // local dev
  ],
  credentials: true,
}));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));
app.use('/api/auth',       authRoutes);
app.use('/api/market',     marketRoutes);
app.use('/api/industries', industryRoutes);
app.use('/api/oracle',     oracleRoutes);
app.use('/api/strategy',   strategyRoutes);

// ── WebSocket (real-time for paid subscribers) ───────────────────────────────
initWebSocket(server);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => logger.info(`TAF API running on :${PORT}`));
