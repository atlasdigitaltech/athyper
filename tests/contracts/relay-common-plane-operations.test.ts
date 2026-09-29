import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_PARTNER_RELAY_OPERATIONS,
  COMMON_PLANE_RELAY_OPERATIONS,
  ENTITY_LIST_QUERY_OPERATION,
  ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS,
  MESH_NETWORK_ACCOUNTS_OPERATION,
  NEON_WORK_CONTEXTS_OPERATION,
  STUDIO_BP_LOCAL_PREVIEW_OPERATION,
} from "../../packages/platform/gateway/bff-relay/src/index";

const routeKey = (operation: { method: string; path: string }) =>
  `${operation.method} ${operation.path}`;

test("common plane relay operations have unique ids and routes", () => {
  const ids = COMMON_PLANE_RELAY_OPERATIONS.map((operation) => operation.id);
  assert.equal(new Set(ids).size, ids.length);
  const routes = COMMON_PLANE_RELAY_OPERATIONS.map(routeKey);
  assert.equal(new Set(routes).size, routes.length);
});

test("common plane relay operations carry the shared entity runtime", () => {
  const ids = new Set(
    COMMON_PLANE_RELAY_OPERATIONS.map((operation) => operation.id),
  );
  assert.ok(ids.has(ENTITY_LIST_QUERY_OPERATION.id));
  for (const operation of ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS)
    assert.ok(ids.has(operation.id), operation.id);
  assert.ok([...ids].some((id) => id.startsWith("collaboration.")));
});

test("plane-specific operations stay out of the common group", () => {
  const ids = new Set(
    COMMON_PLANE_RELAY_OPERATIONS.map((operation) => operation.id),
  );
  for (const operation of [
    NEON_WORK_CONTEXTS_OPERATION,
    MESH_NETWORK_ACCOUNTS_OPERATION,
    STUDIO_BP_LOCAL_PREVIEW_OPERATION,
  ]) {
    assert.ok(!ids.has(operation.id), operation.id);
  }
});

test("common plane relay operations carry every attachment operation once", () => {
  const ids = COMMON_PLANE_RELAY_OPERATIONS.map((operation) => operation.id);
  for (const id of [
    "attachments.stage",
    "attachments.finalize",
    "attachments.status",
    "attachments.browse",
    "attachments.remove",
    "attachments.rename",
    "attachments.folder",
    "attachments.download",
    "attachments.preview",
    "attachments.extract",
    "attachments.search",
    "attachments.category",
    "attachments.archive-outcome",
    "attachments.archive",
  ])
    assert.equal(ids.filter((item) => item === id).length, 1, id);
});

test("plane-specific groups do not re-register attachment operations", () => {
  assert.ok(
    !BUSINESS_PARTNER_RELAY_OPERATIONS.some((operation) =>
      operation.id.startsWith("attachments."),
    ),
  );
});
