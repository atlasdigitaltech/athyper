export type SharedPackageGroup = "api" | "contract" | "navigation" | "runtime" | "ui" | "other";
export type SharedBusinessGroup =
  | "data-integration"
  | "ui-platform"
  | "runtime-domain"
  | "business-domain"
  | "shared-infrastructure";

export const sharedPackageGroups: Record<SharedPackageGroup, string[]> = {
  api: ["api-client", "api-contracts", "route-manifest-core"],
  contract: ["mesh-exchange-contracts", "metadata-client", "runtime-shared", "finance-rules"],
  navigation: ["navigation-core"],
  runtime: [
    "runtime-canvas",
    "runtime-contracts",
    "runtime-list",
    "runtime-add-item",
    "runtime-bulk-actions",
    "runtime-line-item",
    "shell-runtime",
  ],
  ui: [
    "app-foundation",
    "atlas-agent-ui",
    "ui",
    "theme",
    "surface-kit",
    "shell",
    "workflow-ui",
    "content-ui",
    "content-hub-ui",
    "collaboration-ui",
    "dashboard-ui",
    "me-ui",
    "saved-views-ui",
    "setup-ui",
    "brand",
    "icons",
  ],
  other: ["cascade", "config", "core", "domain-widgets", "entity-print", "i18n", "query", "print-templates", "temporal"],
};

export const sharedBusinessGroups: Record<SharedBusinessGroup, string[]> = {
  "data-integration": [
    "api-client",
    "api-contracts",
    "route-manifest-core",
    "metadata-client",
    "mesh-exchange-contracts",
    "query",
    "core",
    "config",
    "navigation-core",
  ],
  "ui-platform": ["app-foundation", "atlas-agent-ui", "ui", "theme", "surface-kit", "shell", "workflow-ui", "content-ui", "content-hub-ui", "collaboration-ui", "dashboard-ui", "me-ui", "saved-views-ui", "setup-ui", "brand", "icons"],
  "runtime-domain": ["runtime-canvas", "runtime-contracts", "runtime-list", "runtime-add-item", "runtime-bulk-actions", "runtime-line-item", "runtime-shared", "shell-runtime"],
  "business-domain": ["finance-rules", "cascade", "entity-print", "print-templates", "temporal", "domain-widgets"],
  "shared-infrastructure": ["i18n"],
};

export const sharedPackageGroupAliases: Array<{ from: SharedPackageGroup; to: SharedBusinessGroup }> = [
  { from: "api", to: "data-integration" },
  { from: "contract", to: "data-integration" },
  { from: "navigation", to: "ui-platform" },
  { from: "runtime", to: "runtime-domain" },
  { from: "ui", to: "ui-platform" },
  { from: "other", to: "business-domain" },
];

export const sharedPackageCatalog = [
  "api-client",
  "api-contracts",
  "app-foundation",
  "atlas-agent-ui",
  "brand",
  "cascade",
  "collaboration-ui",
  "config",
  "content-ui",
  "content-hub-ui",
  "dashboard-ui",
  "core",
  "domain-widgets",
  "entity-print",
  "finance-rules",
  "i18n",
  "icons",
  "runtime-line-item",
  "me-ui",
  "saved-views-ui",
  "setup-ui",
  "mesh-exchange-contracts",
  "metadata-client",
  "navigation-core",
  "print-templates",
  "query",
  "route-manifest-core",
  "runtime-add-item",
  "runtime-bulk-actions",
  "runtime-canvas",
  "runtime-contracts",
  "runtime-list",
  "runtime-shared",
  "shell",
  "shell-runtime",
  "surface-kit",
  "temporal",
  "theme",
  "ui",
  "workflow-ui",
];

export const sharedPackageGroupMapVersion = "2026-07-25";
