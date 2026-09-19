import { describe, it, expect, vi } from "vitest";
import { createBusinessPartnerAccountBankLinkageService } from "./business-partner-account-bank-linkage.js";
const context = {
  planeKey: "neon",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  requestId: "test-request",
  permissions: { allowed: [] },
} as any;
function fixture(allowed = true) {
  const put = vi.fn(async (_key: string, _value: Uint8Array) => {}),
    record = vi.fn(async () => {}),
    intakeOrganization = vi.fn(async () => ({ id: "org" }));
  return {
    put,
    record,
    intakeOrganization,
    service: createBusinessPartnerAccountBankLinkageService({
      authorizer: { authorize: async () => ({ allowed }) } as any,
      repository: { intakeOrganization } as any,
      transactions: {
        run: async (_p: any, _a: any, work: any) => work({}),
      } as any,
      secrets: { put } as any,
      audit: { record } as any,
    }),
  };
}
describe("protected intake values", () => {
  it("writes only to tenant protected storage and returns masked proof without the value", async () => {
    const f = fixture();
    const result = await f.service.protectIntakeValue({
      context,
      operatingOrganizationId: "org",
      kind: "tax",
      value: "TEST-TAX-123456",
    });
    expect(result.protectedValueToken).toMatch(/^tax:/);
    expect(f.put.mock.calls[0]![0]).toBe(
      `protected-values/${context.tenantId}/${result.protectedValueToken}`,
    );
    expect(JSON.stringify(result)).not.toContain("TEST-TAX-123456");
    expect(JSON.stringify(f.record.mock.calls)).not.toContain(
      "TEST-TAX-123456",
    );
    expect(result.maskedValue).toBe("••••3456");
  });
  it("denies before touching storage when create permission is absent", async () => {
    const f = fixture(false);
    await expect(
      f.service.protectIntakeValue({
        context,
        operatingOrganizationId: "org",
        kind: "tax",
        value: "TEST-1234",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.put).not.toHaveBeenCalled();
    expect(f.intakeOrganization).not.toHaveBeenCalled();
  });
  it("rejects an unavailable organization and invalid values", async () => {
    const f = fixture();
    f.intakeOrganization.mockResolvedValueOnce(null as any);
    await expect(
      f.service.protectIntakeValue({
        context,
        operatingOrganizationId: "org",
        kind: "tax",
        value: "TEST-1234",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.put).not.toHaveBeenCalled();
    await expect(
      f.service.protectIntakeValue({
        context,
        operatingOrganizationId: "org",
        kind: "tax",
        value: "x".repeat(129),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

it("captures local bank identifiers without creating accounts or reviews",async()=>{
 const f=fixture();
 const result=await f.service.protectIntakeValue({context,operatingOrganizationId:"org",kind:"bank",bankCountryCode:"MY",accountIdType:"local_account",value:"000012345678"});
 expect(result.protectedValueToken).toMatch(/^bank:/);
 expect(result.maskedValue).toBe("••••5678");
 expect(new TextDecoder().decode(f.put.mock.calls[0]![1])).toBe("000012345678");
 expect(JSON.stringify(result)).not.toContain("000012345678");
 expect(JSON.stringify(f.record.mock.calls)).not.toContain("000012345678");
});
it("rejects an invalid IBAN during protected capture",async()=>{
 const f=fixture();
 await expect(f.service.protectIntakeValue({context,operatingOrganizationId:"org",kind:"bank",bankCountryCode:"QA",accountIdType:"iban",value:"QA1234"})).rejects.toMatchObject({status:400});
 expect(f.put).not.toHaveBeenCalled();
});
