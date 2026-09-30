import { expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DurableGraphPreviewStore } from "../durable-graph-preview.js";
import { createDurableGraphPreview } from "../durable-graph-preview-adapter.js";
import type { GraphPreviewInput } from "../graph-preview.js";
const env = {
  ATHYPER_ENV: "local",
  ATHYPER_LOCAL_WORKSPACE: "1",
  ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
};
it("native compiler failures preserve durable active status and the next save recovers", async () => {
  const root = mkdtempSync(join(tmpdir(), "durable-adapter-"));
  const keys = generateKeyPairSync("ed25519");
  const store = new DurableGraphPreviewStore(
    join(root, "preview.sqlite"),
    keys.publicKey.export({ format: "pem", type: "spki" }).toString(),
    env,
  );
  let allowed = true;
  const preview = createDurableGraphPreview(
    {
      store,
      privateKey: keys.privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      assertCurrent: async () => {
        if (!allowed) throw Error("AUTHOR_DENIED");
      },
      resolve: async () => {},
      project: async (_input, artifact) => ({
        neon: { descriptor: artifact.descriptor, operationBindings: [] },
      }),
    },
    env,
  );
  const input: GraphPreviewInput = {
    actorId: "author",
    changeSet: {
      id: "change",
      tenantId: "tenant",
      entityId: "entity",
      entityCode: "invoice",
      branchCode: "main",
      status: "draft",
      revision: 1,
      createdBy: "author",
    },
    graph: {
      contractSchema: "athyper.meta-entity-contract/2.1",
      entity: { entityCode: "invoice" },
      fields: [
        { fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" } },
      ],
      operations: [],
      runtimeProfiles: [
        {
          backingKind: "virtual",
          apiExposure: "catalog_only",
          readMode: "none",
          writeMode: "none",
          concurrencyMode: "none",
        },
      ],
    },
  };
  try {
    expect(await preview.saved(input)).toMatchObject({
      state: "active",
      activeRevision: 1,
      activeChangeSetId: "change",
    });
    const bad = structuredClone(input);
    bad.changeSet = { ...bad.changeSet, revision: 2 };
    bad.graph = {
      ...bad.graph,
      fields: [...bad.graph.fields, ...bad.graph.fields],
    };
    expect(await preview.saved(bad)).toMatchObject({
      state: "failed",
      savedRevision: 2,
      activeRevision: 1,
    });
    expect(await preview.status(bad.changeSet)).toMatchObject({
      state: "failed",
      activeRevision: 1,
    });
    const next = { ...input, changeSet: { ...input.changeSet, revision: 3 } };
    expect(await preview.saved(next)).toMatchObject({
      state: "active",
      savedRevision: 3,
      activeRevision: 3,
    });
    allowed = false;
    await expect(
      preview.saved({ ...next, changeSet: { ...next.changeSet, revision: 4 } }),
    ).rejects.toThrow("AUTHOR_DENIED");
    expect(
      store.read({ tenantId: "tenant", entityCode: "invoice" })?.revision,
    ).toBe(3);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
