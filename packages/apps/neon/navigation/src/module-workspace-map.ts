/**
 * @athyper/navigation — Module → Workspace static mapping
 *
 * Used by deriveNavTree() to group RuntimeModule[] into workspace buckets
 * when the full WorkspaceNode[] from the platform API is not available.
 *
 * Source of truth: shared.module rows in the DB; this map mirrors the
 * workspace_id relationships. Keep in sync with module-icons.ts groupings.
 */

/** Maps module code → workspace key (matching shared.workspace.key column). */
export const MODULE_WORKSPACE_MAP: Record<string, string> = {
  // ── Core (workspace_id IS NULL — never shown in workspace rail) ──
  FND:       "core",
  META:      "core",
  IAM:       "core",
  AUD:       "core",
  POL:       "core",
  WFL:       "core",
  JOB:       "core",
  DOC:       "core",
  NTF:       "core",
  INT:       "core",
  CMS:       "core",
  ACT:       "core",
  REL:       "core",

  // ── Finance ──────────────────────────────────────────────────────────
  ACC:       "finance",
  PAY:       "finance",
  TREASURY:  "finance",
  BUDGET:    "finance",
  PAYG:      "finance",

  // ── Supply Chain ─────────────────────────────────────────────────────
  SRM:       "supply-chain",
  SOURCE:    "supply-chain",
  CONTRACT:  "supply-chain",
  BUY:       "supply-chain",
  INVENTORY: "supply-chain",
  QMS:       "supply-chain",
  SUBCON:    "supply-chain",
  DEMAND:    "supply-chain",
  WMS:       "supply-chain",
  LOGISTICS: "supply-chain",

  // ── Customer Experience ───────────────────────────────────────────────
  CRM:       "customer-experience",
  SALE:      "customer-experience",

  // ── People Management ─────────────────────────────────────────────────
  HR:        "people-management",
  PAYROLL:   "people-management",

  // ── Project Management ────────────────────────────────────────────────
  PRJCOST:   "project-management",
  ITSM:      "project-management",

  // ── Manufacturing & Operations ────────────────────────────────────────
  MAINT:     "manufacturing-operations",
  MFG:       "manufacturing-operations",

  // ── Asset Management ──────────────────────────────────────────────────
  ASSET:     "asset-management",
  ASSETREMS: "asset-management",
  ASSETFM:   "asset-management",

  // ── Partner Management ────────────────────────────────────────────────
};

/** Display labels for each workspace key. */
export const WORKSPACE_LABELS: Record<string, string> = {
  "finance":              "Finance",
  "supply-chain":         "Supply chain",
  "customer-experience":  "Customer experience",
  "people-management":    "People",
  "project-management":   "Projects",
  "manufacturing-operations": "Manufacturing",
  "asset-management":     "Assets",
};

/** Maps workspace key → landing page URL (used for right-click "Open in new tab" on rail icons). */
export const WORKSPACE_HREF_MAP: Record<string, string> = {
  "finance":                  "/finance",
  "supply-chain":             "/supply-chain",
  "customer-experience":      "/customer-experience",
  "people-management":        "/people",
  "project-management":       "/projects",
  "manufacturing-operations": "/manufacturing",
  "asset-management":         "/asset-management",
};

/** Sort order for workspaces in the rail (lower = higher). */
export const WORKSPACE_SORT_ORDER: Record<string, number> = {
  "finance":                  0,
  "supply-chain":             1,
  "customer-experience":      2,
  "people-management":        3,
  "project-management":       4,
  "manufacturing-operations": 5,
  "asset-management":         6,
};

/** Core module sub-group assignments for the ContextPanel. */
export const CORE_GROUPS: Array<{ label: string; codes: string[] }> = [
  { label: "Runtime",  codes: ["FND", "META", "IAM", "AUD"] },
  { label: "Engines",  codes: ["POL", "WFL", "JOB"] },
  { label: "Services", codes: ["DOC", "NTF", "INT", "CMS", "ACT", "REL"] },
];

/** Reserved partner-module groups removed from Neon navigation (handled in Mesh plane). */
export const PARTNER_GROUPS: Array<{ label: string; codes: string[] }> = [];
