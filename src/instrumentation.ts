import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook.
 *
 * Initializes Sentry for both Node.js and Edge runtimes.
 * Called once at server startup before any request handling.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Captures errors from nested React Server Components.
 * Next.js calls this when a server component throws during rendering.
 */
export const onRequestError = Sentry.captureRequestError;
