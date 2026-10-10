import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // This folder is the project root even if other lockfiles exist higher up.
  outputFileTracingRoot: path.resolve(process.cwd()),
  // Playwright drives a local Chromium for PDF export; keep it out of the server bundle.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
