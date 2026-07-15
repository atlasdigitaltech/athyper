export type SharedPackageGroup = "api" | "auth" | "contract" | "navigation" | "runtime" | "session" | "ui" | "other";
export type SharedBusinessGroup =
  | "platform-auth"
  | "data-integration"
  | "ui-platform"
  | "runtime-domain"
  | "business-domain"
  | "shared-infrastructure";

export const sharedPackageGroups: Record<SharedPackageGroup, string[]> = {
  api: ["api-client", "api-contracts", "route-manifest-core", "bff-relay"],
  auth: ["auth-common", "auth-bff", "identity-gate"],
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
  session: ["session-store", "session-plane"],
  ui: [
    "ui",
    "theme",
    "surface-kit",
    "shell",
    "workflow-ui",
    "content-ui",
    "collaboration-ui",
    "me-ui",
    "brand",
    "icons",
  ],
  other: ["cascade", "config", "core", "domain-widgets", "entity-print", "i18n", "query", "print-templates", "temporal"],
};

export const sharedBusinessGroups: Record<SharedBusinessGroup, string[]> = {
  "platform-auth": ["auth-bff", "auth-common", "identity-gate", "session-plane", "session-store"],
  "data-integration": [
    "api-client",
    "api-contracts",
    "route-manifest-core",
    "metadata-client",
    "mesh-exchange-contracts",
    "query",
    "bff-relay",
    "core",
    "config",
    "navigation-core",
  ],
  "ui-platform": ["ui", "theme", "surface-kit", "shell", "workflow-ui", "content-ui", "collaboration-ui", "me-ui", "brand", "icons"],
  "runtime-domain": ["runtime-canvas", "runtime-contracts", "runtime-list", "runtime-add-item", "runtime-bulk-actions", "runtime-line-item", "runtime-shared", "shell-runtime"],
  "business-domain": ["finance-rules", "cascade", "entity-print", "print-templates", "temporal", "domain-widgets"],
  "shared-infrastructure": ["i18n"],
};

export const sharedPackageGroupAliases: Array<{ from: SharedPackageGroup; to: SharedBusinessGroup }> = [
  { from: "auth", to: "platform-auth" },
  { from: "api", to: "data-integration" },
  { from: "contract", to: "data-integration" },
  { from: "navigation", to: "ui-platform" },
  { from: "runtime", to: "runtime-domain" },
  { from: "session", to: "platform-auth" },
  { from: "ui", to: "ui-platform" },
  { from: "other", to: "business-domain" },
];

export const sharedPackageCatalog = [
  "api-client",
  "api-contracts",
  "auth-bff",
  "auth-common",
  "bff-relay",
  "brand",
  "cascade",
  "collaboration-ui",
  "config",
  "content-ui",
  "core",
  "domain-widgets",
  "entity-print",
  "finance-rules",
  "i18n",
  "icons",
  "identity-gate",
  "runtime-line-item",
  "me-ui",
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
  "session-plane",
  "session-store",
  "shell",
  "shell-runtime",
  "surface-kit",
  "temporal",
  "theme",
  "ui",
  "workflow-ui",
];

export const sharedPackageGroupMapVersion = "2026-07-14";
