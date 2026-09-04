import {describe,expect,it} from "vitest";
import {availableActions,validationPassed} from "./workflow";
import type {PartnerRequest,RequestView} from "./client";

const permissions=new Set(["neon.relationship.entity_case.update","neon.relationship.entity_case.validate","neon.relationship.entity_case.submit","neon.relationship.entity_case.decide","neon.relationship.entity_case.materialize"]);
function view(status:PartnerRequest["status"],extra:Partial<PartnerRequest>={}):RequestView{return{request:{id:"10000000-0000-4000-8000-000000000001",requestNo:"BPR-1",kind:"new_partner",source:{kind:"manual"},proposedPayload:{name:"Acme"},validationSummary:{},duplicateSummary:{},changeImpact:{},status,rowVersion:1,createdAt:"2026-08-28T00:00:00Z",...extra},validationFindings:[]};}
describe("Business Partner onboarding action policy",()=>{
  it("offers edit and validation for an unvalidated draft",()=>expect(availableActions(view("draft"),permissions)).toEqual(["edit","validate"]));
  it("offers submission only after passing validation",()=>{const value=view("draft",{validationSummary:{valid:true}});expect(validationPassed(value.request)).toBe(true);expect(availableActions(value,permissions)).toContain("submit");});
  it("offers approval decisions only for an open work item",()=>{const value={...view("pending_approval"),workflow:{requestId:"w",stageId:"s",workItemId:"i",workItemVersion:1,workItemStatus:"open",definition:{code:"workflow",version:1,hash:"a".repeat(64)}}};expect(availableActions(value,permissions)).toEqual(["return","reject","approve"]);});
  it("offers apply after approval and a stable master link after application",()=>{expect(availableActions(view("approved"),permissions)).toEqual(["apply"]);expect(availableActions(view("applied",{materializedBusinessPartnerId:"20000000-0000-4000-8000-000000000002"}),permissions)).toEqual(["open_partner"]);});
  it("never exposes a command without its exact permission",()=>expect(availableActions(view("approved"),new Set())).toEqual([]));
});
