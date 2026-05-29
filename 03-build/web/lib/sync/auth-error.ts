/**
 * Classify a sync failure into the source status it should produce. Pure — no
 * deps, so it's unit-testable.
 *
 * An OAuth/credential failure (expired or revoked refresh token, missing token,
 * 401) means the source needs the user to reconnect — it should surface as
 * `needs_reauth` so the Sources UI shows a Reconnect button. Everything else
 * (quota, network, 5xx) is a transient `error` that a retry may clear.
 */
export function classifyFailureStatus(
  errorMessage: string,
): "needs_reauth" | "error" {
  const m = (errorMessage ?? "").toLowerCase();
  const authPatterns =
    /invalid_grant|invalid_token|invalid credentials|invalid authentication|unauthorized|\b401\b|expired or revoked|no oauth token|no refresh token|reauth/;
  return authPatterns.test(m) ? "needs_reauth" : "error";
}
