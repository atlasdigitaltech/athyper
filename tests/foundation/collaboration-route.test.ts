import { test } from "node:test";
import assert from "node:assert/strict";
import { isCollaborationRequested } from "../../packages/platform/entity/runtime/form-detail/src/collaboration-route";

test("generic record navigation opens Collaboration only on explicit intent", () => {
  for (const query of ["", "?tab=360&section=overview", "?panel=closed&collaborationSection=comments", "?panel=atlas"])
    assert.equal(isCollaborationRequested(query), false);
  for (const query of ["?panel=collaboration&collaborationSection=comments", "?panel=collaboration&collaborationSection=attachments&collaborationMode=content"])
    assert.equal(isCollaborationRequested(query), true);
});
