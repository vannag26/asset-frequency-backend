const jwt = require('jsonwebtoken');

// ── Verify JWT from Supabase or your own auth ────────────────────────────────
function verifyToken(token) {
  try {
    // Try Supabase JWT first, fall back to own JWT
    return (
      jwt.verify(token, process.env.SUPABASE_JWT_SECRET) ||
      jwt.verify(token, process.env.JWT_SECRET)
    );
  } catch {
    return null;
  }
}

// ── Middleware: require any valid auth ───────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  req.user = payload;
  next();
}

// ── Middleware: require paid subscription ────────────────────────────────────
function requirePaid(req, res, next) {
  requireAuth(req, res, () => {
    const tier = req.user?.user_metadata?.subscription_tier
               || req.user?.subscription_tier
               || 'free';
    if (tier === 'free') {
      return res.status(403).json({
        error: 'Real-time data requires a paid subscription.',
        upgrade_url: 'https://www.theassetfrequency.com/access',
      });
    }
    next();
  });
}

module.exports = { requireAuth, requirePaid, verifyToken };
