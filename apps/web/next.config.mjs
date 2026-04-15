import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    "@athyper/auth",
    "@athyper/i18n",
    "@athyper/api-contracts",
    "@athyper/api-client",
    "@athyper/query",
    "@athyper/metadata-client",
    "@athyper/domain-widgets",
    "@athyper/entity-runtime",
    "@athyper/document-runtime",
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

export default nextConfig;
