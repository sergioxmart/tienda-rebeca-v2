// Rate limiter progresivo en memoria. Para producción se puede mover a Redis,
// pero para 1 boutique con 1 admin esto sobra.

const buckets = new Map(); // key -> { count, resetAt, lockedUntil }

export function rateLimit({ keyFn, limit, windowMs, lockoutMs, maxLockouts }) {
  return (req, res, next) => {
    const k = keyFn(req);
    if (!k) return next();

    const now = Date.now();
    const b = buckets.get(k) || { count: 0, resetAt: now + windowMs, lockouts: 0, lockedUntil: 0 };

    // Si está lockeado, negar
    if (b.lockedUntil > now) {
      const retry = Math.ceil((b.lockedUntil - now) / 1000);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(retry),
      });
      return res.end(JSON.stringify({ ok: false, error: 'locked_out', retryAfterSec: retry }));
    }

    // Reset window
    if (now >= b.resetAt) {
      b.count = 0;
      b.resetAt = now + windowMs;
    }

    b.count += 1;
    buckets.set(k, b);

    if (b.count > limit) {
      b.lockouts += 1;
      // Backoff exponencial: 1, 5, 30 min
      const backoff = lockoutMs * Math.pow(5, b.lockouts - 1);
      b.lockedUntil = now + backoff;

      if (b.lockouts >= maxLockouts) {
        // Lockout largo (24h) tras N excesos
        b.lockedUntil = now + 24 * 60 * 60 * 1000;
      }

      const retry = Math.ceil((b.lockedUntil - now) / 1000);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(retry),
      });
      return res.end(JSON.stringify({ ok: false, error: 'rate_limited', retryAfterSec: retry }));
    }

    return next();
  };
}
