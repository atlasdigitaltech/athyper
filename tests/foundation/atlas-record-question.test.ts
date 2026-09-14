import assert from "node:assert/strict";
import test from "node:test";
import { atlasRequestsRecordOverview } from "../../server/apps/platform-host/src/composition/atlas-record-question";
test("record overview bypasses incidental document matches", () => {
  for (const query of [
    "Explain the saved information in overview.",
    "Show this record summary",
    "Explain the OVERVIEW",
  ])
    assert.equal(atlasRequestsRecordOverview(query), true);
});
test("explicit document requests and ordinary retrieval queries remain eligible", () => {
  for (const query of [
    "Give an overview of the attachment",
    "Summarize this contract overview",
    "What is the Indigo Lantern review interval?",
    "Show contacts",
  ])
    assert.equal(atlasRequestsRecordOverview(query), false);
});
