/**
 * Supabase server-side client (RSC, route handlers, server actions).
 * Uses Next 16 cookies API. Read 02-design + 03-build for usage.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Single-user app — extend Supabase auth cookies to 1 year
              // so the browser doesn't drop the session on restart.
              // Supabase still rotates the refresh token under the hood.
              const extended = name.startsWith("sb-")
                ? { ...options, maxAge: 60 * 60 * 24 * 365 }
                : options;
              cookieStore.set(name, value, extended);
            });
          } catch {
            // setAll called from RSC where we cannot mutate cookies — that's fine.
          }
        },
      },
    },
  );
}
