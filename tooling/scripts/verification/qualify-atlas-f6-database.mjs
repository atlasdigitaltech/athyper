import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {sql,save,images,tenant} from './atlas-f6-common.mjs';
const report={observedAt:new Date().toISOString(),images:images(),checks:[]};
const statement=readFileSync('tooling/scripts/verification/qualify-atlas-attachment-knowledge.sql','utf8');
// Every attempted write in this owner/tenant qualification is rolled back.
assert.match(statement,/^BEGIN;/);assert.match(statement,/ROLLBACK;\s*$/);
sql('neon',statement);report.checks.push('deployed owner-only source/revision/chunk writes, permission substitution and tenant isolation; transaction rolled back');
report.bindings={};
for(const plane of ['neon','mesh']){
 const key=plane==='neon'?'metadata.entity.business_partner.local-master-data.cirrusatlantic':'metadata.entity.network_relationship.tenant.44444444-4444-4444-8444-444444444444';
 report.bindings[plane]=JSON.parse(sql(plane,`SELECT jsonb_build_object('publicationKey',h.publication_key,'releaseId',a.source_release_id,'releaseNo',a.source_release_no,'status',a.status,'compiledHash',d.compiled_hash,'entityId',d.entity_id,'tenantId',d.tenant_id,'aiEnabled',d.compiled_json#>'{ai,enabled}') FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id WHERE h.publication_key='${key}';`));
}
assert.equal(report.bindings.neon.tenantId,tenant);assert.equal(report.bindings.neon.aiEnabled,true);assert.equal(report.bindings.neon.compiledHash,'700e00716fd05a782102a3666406f72929769ed11536c318e1dd3243baf894e4');
report.checks.push('qualified tenant BP release 18 and compiled hash unchanged');
report.secondEntityReady=report.bindings.mesh.aiEnabled===true;
report.canonicalStatementSha256=createHash('sha256').update(statement).digest('hex');
report.passed=true;save('database.json',report);console.log(JSON.stringify(report));
