// RUNTIME_ROUTING_SPEC §4.3 — resolveTabs() spec conformance
//
// Asserts that resolveTabs() produces the correct ordered DetailTab[] for
// each of the three resolution layers. Catches regressions when feature-flag
// names change, ?? fallback logic is edited, or new tab variants are added.
//
// Test categories
//   Layer 2  — feature-flag driven tabs (§3.1 L2)
//   Layer 1  — class-profile default_tabs (§3.1 L1)
//   Layer 3  — tenant overlay add/remove (§3.1 L3)
//   Dedup    — pushIfMissing prevents duplicate tabs across layers
//   Regression — purchase_invoice full flag-set (finance-core reference entity)

import { describe, it, expect } from "vitest";
import {
  type CompiledEntity,
  type EntityClassProfile,
  type OverlayTabChange,
  type DetailTab,
} from "@athyper/api-contracts/metadata";
import { resolveTabs } from "../compiled-reader.js";

// ── Fixture factory ───────────────────────────────────────────────────────────
// Only feature_flags influences tab output; other required fields are constants.

const ENTITY_ID = "00000000-0000-0000-0000-000000000001" as const;

function makeEntity(
  flags: CompiledEntity["feature_flags"],
): CompiledEntity {
  return {
    entity_id:       ENTITY_ID,
    entity_code:     "test_entity",
    slug:            "test-entity",
    entity_name:     "Test Entity",
    entity_class:    "MASTER",
    table_schema:    "master",
    table_name:      "test_entity",
    version_no:      1,
    version_hash:    "deadbeef",
    fields:          [],
    field_groups:    [],
    display_config:  {},
    feature_flags:   flags,
    governance_level: "standard",
    security_tier:   "standard",
    compiled_at:     "2026-04-20T00:00:00.000Z",
    compiled_hash:   "deadbeef",
  } as unknown as CompiledEntity;
}

function tabs(
  flags: CompiledEntity["feature_flags"],
  classProfile: EntityClassProfile | null = null,
  overlay: OverlayTabChange[] = [],
): DetailTab[] {
  return resolveTabs(makeEntity(flags), classProfile, overlay);
}

// ── Layer 2 — feature-flag driven tabs ───────────────────────────────────────

describe("Layer 2 — feature-flag driven tabs", () => {
  it("always starts with overview", () => {
    expect(tabs({})[0]).toBe("overview");
  });

  it("includes attachments by default (has_attachments not set)", () => {
    expect(tabs({})).toContain("attachments");
  });

  it("suppresses attachments when has_attachments = false", () => {
    expect(tabs({ has_attachments: false })).not.toContain("attachments");
    expect(tabs({ has_attachments: false })).toStrictEqual(["overview"]);
  });

  it("adds workflow when is_approvable = true", () => {
    const result = tabs({ is_approvable: true });
    expect(result).toContain("workflow");
    // canonical: overview(0) → workflow(1) → attachments(2) → approvals(3)
    expect(result.indexOf("workflow")).toBe(1);
  });

  it("adds approvals when is_approvable = true (coexists with workflow tab)", () => {
    const result = tabs({ is_approvable: true });
    expect(result).toContain("approvals");
    // approvals(7) comes after comments(6) and before tasks(8) in canonical order
    // with only workflow+attachments+approvals present: overview→workflow→attachments→approvals
    expect(result.indexOf("approvals")).toBeGreaterThan(result.indexOf("attachments"));
  });

  it("adds versions via canonical flag version_control", () => {
    expect(tabs({ version_control: true })).toContain("versions");
  });

  it("adds comments via comments_enabled", () => {
    expect(tabs({ comments_enabled: true })).toContain("comments");
  });

  it("adds events via event_history", () => {
    expect(tabs({ event_history: true })).toContain("events");
  });

  it("adds lines via has_lines", () => {
    expect(tabs({ has_lines: true })).toContain("lines");
  });

  it("adds distributions via has_accounting_distribution", () => {
    expect(tabs({ has_accounting_distribution: true })).toContain("distributions");
  });

  it("Phase-3 tabs: quality, reports, tasks, watchers, rules, integrations", () => {
    const result = tabs({
      quality_checks:  true,
      record_reports:  true,
      has_tasks:       true,
      has_watchers:    true,
      has_rules:       true,
      has_integrations: true,
    });
    expect(result).toContain("quality");
    expect(result).toContain("reports");
    expect(result).toContain("tasks");
    expect(result).toContain("watchers");
    expect(result).toContain("rules");
    expect(result).toContain("integrations");
  });

  it("Phase-3 tabs appear in CANONICAL_TAB_ORDER: tasks→watchers→rules→integrations→quality→reports→events", () => {
    // Canonical sort: tasks(8) < watchers(9) < rules(10) < integrations(11) < quality(12) < reports(13) < events(14)
    const result = tabs({
      event_history:   true,
      quality_checks:  true,
      record_reports:  true,
      has_tasks:       true,
      has_watchers:    true,
      has_rules:       true,
      has_integrations: true,
    });
    const idxTasks        = result.indexOf("tasks");
    const idxWatchers     = result.indexOf("watchers");
    const idxRules        = result.indexOf("rules");
    const idxIntegrations = result.indexOf("integrations");
    const idxQuality      = result.indexOf("quality");
    const idxReports      = result.indexOf("reports");
    const idxEvents       = result.indexOf("events");
    expect(idxTasks).toBeLessThan(idxWatchers);
    expect(idxWatchers).toBeLessThan(idxRules);
    expect(idxRules).toBeLessThan(idxIntegrations);
    expect(idxIntegrations).toBeLessThan(idxQuality);
    expect(idxQuality).toBeLessThan(idxReports);
    expect(idxReports).toBeLessThan(idxEvents);
  });
});

