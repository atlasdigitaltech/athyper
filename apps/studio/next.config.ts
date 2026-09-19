import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  ...(process.env["ATHYPER_NEXT_DIST_DIR"]
    ? { distDir: process.env["ATHYPER_NEXT_DIST_DIR"] }
    : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: [
    ...(process.env["LOCAL_DEV_ALLOWED_ORIGIN"]
      ? [process.env["LOCAL_DEV_ALLOWED_ORIGIN"]]
      : []),
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
