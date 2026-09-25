// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {useChangedRuntimeResources} from "./changed-runtime-resources";
const state=vi.hoisted(()=>({invalidate:vi.fn(),scope:{tenantId:"tenant",principalId:"actor",authEpoch:3}}));
vi.mock("@athyper/platform-shell-app-foundation",()=>({useSessionIdentity:()=>({scope:state.scope})}));
vi.mock("@athyper/platform-entity-form-detail",()=>({invalidateEntityRuntimeRecord:state.invalidate}));
it("invalidates receipt and direct-command records only in the current principal epoch",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 let changed!:ReturnType<typeof useChangedRuntimeResources>;
 function Probe(){changed=useChangedRuntimeResources();return null;}
 const node=document.createElement("div"),root=createRoot(node);
 try {
  await act(async()=>root.render(<Probe/>));
  changed([{entityCode:"business_partner",recordId:"one"},{entityCode:"other",recordId:"ignored"}],"two");
  expect(state.invalidate.mock.calls.map(([scope])=>scope)).toEqual([
   {...state.scope,entityCode:"business_partner",recordId:"two"},
   {...state.scope,entityCode:"business_partner",recordId:"one"},
  ]);
 }finally{await act(async()=>root.unmount());}
});
