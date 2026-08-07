import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["admin.athyper.local"],
  reactStrictMode: false,
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  serverExternalPackages: ["redis"],
  transpilePackages: [
    "@athyper/app-foundation",
    "@athyper/platform-ai-agent-runtime",
    "@athyper/platform-ai-agent-ui",
    "@athyper/app-admin",
    "@athyper/api-contracts",
    "@athyper/brand",
    "@athyper/platform-iam-auth-common",
    "@athyper/platform-iam-auth-bff",
    "@athyper/cascade",
    "@athyper/collaboration-ui",
    "@athyper/dashboard-ui",
    "@athyper/app-admin-command-hub",
    "@athyper/app-admin-navigation",
    "@athyper/app-admin-route-manifest",
    "@athyper/app-admin-shell",
    "@athyper/finance-rules",
    "@athyper/icons",
    "@athyper/i18n",
    "@athyper/platform-iam-identity-gate",
    "@athyper/me-ui",
    "@athyper/meta-entity-authoring-contracts",
    "@athyper/meta-entity-runtime",
    "@athyper/meta-entity-studio-ui",
    "@athyper/query",
    "@athyper/runtime-contracts",
    "@athyper/runtime-list",
    "@athyper/navigation-core",
    "@athyper/platform-communications-notifications-client",
    "@athyper/route-manifest-core",
    "@athyper/platform-iam-session-store",
    "@athyper/platform-iam-session-plane",
    "@athyper/temporal",
    "@athyper/shell",
    "@athyper/shell-runtime",
    "@athyper/runtime-shared",
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
