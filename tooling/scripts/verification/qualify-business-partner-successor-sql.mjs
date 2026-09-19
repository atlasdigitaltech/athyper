/** Rollback-only SQL materializer rehearsal. Synthetic signature is never committed
 * and does not establish authenticated publication or signed qualification. */
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const proposal=JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-successor.dev.json','utf8'));
const persisted=JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-persisted-approval.dev.json','utf8'));
const head=JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-head.dev.json','utf8'));
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
let migration=readFileSync('server/db/scripts/operations/upgrades/publication/20260910_authorization_successor_materializer.sql','utf8').replace(/COMMIT;\s*$/,'');
const sql=migration+`
SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';
SET LOCAL app.current_principal_id='81cd1978-2df5-5c9a-938a-2f8c291aea13';
INSERT INTO publication.entity_authorization_successor_payload(content_hash,tenant_id,descriptor) VALUES(${lit(proposal.descriptorHash)},'44444444-4444-4444-8444-444444444444',${lit(JSON.stringify(proposal.descriptor))}::jsonb);
DO $test$ BEGIN
 BEGIN
 INSERT INTO publication.entity_authorization_successor_payload(content_hash,tenant_id,descriptor) VALUES(repeat('0',64),'44444444-4444-4444-8444-444444444444','{}');
 RAISE EXCEPTION 'ALTERED_PAYLOAD_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
 UPDATE publication.entity_authorization_successor_payload SET descriptor='{}';
 RAISE EXCEPTION 'IMMUTABILITY_NOT_ENFORCED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='IMMUTABILITY_NOT_ENFORCED' THEN RAISE; END IF; END;
END $test$;
INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,release_kind,supersedes_release_id,contract_schema_code,contract_schema_version,contract_hash,revision_hash,release_hash,compatibility_level,target_planes,signature_algorithm,signing_key_id,contract_signature,published_by)
SELECT '11111111-1111-4111-8111-111111111119',cs.tenant_id,cs.entity_id,cs.id,rev.id,prior.release_no+1,'publish',prior.id,'athyper.meta-entity-contract','2.1',rev.contract_hash,rev.revision_hash,repeat('1',64),'backward_compatible',ARRAY['neon'],'Ed25519','rollback-only-test','rollback-only-not-a-valid-signature',cs.created_by
FROM metadata.entity_change_set cs JOIN LATERAL (SELECT * FROM snapshot.entity_contract_revision WHERE change_set_id=cs.id AND validation_status='valid' ORDER BY revision_no DESC LIMIT 1) rev ON true
JOIN LATERAL (SELECT * FROM metadata.entity_release WHERE entity_id=cs.entity_id AND tenant_id=cs.tenant_id ORDER BY release_no DESC LIMIT 1) prior ON true
WHERE cs.id=${lit(persisted.changeSetId)}::uuid AND cs.status='approved' AND cs.lock_version=3;
DO $negative$ BEGIN
 BEGIN
 PERFORM publication.fn_prepare_authorization_successor('11111111-1111-4111-8111-111111111119','{}');
 RAISE EXCEPTION 'MISSING_HEAD_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'SUCCESSOR_RUNTIME_PRECONDITION_REQUIRED' THEN RAISE; END IF; END;
 PERFORM set_config('app.current_principal_id','5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d',true);
 BEGIN
 PERFORM publication.fn_prepare_authorization_successor('11111111-1111-4111-8111-111111111119','{}');
 RAISE EXCEPTION 'WRONG_PUBLISHER_ACCEPTED';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 PERFORM set_config('app.current_principal_id','81cd1978-2df5-5c9a-938a-2f8c291aea13',true);
END $negative$;
SELECT publication.fn_prepare_authorization_successor('11111111-1111-4111-8111-111111111119',${lit(JSON.stringify({sourceReleaseId:head.base.releaseId,sourceReleaseNo:head.base.releaseNo,appliedReleaseId:head.base.appliedReleaseId,rowVersion:head.base.headVersion,artifactHash:'1'.repeat(64)}))}::jsonb);
DO $assert$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM publication.fn_authorization_successor_compilation_source('11111111-1111-4111-8111-111111111119') WHERE release_no=19 AND compiled_json->'authorization' IS NOT NULL AND jsonb_array_length(contract_json->'operations')=42) THEN RAISE EXCEPTION 'SUCCESSOR_COMPILATION_SOURCE_MISSING'; END IF;
END $assert$;
SELECT jsonb_build_object('canonicalHashMatched',true,'alteredPayloadRejected',true,'payloadImmutable',true,'transactionalMaterialization',true,'nativeCompilationSource',true,'missingHeadRejected',true,'wrongPublisherRejected',true);
ROLLBACK;`;
const out=execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_studio','-At'],{input:sql,encoding:'utf8',maxBuffer:1000000});
const checks=JSON.parse(out.split('\n').find(l=>l.startsWith('{')));
const report={schemaVersion:1,kind:'bp_successor_sql_rehearsal',capturedAt:new Date().toISOString(),checks,rolledBack:true,authenticatedQualification:false,signed:false,grantsChanged:false,activationAuthorized:false};
writeFileSync('governance/policy/reports/business-partner-successor-sql.dev.json',JSON.stringify(report,null,2)+'\n');console.log(report);
