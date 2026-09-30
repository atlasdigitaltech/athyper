import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const baseline=JSON.parse(readFileSync('docs/examples/atlas-f5/cirrus-baseline-import.json','utf8'));
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const tenant=baseline.tenantId;
let id=randomUUID();
const run=(plane,input)=>{try{return execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-U','postgres','-d',`athyper_${plane}`,'-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:20000,stdio:['pipe','pipe','pipe']});}catch(error){throw Error(`${plane} qualification failed: ${String(error.stderr).split('\n')[0]}`);}};
const available=run('studio',"SELECT to_regclass('metadata.entity_baseline_import') IS NOT NULL").trim()==='t';
if(available){const existing=run('studio',`SELECT id FROM metadata.entity_baseline_import WHERE tenant_id=${q(tenant)}::uuid AND publication_key=${q(baseline.publicationKey)} AND source_release_id=${q(baseline.sourceReleaseId)}::uuid`).trim();if(existing)id=existing;}
const schema=readFileSync('server/db/ddl/planes/studio/metadata/12_baseline_import.sql','utf8');
const studio=run('studio',`BEGIN; SET LOCAL lock_timeout='5s';
 SELECT set_config('app.current_tenant_id',${q(tenant)},true);
 SELECT to_regclass('metadata.entity_baseline_import') IS NULL AS install_schema \\gset
 \\if :install_schema
 ${schema}
 \\endif
 INSERT INTO metadata.entity_baseline_import(id,tenant_id,publication_key,source_release_id,source_release_no,entity_code,source_entity_id,source_plane,content_hash,payload)
 VALUES(${q(id)}::uuid,${q(tenant)}::uuid,${q(baseline.publicationKey)},${q(baseline.sourceReleaseId)}::uuid,17,'business_partner',${q(baseline.sourceEntityId)}::uuid,'neon',${q(baseline.contentHash)},${q(JSON.stringify(baseline))}::jsonb) ON CONFLICT(id) DO NOTHING;
 DO $$ BEGIN
  BEGIN UPDATE metadata.entity_baseline_import SET content_hash=repeat('a',64) WHERE id=${q(id)}::uuid; RAISE EXCEPTION 'UPDATE unexpectedly allowed'; EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  BEGIN DELETE FROM metadata.entity_baseline_import WHERE id=${q(id)}::uuid; RAISE EXCEPTION 'DELETE unexpectedly allowed'; EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
 END $$;
 SET LOCAL ROLE athyperapp;
 DO $$ BEGIN IF (SELECT count(*) FROM metadata.entity_baseline_import WHERE id=${q(id)}::uuid)<>1 THEN RAISE EXCEPTION 'Own tenant unavailable'; END IF; END $$;
 SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000001',true);
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM metadata.entity_baseline_import WHERE id=${q(id)}::uuid) THEN RAISE EXCEPTION 'Cross tenant disclosure'; END IF;
 BEGIN INSERT INTO metadata.entity_baseline_import_revocation(baseline_id,tenant_id,reason) VALUES(${q(id)}::uuid,${q(tenant)}::uuid,'unauthorized'); RAISE EXCEPTION 'API write unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END $$;
 RESET ROLE;
 INSERT INTO metadata.entity_baseline_import_revocation(baseline_id,tenant_id,reason) VALUES(${q(id)}::uuid,${q(tenant)}::uuid,'rollback qualification');
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation WHERE baseline_id=${q(id)}::uuid) THEN RAISE EXCEPTION 'Revocation missing'; END IF; END $$;
 SELECT 'studio:immutable,tenant-isolated,operator-only,revocable'; ROLLBACK;`);
const applied=randomUUID(),head=baseline.source.head;
const expected={appliedReleaseId:head.applied_release_id,rowVersion:head.row_version,sourceReleaseNo:head.source_release_no,artifactHash:head.artifact_hash};
const activationSchema=readFileSync('server/db/ddl/common/runtime_meta/12_baseline_precondition.sql','utf8');
const neon=run('neon',`BEGIN; SET LOCAL lock_timeout='5s';
 SELECT to_regprocedure('runtime_meta.trg_baseline_activation_precondition()') IS NULL AS install_schema \\gset
 \\if :install_schema
 ${activationSchema}
 \\endif
 CREATE TEMP TABLE qualified_head (LIKE runtime_meta.release_activation_head INCLUDING DEFAULTS) ON COMMIT DROP;
 INSERT INTO qualified_head SELECT * FROM runtime_meta.release_activation_head WHERE publication_key=${q(baseline.publicationKey)};
 CREATE TRIGGER qualified_precondition BEFORE INSERT OR UPDATE ON qualified_head FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_baseline_activation_precondition();
 INSERT INTO runtime_meta.applied_release(id,publication_key,source_release_id,source_release_no,deployment_id,artifact_hash,manifest)
 VALUES(${q(applied)}::uuid,${q('atlas.qualification.'+id)},${q(randomUUID())}::uuid,18,${q(randomUUID())}::uuid,repeat('a',64),${q(JSON.stringify({evidence:{importedBaseline:expected}}))}::jsonb);
 UPDATE qualified_head SET row_version=row_version+1;
 DO $$ BEGIN BEGIN
 UPDATE qualified_head SET applied_release_id=${q(applied)}::uuid,source_release_no=18;
 RAISE EXCEPTION 'stale baseline unexpectedly allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'BASELINE_STALE_AT_ACTIVATION' THEN RAISE; END IF; END; END $$;
 UPDATE qualified_head SET row_version=row_version-1;
 UPDATE qualified_head SET applied_release_id=${q(applied)}::uuid,source_release_no=18;
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM qualified_head WHERE applied_release_id=${q(applied)}::uuid) THEN RAISE EXCEPTION 'Current baseline activation rejected'; END IF; END $$;
 SELECT 'neon:current-baseline-accepted,stale-baseline-rejected'; ROLLBACK;`);
const receipt={schema:'atlas-baseline-qualification/1',observedAt:new Date().toISOString(),committed:false,checks:[studio.split('\n').find(x=>x.startsWith('studio:')),neon.split('\n').find(x=>x.startsWith('neon:'))]};
writeFileSync('docs/examples/atlas-f5/cirrus-baseline-qualification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
