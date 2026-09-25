import { describe, expect, it, vi } from "vitest";
import { MasterDataError } from "@athyper/server-service-master-data";
import { createBusinessPartnerRecordProviders } from "../entities/business-partner-record-providers.js";

const input = {
  context: { tenantId: "tenant", principalId: "actor", planeKey: "neon" },
  core: { entityCode: "business_partner" },
  recordId: "partner",
  fieldKeys: ["id", "name"],
  resourceContext: { companyCodeId: "company", asOf: "2025-01-01" },
  limit: 25,
} as any;
function fixture() {
  const service = {
    header: vi.fn(async () => ({
      businessPartnerVersion: 2,
      identity: {
        id: "partner",
        name: "Demo",
        code: "BP",
        category: "organization",
        lifecycleStatus: "active",
      },
    })),
    overview: vi.fn(async () => ({
      businessPartnerVersion: 2,
      values: { name: "Demo" },
    })),
    section: vi.fn(async () => ({
      businessPartnerVersion: 2,
      state: "ready",
      data: { items: [] },
    })),
  };
  const classifications = { read: vi.fn() };
  return {
    service,
    providers: createBusinessPartnerRecordProviders(
      service as any,
      classifications as any,
    ),
  };
}
describe("Business Partner entity provider boundary", () => {
  it("projects only requested header fields and rejects a different entity", async () => {
    const { service, providers } = fixture();
    expect(await providers.headers.readHeader(input)).toEqual({
      revision: "2",
      values: { id: "partner", name: "Demo" },
    });
    expect(
      await providers.headers.readHeader({
        ...input,
        core: { entityCode: "contact_person" },
      }),
    ).toBeNull();
    expect(service.header).toHaveBeenCalledTimes(1);
  });
  it("registers known handlers only and preserves scoped authorized reads", async () => {
    const { service, providers } = fixture();
    expect(providers.sections.get("unregistered")).toBeUndefined();
    expect(providers.sections.get("toString")).toBeUndefined();
    await providers.sections.get("neon.bp.section.banking.v1")!.read(input);
    expect(service.section).toHaveBeenCalledWith(
      expect.objectContaining({
        context: input.context,
        businessPartnerId: "partner",
        sectionCode: "banking",
        companyCodeId: "company",
        asOf: "2025-01-01",
      }),
    );
  });
  it("does not issue a second identity read after section admission fails", async () => {
    const { service, providers } = fixture();
    service.overview.mockRejectedValue(
      new MasterDataError(403, "DENIED", "restricted"),
    );
    await expect(
      providers.sections.get("neon.bp.section.identity.v1")!.read(input),
    ).rejects.toMatchObject({ status: 403 });
    expect(service.section).not.toHaveBeenCalled();
    expect(service.overview).toHaveBeenCalledWith(expect.anything(), { requireIdentity: true });
  });
  it("reads identity once with explicit identity admission and preserves scope", async () => {
    const {service,providers}=fixture();
    await expect(providers.sections.get("neon.bp.section.identity.v1")!.read(input)).resolves.toMatchObject({data:{values:{name:"Demo"}}});
    expect(service.overview).toHaveBeenCalledTimes(1);
    expect(service.overview).toHaveBeenCalledWith(expect.objectContaining({companyCodeId:"company",asOf:"2025-01-01"}),{requireIdentity:true});
    expect(service.section).not.toHaveBeenCalled();
  });
});
