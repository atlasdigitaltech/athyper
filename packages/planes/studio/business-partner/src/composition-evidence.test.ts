import {expect, it} from "vitest";
import {evidenceState, type CheckEvidence} from "./composition-evidence";
import type {Inspection} from "./workbench-model";
const inspection: Inspection = {source:"draft", id:"d", version:"4", status:"draft", targets:[], data:{entity:{title:"Partner"}}};
const check: CheckEvidence = {kind:"validate", source:"draft:d", revision:"4", graph:inspection.data, observedAt:"2026-09-16T00:00:00Z", report:{issues:[]}};
it("qualifies checks only for the exact revision and graph", () => {
  expect(evidenceState(check, inspection, inspection.data)).toBe("Passed");
  expect(evidenceState(check, inspection, {entity:{title:"Edited"}})).toContain("Outdated");
  expect(evidenceState(check, {...inspection,version:"5"}, inspection.data)).toContain("Outdated");
  expect(evidenceState(check, {...inspection,id:"other"}, inspection.data)).toContain("Outdated");
  expect(evidenceState(undefined, inspection, inspection.data)).toContain("Not observed");
});
it("does not turn empty tests, unknown responses or failed checks into a success", () => {
  expect(evidenceState({...check,kind:"test",report:{passed:true,results:[]}}, inspection, inspection.data)).toBe("No tests configured");
  expect(evidenceState({...check,report:{}}, inspection, inspection.data)).toBe("Unverified response");
  expect(evidenceState({...check,kind:"test",report:{passed:false}}, inspection, inspection.data)).toBe("Failed");
  expect(evidenceState({...check,kind:"save"}, inspection, inspection.data)).toBe("Save and reread verified");
});
