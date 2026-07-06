import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // tests/integration/ is a separate DB-touching suite with its own config
    // (vitest.integration.config.ts) — must never run under the default gate.
    exclude: ["tests/integration/**", "**/node_modules/**"],
    environment: "node",
  },
});
