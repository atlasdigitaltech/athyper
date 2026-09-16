import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const ids = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-process-submission-live.dev.json",
    "utf8",
  ),
)
  .cases.filter((c: any) => c.process)
  .map((c: any) => c.id);
assert.ok(ids.every((id: string) => /^[a-f0-9-]{36}$/.test(id)));
const list = ids.map((id: string) => `'${id}'::uuid`).join(",");
const query = (sql: string) =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-dev-db-1",
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
      ],
      { input: sql, encoding: "utf8" },
    ),
  );
const cases =
  query(`SELECT json_agg(x) FROM(SELECT c.id case_id,e.evidence->'effectiveProfile'->>'code' profile,c.status case_status,s.status supplier_status,r.status cycle_status,
 (SELECT count(*) FROM document.work_item i WHERE i.tenant_id=a.tenant_id AND i.payload->>'attemptId'=a.id::text AND i.outcome->>'decision' IN('approve','accept_review')) votes,
 (SELECT count(*) FROM document.work_item i WHERE i.tenant_id=a.tenant_id AND i.payload->>'attemptId'=a.id::text AND i.outcome->>'decidedBy'=e.evidence->>'actorPrincipalId') maker_votes,
 (SELECT count(*) FROM governance.process_document_job j WHERE j.tenant_id=a.tenant_id AND j.attempt_id=a.id AND j.status='ready' AND j.gate_status='succeeded') ready_documents,
 (SELECT count(*) FROM governance.process_document_job j JOIN document.supplier_activation_evidence ae ON ae.tenant_id=j.tenant_id AND ae.id=(j.intent->'activationEvidence'->>'id')::uuid WHERE j.tenant_id=a.tenant_id AND j.attempt_id=a.id AND j.purpose='activation_confirmation' AND ae.business_partner_id=c.target_entity_id AND ae.readiness_fingerprint=j.intent->'activationEvidence'->>'hash' AND j.intent->'sourceSnapshot'->>'id'=c.result_snapshot_id::text) exact_activation_bindings
 FROM document.entity_case c JOIN governance.process_attempt a ON a.tenant_id=c.tenant_id AND a.case_id=c.id JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id JOIN governance.cycle_run r ON r.tenant_id=a.tenant_id AND r.id=a.cycle_run_id JOIN master.supplier s ON s.tenant_id=c.tenant_id AND s.business_partner_id=c.target_entity_id WHERE c.id IN(${list}) ORDER BY profile)x;`);
for (const c of cases) {
  assert.equal(c.case_status, "materialized");
  assert.equal(c.supplier_status, "active");
  assert.equal(c.cycle_status, "running");
  assert.equal(
    c.votes,
    ({ simple: 1, standard: 2, enhanced: 10 } as any)[c.profile],
  );
  assert.equal(c.maker_votes, 0);
  assert.equal(c.ready_documents, 3);
  assert.equal(c.exact_activation_bindings, 1);
}
assert.equal(cases.length, 3);
const address = query(
  `SELECT json_build_object('addresses',count(distinct l.address_id),'owners',count(distinct l.owner_id)) FROM master.address_link l JOIN document.entity_case c ON c.tenant_id=l.tenant_id AND c.target_entity_id=l.owner_id WHERE c.id IN(${list});`,
);
assert.deepEqual(address, { addresses: 1, owners: 3 });
const report = {
  at: new Date().toISOString(),
  mode: "Read-only verification of committed authenticated reviews/materialization and controlled upstream P4 activation fixtures",
  cases,
  addressReuse: address,
  passed: true,
};
writeFileSync(
  "governance/policy/reports/supplier-process-document-outcomes-db.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