// ── Layer 1 — class-profile default_tabs ─────────────────────────────────────

describe("Layer 1 — class-profile default_tabs", () => {
  const documentProfile: EntityClassProfile = {
    entity_class: "DOCUMENT",
    default_tabs: ["lines", "distributions"],
  };

  it("adds lines from class-profile default_tabs without any flag", () => {
    const result = resolveTabs(makeEntity({}), documentProfile, []);
    expect(result).toContain("lines");
  });

  it("adds distributions from class-profile default_tabs without any flag", () => {
    const result = resolveTabs(makeEntity({}), documentProfile, []);
    expect(result).toContain("distributions");
  });

  it("class-profile lines appear before attachments (Layer 1 before Layer 2)", () => {
    const result = resolveTabs(makeEntity({}), documentProfile, []);
    expect(result.indexOf("lines")).toBeLessThan(result.indexOf("attachments"));
  });

  it("exact order with class-profile: overview → lines → distributions → attachments", () => {
    const result = resolveTabs(makeEntity({}), documentProfile, []);
    expect(result).toStrictEqual(["overview", "lines", "distributions", "attachments"]);
  });
});

// ── Layer 3 — tenant overlay ─────────────────────────────────────────────────

describe("Layer 3 — tenant overlay operations", () => {
  it("overlay add appends a tab not present in the base set", () => {
    const result = tabs({}, null, [{ tab: "tasks", operation: "add" }]);
    expect(result).toContain("tasks");
    // tasks should be at the end (after attachments from Layer 2)
    expect(result.indexOf("tasks")).toBeGreaterThan(result.indexOf("attachments"));
  });

  it("overlay remove suppresses a tab that Layer 2 would add", () => {
    const result = tabs({}, null, [{ tab: "attachments", operation: "remove" }]);
    expect(result).not.toContain("attachments");
    expect(result).toStrictEqual(["overview"]);
  });

  it("overlay remove is a no-op for a tab that is not present", () => {
    const result = tabs({}, null, [{ tab: "tasks", operation: "remove" }]);
    expect(result).not.toContain("tasks");
    expect(result).toStrictEqual(["overview", "attachments"]);
  });

  it("overlay add + remove in sequence: remove then re-add has no effect", () => {
    const result = tabs({}, null, [
      { tab: "attachments", operation: "remove" },
      { tab: "attachments", operation: "add" },
    ]);
    // add after remove brings it back (pushIfMissing)
    expect(result).toContain("attachments");
  });
});

// ── Deduplication — pushIfMissing ─────────────────────────────────────────────

describe("deduplication — pushIfMissing prevents duplicate tabs", () => {
  it("lines added by class-profile and flag does not duplicate", () => {
    const profile: EntityClassProfile = {
      entity_class: "DOCUMENT",
      default_tabs: ["lines"],
    };
    const result = resolveTabs(makeEntity({ has_lines: true }), profile, []);
    const count = result.filter((t) => t === "lines").length;
    expect(count).toBe(1);
  });

  it("distributions added by class-profile and flag does not duplicate", () => {
    const profile: EntityClassProfile = {
      entity_class: "DOCUMENT",
      default_tabs: ["distributions"],
    };
    const result = resolveTabs(
      makeEntity({ has_accounting_distribution: true }),
      profile,
      [],
    );
    const count = result.filter((t) => t === "distributions").length;
    expect(count).toBe(1);
  });

  it("overlay add does not duplicate an already-present tab", () => {
    const result = tabs({}, null, [{ tab: "attachments", operation: "add" }]);
    const count = result.filter((t) => t === "attachments").length;
    expect(count).toBe(1);
  });
});

// ── Regression — purchase_invoice reference entity ───────────────────────────
//
// These flags mirror the control.entity.feature_flags seed in
// server/db/sql/900_seed_data/010_system/100_finance/200_document/001_invoice.sql
// section 5b. If the seed changes the expected array must be updated here.

describe("regression — purchase_invoice feature_flags (finance-core)", () => {
  // Schema-relevant flags from the seed (section 5b of 001_invoice.sql).
  // allow_on_behalf_of and auto_number are raw DB extras stripped at compile time
  // and therefore absent from CompiledEntity["feature_flags"].
  const PURCHASE_INVOICE_FLAGS: CompiledEntity["feature_flags"] = {
    is_approvable:               true,
    document_category:           "payables",
    has_lines:                   true,
    comments_enabled:            true,
    event_history:               true,
    has_attachments:             true,
    version_control:             true,
    has_accounting_distribution: true,
    has_payment_schedule:        true,   // health tile only, no tab
  };

  it("produces the exact expected tab set in canonical order", () => {
    // Canonical: overview(0) lines(1) distributions(2) workflow(3) attachments(4)
    //            versions(5) comments(6) approvals(7) events(14)
    // is_approvable drives both workflow + approvals tabs
    const result = tabs(PURCHASE_INVOICE_FLAGS);
    expect(result).toStrictEqual([
      "overview",
      "lines",
      "distributions",
      "workflow",
      "attachments",
      "versions",
      "comments",
      "approvals",
      "events",
    ]);
  });

  it("contains no unexpected tabs", () => {
    const result = tabs(PURCHASE_INVOICE_FLAGS);
    const EXPECTED = new Set<DetailTab>([
      "overview", "lines", "distributions", "workflow",
      "attachments", "versions", "comments", "approvals", "events",
    ]);
    for (const tab of result) {
      expect(EXPECTED.has(tab)).toBe(true);
    }
  });

  it("has_payment_schedule does not drive a tab (health-tile only)", () => {
    const result = tabs({ has_payment_schedule: true });
    // has_payment_schedule is not a tab flag — only overview + attachments expected
    expect(result).toStrictEqual(["overview", "attachments"]);
  });
});
