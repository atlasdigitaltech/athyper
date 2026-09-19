import {it, expect, vi} from "vitest";
import {createBusinessPartner360Service} from "../business-partner-360-service.js";
const context = {tenantId: "tenant", principalId: "principal", planeKey: "neon", assurance: "elevated"} as never;
function fixture(auditAvailable = true, replayAvailable = true) {
  const authorize = vi.fn(), reveal = vi.fn(), claim = vi.fn(), audit = vi.fn();
  const resolveCore = vi.fn(async () => ({id: "bp"}));
  const service = createBusinessPartner360Service({
    authorizer: {authorize}, repository: {resolveCore, ...(replayAvailable ? {claimRestrictedReveal: claim} : {})} as never,
    transactions: {async run(_plane, _actor, work) {return work({});}},
    definitions: {} as never, protectedValues: {reveal},
    ...(auditAvailable ? {audit: {record: audit}} : {}),
  });
  return {service, authorize, reveal, claim, audit, resolveCore};
}
it("checks stored parent and required reveal infrastructure without authorizing recursively or consuming a reveal", async () => {
  const f = fixture();
  expect(await f.service.preflightReveal!({context, businessPartnerId: "bp", kind: "tax"})).toBe("allowed");
  expect(f.resolveCore).toHaveBeenCalledWith({tenantId: "tenant", businessPartnerId: "bp"}, {});
  for (const effect of [f.authorize, f.reveal, f.claim, f.audit]) expect(effect).not.toHaveBeenCalled();
  f.resolveCore.mockResolvedValue({id: "other"});
  expect(await f.service.preflightReveal!({context, businessPartnerId: "bp", kind: "bank"})).toBe("not_applicable");
});
it("blocks historical/unelevated tax and unavailable audit or replay protection", async () => {
  const f = fixture();
  expect(await f.service.preflightReveal!({context, businessPartnerId: "bp", kind: "bank", historical: true})).toBe("workflow_blocked");
  expect(await f.service.preflightReveal!({context: {...(context as object), assurance: "standard"} as never, businessPartnerId: "bp", kind: "tax"})).toBe("workflow_blocked");
  expect(f.resolveCore).not.toHaveBeenCalled();
  for (const [audit, replay] of [[false, true], [true, false]])
    expect(await fixture(audit, replay).service.preflightReveal!({context, businessPartnerId: "bp", kind: "bank"})).toBe("not_applicable");
});
