import assert from "node:assert/strict";
import test from "node:test";
import { createAppRelay as neon } from "../../apps/neon/lib/relay";
import { createAppRelay as studio } from "../../apps/studio/lib/relay";
import type { RelaySessionContext } from "../../packages/platform/gateway/bff-relay/src/index";

test("protected intake is an exact tenant-bound Neon POST with CSRF, not a cross-plane wildcard", async () => {
 for (const [plane,factory] of [["neon",neon],["studio",studio]] as const) {
  let calls=0;
  const session:RelaySessionContext={accessToken:"test",plane,realmKey:"athyper",tenantId:"tenant",principalId:"actor",authEpoch:1,csrfToken:"csrf"};
  const handler=factory({appOrigin:"https://app.test",runtimeApiUrl:"http://runtime.test",
   session:{resolve:async()=>session,refresh:async()=>undefined,invalidate:async()=>[]},
   fetch:async()=>{calls++;return Response.json({protectedValueToken:"opaque-test-token"});},
  });
  const path=["neon","business-partner-intake","protected-values"];
  const invoke=(csrf:boolean,method="POST")=>handler(new Request("https://app.test/api/relay/"+path.join("/"),{
   method,headers:{origin:"https://app.test","content-type":"application/json",...(csrf?{"x-csrf-token":"csrf"}:{})},
   ...(method==="POST"?{body:JSON.stringify({kind:"tax",value:"SYNTHETIC"})}:{}),
  }),{params:Promise.resolve({path})});
  assert.equal((await invoke(true,"GET")).status,404);
  assert.equal((await invoke(false)).status,plane==="neon"?403:404);
  assert.equal((await invoke(true)).status,plane==="neon"?200:404);
  assert.equal(calls,plane==="neon"?1:0);
 }
});
