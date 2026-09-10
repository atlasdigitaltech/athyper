/** Install an already qualified worker image; keep release 19 activation closed. */
import{readFileSync,writeFileSync}from'node:fs';import{homedir}from'node:os';import{join,dirname}from'node:path';import{execFileSync}from'node:child_process';
const run=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const candidate=JSON.parse(readFileSync('governance/policy/reports/business-partner-worker-candidate.dev.json')),smoke=JSON.parse(readFileSync('governance/policy/reports/business-partner-worker-image-qualification.dev.json'));
if(candidate.imageId!==smoke.imageId||smoke.registeredOperations!==42||Object.values(smoke.checks).some(v=>!v))throw Error('Qualified candidate required');
const before=JSON.parse(run(['inspect','athyper-dev-worker-1']))[0];if(before.Image!==candidate.baseImage)throw Error('Running worker changed');
const root=join(homedir(),'.athyper/instances/dev/deployments/bp-release-19-worker-20260910'),seal=JSON.parse(readFileSync('governance/policy/reports/business-partner-release-19-review-seal.dev.json'));
const hold=`BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION runtime_meta.trg_bp_release19_activation_hold() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,runtime_meta AS $$
DECLARE source_id uuid; BEGIN
 SELECT source_release_id INTO STRICT source_id FROM runtime_meta.applied_release WHERE id=NEW.applied_release_id;
 IF source_id='ba383d04-9a18-4e59-ab4e-3d9726e934c6'::uuid THEN RAISE EXCEPTION 'BP_RELEASE_19_ENFORCEMENT_APPROVAL_REQUIRED'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS bp_release19_activation_hold ON runtime_meta.release_activation_head;
CREATE TRIGGER bp_release19_activation_hold BEFORE INSERT OR UPDATE ON runtime_meta.release_activation_head FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_bp_release19_activation_hold();
COMMIT;`;
writeFileSync(join(root,'activation-hold.sql'),hold,{mode:0o600});run(['exec','-i','athyper-dev-db-1','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:hold});
const override={services:{worker:{image:candidate.imageId,environment:{ENTITY_RELEASE_REVIEW_CONFIG_PATH:'/bp-review-config.json'},volumes:[{type:'bind',source:dirname(seal.directory),target:'/bp-review',read_only:true},{type:'bind',source:join(root,'evidence'),target:'/bp-evidence',read_only:true},{type:'bind',source:join(root,'review-config.json'),target:'/bp-review-config.json',read_only:true}]}}};
writeFileSync(join(root,'override.json'),JSON.stringify(override,null,2)+'\n',{mode:0o600});writeFileSync(join(root,'rollback.json'),JSON.stringify({services:{worker:{image:before.Image}}},null,2)+'\n',{mode:0o600});
const configs=before.Config.Labels['com.docker.compose.project.config_files'].split(',');
run(['compose','-p',before.Config.Labels['com.docker.compose.project'],...configs.flatMap(c=>['-f',c]),'-f',join(root,'override.json'),'up','-d','--no-deps','--no-build','worker'],{timeout:60000});
const report={schemaVersion:1,kind:'bp_release_19_worker_deployment',capturedAt:new Date().toISOString(),baseImage:before.Image,imageId:candidate.imageId,sourceConfigs:configs,override:join(root,'override.json'),rollback:join(root,'rollback.json'),rollbackNote:'Use sourceConfigs plus rollback.json; retain activation hold and current grants/revocations.',registeredOperations:42,applied:true,activationHold:'runtime_meta.bp_release19_activation_hold',grantsChanged:false,activationAuthorized:false};
writeFileSync('governance/policy/reports/business-partner-worker-deployment.dev.json',JSON.stringify(report,null,2)+'\n');console.log({imageId:candidate.imageId,applied:true,registeredOperations:42,activationHeld:true});
