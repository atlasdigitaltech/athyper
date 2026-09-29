import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMON_PLANE_RELAY_OPERATIONS,
  ENTITY_LIST_QUERY_OPERATION,
  ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS,
  MESH_NETWORK_ACCOUNTS_OPERATION,
  NEON_WORK_CONTEXTS_OPERATION,
  STUDIO_BP_LOCAL_PREVIEW_OPERATION,
} from "@athyper/platform-gateway-bff-relay";

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
