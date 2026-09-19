import { expect, it, vi } from "vitest";
import { createBusinessPartner360CommercialClient } from "./business-partner-360-commercial-client";
import { createBusinessPartner360SectionClient } from "./business-partner-360-section-client";
it("sends selected organization/company with both protected reveal commands", async () => {
  const request = vi.fn(async () => ({}));
  const http = { request } as never;
  const scope = {
    operatingOrganizationId: "organization",
    companyCodeId: "company",
    asOf: "2026-09-12",
    roleLens: "all",
    businessPartnerId: "bp",
  };
  await createBusinessPartner360CommercialClient(http).revealBank(
    "bp",
    "bank",
    "qualification",
    undefined,
    scope,
  );
  await createBusinessPartner360SectionClient(http).revealTax(
    "bp",
    "tax",
    "qualification",
    undefined,
    scope,
  );
  for (const call of request.mock.calls as unknown as [
    unknown,
    { query: unknown; body: Record<string, unknown> },
  ][]) {
    expect(call[1].query).toEqual({
      operatingOrganizationId: "organization",
      companyCodeId: "company",
    });
    expect(call[1].body["revealId"]).toEqual(expect.any(String));
    expect(call[1].body["purposeExpiresAt"]).toEqual(expect.any(String));
  }
  expect(request).toHaveBeenCalledTimes(2);
});
