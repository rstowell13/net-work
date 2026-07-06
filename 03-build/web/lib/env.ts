/**
 * Env var contract for the app.
 *
 * CRITICAL: `npm run build` must succeed with NO env vars set (CI has none;
 * Vercel preview builds may lack some). So nothing here throws at import
 * time. `checkEnv()` is an opt-in diagnostic (logs, doesn't throw) you can
 * call from a script or a health route. The `requireX()` getters throw a
 * named-var error, but only when a caller actually invokes them at request
 * time — never at module evaluation.
 */

const REQUIRED_VARS = [
  "DATABASE_URL",
  "DATABASE_URL_POOLED",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "APP_OWNER_EMAIL",
  "CRON_SECRET",
] as const;

const OPTIONAL_VARS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_FALLBACK_MODELS",
  "SENTRY_DSN",
] as const;

type RequiredVar = (typeof REQUIRED_VARS)[number];

/**
 * Logs which required vars are missing. Does not throw — safe to call
 * during build or at startup for a diagnostic. Returns true if everything
 * required is present.
 */
export function checkEnv(): boolean {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.warn(
      `[env] missing ${missing.length} required var(s): ${missing.join(", ")}`,
    );
  }
  const missingOptional = OPTIONAL_VARS.filter((name) => !process.env[name]);
  if (missingOptional.length > 0) {
    console.warn(
      `[env] optional var(s) not set (feature degrades gracefully): ${missingOptional.join(", ")}`,
    );
  }
  return missing.length === 0;
}

/**
 * Get a required env var, throwing a precise, named error if it's unset.
 * Call this at first RUNTIME use (inside a function body / request path),
 * never at module top-level — otherwise it defeats the point.
 */
export function requireEnv(name: RequiredVar): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/** Optional env var — returns undefined if unset, never throws. */
export function optionalEnv(
  name: (typeof OPTIONAL_VARS)[number],
): string | undefined {
  return process.env[name] || undefined;
}
