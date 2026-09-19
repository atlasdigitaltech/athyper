import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { recordR8Artifact } from "./record-business-partner-r8-evidence.mjs";
import {
  prepareR8Packet,
  inspectR8Environment,
  createR8ReviewDrafts,
} from "./prepare-business-partner-r8-qualification.mjs";
import {
  baseManifest,
  testArtifacts,
} from "./business-partner-r8-test-fixtures.mjs";
import { R8_GATES, sha256 } from "./business-partner-r8-evidence.mjs";
import { verifyBusinessPartnerR8Qualification } from "./verify-business-partner-r8-qualification.mjs";
function workspace(t) {
  const root = mkdtempSync(resolve(tmpdir(), "r8-intake-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = resolve(
    root,
    "governance/config/governance/business-partner-r8-qualification.v1.json",
  );
  mkdirSync(resolve(root, "governance/config/governance"), { recursive: true });
  writeFileSync(path, JSON.stringify(baseManifest()));
  return { root, path };
}
test("preflight reports only missing or invalid names, never values", () => {
  const result = inspectR8Environment({
    PUBLICATION_CANARY_API_URL: "https://user:password@host?token=secret",
    CLEAN_DATABASE_URL: "secret-invalid-url",
    R8_PRODUCT_OWNER: "Same Person",
    R8_ENGINEERING_OWNER: "same person",
  });
  assert.equal(result.ready, false);
  assert.ok(result.invalid.includes("PUBLICATION_CANARY_API_URL"));
  assert.ok(result.invalid.includes("distinct_named_owners"));
  assert.doesNotMatch(
    JSON.stringify(result),
    /password|secret-invalid-url|Same Person/,
  );
});
test("preparation emits pending review drafts and cannot overwrite reviewer work", (t) => {
  const { root, path } = workspace(t),
    before = readFileSync(path, "utf8");
  const { directory, packet } = prepareR8Packet({
    repositoryRoot: root,
    packetId: "test-packet",
    env: {},
  });
  assert.equal(packet.productionQualified, false);
  assert.equal(readdirSync(directory).length, 6);
  for (const gate of R8_GATES) {
    const artifact = JSON.parse(
      readFileSync(resolve(directory, `${gate}.draft.json`), "utf8"),
    );
    assert.equal(artifact.result, "pending");
    assert.equal(artifact.sourceRevision, null);
  }
  assert.throws(
    () =>
      prepareR8Packet({
        repositoryRoot: root,
        packetId: "test-packet",
        env: {},
      }),
    /EEXIST/,
  );
  assert.equal(readFileSync(path, "utf8"), before);
});
test("drafts and sensitive inputs never mutate the manifest", (t) => {
  const { root, path } = workspace(t),
    before = readFileSync(path, "utf8");
  assert.throws(
    () =>
      recordR8Artifact({
        repositoryRoot: root,
        bytes: Buffer.from(
          JSON.stringify(createR8ReviewDrafts().manual_accessibility),
        ),
      }),
    /drafts cannot/,
  );
  const artifact = testArtifacts().target_evidence_lifecycle;
  artifact.evidence.authorization = "Bearer private-value";
  assert.throws(
    () =>
      recordR8Artifact({
        repositoryRoot: root,
        bytes: Buffer.from(JSON.stringify(artifact)),
      }),
    /sensitive material/,
  );
  assert.equal(readFileSync(path, "utf8"), before);
});
test("intake retains exact bytes, permits identical replay, and requires real prerequisites before certification", (t) => {
  const { root, path } = workspace(t),
    artifacts = testArtifacts(),
    reviewedReceipts = {};
  assert.throws(
    () =>
      recordR8Artifact({
        repositoryRoot: root,
        bytes: Buffer.from(JSON.stringify(artifacts.named_owner_certification)),
      }),
    /requires retained/,
  );
  for (const gate of R8_GATES.slice(0, 4)) {
    const bytes = Buffer.from(JSON.stringify(artifacts[gate]));
    const result = recordR8Artifact({ repositoryRoot: root, bytes });
    assert.equal(result.productionQualified, false);
    assert.deepEqual(readFileSync(resolve(root, result.artifactPath)), bytes);
    assert.equal(
      recordR8Artifact({ repositoryRoot: root, bytes }).receiptPath,
      result.receiptPath,
    );
    reviewedReceipts[gate] = sha256(
      readFileSync(resolve(root, result.receiptPath)),
    );
  }
  artifacts.named_owner_certification.evidence.reviewedReceipts =
    reviewedReceipts;
  const result = recordR8Artifact({
    repositoryRoot: root,
    bytes: Buffer.from(JSON.stringify(artifacts.named_owner_certification)),
  });
  assert.equal(result.productionQualified, true);
  assert.deepEqual(
    verifyBusinessPartnerR8Qualification({
      repositoryRoot: root,
      manifestPath: path,
    }),
    { gates: 5, passed: 5, productionQualified: true },
  );
  artifacts.target_evidence_lifecycle.evidence.objectVersionRef =
    "object:changed:2";
  assert.throws(
    () =>
      recordR8Artifact({
        repositoryRoot: root,
        bytes: Buffer.from(JSON.stringify(artifacts.target_evidence_lifecycle)),
      }),
    /already has different retained evidence/,
  );
});
test("intake refuses symlinked evidence output directories", (t) => {
  const { root } = workspace(t);
  const evidenceRoot = resolve(root, "governance/evidence/business-partner/r8");
  mkdirSync(evidenceRoot, { recursive: true });
  const outside = resolve(root, "outside");
  mkdirSync(outside);
  symlinkSync(outside, resolve(evidenceRoot, "artifacts"));
  assert.throws(
    () =>
      recordR8Artifact({
        repositoryRoot: root,
        bytes: Buffer.from(
          JSON.stringify(testArtifacts().target_evidence_lifecycle),
        ),
      }),
    /must not be symlinks/,
  );
  assert.deepEqual(readdirSync(outside), []);
});

test("intake refuses concurrent manifest mutation and releases its lock after rejection", (t) => {
  const { root, path } = workspace(t);
  const lock = `${path}.lock`;
  writeFileSync(lock, "other intake");
  const bytes = Buffer.from(
    JSON.stringify(testArtifacts().target_evidence_lifecycle),
  );
  assert.throws(
    () => recordR8Artifact({ repositoryRoot: root, bytes }),
    /already running/,
  );
  rmSync(lock);
  assert.throws(
    () =>
      recordR8Artifact({
        repositoryRoot: root,
        bytes: Buffer.from("invalid-json"),
      }),
    /JSON artifact/,
  );
  assert.equal(recordR8Artifact({ repositoryRoot: root, bytes }).passed, 1);
});
