import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts";
import { installationSql } from "./install-operation-bootstrap.dev.mjs";
const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const sources = [
  {
    entity_id: id(1),
    entity_code: "synthetic",
    source_change_set_id: id(2),
    source_revision: 4,
    source_operation_id: id(3),
    operation_key: "read",
    requires_mfa: false,
  },
];
const input = {
  sources,
  targets: [{ entityId: id(1), changeSetId: id(4) }],
  approvedHash: sha256(sources),
  approvalReference: "owner's recorded decision",
};
test("source approval hash and exact target validate before producing installation SQL", () => {
  assert.throws(() =>
    installationSql({ ...input, approvedHash: "0".repeat(64) }),
  );
  assert.throws(() =>
    installationSql({
      ...input,
      targets: [{ entityId: id(1), changeSetId: id(2) }],
    }),
  );
  assert.throws(() =>
    installationSql({
      ...input,
      sources: [{ ...sources[0], requires_mfa: true }],
    }),
  );
});
test("rehearses by default, locks source rows, rejects conflicts and never writes Entity rows", () => {
  const source = installationSql(input);
  assert.match(source, /ROLLBACK;$/);
  assert.match(source, /owner''s recorded decision/);
  assert.match(source, /FOR SHARE OF s,e,o/);
  assert.match(source, /BOOTSTRAP_APPROVED_SOURCE_CHANGED/);
  assert.match(source, /BOOTSTRAP_TARGET_ALREADY_EXISTS/);
  assert.match(source, /BOOTSTRAP_INSTALLATION_CONFLICT/);
  assert.match(source, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(source, /(?:INSERT INTO|UPDATE|DELETE FROM) metadata\./);
  assert.match(installationSql({ ...input, apply: true }), /COMMIT;$/);
});
