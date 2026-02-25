import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server-side configuration.
 *
 * Captures server component errors, API route crashes, and
 * unhandled exceptions in Node.js runtime.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // Capture ALL server errors — these are the ones that matter most
  sampleRate: 1.0,

  // Performance: sample 20% of server transactions
  tracesSampleRate: 0.2,

  // Tag every error for multi-tenant filtering
  initialScope: {
    tags: {
      platform: "entry",
      runtime: "node",
    },
  },

  // Enrich server errors with additional context
  beforeSend(event) {
    // Don't report expected auth redirects
    const message = event.exception?.values?.[0]?.value || "";
    if (message.includes("NEXT_REDIRECT")) {
      return null;
    }

    return event;
  },
});
