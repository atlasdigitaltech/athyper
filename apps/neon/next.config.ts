import type { NextConfig } from "next";
const config: NextConfig = {
  ...(process.env["ATHYPER_NEXT_DIST_DIR"]
    ? { distDir: process.env["ATHYPER_NEXT_DIST_DIR"] }
    : {}),
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: [
    ...(process.env["LOCAL_DEV_ALLOWED_ORIGIN"]
      ? [process.env["LOCAL_DEV_ALLOWED_ORIGIN"]]
      : []),
    "neon.athyper.local",
  ],
  transpilePackages: [
    "@athyper/platform-theme",
    "@athyper/platform-shell-app-foundation",
    "@athyper/product-neon-shell",
  ],
};
export default config;
