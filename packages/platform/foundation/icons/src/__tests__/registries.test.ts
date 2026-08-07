/**
 * @athyper/platform-icons — Registry Tests
 *
 * Verifies that every known code resolves to a non-null icon component
 * and that unknown/empty inputs always return the fallback (CircleHelp).
 *
 * Run with: pnpm --filter @athyper/platform-icons test
 */
import { describe, it, expect } from "vitest";
import { CircleHelp } from "lucide-react";

import { getModuleIcon, hasModuleIcon, resolveModuleIcon } from "../module-icons";
import { getWorkspaceIcon, hasWorkspaceIcon, resolveWorkspaceIcon } from "../workspace-icons";
import { getEntityClassIcon } from "../entity-class-icons";
import { getEntityIcon, hasEntityIcon } from "../entity-icons";
import { getEntityColorClasses } from "../color-tokens";
import { getActionIcon, getHandlerTypeIcon, getRegisteredActions } from "../action-icons";
import { getStatusIcon } from "../status-icons";
import { type SemanticIntent } from "@athyper/platform-theme/semantic-colors";

function expectIconComponent(icon: unknown): void {
  expect(icon).toBeDefined();
  expect(["function", "object"]).toContain(typeof icon);
}

// ── Module Icons ────────────────────────────────────────────────

const ALL_MODULE_CODES = [
  // ── Athyper Plane (31) ──────────────────────────────────────
  // Atlas AI Studio
  "AIP", "AGT", "KNW", "AIG",
  // Entity Studio
  "META", "POL", "WFL", "DOC", "CMS",
  // Platform Foundation
  "FND", "REF", "CORE",
  // TrustIAM Studio
  "IAM", "ONB", "AUD",
  // Plans & Entitlements Studio
  "SUB", "ENT", "USG",
  // Observability Studio
  "OBS", "ERR", "SRE",
  // Communications Studio
  "NTF", "ACT",
  // Integration & Automation Studio
  "INT", "JOB",
  // Extension Studio
  "EXT", "DEV",
  // Platform Operations Studio
  "OPS", "SEC", "SEA", "ANA",

  // ── Neon Plane (26) ─────────────────────────────────────────
  // Finance
  "ACC", "PAY", "TREASURY", "BUDGET", "PAYG",
  // Supply Chain
  "SRM", "SOURCE", "CONTRACT", "BUY", "INVENTORY", "QMS", "SUBCON", "DEMAND", "WMS", "LOGISTICS",
  // Commercial
  "CRM", "SALE",
  // People
  "HR", "PAYROLL",
  // Projects & Services
  "PRJCOST", "ITSM",
  // Operations
  "MAINT", "MFG",
  // Assets & Facilities
  "ASSET", "ASSETREMS", "ASSETFM",

  // ── Mesh Plane (7) ──────────────────────────────────────────
  "PCON", "OMI", "IMO", "CCON", "SOO", "SII", "LOGX",
];

describe("getModuleIcon", () => {
  it.each(ALL_MODULE_CODES)("resolves module code %s", (code) => {
    const icon = getModuleIcon(code);
    expectIconComponent(icon);
  });

  it("returns fallback (CircleHelp) for unknown code", () => {
    expect(getModuleIcon("UNKNOWN_XYZ")).toBe(CircleHelp);
  });

  it("returns fallback for empty string", () => {
    expect(getModuleIcon("")).toBe(CircleHelp);
  });

  it("normalizes module code casing and whitespace", () => {
    expect(getModuleIcon(" acc ")).toBe(getModuleIcon("ACC"));
    expect(hasModuleIcon(" fnd ")).toBe(true);
  });

  it("hasModuleIcon returns true for known codes", () => {
    expect(hasModuleIcon("ACC")).toBe(true);
    expect(hasModuleIcon("FND")).toBe(true);
    expect(hasModuleIcon("PCON")).toBe(true);
  });

  it("hasModuleIcon returns false for unknown code", () => {
    expect(hasModuleIcon("UNKNOWN")).toBe(false);
  });

  it(`covers all 64 module codes (got ${ALL_MODULE_CODES.length})`, () => {
    expect(ALL_MODULE_CODES).toHaveLength(64);
  });
});

