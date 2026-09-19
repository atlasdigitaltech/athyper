import {readFileSync,writeFileSync} from "node:fs";
import {request} from "@playwright/test";
const staged=JSON.parse(readFileSync("governance/policy/reports/business-partner-save-draft-case-contract.staging.dev.json","utf8"));
if(staged.status!==201||!staged.result.id)throw Error("Successful staging required");
const origin="https://studio.dev.athyper.test";
const c=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:"tests/e2e/.auth/dev/studio/catl.owner.json"});
try {
 const session=await (await c.get("/api/auth/session")).json();
 if(session.state!=="authenticated"||session.tenantId!=="44444444-4444-4444-8444-444444444444"||session.principalId!=="5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d")throw Error("Expected independent Studio publisher session required");
 const path=`/api/relay/studio/business-partner-case-contracts/${staged.result.id}`;
 const read=await c.get(path);if(!read.ok())throw Error(`Review read failed: ${read.status()}`);
 const revision=await read.json();
 if(revision.contractHash!==staged.contractHash||revision.createdBy===session.principalId)throw Error("Revision hash or independent reviewer mismatch");
 const cookies=(await c.storageState()).cookies;
 const csrf=cookies.find(x=>x.name==="__Host-athyper-csrf")??cookies.find(x=>x.name==="athyper-csrf");if(!csrf)throw Error("CSRF required");
 const response=await c.post(`${path}/publish`,{headers:{origin,"x-csrf-token":decodeURIComponent(csrf.value),"idempotency-key":`save-draft-publish-${staged.contractHash}`},data:{minimumRuntimeVersion:"1.0.0"}});
 const result=await response.json();
 writeFileSync("governance/policy/reports/business-partner-save-draft-case-contract.publication.dev.json",JSON.stringify({checkedAt:new Date().toISOString(),actor:"catl.owner",status:response.status(),revisionId:revision.id,contractHash:staged.contractHash,result},null,2)+"\n");
 console.log(JSON.stringify({status:response.status(),releaseId:result.release?.id,jobId:result.jobId,code:result.code??result.error,reason:result.reason}));
}finally{await c.dispose()}
