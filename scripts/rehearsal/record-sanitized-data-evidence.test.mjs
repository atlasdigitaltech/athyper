import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultRepoRoot } from "../../deploy/stackctl/src/io.mjs";
import { recordSanitizedDataEvidence } from "./record-sanitized-data-evidence.mjs";

function paths(dataset) {
  const root = mkdtempSync(join(tmpdir(), "athyper-sanitized-"));
  const input = join(root, "dataset.json");
  const output = join(root, "manifest.json");
  writeFileSync(input, `${JSON.stringify(dataset)}\n`, { mode: 0o600 });
  return { input, output };
}

test("records a hash-bound manifest for scanned synthetic QA records", () => {
  const { input, output } = paths({
    sourceInstance: "qa",
    records: [{ id: "fixture-1", email: "tester@qa.athyper.test", password: "redacted" }],
  });
  const evidence = recordSanitizedDataEvidence(defaultRepoRoot, input, output);
  assert.equal(evidence.spec.recordCount, 1);
  assert.equal(evidence.spec.checks.personalDataScanPassed, true);
  assert.match(evidence.spec.datasetSha256, /^[a-f0-9]{64}$/u);
});

test("refuses credentials and non-synthetic personal addresses without echoing values", () => {
  const credential = paths({ sourceInstance: "qa", records: [{ apiSecret: "do-not-record-this" }] });
  assert.throws(() => recordSanitizedDataEvidence(defaultRepoRoot, credential.input, credential.output), /credential-field:records\[0\]\.apiSecret/u);
  const personal = paths({ sourceInstance: "qa", records: [{ email: "person@customer.invalid.com" }] });
  assert.throws(() => recordSanitizedDataEvidence(defaultRepoRoot, personal.input, personal.output), /non-synthetic-email/u);
});
