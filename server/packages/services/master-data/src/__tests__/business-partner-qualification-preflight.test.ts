import {expect,it,vi} from "vitest";
import {createBusinessPartnerEligibilityService} from "../business-partner-eligibility-service.js";
const context={planeKey:"neon",tenantId:"tenant",principalId:"principal"} as never;
it("checks the target in the tenant transaction without authorization, command writes or effects",async()=>{
 const ready=vi.fn(async()=>true),authorize=vi.fn(),create=vi.fn(),audit=vi.fn(),outbox=vi.fn();
 const service=createBusinessPartnerEligibilityService({authorizer:{authorize},repository:{qualificationTargetReady:ready,createQualification:create} as never,transactions:{async run(_plane,actor,work){expect(actor.tenantId).toBe("tenant");return work({});}},audit:{record:audit},outbox:{write:outbox} as never});
 const query={context,businessPartnerId:"bp",operatingOrganizationId:"org",companyCodeId:"company"};
 expect(await service.preflightQualification!(query)).toBe("allowed");
 expect(ready).toHaveBeenCalledWith({tenantId:"tenant",businessPartnerId:"bp",operatingOrganizationId:"org",companyCodeId:"company"},{});
 ready.mockResolvedValue(false);
 expect(await service.preflightQualification!(query)).toBe("not_applicable");
 expect(await service.preflightQualification!({...query,historical:true})).toBe("workflow_blocked");
 expect(ready).toHaveBeenCalledTimes(2);
 for(const effect of [authorize,create,audit,outbox])expect(effect).not.toHaveBeenCalled();
});
it("fails closed for a missing readiness adapter",async()=>{
 const service=createBusinessPartnerEligibilityService({authorizer:{} as never,repository:{} as never,transactions:{} as never,audit:{} as never,outbox:{} as never});
 expect(await service.preflightQualification!({context,businessPartnerId:"bp",operatingOrganizationId:"org"})).toBe("not_applicable");
});
