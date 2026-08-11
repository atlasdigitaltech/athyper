import { describe,expect,it,vi } from "vitest";
import { DefaultNumberingService,type NumberingRepository } from "../index.js";
import type { NumberingPolicy } from "@athyper/server-contract-numbering";

const context={planeKey:"neon" as const,tenantId:"019fc300-0000-7000-8000-000000000002",principalId:"019fc300-0000-7000-8000-000000000003"};
const policy:NumberingPolicy={id:"019fc300-0000-7000-8000-000000000001",policyCode:"invoice",policyRevision:1,formatTemplate:"INV-{seq}",sequenceWidth:4,padCharacter:"0",startValue:1,incrementBy:1,scopeKind:"tenant",resetKind:"never",source:"global"};
describe("DefaultNumberingService",()=>{
  it("previews without advancing a counter",async()=>{const allocate=vi.fn();const repository:NumberingRepository<{}>={resolvePolicy:async()=>policy,allocate};const service=new DefaultNumberingService({run:async(_plane,_actor,work)=>work({})},repository);await expect(service.preview({context,policyCode:"invoice",policyRevision:1,nextValue:12,occurredAt:"2026-08-09T00:00:00Z"})).resolves.toMatchObject({formattedNumber:"INV-0012"});expect(allocate).not.toHaveBeenCalled();});
  it("rejects an invalid allocation id before opening a transaction",async()=>{const run=vi.fn();const service=new DefaultNumberingService(run as never,{} as never);await expect(service.allocate({context,policyCode:"invoice",policyRevision:1,allocationId:"bad",occurredAt:"2026-08-09T00:00:00Z"})).rejects.toMatchObject({code:"NUMBERING_ALLOCATION_ID_INVALID"});expect(run).not.toHaveBeenCalled();});
});
