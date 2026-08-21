import { describe, expect, it } from "vitest";
import type { AuditEvent, AuditRecordInput } from "@athyper/server-contract-audit";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PolicyDefinition, PolicyRepository } from "@athyper/server-contract-policy";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { createCachedPolicyRepository, createPolicyService } from "../index.js";

type Tx = { readonly plane: PlaneKey };
const context = (planeKey: PlaneKey): VerifiedRequestContext => ({ planeKey, realmKey: "athyper", tenantId: "11111111-1111-4111-8111-111111111111", principalId: "22222222-2222-4222-8222-222222222222", authEpoch: 1, profileHash: "profile", requestId: "request-1", permissions: { planeKey, tenantId: "11111111-1111-4111-8111-111111111111", principalId: "22222222-2222-4222-8222-222222222222", principalFingerprint: "fingerprint", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } });
const definitions: readonly PolicyDefinition[] = [
  { id: "33333333-3333-4333-8333-333333333333", entityType: "purchase_order", name: "Purchase approval", priority: 10, evaluationMode: "first_match", effectiveFrom: "2026-01-01", versionNo: 2, rules: [
    { id: "44444444-4444-4444-8444-444444444444", priority: 10, condition: { ">": [{ var: "amount" }, 10000] }, action: "require_workflow", actionConfig: { template: "high_value" }, metadata: {} },
    { id: "55555555-5555-4555-8555-555555555555", priority: 20, condition: {}, action: "allow", actionConfig: {}, metadata: {} },
  ] },
  { id: "66666666-6666-4666-8666-666666666666", entityType: "purchase_order", name: "Risk block", priority: 20, evaluationMode: "accumulate", effectiveFrom: "2026-01-01", versionNo: 1, rules: [
    { id: "77777777-7777-4777-8777-777777777777", priority: 10, condition: { "==": [{ var: "supplier.risk" }, "blocked"] }, action: "deny", actionConfig: {}, explanation: "Supplier is blocked", metadata: {} },
  ] },
];

describe("policy service", () => {
  for (const planeKey of ["studio", "neon", "mesh"] as const) it(`evaluates local policy artifacts on ${planeKey}`, async () => {
    const audit: AuditEvent[] = [];
    const service = createPolicyService({ repository: repository(definitions), transactions: { run: async (plane, _actor, work) => work({ plane }) }, audit: { record: async (input) => { const event = auditEvent(input); audit.push(event); return event; } }, now: () => new Date("2026-08-09T00:00:00.000Z") });
    await expect(service.evaluate({ context: context(planeKey), entityType: "purchase_order", facts: { amount: 25000, supplier: { risk: "blocked" } } })).resolves.toMatchObject({ action: "deny", permitted: false, outcomes: [{ action: "require_workflow" }, { action: "deny" }], winning: { explanation: "Supplier is blocked" } });
    expect(audit).toHaveLength(1);
  });

  it("caches by tenant, entity, date, and bound policy coordinate", async () => {
    let reads = 0;
    const cached = createCachedPolicyRepository({ repository: { findActive: async () => { reads += 1; return definitions; } }, now: () => 1, ttlMs: 100 });
    const query = { tenantId: "tenant", entityType: "purchase_order", effectiveOn: "2026-08-09", policyDefinitionIds: [definitions[0]!.id] };
    await cached.findActive(query, {}); await cached.findActive(query, {}); expect(reads).toBe(1);
    cached.clear("tenant"); await cached.findActive(query, {}); expect(reads).toBe(2);
  });

  it("simulates with an ordered rule explanation without writing audit evidence",async()=>{const audit:AuditEvent[]=[];const service=createPolicyService({repository:repository(definitions),transactions:{run:async(plane,_actor,work)=>work({plane})},audit:{record:async input=>{const event=auditEvent(input);audit.push(event);return event;}},now:()=>new Date("2026-08-09T00:00:00Z")});const simulation=await service.simulate({context:context("neon"),entityType:"purchase_order",facts:{amount:50,supplier:{risk:"clear"}}});expect(simulation).toMatchObject({audited:false,decision:{action:"allow"},trace:[{ruleId:definitions[0]!.rules[0]!.id,matched:false},{ruleId:definitions[0]!.rules[1]!.id,matched:true},{ruleId:definitions[1]!.rules[0]!.id,matched:false}]});expect(audit).toEqual([]);});
});

function repository(value: readonly PolicyDefinition[]): PolicyRepository<Tx> { return { findActive: async (_query, transaction) => { expect(transaction.plane).toBeDefined(); return value; } }; }
function auditEvent(input: AuditRecordInput): AuditEvent { return { ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: input.severity ?? "info" }; }
