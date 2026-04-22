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
import { getActionIcon, getHandlerTypeIcon } from "../action-icons";
import { getStatusIcon } from "../status-icons";
import { type SemanticIntent } from "@athyper/theme/semantic-colors";

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
    expect(icon).toBeDefined();
    expect(typeof icon).toBe("function");
  });

  it("returns fallback (CircleHelp) for unknown code", () => {
    expect(getModuleIcon("UNKNOWN_XYZ")).toBe(CircleHelp);
  });

  it("returns fallback for empty string", () => {
    expect(getModuleIcon("")).toBe(CircleHelp);
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
    expect(icon).toBeDefined();
    expect(typeof icon).toBe("function");
  });

  it("returns fallback (CircleHelp) for unknown workspace", () => {
    expect(getWorkspaceIcon("unknown-workspace")).toBe(CircleHelp);
  });

  it("returns fallback for empty string", () => {
    expect(getWorkspaceIcon("")).toBe(CircleHelp);
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
    expect(icon).toBeDefined();
    expect(typeof icon).toBe("function");
  });

  it("returns fallback (CircleHelp) for unknown class", () => {
    expect(getEntityClassIcon("UNKNOWN_CLASS")).toBe(CircleHelp);
  });

  it("returns fallback for empty string", () => {
    expect(getEntityClassIcon("")).toBe(CircleHelp);
  });

  it(`covers all 10 entity classes (got ${ALL_ENTITY_CLASSES.length})`, () => {
    expect(ALL_ENTITY_CLASSES).toHaveLength(10);
  });
});

// ── Action Icons ────────────────────────────────────────────────

const ALL_HANDLER_TYPES = ["NAVIGATE", "API", "MODAL", "INLINE"];

const ALL_ACTION_VERBS = [
  "create", "edit", "delete", "duplicate", "view",
  "export", "import", "approve", "reject", "submit",
  "delegate", "reverse", "archive", "print", "filter",
  "search", "more", "command",
];

describe("getHandlerTypeIcon", () => {
  it.each(ALL_HANDLER_TYPES)("resolves handler type %s", (type) => {
    const icon = getHandlerTypeIcon(type);
    expect(icon).toBeDefined();
    expect(typeof icon).toBe("function");
  });

  it("returns fallback (CircleHelp) for unknown handler type", () => {
    expect(getHandlerTypeIcon("UNKNOWN_HANDLER")).toBe(CircleHelp);
  });
});

describe("getActionIcon", () => {
  it.each(ALL_ACTION_VERBS)("resolves action verb %s", (verb) => {
    const icon = getActionIcon(verb);
    expect(icon).toBeDefined();
    expect(typeof icon).toBe("function");
  });

  it("returns fallback (CircleHelp) for unknown action", () => {
    expect(getActionIcon("unknown_action")).toBe(CircleHelp);
  });

  it("returns fallback for empty string", () => {
    expect(getActionIcon("")).toBe(CircleHelp);
  });
});

// ── Status Icons ────────────────────────────────────────────────

const ALL_SEMANTIC_INTENTS: SemanticIntent[] = [
  "neutral", "info", "success", "warning", "error", "primary", "accent", "muted",
];

describe("getStatusIcon", () => {
  it.each(ALL_SEMANTIC_INTENTS)("resolves intent %s", (intent) => {
    const icon = getStatusIcon(intent);
    expect(icon).toBeDefined();
    expect(typeof icon).toBe("function");
  });

  it(`covers all 8 semantic intents (got ${ALL_SEMANTIC_INTENTS.length})`, () => {
    expect(ALL_SEMANTIC_INTENTS).toHaveLength(8);
  });
});
