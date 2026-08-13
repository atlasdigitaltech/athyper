import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", poweredByHeader: false, reactStrictMode: true, allowedDevOrigins: ["neon.athyper.local"], transpilePackages: ["@athyper/platform-theme", "@athyper/platform-shell-app-foundation", "@athyper/product-neon-shell"] };
export default config;
