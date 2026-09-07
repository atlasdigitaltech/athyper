import { MASTER_DATA_SENSITIVE_PERMISSIONS } from "../master-data-authority.js";
import { MasterDataError } from "../errors.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { describe, expect, it, vi } from "vitest";
import { createMasterDataServices, type MasterDataServiceOptions } from "../services.js";
import { normalizeAddress } from "../normalization.js";
import { optionalTimestamp } from "../validation.js";

const context = { tenantId: "tenant", principalId: "principal", planeKey: "neon", requestId: "request" } as VerifiedRequestContext;
const owner = { entityCode: "party", ownerTypeId: "type", ownerId: "owner" };
const evidence = { provider: "provider", evidenceId: "evidence", issuedAt: "2026-09-01T00:00:00Z", expiresAt: "2026-09-07T00:00:00Z", payloadHash: "hash", signature: "signature", keyId: "key" };
function fixture(withVerificationAuthority = true) {
  const transaction = {};
  const repository = {
    ownerExists: vi.fn(async () => true), findContactDuplicate: vi.fn(async () => null),
    createContact: vi.fn(async (input) => ({ ...input, id: "contact" })),
    getContactForVerification: vi.fn(async () => ({ id: "contact", channelType: "email", value: "a@example.com" })),
    setContactVerification: vi.fn(async () => ({ id: "contact" })),
    deactivateContact: vi.fn(async () => true),
    findAddressDuplicate: vi.fn(async () => null), createAddress: vi.fn(async () => ({ id: "address" })),
    createAddressLink: vi.fn(async (input) => ({ ...input, id: "link" })),
    deactivateAddressLink: vi.fn(async (): Promise<false | "deactivated" | "cancelled"> => "deactivated"), listContacts: vi.fn(async () => []), listAddresses: vi.fn(async () => []),
  };
  const authorize = vi.fn(async () => ({ allowed: true }));
  const run = vi.fn(async (_plane, _actor, work) => work(transaction));
  const audit = { record: vi.fn(async () => undefined) };
  const outbox = { append: vi.fn(async () => undefined) };
  const verify = vi.fn(async () => true);
  const metadata = { getEntityDescriptor: vi.fn(async () => ({ code: "party" })) };
  const authorizeAccess = vi.fn(async (_context, access: keyof typeof MASTER_DATA_SENSITIVE_PERMISSIONS, _target, _transaction) => {
    for (const _permission of ["root", ...MASTER_DATA_SENSITIVE_PERMISSIONS[access]]) {
      if (!(await authorize()).allowed) throw new MasterDataError(403, "FORBIDDEN", "Denied");
    }
  });
  const authorizeVerification = vi.fn(async () => {
    if (!(await authorize()).allowed) throw new MasterDataError(403, "FORBIDDEN", "Denied");
  });
  const services = createMasterDataServices({ ...(withVerificationAuthority ? { authorizeVerification } : {}), authorizeAccess, repository, transactions: { run }, authorizer: { authorize }, metadata, audit, outbox, evidenceVerifier: { verify }, now: () => new Date("2026-09-06T00:00:00Z") } as unknown as MasterDataServiceOptions<object>);
  return { services, authorizeAccess, repository, authorize, run, audit, outbox, verify, metadata, transaction };
}
const operations = [
  (s: ReturnType<typeof fixture>["services"]) => s.contacts.create({ context, owner, channelType: "email", value: "A@Example.com" }),
  (s: ReturnType<typeof fixture>["services"]) => s.addresses.create({ context, owner, address: { city: "KL" } }),
  (s: ReturnType<typeof fixture>["services"]) => s.contacts.changeVerification({ context, contactId: "contact", verified: true, evidence }),
  (s: ReturnType<typeof fixture>["services"]) => s.contacts.deactivate({ context, contactId: "contact" }),
  (s: ReturnType<typeof fixture>["services"]) => s.addresses.deactivate({ context, addressLinkId: "link" }),
  (s: ReturnType<typeof fixture>["services"]) => s.ownerProfile.get({ context, owner }),
];
describe("master data service guards and effects", () => {
  it("fails closed when trusted verification authority is absent", async () => {
    const f = fixture(false);
    await expect(operations[2]!(f.services)).rejects.toMatchObject({status:503,code:"MASTER_DATA_AUTHORITY_UNAVAILABLE"});
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.repository.getContactForVerification).not.toHaveBeenCalled();
    expect(f.repository.setContactVerification).not.toHaveBeenCalled();
    expect(f.outbox.append).not.toHaveBeenCalled();
  });
  it.each(operations.map((op, i) => [i, op] as const))("denies operation %s before data access", async (_i, op) => {
    const f = fixture(); f.authorize.mockResolvedValue({ allowed: false });
    await expect(op(f.services)).rejects.toMatchObject({ status: 403 });
    expect(f.run).toHaveBeenCalled();
    expect(f.repository.createContact).not.toHaveBeenCalled();
    expect(f.repository.createAddress).not.toHaveBeenCalled();
    expect(f.repository.deactivateContact).not.toHaveBeenCalled();
    expect(f.repository.deactivateAddressLink).not.toHaveBeenCalled();
    expect(f.repository.listContacts).not.toHaveBeenCalled();
    expect(f.repository.getContactForVerification).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled();
  });
  it.each(operations.slice(0, 5).map((op, i) => [i, op] as const))("keeps mutation %s and effects in the tenant's plane transaction", async (_i, op) => {
    const f = fixture(); await op(f.services);
    expect(f.run).toHaveBeenCalledWith("neon", { tenantId: "tenant", principalId: "principal" }, expect.any(Function));
    expect(f.audit.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant" }), f.transaction);
    expect(f.outbox.append).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant" }), f.transaction);
  });
  it.each([
    { ...evidence, expiresAt: "2026-09-06T00:00:00Z" },
    { ...evidence, issuedAt: "2026-09-08T00:00:00Z" },
    { ...evidence, expiresAt: "2026-08-31T00:00:00Z" },
  ])("rejects evidence outside its validity window", async (invalidEvidence) => {
    const f = fixture();
    await expect(f.services.contacts.changeVerification({ context, contactId: "contact", verified: true, evidence: invalidEvidence })).rejects.toMatchObject({ status: 422 });
    expect(f.run).not.toHaveBeenCalled();
  });
  it("rejects invalid signatures without writing", async () => {
    const f = fixture(); f.verify.mockResolvedValue(false);
    await expect(operations[2]!(f.services)).rejects.toMatchObject({ status: 422 });
    expect(f.repository.setContactVerification).not.toHaveBeenCalled();
    expect(f.audit.record).not.toHaveBeenCalled();
  });
  it("records cancellation disposition in audit and outbox within the mutation transaction", async () => {
    const f = fixture(); f.repository.deactivateAddressLink.mockResolvedValue("cancelled");
    await operations[4]!(f.services);
    expect(f.audit.record).toHaveBeenCalledWith(expect.objectContaining({metadata:{disposition:"cancelled"}}), f.transaction);
    expect(f.outbox.append).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({disposition:"cancelled"})}), f.transaction);
  });
  it("returns 404 without effects when deactivation targets are missing", async () => {
    const f = fixture(); f.repository.deactivateContact.mockResolvedValue(false); f.repository.deactivateAddressLink.mockResolvedValue(false);
    await expect(operations[3]!(f.services)).rejects.toMatchObject({ status: 404 });
    await expect(operations[4]!(f.services)).rejects.toMatchObject({ status: 404 });
    expect(f.repository.deactivateContact).toHaveBeenCalledWith("tenant", "contact", "2026-09-06T00:00:00.000Z", f.transaction);
    expect(f.audit.record).not.toHaveBeenCalled(); expect(f.outbox.append).not.toHaveBeenCalled();
  });
  it("requires both sensitive capabilities before profile reads", async () => {
    const f = fixture(); f.authorize.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
    await expect(operations[5]!(f.services)).rejects.toMatchObject({ status: 403 });
    expect(f.repository.listContacts).not.toHaveBeenCalled();
    expect(f.repository.listAddresses).not.toHaveBeenCalled();
  });
  it.each([0, 1, 3, 4, 5])("authorizes operation %s inside its data transaction", async i => {
    const f = fixture(); await operations[i]!(f.services);
    const expected = [ ["contact.write", { owner }], ["address.write", { owner }], [],
      ["contact.write", { contactId: "contact" }], ["address.write", { addressLinkId: "link" }], ["profile.read", { owner }] ][i]!;
    expect(f.authorizeAccess).toHaveBeenCalledWith(context, expected[0], expected[1], f.transaction);
  });
  it("scopes both profile reads by tenant, owner and instant", async () => {
    const f = fixture(); await operations[5]!(f.services);
    for (const read of [f.repository.listContacts, f.repository.listAddresses]) expect(read).toHaveBeenCalledWith("tenant", owner, "2026-09-06T00:00:00.000Z", f.transaction);
  });
  it.each([NaN, Infinity, -Infinity, "0", null])("rejects nonnumeric coordinate %s", (latitude) => {
    expect(() => normalizeAddress({ city: "KL", latitude, longitude: 0 } as never)).toThrow();
  });
  it.each(["2026-02-29T00:00:00Z", "2026-04-31T00:00:00Z", "2026-09-06", "2026-09-06T00:00:00", "", null, []])("rejects invalid instant %s", (instant) => {
    expect(() => optionalTimestamp(instant)).toThrow();
  });
  it("accepts leap days and timezone offsets", () => {
    expect(optionalTimestamp("2024-02-29T12:30:00+08:00")).toBe("2024-02-29T12:30:00+08:00");
  });
});
