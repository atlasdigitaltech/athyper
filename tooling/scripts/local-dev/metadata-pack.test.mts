import { test } from "node:test";
import assert from "node:assert/strict";
import { packMetadataIndex } from "./metadata-pack.mts";
import { verifyNativeMetadataGraphs } from "./metadata-graphs.mts";
import { metadataHash } from "./metadata-set.mjs";

const tenantId = "44444444-4444-4444-8444-444444444444";
const reference = { kind: "entity", key: "invoice", plane: "neon" };
function index() {
  return {
    schema: "athyper.metadata-source-index/1",
    tenantId,
    roots: [reference],
    records: [
      {
        reference,
        tenantId,
        requires: [],
        payload: {
          sourceEntityId: "11111111-1111-4111-8111-111111111111",
          graph: {
            contractSchema: "athyper.meta-entity-contract/2.1",
            entity: { entityCode: "invoice" },
            fields: [
              {
                fieldKey: "id",
                dataType: "uuid",
                typeConfig: { kind: "uuid" },
              },
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
        },
      },
    ],
  };
}
test("packs native compiler output reproducibly and detects a replaced compilation", async () => {
  const source = index();
  const set = await packMetadataIndex(source);
  assert.equal(verifyNativeMetadataGraphs(set).length, 1);
  assert.equal(
    metadataHash(set),
    metadataHash(await packMetadataIndex(source)),
  );
  set.items[0].payload.compiled.descriptorHash = "0".repeat(64);
  // Even recomputing the transport hash cannot disguise a compiler mismatch.
  const item = set.items[0];
  item.sha256 = metadataHash({
    reference: item.reference,
    payload: item.payload,
    requires: item.requires,
  });
  assert.throws(
    () => verifyNativeMetadataGraphs(set),
    /compiler output mismatch/,
  );
});
test("discovers native external references even when the index omits them", async () => {
  const source: any = index();
  source.records[0].payload.graph.runtimeProfiles[0].readHandlerKey =
    "platform.invoice.read.v1";
  await assert.rejects(
    packMetadataIndex(source),
    /Missing metadata dependency/,
  );
  source.records.push({
    reference: { kind: "handler", key: "platform.invoice.read.v1" },
    tenantId: null,
    requires: [],
    payload: { sourceRevision: "a".repeat(40) },
  });
  const set = await packMetadataIndex(source);
  assert.equal(set.items.length, 2);
  const graph = set.items.find((item) => item.reference.kind === "entity");
  graph.requires = [];
  graph.sha256 = metadataHash({
    reference: graph.reference,
    payload: graph.payload,
    requires: graph.requires,
  });
  // Drop the dependency as well: closure alone passes, native graph audit fails.
  set.items = [graph];
  assert.throws(
    () => verifyNativeMetadataGraphs(set),
    /Undeclared native graph dependency/,
  );
});
