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
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: [
    "@athyper/brand",
    "@athyper/auth-bff",
    "@athyper/i18n",
    "@athyper/identity-gate",
    "@athyper/app-mesh",
    "@athyper/app-mesh-navigation",
    "@athyper/app-mesh-route-manifest",
    "@athyper/app-mesh-shell",
    "@athyper/mesh-exchange-contracts",
    "@athyper/navigation-core",
    "@athyper/route-manifest-core",
    "@athyper/session-plane",
    "@athyper/session-store",
    "@athyper/shell",
    "@athyper/shell-runtime",
    "@athyper/surface-kit",
    "@athyper/theme",
    "@athyper/ui",
  ],
};

export default nextConfig;
