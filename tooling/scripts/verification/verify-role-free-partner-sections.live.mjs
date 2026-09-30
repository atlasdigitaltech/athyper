/** Read-only audit of the screenshot's partner-fact sections. No grants or fixtures are written. */
import assert from "node:assert/strict";
import {actor} from "./partner-classification-session.mjs";
const admin=await actor("catl.admin"), bp="b4137225-4534-5469-8138-09d15a970271", results=[];
try {
  for(const section of ["overview","identity","industries","commodities","contacts","addresses","identifiers-tax","banking","qualifications-certificates","certificates","network"]){
    const response=await admin.call(`entity-runtime/business_partner/records/${bp}/sections/${section}?surface=detail`);
    // Network's current organization/company-only grant is a separate configuration blocker.
    assert.ok(section==="network" ? [200,403].includes(response.status) : response.status===200,JSON.stringify({section,...response}));
    results.push({section,status:response.status,state:response.body?.data?.state});
  }
  console.log(JSON.stringify({results,allReadable:results.every(result=>result.status===200),networkAuthorizationPending:results.at(-1).status===403}));
} finally {await admin.dispose();}
