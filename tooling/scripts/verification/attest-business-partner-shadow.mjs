// Attests the DEV shadow milestone only. Not an enforcement/activation receipt.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [deploymentPath,browserPath,output]=process.argv.slice(2);
if(!deploymentPath||!browserPath||!output)throw new Error('Usage: attest-business-partner-shadow.mjs <deployment-directory> <browser-report> <output.json>');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const audit=read(join(deploymentPath,'audit.json')),browser=read(browserPath);
assert.equal(audit.mode,'shadow');assert.equal(audit.entityCode,'business_partner');assert.equal(audit.planeKey,'neon');
assert.equal(browser.authenticated,true);assert.equal(browser.readJourneyQualified,true);
assert(browser.checks.every(c=>c.passed));
const requiredChecks=['application','list_descriptor','list','record','summary','record_ui','unscoped_ui_actions_match_legacy','scoped_ui_actions_match_legacy','scoped_summary','scoped_section:company-configuration','scoped_section:business-activity','scoped_section:network','scoped_ui_tab:roles','scoped_ui_tab:requests','scoped_ui_tab:transactions','scoped_ui_tab:activity','denied_section:comments','denied_section:attachments','invalid_company_closed','missing_record_closed','anonymous_closed'];
for(const surface of requiredChecks)assert(browser.checks.some(c=>c.surface===surface&&c.passed),`Missing qualification check: ${surface}`);
const profileBytes=readFileSync('packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json');
const profileHash=createHash('sha256').update(profileBytes).digest('hex');assert.equal(audit.profileSha256,profileHash);
const services=[];
for(const service of ['api','worker','scheduler']){
 const container=JSON.parse(execFileSync('docker',['inspect',`athyper-dev-${service}-1`],{encoding:'utf8'}))[0];
 const env=Object.fromEntries(container.Config.Env.map(v=>v.split(/=(.*)/s).slice(0,2)));
 assert.equal(container.Image,audit.shadowImage);assert.equal(container.State.Health.status??container.State.Health.Status,'healthy');
 assert.equal(env.BP_AUTHORIZATION_MODE,'shadow');assert.equal(env.BP_AUTHORIZATION_PROFILE_SHA256,profileHash);
 assert(audit.services[service].rollback);
 services.push({service,image:container.Image,health:'healthy',mode:'shadow'});
}
execFileSync('node',['tooling/scripts/verification/review-business-partner-roles.mjs','dev',join(deploymentPath,'authorization-after.json')],{stdio:'pipe'});
const before=read(join(deploymentPath,'authorization-before.json')),after=read(join(deploymentPath,'authorization-after.json'));
assert.deepEqual(after.authorizationFingerprints,before.authorizationFingerprints,'Authorization rows changed');
assert.equal(after.namedAssignments.length,0);assert.equal(after.grantChanges.length,0);
const migration=read('governance/policy/reports/entity-authorization-migration.dev.json');
assert(migration.descriptorPlans.length>0);
for(const descriptor of migration.descriptorPlans){assert.equal(descriptor.unmappedLegacyOperations.length,0);assert.equal(descriptor.unmappedFields.length,0);assert.equal(descriptor.permissionMismatches.length,0);}
// Hashes correlate response request IDs to verified server-side authorization events.
const refs=new Set(browser.checks.map(c=>c.requestRef).filter(Boolean));assert(refs.size>0);
const events=[];
const logs=execFileSync('docker',['logs','--since',browser.generatedAt,'athyper-dev-api-1'],{encoding:'utf8',maxBuffer:32_000_000,stdio:['pipe','pipe','ignore']});
for(const line of logs.split('\n')){
 let event;try{event=JSON.parse(line);}catch{continue;}
 if(event.event==='bp_authorization_shadow'&&event.profileHash===profileHash&&event.principalRef===browser.principalRef&&refs.has(event.requestRef))events.push(event);
}
assert(events.length>0,'No correlated authenticated shadow comparisons');
assert(events.every(e=>e.authority==='legacy'&&e.grantsChanged===false));
assert(!events.some(e=>e.kind==='mapping_gap'||e.kind==='unavailable'||e.candidateTarget==='unavailable'),'Qualification contains mapping gaps or unavailable previews');
const operations=new Set(events.filter(e=>e.kind==='decision').map(e=>e.operationKey));
for(const operation of ['discover','read','identity_read','contacts_read','addresses_read','identifier_read','bank_read','bank_reveal','requests_read','supplier_company_read','network_read','comments_read','attachments_read'])assert(operations.has(operation),`No comparison for ${operation}`);
const grouped=new Map();
for(const e of events){
 const row={operationKey:e.operationKey,permissionCode:e.permissionCode,legacy:e.legacy,installedTarget:e.installedTarget,candidateTarget:e.candidateTarget,evidence:e.evidence,
 ...(e.installedTrace ? {installedTrace:e.installedTrace,candidateTrace:e.candidateTrace,coordinateKinds:e.coordinateKinds,recordCoordinatePresent:e.recordCoordinatePresent}: {})};
 const key=JSON.stringify(row),old=grouped.get(key);grouped.set(key,{...row,count:(old?.count??0)+1});
}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),environment:'dev',shadowMilestoneComplete:true,fullMigrationComplete:false,mode:'shadow',entityCode:'business_partner',planeKey:'neon',profileSha256:profileHash,services,authenticatedPrincipalCount:browser.authenticatedPrincipalCount,authenticatedChecks:browser.checks.length,scopeCases:browser.scopeCases,correlatedRequestCount:refs.size,shadowDecisionCount:events.length,mappingGaps:0,unavailableCorrelatedPreviews:0,operationsObserved:[...operations].sort(),comparisons:[...grouped.values()],effectiveAuthority:'legacy',authorizationTablesCompared:Object.keys(before.authorizationFingerprints).length,changedAuthorizationTables:[],grantChanges:[],namedAssignments:[],roleReviewCandidates:after.candidates.length,rollbackAuditPath:join(deploymentPath,'audit.json'),browserEvidence:browserPath,limitations:['One existing authenticated DEV principal exercised positive, missing-scope, scoped, denied-section, invalid-target and signed-out paths.','Shadow command readiness is a discovery preview; no business commands were replayed or executed by the observer.','This unsigned shadow attestation cannot activate target enforcement.'],remainingMigrationGates:['Named steward/requester/approver review and any explicitly approved grant changes','Distinct governance personas and same-phase workflow/command qualification','Company-owned entity and independently owned child generality qualification','Resolution of recorded policy differences before enforcement','Compatible signed activation and eventual compatibility retirement']};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,shadowMilestoneComplete:true,authenticatedChecks:report.authenticatedChecks,shadowDecisions:events.length,unchangedAuthorizationTables:report.authorizationTablesCompared}));
