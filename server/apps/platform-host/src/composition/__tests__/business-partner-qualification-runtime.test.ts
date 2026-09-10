import {it,expect,vi} from "vitest";
import {createBusinessPartnerQualificationRuntimeRegistrations} from "../business-partner-qualification-runtime.js";
function fixture(){
 const create=vi.fn(async()=>({})),check=vi.fn(async()=>"allowed" as const),resolve=vi.fn();
 const entries=createBusinessPartnerQualificationRuntimeRegistrations({createQualification:create,preflightQualification:check} as never,{resolve,preflight:check});
 return{create,check,resolve,entries};
}
it("binds organization/company creation separately and rejects existing-child decisions",async()=>{
 const f=fixture(),command={context:{planeKey:"neon"},businessPartnerId:"bp",operatingOrganizationId:"org"};
 await f.entries[0]!.handler.invoke(command);
 await f.entries[1]!.handler.invoke({...command,companyCodeId:"company"});
 expect(f.create).toHaveBeenCalledTimes(2);
 expect(()=>f.entries[1]!.handler.invoke(command)).toThrow();
 expect(()=>f.entries[0]!.handler.invoke({...command,companyCodeId:"company"})).toThrow();
 expect(()=>f.entries[0]!.handler.invoke({...command,qualificationId:"existing"})).toThrow();
 expect(()=>f.entries[0]!.handler.invoke({...command,context:{planeKey:"mesh"}})).toThrow();
});
it("runs owning readiness without creation and rejects missing or cross-variant context",async()=>{
 const f=fixture(),input={context:{planeKey:"neon"},operationKey:"qualification_company",recordId:"bp",coordinates:{operatingOrganizationId:"org",companyCodeId:"company"},phase:"execute"};
 expect(await f.entries[1]!.preflight!.check(input)).toBe("allowed");
 expect(f.check).toHaveBeenCalledWith(expect.objectContaining({businessPartnerId:"bp",operatingOrganizationId:"org",companyCodeId:"company"}));
 expect(await f.entries[1]!.preflight!.check({...input,recordId:undefined})).toBe("not_applicable");
 expect(await f.entries[1]!.preflight!.check({...input,coordinates:{operatingOrganizationId:"org"}})).toBe("not_applicable");
 expect(f.create).not.toHaveBeenCalled();
 expect(()=>f.entries[0]!.preflight!.check(input)).toThrow();
});
it("pins proposed scope and requires a real owner preflight",async()=>{
 const f=fixture();
 await f.entries[0]!.resolver.resolve({entityCode:"business_partner",operationKey:"qualification",target:"existing",resolver:"tenant.record.v1"});
 expect(f.resolve).toHaveBeenCalledWith(expect.objectContaining({target:"proposed",resolver:"organization.record.v1"}));
 expect(()=>createBusinessPartnerQualificationRuntimeRegistrations({} as never,{} as never)).toThrow("BP_QUALIFICATION_PREFLIGHT_UNAVAILABLE");
});
