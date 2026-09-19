import {request} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path='governance/policy/reports/business-partner-release-19-retained-commands.dev.json';
const report=JSON.parse(readFileSync(path,'utf8'));
if(!report.commandJourneyCompleted)throw Error('Command journey incomplete');
const client=await request.newContext({baseURL:'https://neon.dev.athyper.test',ignoreHTTPSErrors:true,storageState:'tests/e2e/.auth/catl.admin-release-19-qualification.json'});
try{
 const response=await client.get('/api/relay/neon/business-partner-cases/'+report.testCaseId+'/view');
 const body=await response.json();
 if(!response.ok()||body.request?.status!=='applied')throw Error('Persisted application not confirmed');
 report.persistedVerification={verifiedAt:new Date().toISOString(),status:body.request.status,rowVersion:body.request.rowVersion,requestRef:createHash('sha256').update(response.headers()['x-request-id']??'').digest('hex')};
 report.priorBlockerDisposition='Normal catl.owner MFA step-up completed; both assigned approval stages and subsequent catl.admin materialization succeeded.';
 report.targetBackendQualified=false;
 report.exactReleaseExecutionParity=false;
 report.qualificationBoundary='Retained active-release command journey; does not qualify release-19 target enforcement.';
 writeFileSync(path,JSON.stringify(report,null,2)+'\n');
 console.log({caseId:report.testCaseId,persistedStatus:body.request.status,commandJourneyCompleted:true,targetBackendQualified:false});
}finally{await client.dispose();}
