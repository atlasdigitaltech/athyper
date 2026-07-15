import { describe, expect, it } from "vitest";
import {
  isProcessTabId,
  resolveProcessSurfaceId,
  suppressLifecycleDuplicateStages,
} from "./runtime-process-surface";

describe("process surface routing", () => {
  it("routes approvals and legacy workflow URLs to the approvals surface", () => {
    expect(resolveProcessSurfaceId("approvals")).toBe("approvals");
    expect(resolveProcessSurfaceId("workflow")).toBe("approvals");
    expect(resolveProcessSurfaceId("process")).toBe("approvals");
  });

  it("keeps lifecycle separate from approvals", () => {
    expect(resolveProcessSurfaceId("lifecycle")).toBe("lifecycle");
    expect(isProcessTabId("approvals")).toBe(true);
  });
});

describe("approval stage fallback", () => {
  const lifecycle = [
    "Draft",
    "Pending Approval",
    "Approved",
    "Active",
    "Partially Fulfilled",
    "Fully Fulfilled",
  ];

  it("suppresses a stage route made entirely from lifecycle states", () => {
    expect(suppressLifecycleDuplicateStages(lifecycle, lifecycle)).toEqual([]);
    expect(suppressLifecycleDuplicateStages(["Pending Approval", "Approved"], lifecycle)).toEqual([]);
  });

  it("preserves genuine approval stages", () => {
    expect(suppressLifecycleDuplicateStages(
      ["Manager Approval", "Finance Approval"],
      lifecycle,
    )).toEqual(["Manager Approval", "Finance Approval"]);
  });
});
