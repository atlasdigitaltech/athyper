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

  // Disable React StrictMode double-invoke in development.
  // StrictMode intentionally mounts→unmounts→remounts every component, causing
  // every useQuery/fetch to fire twice (first "canceled", then 200). This is
  // development-only noise — production is unaffected — but it pollutes the
  // network tab and confuses debugging. Re-enable temporarily if you need to
  // audit for effects/ref cleanup bugs.
  reactStrictMode: false,

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
    "@athyper/runtime-shared",
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

      // Phase 1 workbench canonicalization: Commodity Categories is Supply Chain-owned.
      {
        source:      "/finance/spend-categories",
        destination: "/workbench/supply-chain/commodity-categories",
        permanent:   false,
      },
      {
        source:      "/workbench/finance/spend-categories",
        destination: "/workbench/supply-chain/commodity-categories",
        permanent:   false,
      },
      {
        source:      "/workbench/supply-chain/spend-categories",
        destination: "/workbench/supply-chain/commodity-categories",
        permanent:   false,
      },
      {
        source:      "/finance/commodity-categories",
        destination: "/workbench/supply-chain/commodity-categories",
        permanent:   false,
      },
      {
        source:      "/workbench/finance/commodity-categories",
        destination: "/workbench/supply-chain/commodity-categories",
        permanent:   false,
      },
      {
        source:      "/app/cc_supplier_spend_policy",
        destination: "/app/commodity-category-buy-policy?filter.scope_type=SUPPLIER_PROFILE",
        permanent:   false,
      },
      {
        source:      "/app/cc_supplier_spend_policy/:rest*",
        destination: "/app/commodity-category-buy-policy/:rest*",
        permanent:   false,
      },
      {
        source:      "/app/commodity_category_spend_policy",
        destination: "/app/commodity-category-buy-policy",
        permanent:   false,
      },
      {
        source:      "/app/commodity_category_spend_policy/:rest*",
        destination: "/app/commodity-category-buy-policy/:rest*",
        permanent:   false,
      },
      {
        source:      "/app/commodity_category_sales_policy",
        destination: "/app/commodity-category-sell-policy",
        permanent:   false,
      },
      {
        source:      "/app/commodity_category_sales_policy/:rest*",
        destination: "/app/commodity-category-sell-policy/:rest*",
        permanent:   false,
      },
      {
        source:      "/app/classification_to_intent_rule",
        destination: "/app/commodity-classification-to-intent-rule",
        permanent:   false,
      },
      {
        source:      "/app/classification_to_intent_rule/:rest*",
        destination: "/app/commodity-classification-to-intent-rule/:rest*",
        permanent:   false,
      },
      {
        source:      "/app/classification_config",
        destination: "/app/commodity-classification-config",
        permanent:   false,
      },
      {
        source:      "/app/classification_config/:rest*",
        destination: "/app/commodity-classification-config/:rest*",
        permanent:   false,
      },

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
  hideSourceMaps: true,
  tunnelRoute: undefined,
  webpack: {
    treeshake: { removeDebugLogging: true },
    reactComponentAnnotation: { enabled: false },
  },
});
