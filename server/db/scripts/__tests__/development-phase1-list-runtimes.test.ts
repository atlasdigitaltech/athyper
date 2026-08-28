import assert from "node:assert/strict";
import test from "node:test";
import { buildDevelopmentPhase1ListProjection } from "../provision-development-phase1-list-runtimes.js";

test("Phase 1 Mesh and Studio list publications are deterministic and plane-safe", () => {
  const permission = "11111111-1111-4111-8111-111111111111";
  const mesh = buildDevelopmentPhase1ListProjection("mesh", permission);
  const studio = buildDevelopmentPhase1ListProjection("studio", permission);
  assert.deepEqual(mesh, buildDevelopmentPhase1ListProjection("mesh", permission));
  assert.equal(mesh.projection.descriptor.compiled_json.entityCode, "network_relationship");
  assert.equal(mesh.projection.descriptor.compiled_json.listPresentation.limits.defaultPageSize, 10);
  assert.equal(mesh.projection.descriptor.compiled_json.listPresentation.dataOperations.importAdapterKey,"mesh.network_relationship.request.v1");
  assert.equal(mesh.releaseNo,2);
  assert.equal(mesh.projection.contract.release_no, mesh.releaseNo);
  assert.equal(mesh.projection.descriptor.compiled_json.operation_scope_bindings[0]?.bindingId,
    buildDevelopmentPhase1ListProjection("mesh", permission).projection.descriptor.compiled_json.operation_scope_bindings[0]?.bindingId);
  assert.match(JSON.stringify(mesh), /mesh\.network_relationship\.actor_account\.v1/);
  assert.equal(studio.projection.descriptor.compiled_json.entityCode, "metadata_entity");
  assert.equal(studio.projection.descriptor.compiled_json.listPresentation.identityField, "entity_code");
  assert.equal(studio.projection.descriptor.compiled_json.listPresentation.dataOperations.importAdapterKey,"studio.metadata_entity.draft.v1");
  assert.match(JSON.stringify(studio), /tenant_context/);
  assert.notEqual(mesh.artifactHash, studio.artifactHash);
});
