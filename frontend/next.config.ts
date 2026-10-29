import type { NextConfig } from "next";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

// Load monorepo root `.env` / `.env.local` (same file backend uses)
const monorepoRoot = path.join(__dirname, "..");
loadEnvConfig(monorepoRoot);

const nextConfig: NextConfig = {
  // Desktop app: self-contained server the Electron shell runs on loopback.
  ...(process.env.CAPSCREEN_DESKTOP_BUILD === "1" ? { output: "standalone" as const } : {}),
  // pnpm workspace: pin Turbopack root so it resolves `next` correctly.
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
  async redirects() {
    return [
      {
        source: "/projects",
        destination: "/startups",
        permanent: true,
      },
      {
        source: "/projects/:path*",
        destination: "/startups/:path*",
        permanent: true,
      },
      {
        source: "/ai",
        destination: "/settings/ai",
        permanent: false,
      },
      {
        source: "/account/models",
        destination: "/settings/ai",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
