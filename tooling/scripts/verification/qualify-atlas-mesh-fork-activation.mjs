import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {sql,save,images,tenant} from './atlas-f6-common.mjs';
const imported=JSON.parse(readFileSync('docs/examples/atlas-f6/mesh-baseline-import.json','utf8'));
const key=imported.publicationKey+'.tenant.'+tenant,release=randomUUID(),applied=randomUUID();
const expected={kind:'global_tenant_fork',sourcePublicationKey:imported.publicationKey,tenantId:tenant,appliedReleaseId:imported.source.head.applied_release_id,rowVersion:String(imported.source.head.row_version),sourceReleaseNo:String(imported.sourceReleaseNo),artifactHash:imported.sourceArtifactHash};
const quote=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const statement=`BEGIN; SET LOCAL lock_timeout='5s';
INSERT INTO runtime_meta.entity_contract SELECT (jsonb_populate_record(NULL::runtime_meta.entity_contract,to_jsonb(c)||${quote({id:randomUUID(),tenant_id:tenant,release_id:release,release_no:1,publication_key:key,revision_id:randomUUID(),entity_id:randomUUID()})})).* FROM runtime_meta.entity_contract c WHERE c.release_id='${imported.sourceReleaseId}' AND c.tenant_id IS NULL;
INSERT INTO runtime_meta.applied_release SELECT (jsonb_populate_record(NULL::runtime_meta.applied_release,to_jsonb(a)||${quote({id:applied,deployment_id:randomUUID(),publication_key:key,source_release_id:release,source_release_no:1,manifest:{evidence:{importedBaseline:expected}}})})).* FROM runtime_meta.applied_release a WHERE a.id='${imported.source.head.applied_release_id}';
CREATE TEMP TABLE fork_head_probe (LIKE runtime_meta.release_activation_head INCLUDING DEFAULTS);
CREATE TRIGGER fork_probe BEFORE INSERT OR UPDATE ON fork_head_probe FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_baseline_activation_precondition();
INSERT INTO fork_head_probe SELECT (jsonb_populate_record(NULL::runtime_meta.release_activation_head,to_jsonb(h)||${quote({publication_key:key,applied_release_id:applied,source_release_no:1})})).* FROM runtime_meta.release_activation_head h WHERE h.publication_key='${imported.publicationKey}';
DO $$ BEGIN
 BEGIN INSERT INTO fork_head_probe SELECT (jsonb_populate_record(NULL::runtime_meta.release_activation_head,to_jsonb(h)||' {"publication_key":"metadata.entity.network_relationship"}'::jsonb)).* FROM fork_head_probe h;
 RAISE EXCEPTION 'TEST_GLOBAL_KEY_ACCEPTED'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TENANT_FORK_COORDINATE_MISMATCH' THEN RAISE; END IF; END;
 BEGIN UPDATE fork_head_probe SET row_version=row_version+1; RAISE EXCEPTION 'TEST_EXISTING_TENANT_ACCEPTED'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TENANT_FORK_COORDINATE_MISMATCH' THEN RAISE; END IF; END;
END $$;
UPDATE runtime_meta.applied_release SET manifest=jsonb_set(manifest,'{evidence,importedBaseline,rowVersion}','"-1"'::jsonb) WHERE id='${applied}';
DO $$ BEGIN
 BEGIN INSERT INTO fork_head_probe SELECT * FROM fork_head_probe;
 RAISE EXCEPTION 'TEST_STALE_SOURCE_ACCEPTED'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'GLOBAL_BASELINE_STALE_AT_ACTIVATION' THEN RAISE; END IF; END;
END $$;
ROLLBACK;`;
try{sql('mesh',statement);}catch(e){console.error(String(e.stderr??e.message).split('\n').filter(l=>l.includes('ERROR:')).join('\n'));process.exitCode=1;}
if(!process.exitCode){save('mesh-fork-activation-qualification.json',{observedAt:new Date().toISOString(),images:images(),passed:true,transactionRolledBack:true,checks:['new tenant key accepted with current source','global key substitution denied','existing tenant head overwrite denied','stale global source denied']});console.log('Mesh fork activation probes passed; transaction rolled back.');}
