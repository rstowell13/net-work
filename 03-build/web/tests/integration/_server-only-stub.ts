// Stub for the "server-only" package under Vitest. The real package throws
// when imported outside the Next.js bundler (which is what strips it in
// practice); the integration suite runs under plain Node, so it needs a
// no-op replacement. Aliased in vitest.integration.config.ts.
export {};
