import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { BUSINESS_PARTNER_360_PERMISSIONS } from "@athyper/server-contract-master-data";
import { createBusinessPartner360Service } from "../business-partner-360-service.js";

function fixture(
  kind: "tax" | "bank",
  change: "none" | "revoke" | "expire" | "denied",
  scope: { operatingOrganizationId?: string; companyCodeId?: string } = {},
  compatible = true,
) {
  let instant = Date.parse("2026-09-12T02:00:00Z"),
    profileHash = "permitted";
  const context = {
    tenantId: randomUUID(),
    principalId: randomUUID(),
    planeKey: "neon",
    realmKey: "test",
    authEpoch: 1,
    profileHash,
    assurance: "elevated",
  } as const;
  const restrictedRead = vi.fn(async () => ({
    protected: true,
    tokenOrValue: "opaque-fixture-token",
  }));
  const reveal = vi.fn(async () => {
    if (change === "revoke") profileHash = "revoked";
    if (change === "expire") instant += 31_000;
    return "123456789012";
  });
  const audit = vi.fn(),
    claim = vi.fn(async () => true);
  const permission =
    kind === "tax"
      ? BUSINESS_PARTNER_360_PERMISSIONS.taxReveal
      : BUSINESS_PARTNER_360_PERMISSIONS.bankReveal;
  const authorize = vi.fn(
    async (request: {
      permissionCode: string;
      resource?: Readonly<Record<string, unknown>>;
    }) =>
      change === "denied" && request.permissionCode === permission
        ? { allowed: false, reason: "denied" }
        : { allowed: true },
  );
  const resolveCore = vi.fn(async () => ({
    id: "bp",
    category: "organization",
    scopeValid: compatible,
    roles: [],
    businessDate: "2026-09-12",
  }));
  const service = createBusinessPartner360Service({
    authorizer: {
      enforcedEntityProfile: () => ({}) as never,
      authorize,
    },
    refreshAuthorizationContext: async () =>
      ({ ...context, profileHash }) as never,
    repository: {
      resolveCore,
      claimRestrictedReveal: claim,
      readRestrictedTaxValue: restrictedRead,
      readRestrictedBankValue: restrictedRead,
    } as never,
    transactions: {
      async run(_plane, _actor, work) {
        return work({});
      },
    },
    definitions: {} as never,
    protectedValues: { reveal },
    audit: { record: audit },
    now: () => new Date(instant),
  });
  const command = {
    context: context as never,
    businessPartnerId: "bp",
    ...scope,
    purpose: "qualification",
    revealId: randomUUID(),
    purposeExpiresAt: new Date(instant + 30_000).toISOString(),
  };
  const execute = () =>
    kind === "tax"
      ? service.revealTaxRegistration({ ...command, taxRegistrationId: "tax" })
      : service.revealBankAccount({ ...command, bankAccountLinkId: "bank" });
  return {
    execute,
    reveal,
    audit,
    restrictedRead,
    claim,
    authorize,
    resolveCore,
  };
}

it.each(["tax", "bank"] as const)(
  "returns populated %s only with separate reveal permission",
  async (kind) => {
    const allowed = fixture(kind, "none");
    expect(await allowed.execute()).toMatchObject({ value: "123456789012" });
    expect(allowed.reveal).toHaveBeenCalledTimes(1);
    expect(allowed.audit).toHaveBeenCalledTimes(1);
    const denied = fixture(kind, "denied");
    await expect(denied.execute()).rejects.toMatchObject({
      code: "BP_360_SECTION_FORBIDDEN",
    });
    expect(denied.restrictedRead).not.toHaveBeenCalled();
    expect(denied.reveal).not.toHaveBeenCalled();
    expect(denied.claim).not.toHaveBeenCalled();
  },
);

it.each(["tax", "bank"] as const)(
  "withholds populated %s when authority changes during protected-value resolution",
  async (kind) => {
    const f = fixture(kind, "revoke");
    await expect(f.execute()).rejects.toMatchObject({
      code: "BP_PROVIDER_AUTHORIZATION_CHANGED",
    });
    expect(f.reveal).toHaveBeenCalledTimes(1);
  },
);

it.each(["tax", "bank"] as const)(
  "withholds populated %s when its reveal purpose expires during execution",
  async (kind) => {
    const f = fixture(kind, "expire");
    await expect(f.execute()).rejects.toMatchObject({
      code: "BP_360_REVEAL_PURPOSE_EXPIRED",
    });
    expect(f.reveal).toHaveBeenCalledTimes(1);
  },
);
it.each(["tax", "bank"] as const)(
  "carries selected context through %s source authorization and stored ownership checks",
  async (kind) => {
    const scope = {
      operatingOrganizationId: "organization",
      companyCodeId: "company",
    };
    const f = fixture(kind, "none", scope);
    await f.execute();
    expect(f.resolveCore).toHaveBeenCalledWith(
      expect.objectContaining(scope),
      expect.anything(),
    );
    const permission =
      kind === "tax"
        ? BUSINESS_PARTNER_360_PERMISSIONS.taxReveal
        : BUSINESS_PARTNER_360_PERMISSIONS.bankReveal;
    expect(f.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionCode: permission,
        resource: expect.objectContaining(scope),
      }),
    );
    const incompatible = fixture(kind, "none", scope, false);
    await expect(incompatible.execute()).rejects.toMatchObject({
      code: "BP_360_SCOPE_INVALID",
    });
    expect(incompatible.restrictedRead).not.toHaveBeenCalled();
    expect(incompatible.claim).not.toHaveBeenCalled();
    const partial = fixture(kind, "none", {
      operatingOrganizationId: "organization",
    });
    await expect(partial.execute()).rejects.toMatchObject({
      code: "BP_360_SCOPE_INVALID",
    });
    expect(partial.restrictedRead).not.toHaveBeenCalled();
  },
);
