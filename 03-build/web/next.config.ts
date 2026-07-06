import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Pin Turbopack to this directory. Without this, a stray package-lock.json
  // higher in the filesystem can cause Next.js to misidentify the project
  // root and fail to locate middleware.ts.
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["192.168.86.87"],
};

// withSentryConfig only adds build-time source-map upload/release wiring —
// harmless without a DSN, but skip it entirely when Sentry isn't configured
// so a build with no env vars never attempts a Sentry API call.
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
