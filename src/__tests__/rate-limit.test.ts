import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock NextResponse before importing the module
vi.mock("next/server", () => {
  class MockHeaders {
    private headers = new Map<string, string>();
    get(key: string) { return this.headers.get(key) ?? null; }
    set(key: string, value: string) { this.headers.set(key, value); }
    has(key: string) { return this.headers.has(key); }
  }

  return {
    NextRequest: class {
      headers: MockHeaders;
      constructor(url: string, init?: { headers?: Record<string, string> }) {
        this.headers = new MockHeaders();
        if (init?.headers) {
          for (const [k, v] of Object.entries(init.headers)) {
            this.headers.set(k, v);
          }
        }
      }
    },
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({
        body,
        status: init?.status || 200,
        headers: new MockHeaders(),
      }),
    },
  };
});

import { createRateLimiter } from "@/lib/rate-limit";
import { NextRequest } from "next/server";

function makeRequest(ip: string = "1.2.3.4"): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rate-limit", () => {
  beforeEach(() => {
    // Reset the module state between tests by using unique limiter names
  });

  it("allows requests under the limit", () => {
    const limiter = createRateLimiter("test-under-limit", {
      limit: 3,
      windowSeconds: 60,
    });

    expect(limiter(makeRequest())).toBeNull();
    expect(limiter(makeRequest())).toBeNull();
    expect(limiter(makeRequest())).toBeNull();
  });

  it("blocks requests over the limit", () => {
    const limiter = createRateLimiter("test-over-limit", {
      limit: 2,
      windowSeconds: 60,
    });

    expect(limiter(makeRequest())).toBeNull();
    expect(limiter(makeRequest())).toBeNull();

    const blocked = limiter(makeRequest());
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it("tracks different IPs independently", () => {
    const limiter = createRateLimiter("test-ip-isolation", {
      limit: 1,
      windowSeconds: 60,
    });

    expect(limiter(makeRequest("10.0.0.1"))).toBeNull();
    expect(limiter(makeRequest("10.0.0.2"))).toBeNull();

    // Both should now be blocked
    expect(limiter(makeRequest("10.0.0.1"))).not.toBeNull();
    expect(limiter(makeRequest("10.0.0.2"))).not.toBeNull();

    // New IP should still be allowed
    expect(limiter(makeRequest("10.0.0.3"))).toBeNull();
  });

  it("resets after the time window expires", () => {
    vi.useFakeTimers();

    const limiter = createRateLimiter("test-window-reset", {
      limit: 1,
      windowSeconds: 10,
    });

    expect(limiter(makeRequest())).toBeNull();
    expect(limiter(makeRequest())).not.toBeNull();

    // Advance past the window
    vi.advanceTimersByTime(11_000);

    // Should be allowed again
    expect(limiter(makeRequest())).toBeNull();

    vi.useRealTimers();
  });

  it("returns 429 response with Retry-After header", () => {
    const limiter = createRateLimiter("test-headers", {
      limit: 1,
      windowSeconds: 60,
    });

    limiter(makeRequest());
    const blocked = limiter(makeRequest());

    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(blocked!.body).toHaveProperty("error");
    expect(blocked!.body).toHaveProperty("retry_after");
    expect(blocked!.headers.has("Retry-After")).toBe(true);
    expect(blocked!.headers.has("X-RateLimit-Limit")).toBe(true);
    expect(blocked!.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("uses x-real-ip when x-forwarded-for is missing", () => {
    const limiter = createRateLimiter("test-real-ip", {
      limit: 1,
      windowSeconds: 60,
    });

    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-real-ip": "192.168.1.1" },
    });
    expect(limiter(req)).toBeNull();
    expect(limiter(req)).not.toBeNull();

    // Different IP header should be independent
    const req2 = new NextRequest("http://localhost/api/test", {
      headers: { "x-real-ip": "192.168.1.2" },
    });
    expect(limiter(req2)).toBeNull();
  });

  it("uses first IP from x-forwarded-for chain", () => {
    const limiter = createRateLimiter("test-xff-chain", {
      limit: 1,
      windowSeconds: 60,
    });

    const req1 = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" },
    });
    expect(limiter(req1)).toBeNull();
    expect(limiter(req1)).not.toBeNull();

    // Same original IP through different proxies should still be blocked
    const req2 = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.1.1.1, 4.4.4.4" },
    });
    expect(limiter(req2)).not.toBeNull();
  });

  it("handles sliding window correctly with multiple requests", () => {
    vi.useFakeTimers();

    const limiter = createRateLimiter("test-sliding-window", {
      limit: 3,
      windowSeconds: 10,
    });

    // Time 0: 3 requests
    expect(limiter(makeRequest())).toBeNull();
    expect(limiter(makeRequest())).toBeNull();
    expect(limiter(makeRequest())).toBeNull();
    expect(limiter(makeRequest())).not.toBeNull(); // blocked

    // Time +5s: still blocked (only 5s of 10s window has passed)
    vi.advanceTimersByTime(5_000);
    expect(limiter(makeRequest())).not.toBeNull();

    // Time +11s: all 3 original requests have expired from the window
    vi.advanceTimersByTime(6_000);
    expect(limiter(makeRequest())).toBeNull(); // allowed again

    vi.useRealTimers();
  });
});
