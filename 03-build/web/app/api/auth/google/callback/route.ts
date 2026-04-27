/**
 * Completes the Google OAuth flow. Validates the state cookie, exchanges
 * the code for tokens, and creates Source + OAuthToken rows for each of
 * Google Contacts, Gmail, and Google Calendar (one consent grants all three).
 *
 * Refs: ROADMAP M2.2
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { googleOAuthClient } from "@/lib/google";
import { getCurrentUser } from "@/lib/auth";
import { upsertSource, setOAuthToken, type SourceKind } from "@/lib/sources";

const GOOGLE_KINDS: SourceKind[] = ["google_contacts", "gmail", "google_calendar"];

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/sources?error=${encodeURIComponent(error)}`, request.url),
    );
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL("/settings/sources?error=missing_code", request.url),
    );
  }

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get("google_oauth_state")?.value;
  if (!stateCookie || stateCookie !== stateParam) {
    return NextResponse.redirect(
      new URL("/settings/sources?error=state_mismatch", request.url),
    );
  }
  // One-shot cookie
  cookieStore.delete("google_oauth_state");

  // Exchange the code for tokens
  const oauth2 = googleOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const expiryMs = tokens.expiry_date;
  const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);

  if (!accessToken || !refreshToken || !expiryMs) {
    return NextResponse.redirect(
      new URL("/settings/sources?error=incomplete_tokens", request.url),
    );
  }

  const expiresAt = new Date(expiryMs);

  // Pull the Google account email for storage in Source.config (so the user
  // can see which Google account they connected).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenInfo: any = await oauth2.getTokenInfo(accessToken);
  const googleEmail = (tokenInfo?.email ?? null) as string | null;

  // Create Source + OAuthToken rows for each kind
  for (const kind of GOOGLE_KINDS) {
    const source = await upsertSource({
      userId: user.id,
      kind,
      status: "connected",
      config: googleEmail ? { google_email: googleEmail } : undefined,
    });
    await setOAuthToken({
      sourceId: source.id,
      accessToken,
      refreshToken,
      expiresAt,
      scopes,
    });
  }

  return NextResponse.redirect(
    new URL("/settings/sources?connected=google", request.url),
  );
}
