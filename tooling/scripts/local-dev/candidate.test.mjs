import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha, verifyPackage, verifyCandidate } from "./candidate.mjs";
import { collectMetadataSet } from "./metadata-set.mjs";
import { REQUIRED_IMAGES } from "../release/promote-image-set.mjs";
const authoring = () => {
  const revision = {
    bundleCode: "business_partner.onboarding",
    bundle: { bundleCode: "business_partner.onboarding" },
  };
  return {
    schema: "athyper.authoring-export/1",
    revision,
    bundleSha256: sha(revision.bundle),
  };
};
test("rejects a modified authoring export", () => {
  const doc = authoring();
  verifyPackage(doc);
  doc.revision.bundle.extra = true;
  assert.throws(() => verifyPackage(doc), /mismatch/);
});
test("candidate binds all files and one source revision", () => {
  const root = mkdtempSync(join(tmpdir(), "candidate-"));
  try {
    const revision = "1".repeat(40),
      images = {
        apiVersion: "athyper.io/v1alpha1",
        kind: "ImageSet",
        metadata: { channel: "candidate" },
        spec: {
          sourceRevision: revision,
          images: REQUIRED_IMAGES.map((id) => ({
            id,
            reference: `registry/${id}@sha256:${"a".repeat(64)}`,
          })),
        },
      };
    const data = {
      "authoring.json": authoring(),
      "images.yaml": images,
      "compiled.json": {},
      "migrations.json": [],
    };
    for (const [name, value] of Object.entries(data))
      writeFileSync(join(root, name), JSON.stringify(value));
    const manifest = {
      schema: "athyper.local-candidate/1",
      sourceRevision: revision,
      files: Object.fromEntries(
        Object.keys(data).map((name) => [
          name,
          sha(readFileSync(join(root, name), "utf8")),
        ]),
      ),
    };
    writeFileSync(join(root, "candidate.json"), JSON.stringify(manifest));
    assert.equal(verifyCandidate(root).release.spec.sourceRevision, revision);
    writeFileSync(join(root, "compiled.json"), "changed");
    assert.throws(() => verifyCandidate(root), /changed/);
    delete manifest.files["compiled.json"];
    writeFileSync(join(root, "candidate.json"), JSON.stringify(manifest));
    assert.throws(() => verifyCandidate(root), /all required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("v2 binds the metadata set without upgrading v1 evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "candidate-v2-"));
  try {
    const revision = "1".repeat(40),
      document = authoring();
    document.revision.tenantId = "44444444-4444-4444-8444-444444444444";
    const roots = [
      { kind: "entity", key: "business_partner", plane: "neon" },
      { kind: "entity", key: "business_partner_request", plane: "neon" },
      { kind: "case_contract", key: "master.business_partner", plane: "neon" },
      { kind: "definition", key: "business_partner.onboarding", plane: "neon" },
    ];
    // Transport-only fixture; freeze separately requires native graph compilation.
    const metadata = await collectMetadataSet({
      tenantId: document.revision.tenantId,
      roots,
      resolve: async (reference) => ({
        reference,
        tenantId: document.revision.tenantId,
        requires: [],
        payload:
          reference.kind === "definition"
            ? document.revision.bundle
            : { fixture: true },
      }),
    });
    const data = {
      "authoring.json": document,
      "compiled.json": {},
      "migrations.json": [],
      "metadata.json": metadata,
      "images.yaml": {
        apiVersion: "athyper.io/v1alpha1",
        kind: "ImageSet",
        metadata: { channel: "candidate" },
        spec: {
          sourceRevision: revision,
          images: REQUIRED_IMAGES.map((id) => ({
            id,
            reference: `registry/${id}@sha256:${"a".repeat(64)}`,
          })),
        },
      },
    };
    for (const [name, value] of Object.entries(data))
      writeFileSync(join(root, name), JSON.stringify(value));
    const manifest = {
      schema: "athyper.local-candidate/2",
      sourceRevision: revision,
      files: Object.fromEntries(
        Object.keys(data).map((name) => [
          name,
          sha(readFileSync(join(root, name), "utf8")),
        ]),
      ),
    };
    writeFileSync(join(root, "candidate.json"), JSON.stringify(manifest));
    assert.equal(verifyCandidate(root).metadata.items.length, 4);
    delete manifest.files["metadata.json"];
    writeFileSync(join(root, "candidate.json"), JSON.stringify(manifest));
    assert.throws(() => verifyCandidate(root), /all required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
