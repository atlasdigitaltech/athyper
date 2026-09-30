import assert from "node:assert/strict";
import test from "node:test";
import { buildDevelopmentPhase1ListProjection } from "../../provisioning/provision-development-phase1-list-runtimes.js";

test("Phase 1 Neon, Mesh and Studio list publications are deterministic and plane-safe", () => {
  const permission = "11111111-1111-4111-8111-111111111111";
  const neon = buildDevelopmentPhase1ListProjection("neon", permission);
  const mesh = buildDevelopmentPhase1ListProjection("mesh", permission);
  const studio = buildDevelopmentPhase1ListProjection("studio", permission);
  assert.deepEqual(
    mesh,
    buildDevelopmentPhase1ListProjection("mesh", permission),
  );
  assert.deepEqual(neon, buildDevelopmentPhase1ListProjection("neon", permission));
  assert.equal(neon.projection.descriptor.compiled_json.entityCode, "currency");
  assert.equal(neon.projection.descriptor.compiled_json.storage.schema, "shared");
  assert.deepEqual(neon.projection.contract.contract_json.operations, [
    { code: "read", permissionCode: "neon.reference.currency.read" },
  ]);
  assert.deepEqual(neon.projection.descriptor.compiled_json.operations, {
    read: { code: "read", permissionCode: "neon.reference.currency.read" },
  });
  assert.equal(neon.projection.descriptor.compiled_json.listPresentation.dataOperations, undefined);
  assert.equal(neon.releaseNo, 1);
  assert.equal(
    mesh.projection.descriptor.compiled_json.entityCode,
    "network_relationship",
  );
  assert.equal(
    mesh.projection.descriptor.compiled_json.listPresentation.limits
      .defaultPageSize,
    10,
  );
  assert.equal(
    mesh.projection.descriptor.compiled_json.listPresentation.dataOperations
      .importAdapterKey,
    "mesh.network_relationship.request.v1",
  );
  assert.equal(mesh.releaseNo, 5);
  assert.deepEqual(
    mesh.projection.descriptor.compiled_json.listPresentation.dataOperations
      .importFormats,
    ["xlsx", "csv", "json"],
  );
  assert.equal(mesh.projection.contract.release_no, mesh.releaseNo);
  assert.equal(
    mesh.projection.descriptor.compiled_json.operation_scope_bindings[0]
      ?.bindingId,
    buildDevelopmentPhase1ListProjection("mesh", permission).projection
      .descriptor.compiled_json.operation_scope_bindings[0]?.bindingId,
  );
  assert.match(
    JSON.stringify(mesh),
    /mesh\.network_relationship\.actor_account\.v1/,
  );
  assert.deepEqual(
    mesh.projection.descriptor.compiled_json.listPresentation.filterPresentation.quickFields.map(
      (item) => item.field,
    ),
    ["status", "relationship_kind", "effective_from", "updated_at"],
  );
  assert.equal(
    studio.projection.descriptor.compiled_json.entityCode,
    "metadata_entity",
  );
  assert.equal(
    studio.projection.descriptor.compiled_json.listPresentation.identityField,
    "entity_code",
  );
  assert.equal(
    studio.projection.descriptor.compiled_json.listPresentation.dataOperations
      .importAdapterKey,
    "studio.metadata_entity.draft.v1",
  );
  assert.deepEqual(
    studio.projection.descriptor.compiled_json.listPresentation.dataOperations
      .importFormats,
    ["xlsx", "csv", "json"],
  );
  assert.deepEqual(
    studio.projection.descriptor.compiled_json.listPresentation.filterPresentation.quickFields.map(
      (item) => item.field,
    ),
    ["status", "entity_class", "ownership_model", "updated_at"],
  );
  assert.match(JSON.stringify(studio), /tenant_context/);
  assert.notEqual(mesh.artifactHash, studio.artifactHash);
});
