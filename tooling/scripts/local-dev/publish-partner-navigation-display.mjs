import { resolveSourcePath } from "../metadata/source-workspace.mjs";
/** Explicit navigation display overlay. No database reset or broad authoring publish. */
import {readFileSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(a=>!['--apply','--dry-run'].includes(a)) || (apply&&process.argv.includes('--dry-run')))throw Error('Use --dry-run or --apply');
const root=process.cwd(),secrets=homedir()+'/.athyper/instances/dev/secrets';
const head=JSON.parse(execFileSync('docker',['exec','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-Atc',"SELECT row_to_json(r) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release r ON r.id=h.applied_release_id WHERE h.publication_key='metadata.compiled_entity.business_partner'"],{encoding:'utf8'}));
const keys=['business_partner/presentation.detail'];
const sourceSha256=createHash('sha256').update(JSON.stringify(keys.map(key=>readFileSync(resolveSourcePath(`${root}/metadata/entities/${key}.json`),'utf8')))).digest('hex');
function privateRead(path){const s=statSync(path);if(s.mode&0o077||s.uid!==process.getuid())throw Error('PRIVATE_FILE_REQUIRED');return readFileSync(resolveSourcePath(path),'utf8');}
const credentials=JSON.parse(privateRead(secrets+'/dev-publication/client.json'));
const inspection=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
if(inspection.Config.Labels['com.docker.compose.project']!=='athyper-dev')throw Error('DEV_DATABASE_REQUIRED');
const databaseUrl=new URL('postgresql://postgres@'+Object.values(inspection.NetworkSettings.Networks)[0].IPAddress+':5432/athyper_neon');databaseUrl.password=privateRead(secrets+'/postgres-password').trim();
const input={credentials,databaseUrl:databaseUrl.toString(),overlay:'partner-navigation-display',sourceSha256,authoringRoot:root+'/metadata/entities',sourceDefinitionReleaseId:head.source_release_id,expectedActiveArtifactHash:head.artifact_hash,dryRun:!apply};
const result=spawnSync('docker',['exec','-i','athyper-dev-source-worker-1','node','--import','tsx',root+'/tooling/scripts/local-dev/publish-scoped-dev-candidate.mts'],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:4194304});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
