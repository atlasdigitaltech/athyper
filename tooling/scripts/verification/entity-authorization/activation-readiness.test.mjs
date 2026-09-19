import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash,prepareNamedRoleReview} from './named-role-review.mjs';
import {recommendNamedRoles,recordBatchApproval} from './named-role-recommendations.mjs';
import {compareApprovedGrants} from './activation-readiness.mjs';
function fixture(){
 const c={tenant_id:'tenant',tenant_code:'tenant',principal_id:'member',principal_code:'member',principal_status:'active',group_id:'group',group_code:'group',role_id:'role',role_code:'approver',scope_target_id:'scope',scope_entity_id:'org',scope_name:'Org',scope_key:'org',scope_kind:'operating_organization',propagation_mode:'exact',has_current_plane_membership:true,role_permission_codes:['neon.relationship.entity_case.decide']};
 const approvedInventory={grantsChanged:false,grantChanges:[],candidates:[c],authorizationFingerprints:{deny_rule:{rows:0,sha256:'original'}}},sourceSha256=hash(JSON.stringify(approvedInventory));
 const draft=prepareNamedRoleReview(approvedInventory,sourceSha256);draft.reviewers=[{id:'reviewer',name:'Reviewer',principalId:'reviewer',authorityReference:'fixture',domains:['business','security'],tenantIds:['tenant']}];
 const now=Date.now();let packet=recommendNamedRoles(approvedInventory,draft,sourceSha256,{from:new Date(now+86400000).toISOString(),until:new Date(now+86400000*91).toISOString()});
 const b=packet.batches[0];packet=recordBatchApproval(approvedInventory,packet,sourceSha256,{decision:'approve',domains:['business','security'],reviewerId:'reviewer',reference:'fixture',approvedAt:new Date().toISOString(),batchId:b.batchId,batchSha256:b.batchSha256});
 return{approvedInventory,packet,sourceSha256,current:structuredClone(approvedInventory)};
}
test('approved existing capability mapping proposes zero grant writes and preserves exact scope',()=>{const f=fixture(),r=compareApprovedGrants(f);assert.equal(r.inventoryUnchanged,true);assert.equal(r.assessment.namedRoleReviewComplete,true);assert.deepEqual(r.grantChanges,[]);assert.equal(r.rows[0].reviewedScope.kind,'operating_organization');assert.equal(r.rows[0].persistedGrantProposal.scopeChange,null);assert.equal(r.activationAuthorized,false);});
test('revoked membership stays missing and cannot be restored by approved snapshot',()=>{const f=fixture();f.current.candidates=[];const r=compareApprovedGrants(f);assert.equal(r.inventoryUnchanged,false);assert.equal(r.rows[0].drift,'missing_current_membership');assert.equal(r.rows[0].restoreMissingGrant,false);assert.deepEqual(r.grantChanges,[]);});
test('new denials and principal epoch changes invalidate current inventory parity',()=>{const f=fixture();f.current.authorizationFingerprints.deny_rule={rows:1,sha256:'changed'};f.current.candidates[0].principal_auth_epoch=2;const r=compareApprovedGrants(f);assert.equal(r.inventoryUnchanged,false);assert.deepEqual(r.changedTables,['deny_rule']);assert.equal(r.rows[0].drift,'membership_changed');});
test('new scope cannot silently inherit an existing reviewed mapping',()=>{const f=fixture();f.current.candidates.push({...f.current.candidates[0],scope_target_id:'tenant-scope',scope_kind:'tenant'});const r=compareApprovedGrants(f);assert.equal(r.inventoryUnchanged,false);assert.equal(r.newCandidateIds.length,1);assert.equal(r.rows.length,1);});
