/** Authenticated read-only prerequisite capture, not execution qualification. */
import {request} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const exact=JSON.parse(readFileSync('governance/policy/reports/business-partner-exact-release.dev.json','utf8'));
const signed=JSON.parse(readFileSync('governance/policy/reports/business-partner-release-19-signed-verification.dev.json','utf8'));
const operations=exact.source.compiled_json.authorization.operations;
const actors:any[]=[];
for(const account of ['catl.admin','catl.owner']){
 const client=await request.newContext({baseURL:'https://neon.dev.athyper.test',ignoreHTTPSErrors:true,storageState:'tests/e2e/.auth/'+account+'-release-19-qualification.json'});
 try{
  const s=await(await client.get('/api/auth/session')).json();
  if(s.state!=='authenticated'){actors.push({account,authenticated:false});continue;}
  const response=await client.get('/api/relay/iam/me'),me=await response.json();
  if(!response.ok()||me.principalId!==s.principalId)throw Error('Verified identity unavailable');
  const scopeResponse=await client.get('/api/relay/neon/work-contexts');
  const orgResponse=await client.get('/api/relay/neon/operating-organizations');
  const work=await scopeResponse.json(),org=await orgResponse.json();
  const permissions=new Set<string>(me.permissions??[]);
  actors.push({account,authenticated:true,principalId:s.principalId,tenantId:s.tenantId,assurance:s.assurance,
   companies:work.companies??[],organizations:org.organizations??[],
   operationPermissionPresence:operations.map((o:any)=>({operation:o.key,permissionCode:o.permissionCode,scope:o.scope,present:permissions.has(o.permissionCode)})),
   caveat:'Permission presence is not scoped authorization, preflight or execution evidence.'});
 }finally{await client.dispose();}
}
const report={schemaVersion:1,kind:'bp_release_19_execution_readiness',capturedAt:new Date().toISOString(),releaseId:signed.releaseId,artifactHash:signed.artifactHash,actors,
 authenticatedExecutionQualified:false,grantsChanged:false,activationAuthorized:false};
writeFileSync(process.argv[2]??'governance/policy/reports/business-partner-release-19-execution-readiness.dev.json',JSON.stringify(report,null,2)+'\n');
console.log(actors.map(a=>({account:a.account,authenticated:a.authenticated,missing:a.operationPermissionPresence?.filter((o:any)=>!o.present).map((o:any)=>o.operation)})));
