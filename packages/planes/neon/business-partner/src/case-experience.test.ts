import type {
  GovernedCaseStatusV1,
  GovernedCaseViewV1,
} from "@athyper/contract-platform-entity-runtime";
import { ApiTransportError } from "@athyper/platform-api-client";
import { describe, expect, it } from "vitest";
import {
  CASE_UI_STATES,
  caseStatusMessage,
  caseStatusUiState,
  failureUiState,
  governedCaseActions,
} from "./case-experience";

function caseView(
  status: GovernedCaseStatusV1,
  actions: readonly string[] = [],
): GovernedCaseViewV1 {
  return {
    schema: "athyper.governed-case-view/1",
    id: "10000000-0000-4000-8000-000000000001",
    kind: "new_partner",
    status,
    rowVersion: 3,
    definition: {
      id: "20000000-0000-4000-8000-000000000002",
      version: 2,
      contentHash: "a".repeat(64),
    },
    subject: { type: "business_partner", displayName: "Fixture Supplier" },
    ownership: { requesterId: "30000000-0000-4000-8000-000000000003" },
    progress: { completed: 2, required: 4, blockers: 0 },
    sections: [],
    allowedActions: actions.map((id) => ({ id, label: id })),
    evidenceSummary: { active: 1, scanning: 0, quarantined: 0, missing: 0 },
    timestamps: {
      createdAt: "2026-09-04T00:00:00Z",
      updatedAt: "2026-09-04T01:00:00Z",
    },
  };
}

describe("governed Business Partner case experience", () => {
  it("publishes the complete explicit page-state vocabulary", () => {
    expect(CASE_UI_STATES).toEqual([
      "ready",
      "loading",
      "empty",
      "partial",
      "error",
      "unauthorized",
      "unavailable",
      "stale",
      "mutation-pending",
      "mutation-success",
      "mutation-conflict",
      "mutation-failure",
    ]);
  });

  it("uses only producer-projected actions and adapts materialize to the existing UI command", () => {
    expect(
      governedCaseActions(
        caseView("approved", ["edit", "materialize", "unknown_action"]),
      ),
    ).toEqual(["edit", "apply"]);
  });

  it.each([
    ["draft", "ready"],
    ["validating", "ready"],
    ["validation_failed", "partial"],
    ["submitted", "ready"],
    ["pending_approval", "ready"],
    ["in_review", "ready"],
    ["returned", "partial"],
    ["approved", "ready"],
    ["rejected", "partial"],
    ["applying", "ready"],
    ["materializing", "ready"],
    ["failed", "partial"],
    ["conflicted", "stale"],
    ["applied", "ready"],
    ["materialized", "ready"],
    ["cancelled", "ready"],
    ["superseded", "ready"],
  ] as const)("maps %s to the explicit %s page state", (status, state) => {
    expect(caseStatusUiState(status)).toBe(state);
  });

  it.each([
    "validation_failed",
    "returned",
    "rejected",
    "failed",
    "cancelled",
    "superseded",
    "conflicted",
  ] as const)("provides actionable copy for %s", (status) => {
    expect(caseStatusMessage(status)?.detail).toBeTruthy();
  });

  it("classifies read and mutation failures without hiding authorization or conflicts", () => {
    expect(
      failureUiState(new ApiTransportError("authorization", "denied", 403)),
    ).toBe("unauthorized");
    expect(
      failureUiState(new ApiTransportError("conflict", "stale", 409)),
    ).toBe("stale");
    expect(
      failureUiState(new ApiTransportError("conflict", "stale", 409), true),
    ).toBe("mutation-conflict");
    expect(
      failureUiState(new ApiTransportError("dependency", "down", 503), true),
    ).toBe("unavailable");
    expect(failureUiState(new Error("bad"))).toBe("error");
    expect(failureUiState(new Error("bad"), true)).toBe("mutation-failure");
  });
});
