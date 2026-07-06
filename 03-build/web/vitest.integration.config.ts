import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate config for the DB-touching integration suite (tests/integration/).
// Kept out of the default `vitest run` so the fast unit gate never needs a
// live Postgres. Run explicitly with `npm run test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // lib modules `import "server-only"` to block accidental client-side
      // imports. That guard throws outside the Next.js bundler (which is the
      // only thing that strips it), so under plain Node/Vitest it would
      // throw on import. Standard workaround: alias it to an empty module.
      "server-only": path.resolve(__dirname, "tests/integration/_server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    // DB fixtures + real queries are slower than the pure-function unit
    // suite; give individual tests more headroom before timing out.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ["tests/integration/_setup.ts"],
    // Migrations run ONCE for the whole suite here (globalSetup runs outside
    // per-file module isolation — see _global-setup.ts for why that matters:
    // CREATE TYPE isn't idempotent, so running it once per test file errors).
    globalSetup: ["tests/integration/_global-setup.ts"],
    // Every test file truncates the SAME database between tests (see
    // beforeEach in each suite). Running files in parallel workers would race
    // one file's truncateAll against another file's inserts. Force
    // sequential, single-process execution — this suite trades speed for
    // correctness, which is the right trade for a stretch integration suite.
    fileParallelism: false,
  },
});
