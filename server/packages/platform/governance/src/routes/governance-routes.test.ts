import express from "express";
import { describe, expect, it, vi } from "vitest";
import type { Authorizer } from "@athyper/server-contract-auth";
import type { ChannelConsentService, CycleCertificationService, CycleDeviationService, CycleRunService, CycleTaskService } from "@athyper/server-contract-governance";
import { auditRouteContracts, routeContracts } from "@athyper/server-runtime-http";
import { registerGovernanceRoutes } from "./governance-routes.js";

describe("G2 governance routes", () => {
  it("registers documented execution endpoints with explicit permissions", () => {
    const application=express(),call=vi.fn();
    registerGovernanceRoutes(application,{authenticate:(_request,_response,next)=>next(),readContext:()=>({tenantId:"tenant",principalId:"principal"} as never),authorizer:{authorize:async()=>({allowed:true})} as Authorizer,consent:{record:call} as unknown as ChannelConsentService,cycleRuns:methods(["create","transition","readiness"],call) as unknown as CycleRunService,cycleTasks:methods(["claim","start","complete","block","waive","reopen"],call) as unknown as CycleTaskService,cycleDeviations:methods(["create","resolve","waive","carryForward"],call) as unknown as CycleDeviationService,cycleCertifications:methods(["create","submit","certify","reject"],call) as unknown as CycleCertificationService});
    const contracts=routeContracts(application);
    expect(contracts).toHaveLength(18);
    expect(contracts.find(item=>item.operationId==="governance.cycleCertification.certify")?.permission).toBe("governance.cycle.certify");
    expect(contracts.find(item=>item.operationId==="governance.cycleDeviation.carryForward")?.permission).toBe("governance.cycle.review");
    expect(auditRouteContracts(application)).toEqual([]);
  });
});

function methods(names:readonly string[],implementation:ReturnType<typeof vi.fn>):Record<string,unknown>{return Object.fromEntries(names.map(name=>[name,implementation]));}
