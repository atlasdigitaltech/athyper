import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=new URL('../../../',import.meta.url);
const source=readFileSync(new URL('server/db/ddl/planes/neon/master/07_functions.sql',root),'utf8');
const body=source.split('CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_registration_case(')[1].split('END $$;')[0];
test('registration creates identity, not roles, setup or decisions',()=>{
 assert.match(body,/INSERT INTO master.business_partner\(/);
 assert.doesNotMatch(body,/master\.(supplier|customer)\b|INSERT INTO master.business_partner_operating_organization_assignment|command_create_business_partner_decision|command_business_partner_capability|supplier_enabled|customer_enabled/);
 assert.doesNotMatch(body,/role_id|supplierId|customerId|roleId/);
});
test('registration requires independent approval and pinned contract before creation',()=>{
 assert.match(body,/approval.recorded_by<>current_case.created_by/);
 assert.match(body,/approval.after_version=current_case.row_version/);
 assert.match(body,/operation_code IS DISTINCT FROM 'new_partner'/);
 assert.match(body,/current_case.target_entity_id IS NOT NULL/);
 assert.match(body,/IF NOT FOUND OR contract IS NULL/);
 assert.ok(body.indexOf('Registration requires its valid pinned contract')<body.indexOf('INSERT INTO master.business_partner('));
});
test('registration retains concurrency, idempotency, snapshots and outbox',()=>{
 for(const text of ['FOR UPDATE','row_version<>p_expected_case_version','prior.request_fingerprint<>fingerprint','snapshot.fn_capture_entity','INSERT INTO document.entity_case_materialization','INSERT INTO snapshot.entity_case_snapshot_lineage','INSERT INTO event.outbox']) assert.ok(body.includes(text),text);
});
test('case mutation guard admits the registration command without relaxing actor or tenant checks',()=>{
 const source=readFileSync(new URL('server/db/ddl/planes/neon/document/07_functions.sql',root),'utf8');
 const guard=source.split('CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation()')[1].split('END $$;')[0];
 assert.match(guard,/'entity.case.materialize.business_partner_registration'/);
 for(const key of ['tenant_id','actor_principal_id',"'processing'"])assert.ok(guard.includes(key),key);
});
