import assert from "node:assert/strict";
import { FailedAttemptRateLimiter } from "../server/services/authRateLimit";

const limiter = new FailedAttemptRateLimiter({
  maxAttempts: 3,
  windowMs: 1_000,
  blockMs: 5_000,
  maxEntries: 2
});

assert.equal(limiter.check("client-a", 0).blocked, false);
assert.equal(limiter.recordFailure("client-a", 0).blocked, false);
assert.equal(limiter.recordFailure("client-a", 100).blocked, false);

const blocked = limiter.recordFailure("client-a", 200);
assert.equal(blocked.blocked, true);
assert.equal(blocked.retryAfterSeconds, 5);
assert.equal(limiter.check("client-a", 1_200).blocked, true);
assert.equal(limiter.check("client-a", 5_200).blocked, false);

limiter.recordFailure("client-b", 6_000);
limiter.recordSuccess("client-b");
assert.equal(limiter.check("client-b", 6_001).blocked, false);

limiter.recordFailure("client-c", 7_000);
assert.equal(limiter.recordFailure("client-c", 8_000).blocked, false);

console.log("Auth rate limiter tests passed.");
