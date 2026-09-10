// @vitest-environment jsdom
import React, {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {EntityRecordAction} from "../../../../../../platform/entity/runtime/form-detail/src/record-action";
import {entityAccessStates, entityAccessReasons, type EntityAccessDecisionV1} from "@athyper/contract-platform-entity-runtime";
let root:Root, host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const action={key:"display-alias",operationKey:"configure_company",label:"Configure company",href:"/scope/new?companyCodeId=uk",placement:"secondary" as const};
const decision=(state:EntityAccessDecisionV1["state"]):EntityAccessDecisionV1=>({schemaVersion:1,state,reasonCode:entityAccessReasons[entityAccessStates.indexOf(state)]!,operationKey:"configure_company",authorityRevision:"release.1",decisionRef:"decision.1",...(state==="context_required"?{missingCoordinates:["companyCodeId"]}:{})});
it.each(entityAccessStates)("honors %s without using the destination as a fallback",async(state)=>{
 const selectContext=vi.fn(),verify=vi.fn(),prerequisites=vi.fn(),retry=vi.fn();
 await act(async()=>root.render(<EntityRecordAction action={{...action,decision:decision(state)}} handlers={{selectContext,verify,prerequisites,retry}}/>));
 expect(host.querySelector("a")?.getAttribute("href")).toBe(state==="allowed"?action.href:undefined);
 const button=host.querySelector("button"); if(button)await act(async()=>button.click());
 expect(selectContext).toHaveBeenCalledTimes(state==="context_required"?1:0);
 expect(verify).toHaveBeenCalledTimes(state==="verification_required"?1:0);
 expect(prerequisites).toHaveBeenCalledTimes(state==="workflow_blocked"||state==="preflight_required"?1:0);
 expect(retry).toHaveBeenCalledTimes(state==="unavailable"?1:0);
 if(state==="unavailable")expect(host.textContent).toContain("decision.1");
});
it("closes mismatched bindings and malformed state/reason combinations",async()=>{
 for(const d of [{...decision("allowed"),operationKey:"other"},{...decision("denied"),state:"allowed"}]){
  await act(async()=>root.render(<EntityRecordAction action={{...action,decision:d as EntityAccessDecisionV1}}/>));expect(host.querySelector("a")).toBeNull();expect(host.querySelector("button")?.disabled).toBe(true);
 }
});
it("disables remediation when its handler is missing and hides historical actions",async()=>{
 await act(async()=>root.render(<EntityRecordAction action={{...action,decision:decision("verification_required")}}/>));expect(host.querySelector("button")?.disabled).toBe(true);
 await act(async()=>root.render(<EntityRecordAction action={action} readOnly/>));expect(host.innerHTML).toBe("");
});
it("rejects external and protocol-relative destinations",async()=>{
 for(const href of ["https://example.test","//example.test","/\\example.test"]){await act(async()=>root.render(<EntityRecordAction action={{...action,href,decision:decision("allowed")}}/>));expect(host.querySelector("a")).toBeNull();}
});
