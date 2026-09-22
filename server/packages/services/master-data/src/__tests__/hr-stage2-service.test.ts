import type {Authorizer,VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {AuditRecorder} from "@athyper/server-contract-audit";
import type {PlaneTransactionCoordinator} from "@athyper/server-foundation/transaction";
import type {Transaction} from "kysely";
import {describe,expect,it,vi} from "vitest";
import {createHrStage2Service} from "../hr-stage2-service.js";
const context={planeKey:"neon",tenantId:"11111111-1111-4111-8111-111111111111",principalId:"22222222-2222-4222-8222-222222222222",requestId:"33333333-3333-4333-8333-333333333333"} as VerifiedRequestContext;
type Tx=Transaction<Record<string,never>>;
describe("HR Stage 2 authorization boundary",()=>{
  it("never opens a transaction for denied setup, user, or self-service actions",async()=>{
    const run=vi.fn(async()=>{throw Error("Denied request reached the database");});
    const authorize=vi.fn(async()=>({allowed:false}));
    const service=createHrStage2Service({authorizer:{authorize} as unknown as Authorizer,transactions:{run} as unknown as PlaneTransactionCoordinator<Tx>,audit:{record:vi.fn()} as unknown as AuditRecorder<Tx>});
    await expect(service.catalog(context,"44444444-4444-4444-8444-444444444444")).rejects.toMatchObject({status:403});
    await expect(service.users(context,"")).rejects.toMatchObject({status:403});
    await expect(service.requestOwnProfileChange(context,{idempotencyKey:"stage2-test-001",preferredName:"Ada"})).rejects.toMatchObject({status:403});
    expect(run).not.toHaveBeenCalled();
    expect(authorize.mock.calls.length).toBe(3);
  });
});
