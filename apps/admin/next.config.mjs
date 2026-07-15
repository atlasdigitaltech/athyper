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
    "@athyper/api-contracts",
    "@athyper/brand",
    "@athyper/auth-common",
    "@athyper/auth-bff",
    "@athyper/cascade",
    "@athyper/collaboration-ui",
    "@athyper/app-admin-command-hub",
    "@athyper/app-admin-navigation",
    "@athyper/app-admin-route-manifest",
    "@athyper/app-admin-shell",
    "@athyper/finance-rules",
    "@athyper/icons",
    "@athyper/i18n",
    "@athyper/identity-gate",
    "@athyper/query",
    "@athyper/runtime-contracts",
    "@athyper/runtime-list",
    "@athyper/navigation-core",
    "@athyper/route-manifest-core",
    "@athyper/session-store",
    "@athyper/session-plane",
    "@athyper/temporal",
    "@athyper/shell",
    "@athyper/shell-runtime",
    "@athyper/runtime-shared",
    "@athyper/surface-kit",
    "@athyper/theme",
    "@athyper/ui",
  ],
  webpack: (config) => config,
  turbopack: {},
};

export default nextConfig;
