import fs from "node:fs";
import assert from "node:assert/strict";
import { run } from "./affordance-count-run.mjs";
import { proposal as p, sql, quote } from "./affordance-count-client.mjs";
const live = JSON.parse(
  fs.readFileSync(
    `governance/policy/reports/business-partner-affordance-open-work-live-qualified-${run}.dev.json`,
  ),
);
assert.equal(live.draftIds.length, 2);
const result = JSON.parse(
  sql(
    `SELECT jsonb_build_object('partnerStatus',(SELECT status FROM master.business_partner WHERE id=${quote(p.fixtures.businessPartnerId)}),'drafts',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'snapshot',current_snapshot_id,'result',result_snapshot_id) ORDER BY id) FROM document.entity_case WHERE id IN (${live.draftIds.map(quote).join(",")})),'revealAudits',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'event',event_code,'actor',actor_principal_id) ORDER BY id),'[]'::jsonb) FROM audit.audit_log WHERE tenant_id=${quote(p.tenantId)} AND event_code IN ('business_partner.bank_account.revealed','business_partner.tax_registration.revealed')),'rawValueLeaks',(SELECT count(*) FROM audit.audit_log a WHERE tenant_id=${quote(p.tenantId)} AND (to_jsonb(a)::text LIKE '%GB82WEST12345698765432%' OR to_jsonb(a)::text LIKE '%SYNTHETICGB123456789%')));`,
  ),
);
assert.equal(result.partnerStatus, "active");
assert.equal(result.drafts.length, 2);
for (const d of result.drafts) {
  assert.equal(d.status, "draft");
  assert(d.snapshot);
  assert.equal(d.result, null);
}
assert.equal(result.rawValueLeaks, 0);
fs.writeFileSync(
  `governance/policy/reports/business-partner-affordance-count-audit-${run}.dev.json`,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      runtimeImage: p.runtimeImage,
      releaseSetHash: p.releaseSetHash,
      passed: true,
      result,
      historyDeleted: false,
      draftsSubmitted: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({
  passed: true,
  drafts: result.drafts.length,
  revealAudits: result.revealAudits.length,
  rawValueLeaks: result.rawValueLeaks,
  partnerStatus: result.partnerStatus,
});
