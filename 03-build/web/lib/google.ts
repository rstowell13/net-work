/**
 * Google OAuth2 client + scope definitions.
 * One consent flow grants Contacts + Gmail + Calendar in a single auth code.
 *
 * Refs: ROADMAP M2.2, M2.9
 */
import { google, type Auth } from "googleapis";

export const GOOGLE_SCOPES = [
  // Contacts (read-only directory + connections)
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  // Gmail (read-only)
  "https://www.googleapis.com/auth/gmail.readonly",
  // Calendar (read-only)
  "https://www.googleapis.com/auth/calendar.readonly",
  // Email used as identity check
  "openid",
  "email",
] as const;

export function googleOAuthClient(): Auth.OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth env vars (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Build a fully-authorized client for a stored OAuthToken row.
 * Caller is responsible for handling token refresh side-effects
 * (the Google client will refresh transparently if the refresh_token is valid).
 */
export function clientFromTokens(args: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}): Auth.OAuth2Client {
  const c = googleOAuthClient();
  c.setCredentials({
    access_token: args.accessToken,
    refresh_token: args.refreshToken,
    expiry_date: args.expiresAt.getTime(),
    scope: args.scopes.join(" "),
    token_type: "Bearer",
  });
  return c;
}
