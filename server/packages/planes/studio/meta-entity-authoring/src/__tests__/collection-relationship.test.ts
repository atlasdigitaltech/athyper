import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { KyselyMetaEntityAuthoringRepository } from "../kysely-authoring-repository.js";
import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileGraph,
  runContractTests,
  validateGraph,
} from "../deterministic.js";

const historicalCandidate = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../../governance/policy/reviews/bp-dependencies-20260912/child-storage.candidate.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as MetaEntityGraph;
const binding = {
  schemaVersion: 1 as const, entityCode: "business_partner_request", planeKey: "neon" as const,
  subjectEntityCode: "master.business_partner", permissionCode: "neon.relationship.entity_case.read",
  detailRouteTemplate: "/app/entity/business_partner_request/:recordId",
};
const candidate: MetaEntityGraph = { ...historicalCandidate, surfaces: historicalCandidate.surfaces!.map(surface => ({
  ...surface, layoutConfig: { ...surface.layoutConfig, collectionCompilation: binding },
})) };
it("rejects an unsupported historical field property before any graph write", async () => {
  // SQL-adapter test, not live PostgreSQL/RLS qualification.
  const tables = new Map<string, Record<string, unknown>[]>();
  const saves = new Map<number, { graph: unknown; graph_hash: unknown }>();
  let serializedBinding = false;
  const query = async (statement: string, parameters: unknown[] = []) => {
    let result: unknown[] = [];
    if (statement.includes("fn_advance_entity_change_set")) result = [{ revision: 2 }];
    // This test edits an existing draft. Stored protection is explicit fixture
    // evidence, not a default inferred from the incoming legacy graph.
    else if (statement.includes("SELECT o.id,o.requires_mfa")) result = candidate.operations.map(operation => ({ id: operation.id, requires_mfa: true }));
    else if (statement.includes("SELECT e.entity_code,e.entity_class")) result = [{
      entity_code: candidate.entity.entityCode, entity_class: candidate.entity.entityClass ?? "document",
      ownership_model: candidate.entity.ownershipModel ?? "tenant",
    }];
    else if (statement.includes("SELECT cs.*")) result = [{
      id: "change", tenant_id: "tenant", entity_id: "entity", entity_code: candidate.entity.entityCode,
      branch_code: "main", status: "draft", lock_version: statement.includes("FOR UPDATE") ? 1 : 2, created_by: "actor",
    }];
    else if (statement.includes("SELECT tenant_id,entity_id")) result = [{ tenant_id: "tenant", entity_id: "entity" }];
    else if (statement.includes("INSERT INTO snapshot.entity_draft_save"))
      saves.set(Number(parameters[1]), { graph: JSON.parse(String(parameters[3])), graph_hash: parameters[4] });
    else if (statement.includes("SELECT graph, graph_hash")) result = [saves.get(Number(parameters[1]))!];
    else {
      const insert = statement.match(/INSERT INTO "metadata"\."([^"]+)" \(([^)]+)\)/);
      const select = statement.match(/FROM "metadata"\."([^"]+)"/);
      if (insert) {
        const columns = insert[2]!.split(",").map(column => column.trim().replaceAll('"', ''));
        const row = Object.fromEntries(columns.map((column, i) => {
          const value = parameters[i];
          return [column, typeof value === "string" && value.startsWith("{") ? JSON.parse(value) : value];
        }));
        tables.set(insert[1]!, [...tables.get(insert[1]!) ?? [], row]);
        if (insert[1] === "entity_surface") {
          expect((row.layout_config as Record<string, unknown>).collectionCompilation).toEqual(binding);
          expect(statement).toContain("::jsonb");
          serializedBinding = true;
        }
      } else if (statement.includes("SELECT to_jsonb") && select)
        result = (tables.get(select[1]!) ?? []).map(value => ({ value }));
    }
    return { rows: result };
  };
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({
    pool: { connect: async () => ({ query, release() {} }), async end() {} } as never,
  }) });
  const repository = new KyselyMetaEntityAuthoringRepository(db);
  try {
    await expect(repository.replaceGraph({ changeSetId: "change", expectedRevision: 1, actorId: "actor",
      graph: { ...candidate, classProfiles: [], tests: [] } })).rejects.toThrow("entity_field.nullSemantics");
    expect(serializedBinding).toBe(false);
    expect(tables.size).toBe(0);
    expect(saves.size).toBe(0);
  } finally { await db.destroy(); }
});
it("compiles the BP review collection with independent read policy and complete field coverage", () => {
  expect(validateGraph(candidate).issues).toEqual([]);
  expect(runContractTests(candidate).passed).toBe(true);
  const artifact = compileGraph(candidate);
  expect(artifact.descriptor.collectionCompilation).toEqual(binding);
  expect(artifact.descriptor.collectionRelationship).toMatchObject({
    scope: {
      contextRef: "operatingOrganizationId",
      fieldRef: "current_snapshot.organization",
    },
  });
  expect(artifact.descriptor.authorization).toMatchObject({
    ownership: "organization.record.v1",
  });
  expect(compileGraph(structuredClone(candidate)).descriptorHash).toBe(
    artifact.descriptorHash,
  );
});
it("blocks historical unbound graphs rather than inferring BP defaults", () => {
  expect(() => compileGraph(historicalCandidate)).toThrow("META_ENTITY_GRAPH_INVALID");
});
it.each(["missing", "orphan", "entity", "subject", "plane", "permission", "version", "route", "unknown"])(
  "rejects invalid compilation binding: %s", mutation => {
    const graph = structuredClone(candidate) as any;
    const config = graph.surfaces[0].layoutConfig;
    if (mutation === "missing") delete config.collectionCompilation;
    if (mutation === "orphan") delete config.collectionRelationship;
    if (mutation === "entity") config.collectionCompilation.entityCode = "other";
    if (mutation === "subject") config.collectionCompilation.subjectEntityCode = "master.other";
    if (mutation === "plane") config.collectionCompilation.planeKey = "mesh";
    if (mutation === "permission") config.collectionCompilation.permissionCode = "neon.other.read";
    if (mutation === "version") config.collectionCompilation.schemaVersion = 2;
    if (mutation === "route") config.collectionCompilation.detailRouteTemplate = "/legacy/:recordId";
    if (mutation === "unknown") config.collectionCompilation.sql = "select *";
    expect(validateGraph(graph).issues.some(issue => issue.code === "COLLECTION_RELATIONSHIP_INVALID")).toBe(true);
    expect(() => compileGraph(graph)).toThrow("META_ENTITY_GRAPH_INVALID");
  },
);
it("includes binding changes in reviewed contract and descriptor hashes", () => {
  const changed = structuredClone(candidate) as any;
  changed.surfaces[0].layoutConfig.collectionCompilation.subjectEntityCode = "master.asset";
  changed.surfaces[0].layoutConfig.collectionRelationship.subject.value = "master.asset";
  expect(compileGraph(changed).contractHash).not.toBe(compileGraph(candidate).contractHash);
  expect(compileGraph(changed).descriptorHash).not.toBe(compileGraph(candidate).descriptorHash);
});
it.each([
  "source",
  "coordinate",
  "storage",
  "resolver",
  "scope",
  "permission",
  "duplicate",
])("rejects a mismatched %s before review and compilation", (mutation) => {
  const graph = structuredClone(candidate) as any;
  const relationship = graph.surfaces[0].layoutConfig.collectionRelationship;
  if (mutation === "source") relationship.sourceRef = "arbitrary_table";
  if (mutation === "coordinate")
    relationship.scope.contextRef = "companyCodeId";
  if (mutation === "storage")
    graph.runtimeProfiles[0].storageObject = "business_partner";
  if (mutation === "resolver")
    graph.operationScopeBindings[1].resolverKey = "unregistered";
  if (mutation === "scope")
    graph.operationScopeBindings[1].scopeKind = "tenant";
  if (mutation === "permission") graph.operationPermissions = [];
  if (mutation === "duplicate")
    graph.surfaces.push({ ...graph.surfaces[0], surfaceKey: "duplicate" });
  expect(
    validateGraph(graph).issues.some(
      (issue) => issue.code === "COLLECTION_RELATIONSHIP_INVALID",
    ),
  ).toBe(true);
  expect(() => compileGraph(graph)).toThrow("META_ENTITY_GRAPH_INVALID");
});
it("does not publish a deprecated relationship declaration", () => {
  const graph = {
    ...candidate,
    surfaces: candidate.surfaces!.map((surface) => ({
      ...surface,
      status: "deprecated" as const,
    })),
  };
  expect(compileGraph(graph).descriptor).not.toHaveProperty(
    "collectionRelationship",
  );
});
