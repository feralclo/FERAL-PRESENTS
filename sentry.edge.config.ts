import * as Sentry from "@sentry/nextjs";

/**
 * Sentry edge runtime configuration.
 *
 * Captures errors in middleware (auth, org resolution, security headers).
 * Middleware is the front door — errors here block ALL requests.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // Capture ALL edge errors — middleware failures are critical
  sampleRate: 1.0,

  // Performance: sample 10% (middleware runs on every request, would be noisy)
  tracesSampleRate: 0.1,

  initialScope: {
    tags: {
      platform: "entry",
      runtime: "edge",
    },
  },
});
