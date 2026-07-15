/**
 * @athyper/icons — Registry Tests
 *
 * Verifies that every known code resolves to a non-null icon component
 * and that unknown/empty inputs always return the fallback (CircleHelp).
 *
 * Run with: pnpm --filter @athyper/icons test
 */
import { describe, it, expect } from "vitest";
import { CircleHelp } from "lucide-react";

import { getModuleIcon, hasModuleIcon } from "../module-icons";
import { getWorkspaceIcon } from "../workspace-icons";
import { getEntityClassIcon } from "../entity-class-icons";
import { getEntityIcon, hasEntityIcon } from "../entity-icons";
import { getEntityColorClasses } from "../color-tokens";
import { getActionIcon, getHandlerTypeIcon, getRegisteredActions } from "../action-icons";
import { getStatusIcon } from "../status-icons";
import { type SemanticIntent } from "@athyper/theme/semantic-colors";

function expectIconComponent(icon: unknown): void {
  expect(icon).toBeDefined();
  expect(["function", "object"]).toContain(typeof icon);
}

// ── Module Icons ────────────────────────────────────────────────

const ALL_MODULE_CODES = [
  // Core
  "FND", "META", "IAM", "AUD", "POL", "WFL", "JOB", "DOC", "NTF", "INT", "CMS", "ACT", "REL",
  // Finance
  "ACC", "PAY", "TREASURY", "BUDGET", "PAYG",
  // Supply Chain
  "SRM", "SOURCE", "CONTRACT", "BUY", "INVENTORY", "QMS", "SUBCON", "DEMAND", "WMS", "LOGISTICS",
  // Customer Experience
  "CRM", "SALE",
  // People Management
  "HR", "PAYROLL",
  // Project Management
  "PRJCOST", "ITSM",
  // Manufacturing & Operations
  "MAINT", "MFG",
  // Asset Management
  "ASSET", "ASSETREMS", "ASSETFM",
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
  });

  it("hasModuleIcon returns false for unknown code", () => {
    expect(hasModuleIcon("UNKNOWN")).toBe(false);
  });

  it(`covers all 39 module codes (got ${ALL_MODULE_CODES.length})`, () => {
    expect(ALL_MODULE_CODES).toHaveLength(39);
  });
});

// ── Workspace Icons ─────────────────────────────────────────────

const ALL_WORKSPACE_KEYS = [
  "core",
  "finance",
  "supply-chain",
  "customer-experience",
  "people-management",
  "project-management",
  "manufacturing-operations",
  "asset-management",
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

  it(`covers all 8 workspaces (got ${ALL_WORKSPACE_KEYS.length})`, () => {
    expect(ALL_WORKSPACE_KEYS).toHaveLength(8);
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

// All verbs present in ACTION_ICON_MAP (including aliases: copy=duplicate, deny=reject, post=approve).
const ALL_ACTION_VERBS = [
  "create", "edit", "delete", "copy", "duplicate", "view",
  "export", "import", "approve", "reject", "deny", "submit", "post",
  "delegate", "reverse", "reverse_document", "archive", "print", "filter",
  "search", "more", "command",
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
});

describe("getEntityIcon", () => {
  it("normalizes entity icon keys", () => {
    expect(getEntityIcon(" Shopping-Cart ")).toBe(getEntityIcon("shopping-cart"));
    expect(hasEntityIcon(" file-text ")).toBe(true);
  });

  it("returns fallback for nullish entity icon keys", () => {
    expect(getEntityIcon(null)).toBe(CircleHelp);
    expect(hasEntityIcon(undefined)).toBe(false);
  });
});

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

  it(`covers all 8 semantic intents (got ${ALL_SEMANTIC_INTENTS.length})`, () => {
    expect(ALL_SEMANTIC_INTENTS).toHaveLength(8);
  });
});
