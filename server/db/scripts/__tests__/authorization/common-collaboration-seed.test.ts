import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deterministicPermissionId } from "../../seed/canonical-catalog-v2-model.js";
import { isCommonCapabilityAction } from "../../../../packages/contracts/publication/src/common-capability-permissions.js";

test("common collaboration seed uses exactly the closed capability vocabulary and deterministic IDs", () => {
  const source = readFileSync(new URL("../../../ddl/common/authz/18_common_collaboration_permissions.sql", import.meta.url), "utf8");
  const entries = [...source.matchAll(/\('([a-f0-9-]+)'::uuid,'(common\.collaboration\.(comment|attachment)\.([a-z_]+))','(low|medium)'\)/g)];
  assert.equal(entries.length, 9);
  assert.equal(new Set(entries.map(entry => entry[2])).size, 9);
  for (const [, id, code, resource, action, risk] of entries) {
    assert.equal(id, deterministicPermissionId(code!));
    const kind = resource === "comment" ? "comments" : "attachments";
    assert.equal(isCommonCapabilityAction(kind, { key: action!, permissionCode: code!, handlerKey: `platform.${kind}.${action}.v1` }), true);
    assert.equal(risk, ["read", "download"].includes(action!) ? "low" : "medium");
  }
  assert.match(source, /'tenant','exact','active'/);
  assert.doesNotMatch(source, /INSERT INTO authz\.(role_permission|group_role)|GRANT |country|business_partner/);
  assert.match(source, /ON CONFLICT\(canonical_code\) DO NOTHING/);
  assert.match(source, /RAISE EXCEPTION 'Common collaboration catalog conflict/);
});
