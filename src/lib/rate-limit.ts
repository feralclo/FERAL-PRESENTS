import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory sliding window rate limiter for API routes.
 *
 * How it works:
 * - Tracks request timestamps per identifier (usually IP)
 * - Slides a time window to count recent requests
 * - Returns 429 when limit is exceeded
 *
 * Limitations:
 * - In-memory: resets on cold start (acceptable — fails open, not closed)
 * - Per-instance: each serverless instance has its own counter
 *   (for truly distributed rate limiting, use Redis/Upstash — this is a
 *    strong first layer that stops casual abuse and brute force)
 *
 * For production at scale, consider upgrading to @upstash/ratelimit
 * which uses Redis for distributed state across all instances.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

/** Periodic cleanup interval (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const cleanupTimers = new Map<string, ReturnType<typeof setInterval>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);

    // Set up periodic cleanup to prevent memory leaks
    if (!cleanupTimers.has(name)) {
      const timer = setInterval(() => {
        const now = Date.now();
        const s = stores.get(name);
        if (!s) return;
        for (const [key, entry] of s) {
          // Remove entries with no recent activity (oldest window * 2)
          if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - CLEANUP_INTERVAL_MS) {
            s.delete(key);
          }
        }
      }, CLEANUP_INTERVAL_MS);
      // Unref so the timer doesn't prevent Node.js from exiting
      if (typeof timer === "object" && "unref" in timer) {
        timer.unref();
      }
      cleanupTimers.set(name, timer);
    }
  }
  return store;
}

/**
 * Extract the client IP from a Next.js request.
 * Checks standard proxy headers, falls back to "unknown".
 */
function getClientIp(request: NextRequest): string {
  // Vercel sets x-forwarded-for; use the first (leftmost = original client)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Check if a request should be rate limited.
 *
 * @returns null if allowed, or a 429 NextResponse if blocked
 */
function checkRateLimit(
  storeName: string,
  identifier: string,
  config: RateLimiterConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const store = getStore(storeName);
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const windowStart = now - windowMs;

  let entry = store.get(identifier);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(identifier, entry);
  }

  // Slide the window: remove timestamps older than the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.limit) {
    // Rate limited — calculate when the oldest request in the window expires
    const oldestInWindow = entry.timestamps[0];
    const resetAt = oldestInWindow + windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Allow the request
  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.limit - entry.timestamps.length,
    resetAt: now + windowMs,
  };
}

/**
 * Create a rate limiter for an API route.
 *
 * Usage:
 *   const limiter = createRateLimiter("login", { limit: 5, windowSeconds: 900 });
 *
 *   export async function POST(request: NextRequest) {
 *     const blocked = limiter(request);
 *     if (blocked) return blocked;
 *     // ... handle request
 *   }
 */
export function createRateLimiter(
  name: string,
  config: RateLimiterConfig
) {
  return function rateLimit(request: NextRequest): NextResponse | null {
    const ip = getClientIp(request);
    const result = checkRateLimit(name, ip, config);

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      const response = NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retry_after: retryAfter,
        },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(retryAfter));
      response.headers.set("X-RateLimit-Limit", String(config.limit));
      response.headers.set("X-RateLimit-Remaining", "0");
      response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
      return response;
    }

    return null;
  };
}
