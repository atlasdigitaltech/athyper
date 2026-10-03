/** CATL DEV only: carry forward the active release and replace only certificate presentation metadata. */
import {readFileSync,statSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';

const candidate = process.argv.find(value => value.startsWith('--candidate='))?.slice(12);
assert.ok(candidate?.startsWith(process.cwd()+'/.tmp/athyper-certificate-audit.') && /^[A-Za-z0-9]+$/.test(candidate.split('.').at(-1)));
const inspection = JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(inspection.Config.Labels['com.docker.compose.project'],'athyper-dev');
const captured = JSON.parse(execFileSync('docker',['exec','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-Atc',"SELECT json_build_object('head',row_to_json(h),'payload',p.payload_json) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=h.applied_release_id WHERE h.publication_key='metadata.compiled_entity.business_partner' AND p.artifact_kind='compiled_entity_runtime'"],{encoding:'utf8',maxBuffer:4194304}));
const keys = ['certification/core','business_partner/presentation.section.certificates'];
if(process.argv.includes('--prepare')) {
  const documents = captured.payload.artifacts.map(artifact => {
    const content = artifact.content;
    return keys.includes(content.artifactKey)
      ? JSON.parse(readFileSync(join(process.cwd(),'metadata/entities',content.artifactKey+'.json'),'utf8'))
      : content;
  });
  for(const key of keys) assert.equal(documents.filter(document => document.artifactKey === key).length,1);
  const files = documents.map(document => [candidate+'/entities/'+document.artifactKey+'.json',document]);
  files.push([candidate+'/entities/release.json',captured.payload.release]);
  assert.match(captured.head.artifact_hash,/^[a-f0-9]{64}$/);
  const sourceRelease=execFileSync('docker',['exec','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_studio','-Atc',`SELECT r.id FROM publication.release r JOIN publication.artifact_compilation c ON c.publication_release_id=r.id WHERE r.release_key='metadata.compiled_entity.business_partner' AND r.status='published' AND c.unsigned_hash='${captured.head.artifact_hash}'`],{encoding:'utf8'}).trim();
  assert.match(sourceRelease,/^[a-f0-9-]{36}$/);
  files.push([candidate+'/baseline.json',{artifactHash:captured.head.artifact_hash,sourceDefinitionReleaseId:sourceRelease,replacementKeys:keys}]);
  const offset = Number(process.argv.find(value => value.startsWith('--offset='))?.slice(9) ?? 0);
  const count = Number(process.argv.find(value => value.startsWith('--count='))?.slice(8) ?? 20);
  assert.ok(Number.isInteger(offset) && offset>=0 && Number.isInteger(count) && count>0);
  if(process.argv.includes('--count-only')) console.log(files.length);
  else console.log('*** Begin Patch\n'+files.slice(offset,offset+count).map(([path,value])=>'*** Add File: '+path+'\n'+JSON.stringify(value,null,2).split('\n').map(line=>'+'+line).join('\n')).join('\n')+'\n*** End Patch');
} else {
  const baseline = JSON.parse(readFileSync(candidate+'/baseline.json','utf8'));
  assert.equal(captured.head.artifact_hash,baseline.artifactHash,'Active release changed; prepare a new candidate');
  const privateRead = path => {const stat=statSync(path);assert.equal(stat.mode & 0o077,0);assert.equal(stat.uid,process.getuid());return readFileSync(path,'utf8');};
  const secrets=join(homedir(),'.athyper/instances/dev/secrets');
  const databaseUrl=new URL('postgresql://postgres@'+Object.values(inspection.NetworkSettings.Networks)[0].IPAddress+':5432/athyper_neon');
  databaseUrl.password=privateRead(join(secrets,'postgres-password')).trim();
  const input={credentials:JSON.parse(privateRead(join(secrets,'dev-publication/client.json'))),databaseUrl:databaseUrl.toString(),candidateOutput:candidate,sourceCompiledRelease:true,authoringRoot:join(process.cwd(),'metadata/entities'),sourceDefinitionReleaseId:baseline.sourceDefinitionReleaseId,expectedActiveArtifactHash:baseline.artifactHash,dryRun:!process.argv.includes('--apply')};
  const result=spawnSync('docker',['exec','-i','athyper-dev-source-worker-1','node','--import','tsx',join(process.cwd(),'tooling/scripts/local-dev/publish-scoped-dev-candidate.mts')],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:4194304});
  process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
}
