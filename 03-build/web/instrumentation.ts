/**
 * Next.js instrumentation hook — runs once per server/edge runtime start.
 * Loads the matching Sentry config, which is itself a no-op when
 * SENTRY_DSN is unset (see sentry.server.config.ts / sentry.edge.config.ts).
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// No-op (undefined) when SENTRY_DSN is unset — nothing calls into Sentry.
export const onRequestError = process.env.SENTRY_DSN
  ? Sentry.captureRequestError
  : undefined;
