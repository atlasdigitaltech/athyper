import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const [browserPath,output]=process.argv.slice(2);
if(!browserPath||!output||browserPath===output)throw Error('Use <browser evidence> <new output>');
const bytes=readFileSync(browserPath),browser=JSON.parse(bytes);
if(!browser.authenticated||!browser.readJourneyQualified||browser.checks.some(c=>!c.passed))throw Error('Authenticated browser qualification required');
const refs=new Set(browser.checks.map(c=>c.requestRef).filter(Boolean));
const container=JSON.parse(execFileSync('docker',['inspect','athyper-dev-api-1'],{encoding:'utf8'}))[0];
if(Date.parse(container.State.StartedAt)>Date.parse(browser.generatedAt))throw Error('API changed after browser capture; recapture against one deployment');
if(container.State.Health.Status!=='healthy')throw Error('API unhealthy');
const env=Object.fromEntries(container.Config.Env.map(v=>v.split(/=(.*)/s).slice(0,2)));
if(env.BP_AUTHORIZATION_MODE!=='shadow')throw Error('Legacy shadow selection required');
const lines=execFileSync('docker',['logs','--since',browser.generatedAt,'athyper-dev-api-1'],{encoding:'utf8',maxBuffer:32000000,stdio:['pipe','pipe','ignore']});
const after=JSON.parse(execFileSync('docker',['inspect','athyper-dev-api-1'],{encoding:'utf8'}))[0];
if(after.Id!==container.Id || after.Image!==container.Image)throw Error('API changed while collecting evidence');
const groups=new Map();let count=0;
for(const line of lines.split('\n')){
 let e;try{e=JSON.parse(line);}catch{continue;}
 if(e.event!=='bp_authorization_shadow'||e.principalRef!==browser.principalRef||!refs.has(e.requestRef))continue;
 if(e.kind==='mapping_gap'||e.kind==='unavailable')throw Error('Correlated observer gap requires investigation');
 if(e.kind!=='decision')continue;
 if(e.authority!=='legacy'||e.grantsChanged!==false||e.profileHash!==env.BP_AUTHORIZATION_PROFILE_SHA256||!e.installedTrace?.length||!e.candidateTrace?.length)throw Error('Missing or incompatible causal trace');
 const row=Object.fromEntries(['operationKey','permissionCode','legacy','installedTarget','candidateTarget','evidence','installedTrace','candidateTrace','coordinateKinds','recordCoordinatePresent','snapshotRef','grantSnapshotRef','authEpoch'].map(k=>[k,e[k]]));
 const key=JSON.stringify(row),old=groups.get(key);groups.set(key,{...row,count:(old?.count??0)+1});count++;
}
if(!count)throw Error('No correlated causal observations');
const profileMount=container.Mounts.find(m=>m.Destination===env.BP_AUTHORIZATION_PROFILE_PATH);
if(!profileMount)throw Error('Pinned profile mount required');
const profileBytes=readFileSync(profileMount.Source);
if(createHash('sha256').update(profileBytes).digest('hex')!==env.BP_AUTHORIZATION_PROFILE_SHA256)throw Error('Pinned profile changed');
const deferred=new Set(JSON.parse(profileBytes).deferredOperations??[]);
const comparisons=[...groups.values()];
const isDeferred=c=>c.candidateTarget==='unavailable'&&deferred.has(c.operationKey)&&c.candidateTrace.length===1&&c.candidateTrace[0]===c.operationKey+':deferred:unavailable';
const unexpectedUnavailable=comparisons.filter(c=>c.candidateTarget==='unavailable'&&!isDeferred(c)).reduce((n,c)=>n+c.count,0);
const report={schemaVersion:1,kind:'authenticated_causal_shadow_capture',generatedAt:new Date().toISOString(),browserEvidence:browserPath,browserSha256:createHash('sha256').update(bytes).digest('hex'),principalRef:browser.principalRef,apiImage:container.Image,profileSha256:env.BP_AUTHORIZATION_PROFILE_SHA256,mode:'shadow',effectiveAuthority:'legacy',authenticatedChecks:browser.checks.length,shadowDecisionCount:count,unavailableCandidateObservations:[...groups.values()].filter(c=>c.candidateTarget==='unavailable').reduce((n,c)=>n+c.count,0),explicitDeferredObservations:comparisons.filter(isDeferred).reduce((n,c)=>n+c.count,0),unexpectedUnavailableObservations:unexpectedUnavailable,diagnosticComplete:unexpectedUnavailable===0,comparisons:[...groups.values()],grantChanges:[],signedSelectedReleaseArtifact:null,sameReleaseQualification:false,acceptanceRecorded:false,activationAuthorized:false};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log({output,checks:report.authenticatedChecks,observations:count,groups:groups.size,stages:[...new Set(report.comparisons.flatMap(c=>c.candidateTrace))]});
