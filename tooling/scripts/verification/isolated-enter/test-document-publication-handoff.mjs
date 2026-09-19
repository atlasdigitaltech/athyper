import fs from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { compileGraph } from "../../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts";
const source = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/bp-dependencies-20260912/child-stored-review.json",
    "utf8",
  ),
);
const descriptor = compileGraph(source.graph).descriptor;
const psql = (input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-bp-enter-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_studio",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8" },
  ).trim();
const tables = [
  "authz.role",
  "authz.role_permission",
  "authz.permission",
  "authz.group_member",
  "authz.group_role",
  "authz.deny_rule",
  "authz.override",
  "authz.record_acl",
  "authz.delegation",
  "authz.delegation_grant",
  "authz.plane_membership",
  "authz.scope_target",
  "runtime_meta.release_activation_head",
];
const fingerprint = () =>
  psql(
    "SELECT jsonb_object_agg(name,digest) FROM (" +
      tables
        .map(
          (t) =>
            `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${t} r`,
        )
        .join(" UNION ALL ") +
      ") s;",
  );
const before = fingerprint();
const migration = fs
  .readFileSync(
    "server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_document_collection_publication.sql",
    "utf8",
  )
  .replace(/COMMIT;\s*$/, "");
const call = (d) =>
  `PERFORM publication.fn_prepare_document_collection_release('4bc3b11e-fcc2-4220-82e3-8ed528d9af18',$descriptor$${JSON.stringify(d)}$descriptor$::jsonb);`;
const negatives = [
  [
    "policy",
    (d) => {
      d.authorization.operations[0].permissionCode = "fake.allow";
    },
  ],
  [
    "field",
    (d) => {
      d.fields[0].fieldKey = "secret";
    },
  ],
  [
    "presentation",
    (d) => {
      d.listPresentation.experience.actions = [{ operation: "write" }];
    },
  ],
  [
    "extra-runtime",
    (d) => {
      d.authorizationRuntime = {};
    },
  ],
  [
    "missing-branch",
    (d) => {
      delete d.fields;
    },
  ],
].map(([name, mutate]) => {
  const d = structuredClone(descriptor);
  mutate(d);
  return `DO $test$ BEGIN BEGIN ${call(d)} RAISE EXCEPTION 'UNEXPECTED_ALLOW_${name}'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'UNEXPECTED_ALLOW%' THEN RAISE; END IF; END; END $test$;`;
});
const result = psql(
  migration +
    `SET LOCAL ROLE athyper_runtime;SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';SET LOCAL app.current_principal_id='81cd1978-2df5-5c9a-938a-2f8c291aea13';` +
    negatives.join("\n") +
    `
DO $test$ BEGIN
PERFORM set_config('app.current_principal_id','5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d',true);
BEGIN ${call(descriptor)} RAISE EXCEPTION 'UNEXPECTED_ALLOW_ACTOR'; EXCEPTION WHEN no_data_found THEN NULL; END;
PERFORM set_config('app.current_principal_id','81cd1978-2df5-5c9a-938a-2f8c291aea13',true);
PERFORM set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000000',true);
BEGIN ${call(descriptor)} RAISE EXCEPTION 'UNEXPECTED_ALLOW_TENANT'; EXCEPTION WHEN no_data_found THEN NULL; END;
PERFORM set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
${call(descriptor)} ${call(descriptor)}
END $test$;
RESET ROLE;
SELECT jsonb_build_object('links',(SELECT count(*) FROM publication.entity_release_link WHERE publication_release_id='4bc3b11e-fcc2-4220-82e3-8ed528d9af18'),'artifacts',(SELECT count(*) FROM snapshot.entity_release_artifact WHERE source_release_id='4bc3b11e-fcc2-4220-82e3-8ed528d9af18'),'directInsert',has_table_privilege('athyper_runtime','snapshot.entity_release_artifact','INSERT'));
ROLLBACK;`,
);
const counts = JSON.parse(result);
assert.equal(counts.links, 1);
assert.equal(counts.artifacts, 1);
assert.equal(counts.directInsert, false);
assert.equal(fingerprint(), before);
const report = {
  capturedAt: new Date().toISOString(),
  releaseId: "4bc3b11e-fcc2-4220-82e3-8ed528d9af18",
  rollbackOnly: true,
  checks: [
    "approved-source",
    "replay",
    "policy-tampering",
    "field-tampering",
    "presentation-tampering",
    "extra-runtime",
    "missing-branch",
    "wrong-actor",
    "wrong-tenant",
    "no-direct-insert",
    "authorization-and-activation-unchanged",
  ],
  counts,
};
const path =
  "governance/policy/reports/business-partner-child-handoff-dry-run-" +
  Date.now() +
  ".dev.json";
fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log({ passed: report.checks.length, report: path });
