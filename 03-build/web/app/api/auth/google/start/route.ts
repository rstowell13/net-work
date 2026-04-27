/**
 * Initiates the Google OAuth flow. Redirects the user to Google's consent
 * screen with a CSRF state token bound to a cookie.
 *
 * Refs: ROADMAP M2.2
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { GOOGLE_SCOPES, googleOAuthClient } from "@/lib/google";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  // Require an authenticated user
  const user = await getCurrentUser();
  if (!user) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const oauth2 = googleOAuthClient();
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token even on subsequent grants
    scope: [...GOOGLE_SCOPES],
    state,
    include_granted_scopes: true,
  });

  return NextResponse.redirect(authUrl);
}
