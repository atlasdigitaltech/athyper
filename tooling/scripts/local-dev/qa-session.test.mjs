import { test } from "node:test";
import assert from "node:assert/strict";
import { accounts, tenantId, validateSession } from "./qa-session.mjs";
const valid = {
  state: "authenticated",
  plane: "studio",
  tenantId,
  principalId: accounts["catl.admin"],
};
test("accepts the verified existing Cirrus account", () =>
  validateSession(valid, "studio", "catl.admin"));
test("rejects wrong account, tenant, plane and expired sessions", () => {
  for (const change of [
    { principalId: accounts["catl.owner"] },
    { tenantId: "another-tenant" },
    { plane: "neon" },
    { state: "anonymous" },
  ]) {
    assert.throws(() =>
      validateSession({ ...valid, ...change }, "studio", "catl.admin"),
    );
  }
  assert.throws(() => validateSession(valid, "studio", "__proto__"));
  assert.throws(() => validateSession(undefined, "studio", "catl.admin"));
});