describe("resolveModuleIcon", () => {
  const noOp = () => CircleHelp;

  it("returns hard-coded icon when icon_key is null", () => {
    expect(resolveModuleIcon("ACC", null, noOp)).toBe(getModuleIcon("ACC"));
  });

  it("returns entity icon when icon_key resolves to a non-fallback", () => {
    const fakeIcon = () => null;
    const fn = (_key: string) => fakeIcon as never;
    expect(resolveModuleIcon("ACC", "calculator", fn)).toBe(fakeIcon);
  });

  it("falls back to hard-coded icon when entity icon resolves to CircleHelp", () => {
    expect(resolveModuleIcon("ACC", "unknown-key-xyz", noOp)).toBe(getModuleIcon("ACC"));
  });
});

// ── Workspace Icons ─────────────────────────────────────────────

const ALL_WORKSPACE_KEYS = [
  // ── Athyper Plane (10) ──────────────────────────────────────
  "atlas-ai-studio",
  "entity-studio",
  "platform-foundation",
  "trustiam-studio",
  "plans-entitlements-studio",
  "observability-studio",
  "communications-studio",
  "integration-automation-studio",
  "extension-studio",
  "platform-operations-studio",

  // ── Neon Plane (7) ──────────────────────────────────────────
  "finance",
  "supply-chain",
  "commercial",
  "people",
  "projects-services",
  "operations",
  "assets-facilities",

  // ── Mesh Plane (1) ──────────────────────────────────────────
  "partner-collaboration",
];

describe("getWorkspaceIcon", () => {
  it.each(ALL_WORKSPACE_KEYS)("resolves workspace %s", (key) => {
    const icon = getWorkspaceIcon(key);
    expectIconComponent(icon);
  });

  it("returns fallback (CircleHelp) for unknown workspace", () => {
    expect(getWorkspaceIcon("unknown-workspace")).toBe(CircleHelp);
  });

  it("returns fallback for empty string", () => {
    expect(getWorkspaceIcon("")).toBe(CircleHelp);
  });

  it("normalizes workspace key casing and whitespace", () => {
    expect(getWorkspaceIcon(" Finance ")).toBe(getWorkspaceIcon("finance"));
  });

  it("hasWorkspaceIcon returns true for known keys", () => {
    expect(hasWorkspaceIcon("finance")).toBe(true);
    expect(hasWorkspaceIcon("atlas-ai-studio")).toBe(true);
    expect(hasWorkspaceIcon("partner-collaboration")).toBe(true);
  });

  it("hasWorkspaceIcon returns false for unknown keys", () => {
    expect(hasWorkspaceIcon("core")).toBe(false);          // stale key removed
    expect(hasWorkspaceIcon("customer-experience")).toBe(false); // stale key removed
    expect(hasWorkspaceIcon("unknown")).toBe(false);
  });

  it(`covers all 18 workspace keys (got ${ALL_WORKSPACE_KEYS.length})`, () => {
    expect(ALL_WORKSPACE_KEYS).toHaveLength(18);
  });
});

describe("resolveWorkspaceIcon", () => {
  const noOp = () => CircleHelp;

  it("returns hard-coded icon when icon_key is null", () => {
    expect(resolveWorkspaceIcon("finance", null, noOp)).toBe(getWorkspaceIcon("finance"));
  });

  it("returns entity icon when icon_key resolves to a non-fallback", () => {
    const fakeIcon = () => null;
    const fn = (_key: string) => fakeIcon as never;
    expect(resolveWorkspaceIcon("finance", "coins", fn)).toBe(fakeIcon);
  });

  it("falls back to hard-coded icon when entity icon resolves to CircleHelp", () => {
    expect(resolveWorkspaceIcon("finance", "unknown-key-xyz", noOp)).toBe(getWorkspaceIcon("finance"));
  });
});

// ── Entity Class Icons ──────────────────────────────────────────

const ALL_ENTITY_CLASSES = [
  "REFERENCE",
  "MASTER",
  "CONTROL",
  "DOCUMENT",
  "DOCUMENT_RELATION",
  "LEDGER",
  "LOG",
  "AGGREGATE",
  "DIMENSION",
  "RELATION",
];

describe("getEntityClassIcon", () => {
  it.each(ALL_ENTITY_CLASSES)("resolves entity class %s", (cls) => {
    const icon = getEntityClassIcon(cls);
    expectIconComponent(icon);
  });

  it("returns fallback (CircleHelp) for unknown class", () => {
    expect(getEntityClassIcon("UNKNOWN_CLASS")).toBe(CircleHelp);
  });

  it("returns fallback for empty string", () => {
    expect(getEntityClassIcon("")).toBe(CircleHelp);
  });

  it("normalizes entity class casing and whitespace", () => {
    expect(getEntityClassIcon(" master ")).toBe(getEntityClassIcon("MASTER"));
  });

  it(`covers all 10 entity classes (got ${ALL_ENTITY_CLASSES.length})`, () => {
    expect(ALL_ENTITY_CLASSES).toHaveLength(10);
  });
});

