import {readFileSync,writeFileSync} from "node:fs";
import {request} from "@playwright/test";
import {canonicalBytes,sha256} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
const proposal=JSON.parse(readFileSync("governance/policy/reports/business-partner-save-draft-case-contract.proposal.dev.json","utf8"));
if(sha256(canonicalBytes(proposal.bundle.candidate.contract))!==proposal.contractHash)throw Error("Proposal hash mismatch");
const origin="https://studio.dev.athyper.test";
const c=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:"tests/e2e/.auth/dev/studio/catl.admin.json"});
try {
 const session=await (await c.get("/api/auth/session")).json();
 if(session.state!=="authenticated"||session.tenantId!==proposal.bundle.tenantId||session.principalId!=="81cd1978-2df5-5c9a-938a-2f8c291aea13")throw Error("Expected Studio author session required");
 const cookies=(await c.storageState()).cookies;
 const csrf=cookies.find(x=>x.name==="__Host-athyper-csrf")??cookies.find(x=>x.name==="athyper-csrf");if(!csrf)throw Error("CSRF required");
 const result=await c.post("/api/relay/studio/business-partner-case-contracts",{headers:{origin,"x-csrf-token":decodeURIComponent(csrf.value),"idempotency-key":`save-draft-initial-${proposal.contractHash}`},data:{bundle:proposal.bundle,targetPlanes:["neon"]}});
 const body=await result.json();
 writeFileSync("governance/policy/reports/business-partner-save-draft-case-contract.staging.dev.json",JSON.stringify({checkedAt:new Date().toISOString(),actor:"catl.admin",status:result.status(),contractHash:proposal.contractHash,result:body},null,2)+"\n");
 console.log(JSON.stringify({status:result.status(),id:body.id,code:body.code??body.error,reason:body.reason}));
}finally{await c.dispose()}
