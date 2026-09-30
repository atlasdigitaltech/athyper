import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  qaPublicationDocument,
  loadQaPublication,
} from "../src/qa-publication.mjs";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "qa-signing-"));
  const refs = {
    PUBLICATION_APPLIER_PRINCIPAL_CODE: "seed.three-plane-provisioner",
    PUBLICATION_TARGET_PLANES: "neon",
    PUBLICATION_RUNTIME_VERSION: "1.0.0",
    PUBLICATION_SIGNING_KEY_ID: "athyper-qa-publication-ed25519-20260912",
    PUBLICATION_PRIVATE_KEY_REFERENCE:
      "PUBLICATION_QA_ED25519_PRIVATE_20260912",
    PUBLICATION_PUBLIC_KEY_REFERENCE: "PUBLICATION_QA_ED25519_PUBLIC_20260912",
    INFISICAL_URL: "https://secrets.qa.athyper.test:8443",
    INFISICAL_WORKSPACE_ID: "c3764e8e-2db7-4d7b-a714-49407ffb6936",
    INFISICAL_ENVIRONMENT: "qa",
    INFISICAL_SECRET_PATH: "/",
    PUBLICATION_INFISICAL_TOKEN_FILE: join(
      root,
      "instances/qa/secrets/publication-infisical-token",
    ),
  };
  const instance = {
    metadata: { id: "qa" },
    spec: {
      domainSuffix: "qa.athyper.test",
      composeProject: "athyper-qa-candidate-1789163256545",
    },
  };
  const path = join(root, "instances/qa/config/publication.compose.json"),
    refsPath = join(root, "instances/qa/secrets/publication-environment.json");
  mkdirSync(join(root, "instances/qa/config"), { recursive: true });
  mkdirSync(join(root, "instances/qa/secrets"), { recursive: true });
  const doc = qaPublicationDocument(
    root,
    refs,
    "sha256:" + "a".repeat(64),
    "1000:1000",
  );
  const save = () => {
    writeFileSync(path, JSON.stringify(doc), { mode: 0o600 });
    writeFileSync(refsPath, JSON.stringify(refs), { mode: 0o600 });
  };
  save();
  return {
    root,
    refs,
    instance,
    path,
    doc,
    save,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}
test("loads only the isolated QA profile and preserves application image bindings", () => {
  const f = fixture();
  try {
    assert.equal(loadQaPublication(f.root, f.instance), f.path);
    assert.equal(f.doc.services.api.image, undefined);
    assert.equal(loadQaPublication(f.root, { metadata: { id: "dev" } }), null);
    assert.throws(
      () =>
        loadQaPublication(f.root, {
          ...f.instance,
          spec: { ...f.instance.spec, composeProject: "athyper-qa" },
        }),
      /isolated/,
    );
  } finally {
    f.close();
  }
});
test("rejects DEV trust, alternate targets and additional environment settings", () => {
  const f = fixture();
  try {
    for (const change of [
      { INFISICAL_ENVIRONMENT: "dev" },
      { PUBLICATION_SIGNING_KEY_ID: "athyper-dev-signing" },
      { PUBLICATION_TARGET_PLANES: "mesh" },
      { ATHYPER_LOCAL_PREVIEW_ROOT: "/tmp/preview" },
    ])
      assert.throws(() =>
        qaPublicationDocument(
          f.root,
          { ...f.refs, ...change },
          "sha256:" + "a".repeat(64),
          "1000:1000",
        ),
      );
  } finally {
    f.close();
  }
});
test("rejects application image substitution and disabled signature verification", () => {
  for (const change of ["image", "signature"]) {
    const f = fixture();
    try {
      if (change === "image") f.doc.services.api.image = "unreviewed:latest";
      else
        f.doc.services.worker.environment.PUBLICATION_REQUIRE_SIGNATURE =
          "false";
      f.save();
      assert.throws(
        () => loadQaPublication(f.root, f.instance),
        /Unsupported QA/,
      );
    } finally {
      f.close();
    }
  }
});