// ── Action Icons ────────────────────────────────────────────────

const ALL_HANDLER_TYPES = ["NAVIGATE", "API", "MODAL", "INLINE"];

const ALL_ACTION_VERBS = [
  "create", "edit", "delete", "copy", "duplicate", "view",
  "export", "import",
  "approve", "reject", "deny",
  "submit", "post",
  "cancel", "void",
  "delegate", "reverse", "reverse_document",
  "status_transition",
  "archive", "print", "filter", "search", "more", "command",
];

describe("getHandlerTypeIcon", () => {
  it.each(ALL_HANDLER_TYPES)("resolves handler type %s", (type) => {
    const icon = getHandlerTypeIcon(type);
    expectIconComponent(icon);
  });

  it("returns fallback (CircleHelp) for unknown handler type", () => {
    expect(getHandlerTypeIcon("UNKNOWN_HANDLER")).toBe(CircleHelp);
  });

  it("normalizes handler type casing and whitespace", () => {
    expect(getHandlerTypeIcon(" api ")).toBe(getHandlerTypeIcon("API"));
  });
});

describe("getActionIcon", () => {
  it.each(ALL_ACTION_VERBS)("resolves action verb %s", (verb) => {
    const icon = getActionIcon(verb);
    expectIconComponent(icon);
  });

  it("approve and post resolve to distinct icons", () => {
    expect(getActionIcon("approve")).not.toBe(getActionIcon("post"));
  });

  it("returns fallback (CircleHelp) for unknown action", () => {
    expect(getActionIcon("unknown_action")).toBe(CircleHelp);
  });

  it("returns fallback for empty string", () => {
    expect(getActionIcon("")).toBe(CircleHelp);
  });

  it("normalizes action casing and whitespace", () => {
    expect(getActionIcon(" APPROVE ")).toBe(getActionIcon("approve"));
  });

  it("registered action list matches ALL_ACTION_VERBS", () => {
    const registered = getRegisteredActions().sort();
    expect(registered).toEqual([...ALL_ACTION_VERBS].sort());
  });

  it(`covers all 25 action verbs (got ${ALL_ACTION_VERBS.length})`, () => {
    expect(ALL_ACTION_VERBS).toHaveLength(25);
  });
});

// ── Entity Icons ────────────────────────────────────────────────

describe("getEntityIcon", () => {
  it("normalizes entity icon keys", () => {
    expect(getEntityIcon(" Shopping-Cart ")).toBe(getEntityIcon("shopping-cart"));
    expect(hasEntityIcon(" file-text ")).toBe(true);
  });

  it("resolves recently added keys", () => {
    expect(getEntityIcon("scroll-text")).not.toBe(CircleHelp);
    expect(getEntityIcon("sparkles")).not.toBe(CircleHelp);
    expect(getEntityIcon("search")).not.toBe(CircleHelp);
  });

  it("returns fallback for nullish entity icon keys", () => {
    expect(getEntityIcon(null)).toBe(CircleHelp);
    expect(hasEntityIcon(undefined)).toBe(false);
  });
});

// ── Color Tokens ────────────────────────────────────────────────

describe("getEntityColorClasses", () => {
  it("normalizes color token casing and whitespace", () => {
    expect(getEntityColorClasses(" Blue ")).toEqual(getEntityColorClasses("blue"));
  });

  it("returns muted fallback for nullish color tokens", () => {
    expect(getEntityColorClasses(null)).toEqual(getEntityColorClasses(""));
  });
});

// ── Status Icons ────────────────────────────────────────────────

const ALL_SEMANTIC_INTENTS: SemanticIntent[] = [
  "neutral", "info", "success", "warning", "error", "primary", "accent", "muted",
];

describe("getStatusIcon", () => {
  it.each(ALL_SEMANTIC_INTENTS)("resolves intent %s", (intent) => {
    const icon = getStatusIcon(intent);
    expectIconComponent(icon);
  });

  it("primary intent does not resolve to Star (use Bookmark instead)", () => {
    const { Star } = require("lucide-react");
    expect(getStatusIcon("primary")).not.toBe(Star);
  });

  it(`covers all 8 semantic intents (got ${ALL_SEMANTIC_INTENTS.length})`, () => {
    expect(ALL_SEMANTIC_INTENTS).toHaveLength(8);
  });
});
