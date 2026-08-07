import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["mesh.athyper.local"],
  reactStrictMode: false,
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  serverExternalPackages: ["redis"],
  transpilePackages: [
    "@athyper/app-foundation",
    "@athyper/api-contracts",
    "@athyper/dashboard-ui",
    "@athyper/brand",
    "@athyper/platform-iam-auth-bff",
    "@athyper/i18n",
    "@athyper/platform-iam-identity-gate",
    "@athyper/app-mesh",
    "@athyper/app-mesh-navigation",
    "@athyper/app-mesh-route-manifest",
    "@athyper/app-mesh-shell",
    "@athyper/mesh-exchange-contracts",
    "@athyper/me-ui",
    "@athyper/navigation-core",
    "@athyper/platform-communications-notifications-client",
    "@athyper/route-manifest-core",
    "@athyper/runtime-canvas",
    "@athyper/runtime-contracts",
    "@athyper/runtime-shared",
    "@athyper/platform-iam-session-plane",
    "@athyper/platform-iam-session-store",
    "@athyper/shell",
    "@athyper/shell-runtime",
    "@athyper/surface-kit",
    "@athyper/platform-theme",
    "@athyper/ui",
  ],
  async headers() {
    return [{
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    }];
  },
};

export default nextConfig;
