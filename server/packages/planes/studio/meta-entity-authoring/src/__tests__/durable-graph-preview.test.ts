import { afterEach, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableGraphPreviewStore } from "../durable-graph-preview.js";
const env = {
  ATHYPER_ENV: "local",
  ATHYPER_LOCAL_WORKSPACE: "1",
  ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
};
const paths: string[] = [];
const stores: DurableGraphPreviewStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const path = mkdtempSync(join(tmpdir(), "graph-preview-"));
  paths.push(path);
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const privateKey = keys.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const open = () => {
    const store = new DurableGraphPreviewStore(
      join(path, "state.sqlite"),
      publicKey,
      env,
    );
    stores.push(store);
    return store;
  };
  return {
    open,
    privateKey,
    input: {
      tenantId: "tenant",
      entityCode: "invoice",
      changeSetId: "draft",
      revision: 1,
      graphHash: "a".repeat(64),
    },
  };
}
it("persists one signed multi-plane head across independent connections", () => {
  const f = fixture(),
    writer = f.open(),
    reader = f.open();
  const claim = writer.claim(f.input);
  expect(
    writer.commit(
      claim,
      writer.seal(
        claim,
        { neon: { revision: 1 }, mesh: { revision: 1 } },
        f.privateKey,
      ),
    ),
  ).toBe(true);
  expect(reader.read(f.input)).toMatchObject({
    revision: 1,
    developmentEvidence: true,
    projections: { neon: { revision: 1 }, mesh: { revision: 1 } },
  });
});
it("rejects superseded writers and retains the last active revision on failure", () => {
  const f = fixture(),
    first = f.open(),
    second = f.open();
  const active = first.claim(f.input);
  first.commit(active, first.seal(active, { neon: {} }, f.privateKey));
  const slow = first.claim({ ...f.input, revision: 2 });
  const latest = second.claim({ ...f.input, revision: 3 });
  expect(first.commit(slow, first.seal(slow, { neon: {} }, f.privateKey))).toBe(
    false,
  );
  second.record(latest, { state: "failed", savedRevision: 3 });
  first.record(slow, { state: "active" });
  expect(first.status(f.input)).toEqual({ state: "failed", savedRevision: 3 });
  expect(first.read(f.input)?.revision).toBe(1);
  expect(() => first.claim({ ...f.input, revision: 2 })).toThrow(/STALE_SAVE/);
});
it("rejects altered content and cross-tenant activation", () => {
  const f = fixture(),
    store = f.open(),
    claim = store.claim(f.input);
  const sealed = store.seal(claim, { neon: {} }, f.privateKey);
  expect(() =>
    store.commit(claim, { ...sealed, body: sealed.body + " " }),
  ).toThrow(/ARTIFACT_INVALID/);
  expect(() => store.commit({ ...claim, tenantId: "other" }, sealed)).toThrow(
    /COORDINATE_MISMATCH/,
  );
  expect(store.read({ ...f.input, tenantId: "other" })).toBeUndefined();
  expect(store.read(f.input)).toBeUndefined();
});
it("requires matching local trust and refuses QA construction", () => {
  const f = fixture(),
    store = f.open(),
    claim = store.claim(f.input);
  const wrongKey = generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  expect(() => store.seal(claim, { neon: {} }, wrongKey)).toThrow(
    /TRUST_MISMATCH/,
  );
  expect(
    () =>
      new DurableGraphPreviewStore("unused.sqlite", "", {
        ...env,
        ATHYPER_DOMAIN_SUFFIX: "qa.athyper.test",
      }),
  ).toThrow(/LOCAL_WORKSPACE/);
});
