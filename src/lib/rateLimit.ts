/** Simple in-memory sliding-window rate limiter (per process). */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  let bucket = buckets.get(opts.key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(opts.key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  if (bucket.timestamps.length >= opts.limit) {
    const oldest = bucket.timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  bucket.timestamps.push(now);

  // Bound map growth
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      b.timestamps = b.timestamps.filter((t) => t > windowStart);
      if (b.timestamps.length === 0) buckets.delete(k);
    }
  }

  return { ok: true };
}

export function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim().slice(0, 64);
  }
  return (req.ip || 'unknown').slice(0, 64);
}
