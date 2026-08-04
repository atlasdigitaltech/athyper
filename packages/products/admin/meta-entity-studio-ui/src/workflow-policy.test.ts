import { describe, expect, it } from "vitest";
import { allowedMetaEntityWorkflowActions } from "./workflow-policy";

describe("Meta Entity Studio workflow policy", () => {
  it("keeps global package examples read-only", () => {
    expect(allowedMetaEntityWorkflowActions("draft", false, false)).toEqual([]);
  });

  it("requires persisted work before lifecycle actions", () => {
    expect(allowedMetaEntityWorkflowActions("draft", true, true)).toEqual([]);
  });

  it("maps lifecycle states without inventing transitions", () => {
    expect(allowedMetaEntityWorkflowActions("draft", true, false)).toEqual(["checkpoint", "submit", "abandon"]);
    expect(allowedMetaEntityWorkflowActions("in_review", true, false)).toEqual(["return-to-draft", "approve", "reject"]);
    expect(allowedMetaEntityWorkflowActions("approved", true, false)).toEqual(["publish", "rollback", "retire"]);
    expect(allowedMetaEntityWorkflowActions("published", true, false)).toEqual([]);
  });
});
