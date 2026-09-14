export interface FailedAttemptRateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
  maxEntries?: number;
}

interface AttemptState {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
  lastSeenAt: number;
}

export interface RateLimitStatus {
  blocked: boolean;
  retryAfterSeconds: number;
}

export class FailedAttemptRateLimiter {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly maxEntries: number;

  constructor(private readonly options: FailedAttemptRateLimiterOptions) {
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  check(key: string, now: number = Date.now()): RateLimitStatus {
    const state = this.attempts.get(key);
    if (!state) return { blocked: false, retryAfterSeconds: 0 };

    if (state.blockedUntil > now) {
      state.lastSeenAt = now;
      return {
        blocked: true,
        retryAfterSeconds: Math.max(1, Math.ceil((state.blockedUntil - now) / 1000))
      };
    }

    if (now - state.windowStartedAt >= this.options.windowMs) {
      this.attempts.delete(key);
    }

    return { blocked: false, retryAfterSeconds: 0 };
  }

  recordFailure(key: string, now: number = Date.now()): RateLimitStatus {
    let state = this.attempts.get(key);
    if (!state || now - state.windowStartedAt >= this.options.windowMs) {
      this.ensureCapacity(now);
      state = {
        failures: 0,
        windowStartedAt: now,
        blockedUntil: 0,
        lastSeenAt: now
      };
      this.attempts.set(key, state);
    }

    state.failures += 1;
    state.lastSeenAt = now;
    if (state.failures >= this.options.maxAttempts) {
      state.blockedUntil = now + this.options.blockMs;
    }

    return this.check(key, now);
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  private ensureCapacity(now: number): void {
    for (const [key, state] of this.attempts) {
      const expired =
        state.blockedUntil <= now &&
        now - state.windowStartedAt >= this.options.windowMs;
      if (expired) this.attempts.delete(key);
    }

    if (this.attempts.size < this.maxEntries) return;

    let oldestKey: string | null = null;
    let oldestSeenAt = Number.POSITIVE_INFINITY;
    for (const [key, state] of this.attempts) {
      if (state.lastSeenAt < oldestSeenAt) {
        oldestSeenAt = state.lastSeenAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.attempts.delete(oldestKey);
  }
}
