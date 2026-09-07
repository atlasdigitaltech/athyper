import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: [
    "studio.dev.athyper.test",
    "studio.athyper.local",
    "admin.athyper.local",
  ],
  transpilePackages: [
    "@athyper/platform-theme",
    "@athyper/platform-shell-app-foundation",
    "@athyper/product-studio-shell",
  ],
};
export default config;
