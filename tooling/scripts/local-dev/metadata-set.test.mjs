import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectMetadataSet,
  verifyMetadataSet,
  metadataKey,
  metadataHash,
  assertBusinessPartnerMetadataSet,
} from "./metadata-set.mjs";

const tenantId = "44444444-4444-4444-8444-444444444444";
const entity = (key) => ({ kind: "entity", key, plane: "neon" });
const permission = { kind: "permission", key: "neon.bp.read", plane: "neon" };
const resolve = async (reference) => ({
  reference,
  tenantId,
  payload: { code: reference.key },
  requires: reference.kind === "permission" ? [] : [permission],
});

test("captures shared transitive dependencies once", async () => {
  const set = await collectMetadataSet({
    tenantId,
    roots: [entity("bp"), entity("request")],
    resolve,
  });
  assert.equal(set.items.length, 3);
  assert.equal(verifyMetadataSet(set), set);
  const replay = await collectMetadataSet({
    tenantId,
    roots: [entity("request"), entity("bp")],
    resolve,
  });
  assert.equal(metadataHash(set), metadataHash(replay));
});
test("allows cyclic entity relations without losing closure", async () => {
  const set = await collectMetadataSet({
    tenantId,
    roots: [entity("bp")],
    resolve: async (reference) => ({
      reference,
      tenantId,
      payload: { code: reference.key },
      requires: [entity(reference.key === "bp" ? "request" : "bp")],
    }),
  });
  assert.equal(set.items.length, 2);
});
test("rejects missing, changed, substituted and foreign-tenant metadata", async () => {
  await assert.rejects(
    collectMetadataSet({
      tenantId,
      roots: [entity("bp")],
      resolve: async () => null,
    }),
    /Missing/,
  );
  await assert.rejects(
    collectMetadataSet({
      tenantId,
      roots: [entity("bp")],
      resolve: async (reference) => ({
        ...(await resolve(reference)),
        tenantId: "other",
      }),
    }),
    /Cross-tenant/,
  );
  await assert.rejects(
    collectMetadataSet({
      tenantId,
      roots: [entity("bp")],
      resolve: async (reference) => ({
        ...(await resolve(reference)),
        reference: entity("other"),
      }),
    }),
    /different coordinate/,
  );
  const set = await collectMetadataSet({
    tenantId,
    roots: [entity("bp")],
    resolve,
  });
  const missing = structuredClone(set);
  missing.items = missing.items.filter(
    (item) => metadataKey(item.reference) !== metadataKey(permission),
  );
  assert.throws(() => verifyMetadataSet(missing), /Missing/);
  set.items[0].payload.code = "changed";
  assert.throws(() => verifyMetadataSet(set), /content mismatch/);
});
test("cannot label a single definition as complete BP dependencies", async () => {
  const set = await collectMetadataSet({
    tenantId,
    roots: [entity("bp")],
    resolve,
  });
  assert.throws(
    () => assertBusinessPartnerMetadataSet(set, tenantId, {}),
    /Required BP/,
  );
});
test("rejects duplicate roots, hidden extra payloads and unbounded traversal", async () => {
  await assert.rejects(
    collectMetadataSet({
      tenantId,
      roots: [entity("bp"), entity("bp")],
      resolve,
    }),
    /Duplicate metadata root/,
  );
  await assert.rejects(
    collectMetadataSet({ tenantId, roots: [entity("bp")], resolve, limit: 1 }),
    /exceeds limit/,
  );
  const set = await collectMetadataSet({
    tenantId,
    roots: [entity("bp"), entity("other")],
    resolve,
  });
  set.roots = [entity("bp")];
  assert.throws(() => verifyMetadataSet(set), /Unreachable/);
});
