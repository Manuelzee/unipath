/**
 * Short-term burst limiter, per server instance. The daily quota in quota.ts is the
 * durable limit; this only stops rapid repeated requests.
 */
export class BurstLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, times] of this.hits) if (times.every(t => now - t >= this.windowMs)) this.hits.delete(k);
    }
    return true;
  }
  /** True when `take` would refuse right now. Records nothing. */
  isFull(key: string, now = Date.now()): boolean {
    return (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs).length >= this.max;
  }
}
