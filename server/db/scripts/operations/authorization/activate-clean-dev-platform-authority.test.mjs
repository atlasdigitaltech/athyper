import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCleanActivationSql } from "./activate-clean-dev-platform-authority.mjs";

const coordinates = {
  "platform.admin": { principalId: "df0159b0-2bdc-55e8-944b-efaa9ed9b8e5", controlSubject: "72d03346-0958-4f3b-a59b-a5e17faee330", legacySubject: "ff001000-0000-0000-0000-000000000002" },
  "platform.owner": { principalId: "41bf4855-6aa1-5e43-bc11-ee2cfa647693", controlSubject: "52380ee6-88a8-4083-947e-d0628871d747", legacySubject: "ff001000-0000-0000-0000-000000000001" },
};

test("defaults to rollback and activates only the seeded local bindings", () => {
  const sql = buildCleanActivationSql(coordinates);
  assert.match(sql, /ROLLBACK;$/);
  assert.match(buildCleanActivationSql(coordinates, true), /COMMIT;$/);
  assert.match(sql, /metadata#>>'\{_seed,source\}'='three-plane-demo:v1'/);
  assert.match(sql, /realm_key='platform-control'/);
  assert.match(sql, /gm\.status='suspended'/);
  assert.match(sql, /auth_epoch=auth_epoch\+1/);
  assert.match(sql, /externalAccountsChanged/);
  assert.doesNotMatch(sql, /DELETE FROM|DROP |CREATE ROLE|ALTER ROLE|DISABLE/);
});

test("rejects missing or altered authority coordinates", () => {
  assert.throws(() => buildCleanActivationSql({}));
  assert.throws(() => buildCleanActivationSql({ ...coordinates, "platform.owner": { ...coordinates["platform.owner"], controlSubject: coordinates["platform.admin"].controlSubject } }));
});
