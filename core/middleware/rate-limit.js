// Rate limiter progresivo en memoria. Para producción se puede mover a Redis,
// pero para 1 boutique con 1 admin esto sobra.

const buckets = new Map(); // key -> { count, resetAt, lockedUntil }

// Guard separado para intentos fallidos de autenticación. A diferencia de
// rateLimit(), este contador solo avanza cuando el handler confirma un fallo;
// así no penaliza el primer paso válido del login con 2FA.
export function createFailureLimiter({ limit = 5, windowMs = 15 * 60 * 1000, lockoutMs = windowMs } = {}) {
  const failures = new Map();

  function cleanup(now) {
    for (const [key, bucket] of failures) {
      if (bucket.lockedUntil <= now && bucket.resetAt <= now) failures.delete(key);
    }
  }

  function check(keys) {
    const now = Date.now();
    cleanup(now);
    let retryAfterSec = 0;
    for (const key of new Set(keys.filter(Boolean))) {
      const bucket = failures.get(key);
      if (bucket?.lockedUntil > now) {
        retryAfterSec = Math.max(retryAfterSec, Math.ceil((bucket.lockedUntil - now) / 1000));
      }
    }
    return { blocked: retryAfterSec > 0, retryAfterSec };
  }

  function fail(keys) {
    const now = Date.now();
    cleanup(now);
    for (const key of new Set(keys.filter(Boolean))) {
      const current = failures.get(key);
      const bucket = !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs, lockedUntil: 0 }
        : current;
      bucket.count += 1;
      // El fallo que alcanza el límite todavía recibe su respuesta normal;
      // los siguientes intentos quedan bloqueados durante la ventana configurada.
      if (bucket.count >= limit) bucket.lockedUntil = now + lockoutMs;
      failures.set(key, bucket);
    }
  }

  function clear(keys) {
    for (const key of new Set(keys.filter(Boolean))) failures.delete(key);
  }

  return { check, fail, clear };
}

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
