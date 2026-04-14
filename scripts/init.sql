-- ── The Asset Frequency — PostgreSQL Schema ───────────────────────────────────

-- Market daily snapshots (free tier)
CREATE TABLE IF NOT EXISTS market_snapshots (
  symbol        TEXT PRIMARY KEY,
  name          TEXT,
  price         NUMERIC(12, 4),
  change_pct    NUMERIC(8, 4),
  volume        BIGINT,
  sector        TEXT,
  last_updated  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_sector ON market_snapshots(sector);
CREATE INDEX IF NOT EXISTS idx_snapshots_change ON market_snapshots(change_pct DESC);

-- Real-time tick data (paid tier)
CREATE TABLE IF NOT EXISTS market_ticks (
  id       BIGSERIAL PRIMARY KEY,
  symbol   TEXT        NOT NULL,
  price    NUMERIC(12, 4),
  bid      NUMERIC(12, 4),
  ask      NUMERIC(12, 4),
  volume   BIGINT,
  ts       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON market_ticks(symbol, ts DESC);
-- Auto-purge ticks older than 7 days (keep DB lean)
-- Run: SELECT cron.schedule('purge-ticks', '0 3 * * *', 'DELETE FROM market_ticks WHERE ts < NOW() - INTERVAL ''7 days''');

-- Industry / sector snapshots
CREATE TABLE IF NOT EXISTS industry_snapshots (
  sector         TEXT PRIMARY KEY,
  avg_change_pct NUMERIC(8, 4),
  top_mover_symbol TEXT,
  top_mover_change NUMERIC(8, 4),
  signal_count   INTEGER DEFAULT 0,
  sentiment      TEXT,
  last_updated   TIMESTAMPTZ DEFAULT NOW()
);

-- Oracle AI signals
CREATE TABLE IF NOT EXISTS oracle_signals (
  id          BIGSERIAL PRIMARY KEY,
  symbol      TEXT        NOT NULL,
  signal_type TEXT        NOT NULL,  -- 'momentum', 'breakout', 'reversal', etc.
  direction   TEXT        NOT NULL,  -- 'strong_buy', 'buy', 'sell', 'strong_sell'
  confidence  NUMERIC(4, 2),
  reasoning   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON oracle_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_created ON oracle_signals(created_at DESC);

-- Oracle forecasts (paid tier detail)
CREATE TABLE IF NOT EXISTS oracle_forecasts (
  id           BIGSERIAL PRIMARY KEY,
  symbol       TEXT NOT NULL,
  horizon      TEXT,        -- '1d', '1w', '1m'
  direction    TEXT,
  target_price NUMERIC(12, 4),
  probability  NUMERIC(4, 2),
  basis        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Strategy playbooks
CREATE TABLE IF NOT EXISTS strategy_playbooks (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  summary     TEXT,
  sector      TEXT,
  content     TEXT,         -- Full markdown content (paid only)
  entry_price NUMERIC(12, 4),
  target      NUMERIC(12, 4),
  stop_loss   NUMERIC(12, 4),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
