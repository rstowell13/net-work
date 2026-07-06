/**
 * Shared helpers for JSON API routes under app/api/.
 *
 * `requireUser()` in lib/auth.ts is for page components — on a missing
 * session it `redirect()`s to /login, which is wrong for a JSON API (an
 * expired session gets a 307 to an HTML page and the client's `r.json()`
 * chokes). Route handlers should use `requireUserApi()` instead, and
 * `handleApi()` to get a uniform `{ error: code }` envelope.
 */
import "server-only";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

/** Like `requireUser()`, but for API routes: throws instead of redirecting. */
export async function requireUserApi() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("unauthorized", 401);
  return user;
}

/**
 * Shared contact-ownership guard. Matches the majority behavior of the
 * copy-pasted checks it replaces: scoped to `userId`, does NOT filter
 * soft-deleted (`deletedAt`) contacts. Throws `ApiError("not_found", 404)`
 * if no matching row exists.
 */
export async function requireOwnedContact(userId: string, contactId: string) {
  const [contact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(
      and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, userId)),
    )
    .limit(1);
  if (!contact) throw new ApiError("not_found", 404);
  return contact;
}

/**
 * Wraps a route handler body: catches `ApiError` and returns its code/status
 * as `{ error: code }`; catches anything else, logs it server-side, and
 * returns a generic 500 — never leaks `e.message` to the client.
 */
export function handleApi<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.code }, { status: e.status });
      }
      console.error(e);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  };
}

// Known plain-Error messages thrown by lib/merge/apply.ts + partition-plan.ts,
// mapped to their machine-readable ApiError code + status. `candidate_status_*`
// is dynamic (templated with the candidate's current status — approved,
// split, or skipped) and means "already resolved", so it maps to 409.
const MERGE_ERROR_STATUS: Record<string, number> = {
  candidate_not_found: 404,
  contact_not_found: 404,
  survivor_not_found: 404,
  // Atomic-claim loser (concurrent apply/partition raced this one) — conflict.
  candidate_already_resolved: 409,
  same_contact: 400,
  need_at_least_two: 400,
  invalid_raw_id: 400,
  candidate_empty: 400,
  invalid_buckets: 400,
  no_records_assigned: 400,
  keep_contact_not_involved: 400,
  raw_not_in_candidate: 400,
  raw_assigned_twice: 400,
  duplicate_keep_contact: 400,
};

/**
 * Maps a raw Error thrown by the merge lib to an ApiError, using its
 * known snake_case-ish message vocabulary. `candidate_status_*` (candidate
 * already approved/split/skipped) → 409. Anything unrecognized → internal 500
 * (never re-throws the original message to the client).
 */
export function mergeErrorToApiError(e: unknown): ApiError {
  const message = e instanceof Error ? e.message : String(e);
  if (message.startsWith("candidate_status_")) {
    return new ApiError(message, 409);
  }
  const status = MERGE_ERROR_STATUS[message];
  if (status) return new ApiError(message, status);
  console.error(e);
  return new ApiError("internal", 500);
}
