/**
 * Sentry edge-runtime config (proxy.ts / middleware). Loaded by
 * instrumentation.ts. Complete no-op when SENTRY_DSN is unset.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
