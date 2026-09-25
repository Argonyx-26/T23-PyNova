// Tiny shared in-memory rate limiter for API routes.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 500) {
      for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : null) ?? "local";
}
