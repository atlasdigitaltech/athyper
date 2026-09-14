import {writeFileSync,chmodSync} from "node:fs";
import {request} from "@playwright/test";
import {businessPartnerInitialCaseSchema} from "../../../server/packages/services/publication/src/business-partner-initial-case-schema.js";
import {initialCaseContractSchema} from "../../../server/packages/services/publication/src/business-partner-case-contract-service.js";
import {canonicalBytes,sha256} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
const tenantId="44444444-4444-4444-8444-444444444444",entityId="289732bb-45c2-49e6-abb3-70ff4b85336b";
const source={tenantId,entityId,publicationKey:`metadata.entity.master_business_partner.${tenantId.replaceAll("-","")}`,contract:structuredClone(businessPartnerInitialCaseSchema)};
const contract=initialCaseContractSchema(source);
const bundle={schema:"athyper.business-partner-case-contract-review/2",mode:"initial",previous:null,tenantId,entityId,publicationKey:source.publicationKey,candidate:{contract}};
const contractHash=sha256(canonicalBytes(contract));
writeFileSync("governance/policy/reports/business-partner-save-draft-case-contract.proposal.dev.json",JSON.stringify({preparedAt:new Date().toISOString(),contractHash,bundle,approved:false,published:false},null,2)+"\n");
const origin="https://studio.dev.athyper.test";
const actor=process.env.STUDIO_ACTOR??"catl.admin";
if(!["catl.admin","catl.owner"].includes(actor))throw Error("Unsupported Studio actor");
const authPath=`tests/e2e/.auth/dev/studio/${actor}.json`;
const c=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:authPath});
try {
 const session=await (await c.get("/api/auth/session")).json();
 if(session.state!=="authenticated"||session.tenantId!==tenantId)throw Error("Authenticated Studio tenant session required");
 const state=await c.storageState();const cookie=state.cookies.find(x=>x.name==="__Host-athyper-csrf")??state.cookies.find(x=>x.name==="athyper-csrf");if(!cookie)throw Error("CSRF cookie required");
 const simulate=async()=>{
  const cookies=(await c.storageState()).cookies;
  const csrf=cookies.find(x=>x.name==="__Host-athyper-csrf")??cookies.find(x=>x.name==="athyper-csrf");
  if(!csrf)throw Error("CSRF required");
  return c.post("/api/relay/studio/business-partner-case-contracts/simulations",{headers:{origin,"x-csrf-token":decodeURIComponent(csrf.value)},data:{bundle,targetPlanes:["neon"]}});
 };
 let response=await simulate();let refreshStatus:number|undefined;
 if(response.status()===401){
  const refresh=await c.post("/api/auth/refresh",{headers:{origin,"x-csrf-token":decodeURIComponent(cookie.value)}});
  refreshStatus=refresh.status();
  if(refresh.ok()){await c.storageState({path:authPath});chmodSync(authPath,0o600);response=await simulate();}
 }
 const result=await response.json();
 writeFileSync("governance/policy/reports/business-partner-save-draft-case-contract.simulation.dev.json",JSON.stringify({checkedAt:new Date().toISOString(),actor,status:response.status(),contractHash,result},null,2)+"\n");
 console.log(JSON.stringify({actor,refreshStatus,status:response.status(),code:result.code??result.error?.code??result.error,reason:result.reason,compatible:result.compatible,detail:result.detail}));
}finally{await c.dispose()}
