/**
 * Drizzle Postgres client.
 * Server-only — never import from client components.
 */
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

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
  drizzleDb?: ReturnType<typeof drizzle<typeof schema>>;
};

// Lazy — the connection (and the "DATABASE_URL is not set" check) must not
// run at module-evaluation time, or `next build` fails whenever env vars
// are absent (e.g. CI, which builds with no secrets). Deferring to first
// actual query means the throw only happens at request time.
//
// The module-level cache makes getDb() construct AT MOST ONE client per
// process in every environment. (The globalThis cache additionally survives
// dev HMR module re-evaluation; module scope alone is enough in prod, where
// caching on globalThis is deliberately avoided so a stale client can't
// outlive a serverless sandbox reuse edge case.)
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDb() {
  if (cachedDb) return cachedDb;
  if (globalForDb.drizzleDb) return (cachedDb = globalForDb.drizzleDb);

  // Prefer the transaction-mode pooler (Supabase port 6543) when it's
  // configured — far higher concurrency than the session-mode pooler
  // (port 5432, pool_size=15) which exhausts under serverless.
  const databaseUrl =
    process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Missing required env var: DATABASE_URL (or DATABASE_URL_POOLED)",
    );
  }

  const client =
    globalForDb.pgClient ??
    postgres(databaseUrl, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
    });
  if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

  cachedDb = drizzle(client, { schema });
  if (process.env.NODE_ENV !== "production") globalForDb.drizzleDb = cachedDb;
  return cachedDb;
}

// Proxy so existing call sites (`db.select()`, `db.insert()`, ...) work
// unchanged, but the real client isn't constructed until the first property
// access — which only happens once a request actually runs a query.
//
// Methods are bound to the REAL drizzle instance (not the proxy): drizzle
// methods read internal state off `this`, and leaving `this` as the proxy
// would route those internal reads/writes through the trap against the empty
// target object. Bound-method cache keeps `db.select === db.select` stable.
const boundCache = new Map<PropertyKey, unknown>();
export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop) {
      const instance = getDb();
      const value = Reflect.get(instance, prop);
      if (typeof value !== "function") return value;
      let bound = boundCache.get(prop);
      if (!bound) {
        bound = (value as (...a: unknown[]) => unknown).bind(instance);
        boundCache.set(prop, bound);
      }
      return bound;
    },
  },
);
export { schema };
