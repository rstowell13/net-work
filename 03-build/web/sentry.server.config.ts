/**
 * Sentry server-runtime config. Loaded by instrumentation.ts. Complete
 * no-op when SENTRY_DSN is unset — Sentry.init is never called, so there's
 * no network activity and no behavior change.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
