import { fileURLToPath } from "url";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow neon.athyper.local (Traefik gateway) to access Next.js dev resources
  // (HMR WebSocket, API routes). Without this, Next.js 16.x blocks cross-origin
  // requests from origins other than localhost in development.
  allowedDevOrigins: ["neon.athyper.local"],

  // F8 Phase 3 — standalone build for containerised staging/prod deploys.
  // Emits .next/standalone/ with a minimal server.js + only the node_modules
  // actually imported at runtime. Image size target: < 200 MB. Local `pnpm dev`
  // and `pnpm build` outside the container are unaffected.
  //
  // outputFileTracingRoot points at the monorepo root so Next traces
  // workspace-package imports (all the `@athyper/*` transpilePackages below)
  // into the standalone bundle — without it, standalone misses those deps.
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  serverExternalPackages: ["redis"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: [
    "@athyper/ui",
    "@athyper/shell",
    "@athyper/navigation",
    "@athyper/icons",
    "@athyper/theme",
    "@athyper/brand",
    "@athyper/auth",
    "@athyper/i18n",
    "@athyper/api-contracts",
    "@athyper/api-client",
    "@athyper/query",
    "@athyper/metadata-client",
    "@athyper/domain-widgets",
    "@athyper/entity-runtime",
    "@athyper/document-runtime",
    "@athyper/content-ui",
    "@athyper/workflow-ui",
    "@athyper/collaboration-ui",
    "@athyper/finance-workbench",
  ],

  async redirects() {
    return [
      // ── Core ───────────────────────────────────────────────────────────────
      { source: "/home",              destination: "/dashboard",          permanent: true },
      { source: "/workbench/admin",   destination: "/dashboard",          permanent: true },
      { source: "/workbench/partner", destination: "/dashboard",          permanent: true },
      { source: "/workbench/user",    destination: "/dashboard",          permanent: true },

      // ── Finance workbench (ledger → finance) ───────────────────────────────
      { source: "/ledger/coa",            destination: "/finance/coa",    permanent: true },
      { source: "/ledger/gl-workbench",   destination: "/finance/gl",     permanent: true },
      { source: "/ledger/finance-admin",  destination: "/finance/admin",  permanent: true },
      // Dynamic ledger views: /ledger/journal → /finance/views/journal
      {
        source:      "/ledger/:viewCode",
        destination: "/finance/views/:viewCode",
        permanent:   true,
      },

      // ── Entity runtime (master + document → /app) ──────────────────────────
      // /master/:entity → /app/:entity  (list page)
      {
        source:      "/master/:entity",
        destination: "/app/:entity",
        permanent:   true,
      },
      // /master/:entity/:rest* → /app/:entity/:rest*  (detail, edit, etc.)
      {
        source:      "/master/:entity/:rest*",
        destination: "/app/:entity/:rest*",
        permanent:   true,
      },
      // /document/:type → /app/:type  (list page)
      {
        source:      "/document/:type",
        destination: "/app/:type",
        permanent:   true,
      },
      // /document/:type/:rest* → /app/:type/:rest*  (detail, attachments, flow, etc.)
      {
        source:      "/document/:type/:rest*",
        destination: "/app/:type/:rest*",
        permanent:   true,
      },
    ];
  },
};

// Source-map upload fires during `next build` when SENTRY_AUTH_TOKEN is set.
// Without the token the wrapper is a no-op — safe for local dev and CI jobs
// that build the app without observability secrets.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sentryUrl: process.env.SENTRY_URL,

  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  hideSourceMaps: true,
  reactComponentAnnotation: { enabled: false },
  tunnelRoute: undefined,
});
