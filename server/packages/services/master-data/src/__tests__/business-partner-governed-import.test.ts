import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BusinessPartnerRequestService, CreateBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";
import { createBusinessPartnerGovernedImport, parseBusinessPartnerGovernedImport } from "../business-partner-governed-import.js";
import { createBusinessPartnerRequestService } from "../business-partner-request-service.js";
import { createBusinessPartnerRequestValidator } from "../business-partner-request-validator.js";

const context = {planeKey: "neon", tenantId: "11111111-1111-4111-8111-111111111111", principalId: "22222222-2222-4222-8222-222222222222", requestId: "request-1"} as VerifiedRequestContext;
const schema = {code: "neon.business_partner_request", version: 1, hash: "a".repeat(64), releaseId: "33333333-3333-4333-8333-333333333333"};
const row = (rowKey = "row-0001") => ({rowKey, operatingOrganizationId: "44444444-4444-4444-8444-444444444444", proposedPayload: {name: "Internal supplier", ownershipClass: "internal", supplierType: "intercompany"}, extensions: {
  addresses: [{clientItemKey: "address-1", definitionFieldCode: "relationship.address.primary", purpose: "default", countryCode: "GB", normalizedHash: "b".repeat(64), isPrimary: true}],
  contactPersons: [{clientItemKey: "contact-1", definitionFieldCode: "relationship.contact.primary", contactName: "Supplier contact", isPrimary: true}],
  contactChannels: [{clientItemKey: "channel-1", definitionFieldCode: "relationship.contact.email", contactClientItemKey: "contact-1", channelType: "email" as const, value: "supplier@example.test", purpose: "default", isPrimary: true}],
}});
const batch = (...rows: ReturnType<typeof row>[]) => ({schemaVersion: 1, batchKey: "batch-0001", rows});
function fixture() {
  const repository = {create: vi.fn(() => {throw Error("PREFLIGHT_MUST_NOT_WRITE");})};
  const audit = {record: vi.fn()}, outbox = {append: vi.fn()};
  const owner = createBusinessPartnerRequestService({repository: repository as never, authorizer: {authorize: async () => ({allowed: true})}, schemas: {resolve: async () => schema}, validator: createBusinessPartnerRequestValidator({duplicates: {findExactName: async () => []}}), workflows: {} as never, transactions: {run: async (_plane, _actor, work) => work({})}, audit: audit as never, outbox});
  const preflightCreate = vi.fn(owner.preflightCreate!.bind(owner));
  const saved = new Map<string, unknown>();
  const create = vi.fn(async (command: CreateBusinessPartnerRequestCommand) => {
    const previous = saved.get(command.idempotencyKey);
    if (previous && JSON.stringify(previous) !== JSON.stringify(command.proposedPayload)) throw Error("IDEMPOTENCY_CONFLICT");
    saved.set(command.idempotencyKey, command.proposedPayload);
    return {request: {id: command.idempotencyKey}, replayed: !!previous};
  });
  const authorizeGateway = vi.fn(async (_context: VerifiedRequestContext) => {});
  const resolveRow = vi.fn(async () => {});
  const service = createBusinessPartnerGovernedImport({requests: {preflightCreate, create} as unknown as BusinessPartnerRequestService, refreshContext: async c => c, authorizeGateway, resolveRow});
  return {service, create, preflightCreate, authorizeGateway, resolveRow, repository, audit, outbox};
}
it("uses real intake rules before any draft write, including ownership and typed primary relationships", async () => {
  const f = fixture();
  const invalid = row("row-0002"); invalid.proposedPayload.supplierType = "general";
  await expect(f.service.execute(context, batch(row(), invalid))).rejects.toMatchObject({code: "BP_GOVERNED_IMPORT_VALIDATION_FAILED"});
  expect(f.create).not.toHaveBeenCalled();
  expect(f.repository.create).not.toHaveBeenCalled(); expect(f.audit.record).not.toHaveBeenCalled(); expect(f.outbox.append).not.toHaveBeenCalled();
  const missing = row(); missing.extensions.contactPersons = [];
  await expect(f.service.execute(context, batch(missing))).rejects.toThrow();
  expect(f.create).not.toHaveBeenCalled();
});
it("pins the checked schema, creates only supplier drafts, and reuses stable row identity on replay", async () => {
  const f = fixture();
  expect((await f.service.execute(context, batch(row()))).outcomes[0]?.status).toBe("created");
  expect((await f.service.execute(context, batch(row()))).outcomes[0]?.status).toBe("replayed");
  expect(f.create.mock.calls[0]![0]).toMatchObject({kind: "new_partner", requestedRole: "supplier", source: {kind: "import"}, registrationMode: "integration", expectedForm: schema});
  const changed = row(); changed.proposedPayload.name = "Changed";
  expect((await f.service.execute(context, batch(changed))).outcomes[0]?.status).toBe("failed");
});
it("stops on revocation between rows and reports prior committed work without continuing", async () => {
  const f = fixture();
  // Three preparation checks, first execution check, then revoked gateway.
  f.authorizeGateway.mockImplementation(async () => {if (f.authorizeGateway.mock.calls.length === 5) throw Error("REVOKED");});
  const result = await f.service.execute(context, batch(row(), row("row-0002"), row("row-0003")));
  expect(result.outcomes.map(o => o.status)).toEqual(["created", "failed", "not_executed"]);
  expect(f.create).toHaveBeenCalledTimes(1);
});
it("rejects incompatible row scope for the whole batch before writing", async () => {
  const f = fixture();
  f.resolveRow.mockRejectedValueOnce(Error("INCOMPATIBLE_COMPANY"));
  await expect(f.service.execute(context, batch(row()))).rejects.toThrow("INCOMPATIBLE_COMPANY");
  expect(f.create).not.toHaveBeenCalled();
});
it("rejects unbounded, duplicate and generic mutation inputs", () => {
  for (const value of [batch(), batch(row(), row()), batch(...Array.from({length: 101}, (_, i) => row(`row-${String(i).padStart(4, "0")}`))), {...batch(row()), mode: "upsert"}, batch({...row(), targetBusinessPartnerId: context.tenantId} as ReturnType<typeof row>)]) expect(() => parseBusinessPartnerGovernedImport(value)).toThrow();
});
it("does not continue under a different refreshed principal", async () => {
  const f = fixture();
  const service = createBusinessPartnerGovernedImport({requests: {preflightCreate: f.preflightCreate, create: f.create} as unknown as BusinessPartnerRequestService, refreshContext: async c => ({...c, principalId: "other"}), authorizeGateway: f.authorizeGateway, resolveRow: f.resolveRow});
  await expect(service.execute(context, batch(row()))).rejects.toMatchObject({code: "BP_GOVERNED_IMPORT_CONTEXT_CHANGED"});
  expect(f.create).not.toHaveBeenCalled();
});
