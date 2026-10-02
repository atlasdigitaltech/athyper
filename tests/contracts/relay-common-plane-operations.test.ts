import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_PARTNER_RELAY_OPERATIONS,
  COMMON_PLANE_RELAY_OPERATIONS,
  ENTITY_LIST_QUERY_OPERATION,
  ENTITY_REFERENCE_CHOICES_OPERATION,
  ENTITY_DETAIL_READ_OPERATION,
  ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS,
  MESH_NETWORK_ACCOUNTS_OPERATION,
  NEON_WORK_CONTEXTS_OPERATION,
  STUDIO_BP_LOCAL_PREVIEW_OPERATION,
  IAM_ME_OPERATION,
  relaySessionFromAuth,
} from "../../packages/platform/gateway/bff-relay/src/index";

const routeKey = (operation: { method: string; path: string }) =>
  `${operation.method} ${operation.path}`;

test("common operations retain IAM and the session adapter preserves authority", async () => {
  assert.ok(COMMON_PLANE_RELAY_OPERATIONS.includes(IAM_ME_OPERATION));
  const request = new Request("https://example.invalid/api/relay/iam/me");
  const calls: unknown[][] = [];
  const authority = relaySessionFromAuth({
    async resolveRelaySession(input) {
      calls.push(["resolve", input]);
      return undefined;
    },
    async refreshRelaySession(input) {
      calls.push(["refresh", input]);
      return undefined;
    },
    async invalidateRelaySession(input, reason) {
      calls.push(["invalidate", input, reason]);
      return ["expired-cookie"];
    },
  });
  assert.equal(await authority.resolve(request), undefined);
  assert.equal(await authority.refresh(request), undefined);
  assert.deepEqual(await authority.invalidate(request, "context_mismatch"), [
    "expired-cookie",
  ]);
  assert.deepEqual(calls, [
    ["resolve", request],
    ["refresh", request],
    ["invalidate", request, "context_mismatch"],
  ]);
});

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
  assert.ok(ids.has(ENTITY_DETAIL_READ_OPERATION.id));
  assert.equal(ENTITY_DETAIL_READ_OPERATION.requiresTenant, true);
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

test("reference choices use a tenant-authenticated GET in every common plane relay", () => {
  assert.ok(
    COMMON_PLANE_RELAY_OPERATIONS.includes(ENTITY_REFERENCE_CHOICES_OPERATION),
  );
  assert.equal(ENTITY_REFERENCE_CHOICES_OPERATION.method, "GET");
  assert.equal(ENTITY_REFERENCE_CHOICES_OPERATION.requiresTenant, true);
  assert.equal(
    ENTITY_REFERENCE_CHOICES_OPERATION.path,
    "/api/entity-runtime/:entityCode/references/:fieldKey",
  );
});
