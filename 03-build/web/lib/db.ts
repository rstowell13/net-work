/**
 * Drizzle Postgres client.
 * Server-only — never import from client components.
 */
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

// Prefer the transaction-mode pooler (Supabase port 6543) when it's
// configured — far higher concurrency than the session-mode pooler
// (port 5432, pool_size=15) which exhausts under serverless.
const databaseUrl = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

// One connection per process — both in dev (HMR safe) and in prod
// (serverless functions are short-lived and the Supabase pooler in
// session mode caps at 15 clients). Multiple connections per function
// stack up fast across parallel Vercel invocations and exhaust the pool
// — `EMAXCONNSESSION: max clients reached in session mode`.
//
// `idle_timeout: 20` and `max_lifetime` keep the connection short so it
// returns to the pooler quickly between invocations.
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.pgClient ??
  postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
