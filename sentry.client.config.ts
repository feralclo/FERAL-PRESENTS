import * as Sentry from "@sentry/nextjs";

/**
 * Sentry client-side configuration.
 *
 * Captures browser errors, unhandled rejections, and performance data
 * from ticket buyers and admin users.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production (don't pollute with dev errors)
  enabled: process.env.NODE_ENV === "production",

  // Sample 100% of errors (critical for a payment platform — don't miss anything)
  sampleRate: 1.0,

  // Performance: sample 20% of transactions (enough for insights, not noisy)
  tracesSampleRate: 0.2,

  // Session replay: capture 5% normally, 100% on error
  // This lets you watch exactly what a user did before a crash
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text on payment/checkout pages for PCI compliance
      maskAllText: false,
      blockAllMedia: false,
      maskAllInputs: true,
    }),
    Sentry.browserTracingIntegration(),
  ],

  // Tag every error with the org_id for multi-tenant filtering
  initialScope: {
    tags: {
      platform: "entry",
    },
  },

  // Filter out noise — browser extensions, bots, chunk load errors (already handled)
  beforeSend(event) {
    const message = event.exception?.values?.[0]?.value || "";

    // ChunkLoadError — already handled by global-error.tsx (auto-reload)
    if (
      message.includes("ChunkLoadError") ||
      message.includes("Loading chunk") ||
      message.includes("Failed to fetch dynamically imported module")
    ) {
      return null;
    }

    // Browser extension errors (not our code)
    if (
      message.includes("chrome-extension://") ||
      message.includes("moz-extension://") ||
      message.includes("safari-extension://")
    ) {
      return null;
    }

    // ResizeObserver loop errors (benign, from browser layout)
    if (message.includes("ResizeObserver loop")) {
      return null;
    }

    // Network errors from ad blockers killing tracking scripts
    if (
      message.includes("connect.facebook.net") ||
      message.includes("googletagmanager.com")
    ) {
      return null;
    }

    return event;
  },

  // Ignore common noisy errors that don't indicate real problems
  ignoreErrors: [
    // Network errors (user's connection, not platform issues)
    "NetworkError",
    "Failed to fetch",
    "Load failed",
    "Network request failed",
    // Cancelled navigations
    "AbortError",
    "The operation was aborted",
    // Safari-specific
    "The request is not allowed by the user agent",
    // Stripe Elements internal errors (handled by Stripe)
    "StripeTerminalError",
  ],
});
