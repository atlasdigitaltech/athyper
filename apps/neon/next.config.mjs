import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["neon.athyper.local"],
  reactStrictMode: false,
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  serverExternalPackages: ["redis"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: [
    "@athyper/app-neon",
    "@athyper/runtime-list",
    "@athyper/brand",
    "@athyper/api-contracts",
    "@athyper/auth-bff",
    "@athyper/app-neon-command-hub",
    "@athyper/app-neon-navigation",
    "@athyper/app-neon-route-manifest",
    "@athyper/app-neon-shell",
    "@athyper/i18n",
    "@athyper/identity-gate",
    "@athyper/entity-print",
    "@athyper/icons",
    "@athyper/navigation-core",
    "@athyper/route-manifest-core",
    "@athyper/runtime-contracts",
    "@athyper/runtime-canvas",
    "@athyper/runtime-shared",
    "@athyper/session-plane",
    "@athyper/session-store",
    "@athyper/shell",
    "@athyper/shell-runtime",
    "@athyper/surface-kit",
    "@athyper/theme",
    "@athyper/ui",
  ],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/home", destination: "/dashboard", permanent: true },
      { source: "/master/:entity", destination: "/app/:entity", permanent: true },
      { source: "/master/:entity/:rest*", destination: "/app/:entity/:rest*", permanent: true },
      { source: "/document/:type", destination: "/app/:type", permanent: true },
      { source: "/document/:type/:rest*", destination: "/app/:type/:rest*", permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Preserve public auth URLs while routing through a dev-safe internal namespace.
        { source: "/api/auth/:path*", destination: "/api/bff-auth/:path*" },
      ],
    };
  },
};

export default nextConfig;
