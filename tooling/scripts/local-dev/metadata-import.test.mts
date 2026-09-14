import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectMetadataSet, metadataHash } from "./metadata-set.mjs";
import { compileGraph } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { graphDependencies } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-dependencies.js";
import {
  planMetadataImport,
  equivalentNativeGraph,
  importNativeMetadata,
} from "./metadata-import.mts";
const tenantId = "44444444-4444-4444-8444-444444444444";
async function fixture() {
  const graph = JSON.parse(
    readFileSync(
      new URL(
        "../../../governance/policy/reviews/bp-dependencies-20260912/child-process.candidate.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  // The submitted proposal used a legacy layout name; native persistence uses grid.
  graph.surfaces[0].layoutKind = "grid";
  const root = {
    kind: "entity",
    key: "business_partner_request",
    plane: "neon",
  };
  return collectMetadataSet({
    tenantId,
    roots: [root],
    resolve: async (reference: any) => ({
      reference,
      tenantId,
      payload:
        reference.kind === "entity"
          ? {
              sourceEntityId: "11111111-1111-4111-8111-111111111111",
              sourceArtifactHash: "a".repeat(64),
              registration: {
                schemaVersion: 1,
                moduleCode: "bp",
                entityClass: "process",
                ownershipModel: "tenant",
              },
              graph,
              compiled: compileGraph(graph),
            }
          : {
              entityId: "22222222-2222-4222-8222-222222222222",
              publicationKey: "metadata.case.business_partner",
              contract: { type: "object" },
            },
      requires: reference.kind === "entity" ? graphDependencies(graph) : [],
    }),
  });
}
test("native candidate import forks deterministic rows and never copies approval", async () => {
  const document = await fixture(),
    before = metadataHash(document),
    a = planMetadataImport(document),
    b = planMetadataImport(document);
  assert.deepEqual(a, b);
  assert.equal(metadataHash(document), before);
  assert.equal(a.approvalCopied, false);
  assert.notEqual(
    a.entities[0].graph.fields[0].id,
    document.items.find((item: any) => item.reference.kind === "entity").payload
      .graph.fields[0].id,
  );
  compileGraph(a.entities[0].graph);
});
test("native readback accepts empty branches and rejects altered field semantics", () => {
  const graph = {
    entity: { entityCode: "invoice" },
    fields: [{ id: "field", fieldKey: "name" }],
    operations: [],
    classProfiles: [{ id: "old", entityClass: "business" }],
  };
  assert.equal(
    equivalentNativeGraph(graph, {
      ...graph,
      relations: [],
      classProfiles: [{ id: "new", entityClass: "business" }],
    }),
    true,
  );
  assert.equal(
    equivalentNativeGraph(graph, {
      ...graph,
      fields: [{ id: "field", fieldKey: "amount" }],
    }),
    false,
  );
});
test("all dependency preflight finishes before native writes", async () => {
  const calls: any[] = [];
  await assert.rejects(
    importNativeMetadata(
      await fixture(),
      {
        request: async (...args) => {
          calls.push(args);
          return [];
        },
      },
      {
        verifyPrerequisites: async () => {
          throw Error("MISSING_CATALOG");
        },
        checkpoint: async () => {},
      },
    ),
    /MISSING_CATALOG/,
  );
  assert.equal(calls.length, 0);
});
test("native import writes drafts and verifies readback without reviewing or publishing", async () => {
  const document = await fixture(),
    calls: any[] = [],
    checkpoints: any[] = [];
  let graph: any = { fields: [], operations: [] },
    revision = 0;
  const result = await importNativeMetadata(
    document,
    {
      async request(method, path, body) {
        calls.push({ method, path });
        if (path.endsWith("/change-sets") && method === "GET") return [];
        if (path.endsWith("/change-sets"))
          return { id: "draft", revision, status: "draft" };
        if (method === "PUT") {
          graph = structuredClone(body);
          revision++;
          return { id: "draft", revision, status: "draft" };
        }
        if (path.endsWith("/graph"))
          return {
            changeSet: { id: "draft", revision, status: "draft" },
            graph,
          };
        if (path.endsWith("/business-partner-case-contracts"))
          return {
            id: "case",
            contract: (body as any).bundle.candidate.contract,
            contractHash: "test",
          };
        throw Error("Unexpected operation");
      },
    },
    {
      verifyPrerequisites: async () => {},
      checkpoint: async (value) => {
        checkpoints.push(structuredClone(value));
      },
    },
  );
  assert.equal(result.entities[0].state, "draft");
  assert.equal(result.releaseQualified, false);
  assert.ok(checkpoints.length >= 2);
  assert.ok(
    calls.every((call) => !/(approve|publish|activate)/.test(call.path)),
  );
});
