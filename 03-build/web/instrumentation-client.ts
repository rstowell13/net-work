/**
 * Sentry browser-runtime init. Next.js auto-loads this file.
 *
 * Note: SENTRY_DSN (server env var) is not exposed to the browser bundle by
 * default — only NEXT_PUBLIC_-prefixed vars are. Per the env contract, we
 * only have SENTRY_DSN (server-side), so browser-side capture stays off
 * until a NEXT_PUBLIC_SENTRY_DSN is added deliberately. This file exists so
 * Next's client instrumentation hook is present; it is a no-op today.
 */
