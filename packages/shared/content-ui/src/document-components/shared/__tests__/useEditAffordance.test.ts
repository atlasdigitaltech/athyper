/**
 * Tests for useEditAffordance + resolveEditAffordance.
 *
 * Covers the full state matrix from spec v1.1 §7 + on_hold phase
 * inheritance from §A5 + permission gate.
 */
import { describe, it, expect } from "vitest";
import {
  resolveEditAffordance,
  type PiEditSurface,
} from "../useEditAffordance";
import type { PiStatus, EditAffordance } from "../../../purchase-invoice/types";

// ── Helpers ───────────────────────────────────────────────────────

function expectAcrossSurfaces(
  status: PiStatus,
  expectations: Partial<Record<PiEditSurface, EditAffordance>>,
  extra: { hasPermission?: boolean; previousStatus?: PiStatus | null } = {},
) {
  for (const surface of Object.keys(expectations) as PiEditSurface[]) {
    const expected = expectations[surface]!;
    const actual = resolveEditAffordance({ status, surface, ...extra });
    expect(actual, `status=${status} surface=${surface}`).toBe(expected);
  }
}

// ── State matrix from spec §7 ─────────────────────────────────────

describe("resolveEditAffordance — state matrix per spec §7", () => {
  it("draft: edit across PC, AD, header identity, payment terms", () => {
    expectAcrossSurfaces("draft", {
      header_identity:          "edit",
      pc_line:                  "edit",
      pc_header:                "edit",
      ad:                       "edit",
      payment_terms:            "edit",
      header_components_strip:  "edit",
    });
  });

  it("rejected: same as draft", () => {
    expectAcrossSurfaces("rejected", {
      header_identity: "edit",
      pc_line:         "edit",
      ad:              "edit",
    });
  });

  it("pending_approval: PC → replace, AD → edit, identity → read_only", () => {
    expectAcrossSurfaces("pending_approval", {
      header_identity:          "read_only",
      pc_line:                  "replace",
      pc_header:                "replace",
      ad:                       "edit",
      payment_terms:            "read_only",
      header_components_strip:  "replace",
    });
  });

  it("approved: same as pending_approval (pre-post)", () => {
    expectAcrossSurfaces("approved", {
      pc_line:    "replace",
      ad:         "edit",
      payment_terms: "read_only",
    });
  });

  it("posted: read_only everywhere", () => {
    expectAcrossSurfaces("posted", {
      header_identity:          "read_only",
      pc_line:                  "read_only",
      pc_header:                "read_only",
      ad:                       "read_only",
      payment_terms:            "read_only",
      header_components_strip:  "read_only",
    });
  });

  it("partially_paid / fully_paid: read_only everywhere", () => {
    expectAcrossSurfaces("partially_paid", { pc_line: "read_only", ad: "read_only" });
    expectAcrossSurfaces("fully_paid",     { pc_line: "read_only", ad: "read_only" });
  });

  it("reversed / cancelled: read_only everywhere", () => {
    expectAcrossSurfaces("reversed",  { pc_line: "read_only", ad: "read_only" });
    expectAcrossSurfaces("cancelled", { pc_line: "read_only", ad: "read_only" });
  });
});

// ── §A5 on_hold phase inheritance ─────────────────────────────────

describe("resolveEditAffordance — on_hold phase inheritance (§A5)", () => {
  it("on_hold without previousStatus → read_only (safety default)", () => {
    expect(resolveEditAffordance({ status: "on_hold", surface: "pc_line" }))
      .toBe("read_only");
  });

  it("on_hold with previousStatus='draft' → inherits draft affordances", () => {
    expect(resolveEditAffordance({
      status: "on_hold",
      previousStatus: "draft",
      surface: "pc_line",
    })).toBe("edit");

    expect(resolveEditAffordance({
      status: "on_hold",
      previousStatus: "draft",
      surface: "ad",
    })).toBe("edit");
  });

  it("on_hold with previousStatus='pending_approval' → inherits approval affordances", () => {
    expect(resolveEditAffordance({
      status: "on_hold",
      previousStatus: "pending_approval",
      surface: "pc_line",
    })).toBe("replace");

    expect(resolveEditAffordance({
      status: "on_hold",
      previousStatus: "pending_approval",
      surface: "ad",
    })).toBe("edit");
  });

  it("on_hold with previousStatus='posted' → read_only (post-post hold)", () => {
    expect(resolveEditAffordance({
      status: "on_hold",
      previousStatus: "posted",
      surface: "pc_line",
    })).toBe("read_only");
  });

  it("on_hold with previousStatus='on_hold' is ignored (no infinite loop)", () => {
    expect(resolveEditAffordance({
      status: "on_hold",
      previousStatus: "on_hold",
      surface: "pc_line",
    })).toBe("read_only");
  });
});

// ── Permission gate ───────────────────────────────────────────────

describe("resolveEditAffordance — permission gate", () => {
  it("hasPermission=false forces read_only regardless of status", () => {
    const surfaces: PiEditSurface[] = [
      "header_identity",
      "pc_line",
      "pc_header",
      "ad",
      "payment_terms",
      "header_components_strip",
    ];
    const statuses: PiStatus[] = ["draft", "pending_approval", "approved", "rejected"];

    for (const status of statuses) {
      for (const surface of surfaces) {
        const actual = resolveEditAffordance({
          status,
          surface,
          hasPermission: false,
        });
        expect(actual, `status=${status} surface=${surface}`).toBe("read_only");
      }
    }
  });

  it("hasPermission=true is the default behavior", () => {
    expect(resolveEditAffordance({
      status: "draft",
      surface: "pc_line",
      hasPermission: true,
    })).toBe("edit");

    expect(resolveEditAffordance({
      status: "draft",
      surface: "pc_line",
    })).toBe("edit");
  });
});
