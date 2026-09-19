import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: [
    ...(process.env["LOCAL_DEV_ALLOWED_ORIGIN"]
      ? [process.env["LOCAL_DEV_ALLOWED_ORIGIN"]]
      : []),
    "mesh.dev.athyper.test",
    "mesh.athyper.local",
  ],
  transpilePackages: [
    "@athyper/platform-theme",
    "@athyper/platform-shell-app-foundation",
    "@athyper/product-mesh-shell",
  ],
};
export default config;
