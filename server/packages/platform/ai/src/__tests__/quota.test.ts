import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { InMemoryAtlasTenantQuotaManager } from "../quota.js";

const context={tenantId:"tenant-a"} as VerifiedRequestContext;
describe("Atlas tenant quotas",()=>{
  it("reserves capacity atomically, settles actual usage, and isolates tenants",async()=>{
    let id=0;const quotas=new InMemoryAtlasTenantQuotaManager({defaultPolicy:{maxRequests:2,maxInputTokens:10,maxOutputTokens:10,windowSeconds:60},createId:()=>`q-${++id}`,now:()=>new Date("2026-08-12T00:00:00Z")});
    const first=await quotas.reserve({context,estimatedInputTokens:4,maxOutputTokens:5});
    await expect(quotas.reserve({context,estimatedInputTokens:7,maxOutputTokens:1})).rejects.toMatchObject({code:"QUOTA_EXCEEDED"});
    await quotas.settle({reservation:first,inputTokens:3,outputTokens:2});
    const second=await quotas.reserve({context,estimatedInputTokens:7,maxOutputTokens:8});
    await quotas.release(second);
    await expect(quotas.reserve({context,estimatedInputTokens:1,maxOutputTokens:1})).rejects.toMatchObject({code:"QUOTA_EXCEEDED"});
    await expect(quotas.reserve({context:{...context,tenantId:"tenant-b"},estimatedInputTokens:10,maxOutputTokens:10})).resolves.toMatchObject({tenantId:"tenant-b"});
    await expect(quotas.snapshot(context)).resolves.toMatchObject({usedRequests:2,usedInputTokens:3,usedOutputTokens:2});
  });
});
