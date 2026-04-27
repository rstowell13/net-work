import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack to this directory. Without this, a stray package-lock.json
  // higher in the filesystem can cause Next.js to misidentify the project
  // root and fail to locate middleware.ts.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
