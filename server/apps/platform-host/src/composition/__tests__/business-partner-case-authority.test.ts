import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type {
  Authorizer,
  AuthorizationRequest,
} from "@athyper/server-contract-auth";
import { parseEntityAuthorizationProfile } from "@athyper/server-contract-metadata";
import { businessPartnerCaseAuthority } from "../business-partner-case-authority.js";
const raw = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const profile = parseEntityAuthorizationProfile({
  ...raw,
  operations: raw.operations.map((o: any) =>
    o.key.startsWith("case_") && !["case_create", "case_read"].includes(o.key)
      ? { ...o, target: "existing" }
      : o,
  ),
});
const request = {
  context: { planeKey: "neon", tenantId: "tenant" },
  permissionCode: "neon.relationship.entity_case.materialize",
  resource: {
    entityCode: "entity_case",
    recordId: "case",
    operationKey: "materialize",
    operatingOrganizationId: "org",
    approvedEvidencePinned: true,
  },
} as unknown as AuthorizationRequest;
it("preserves child coordinates and domain facts while using the signed namespace", async () => {
  const authorize = vi
    .fn()
    .mockResolvedValue({ allowed: false, reason: "domain_denied" });
  const adapter = businessPartnerCaseAuthority(
    { authorize } as Authorizer,
    profile,
    "tenant",
  );
  expect(await adapter.authorize(request)).toEqual({
    allowed: false,
    reason: "domain_denied",
  });
  expect(authorize).toHaveBeenCalledWith({
    ...request,
    resource: {
      ...request.resource,
      entityCode: "business_partner",
      operationKey: "case_materialize",
    },
  });
});
it("does not remap another tenant and rejects incompatible proposed child mutation", async () => {
  const authorize = vi.fn().mockResolvedValue({ allowed: true });
  const adapter = businessPartnerCaseAuthority(
    { authorize } as Authorizer,
    profile,
    "other",
  );
  await adapter.authorize(request);
  expect(authorize).toHaveBeenCalledWith(request);
  authorize.mockClear();
  const selected = businessPartnerCaseAuthority(
    { authorize } as Authorizer,
    profile,
    "tenant",
  );
  expect(
    await selected.authorize({
      ...request,
      resource: { ...request.resource, authorizationTarget: "proposed" },
    }),
  ).toEqual({ allowed: false, reason: "case_binding_unavailable" });
  expect(authorize).not.toHaveBeenCalled();
});

it("adapts DEV case creation using only the IAM-pinned signed profile and preserves denial", async () => {
  const { localBusinessPartnerCaseAuthority } =
    await import("../business-partner-case-authority.js");
  const authorize = vi
    .fn()
    .mockResolvedValue({ allowed: false, reason: "scope_not_contained" });
  const read = vi
    .fn()
    .mockReturnValue([
      {
        entityCode: "business_partner",
        artifactHash: "pin",
        projection: { descriptor: { authorization: profile } },
      },
    ]);
  const context = {
    ...request.context,
    permissions: { localGraphPreview: { business_partner: "pin" } },
  };
  const create = {
    ...request,
    context,
    permissionCode: "neon.relationship.entity_case.create",
    resource: {
      entityCode: "entity_case",
      operationKey: "create",
      authorizationTarget: "proposed",
      operatingOrganizationId: "org",
    },
  } as unknown as AuthorizationRequest;
  const adapter = localBusinessPartnerCaseAuthority({ authorize }, read);
  expect(await adapter.authorize(create)).toEqual({
    allowed: false,
    reason: "scope_not_contained",
  });
  expect(read).toHaveBeenCalledWith("tenant", "neon", {
    business_partner: "pin",
  });
  expect(authorize).toHaveBeenCalledWith({
    ...create,
    resource: {
      ...create.resource,
      entityCode: "business_partner",
      operationKey: "case_create",
    },
  });
  read.mockReturnValue([]);
  authorize.mockClear();
  expect(await adapter.authorize(create)).toEqual({
    allowed: false,
    reason: "case_binding_unavailable",
  });
  expect(authorize).not.toHaveBeenCalled();
});
it("leaves non-preview requests on the existing authorization path", async () => {
  const { localBusinessPartnerCaseAuthority } =
    await import("../business-partner-case-authority.js");
  const authorize = vi
      .fn()
      .mockResolvedValue({ allowed: false, reason: "missing_permission" }),
    read = vi.fn();
  expect(
    await localBusinessPartnerCaseAuthority({ authorize }, read).authorize(
      request,
    ),
  ).toEqual({ allowed: false, reason: "missing_permission" });
  expect(read).not.toHaveBeenCalled();
  expect(authorize).toHaveBeenCalledWith(request);
});
it.each(["mismatched artifact", "removed operation"])(
  "fails closed for %s in DEV",
  async (mode) => {
    const { localBusinessPartnerCaseAuthority } =
      await import("../business-partner-case-authority.js");
    const authorize = vi.fn().mockResolvedValue({ allowed: true });
    const selected =
      mode === "removed operation"
        ? {
            ...profile,
            operations: profile.operations.filter(
              (o) => o.key !== "case_create",
            ),
          }
        : profile;
    const read = vi
      .fn()
      .mockReturnValue([
        {
          entityCode: "business_partner",
          artifactHash: mode === "mismatched artifact" ? "other" : "pin",
          projection: { descriptor: { authorization: selected } },
        },
      ]);
    const create = {
      ...request,
      context: {
        ...request.context,
        permissions: { localGraphPreview: { business_partner: "pin" } },
      },
      permissionCode: "neon.relationship.entity_case.create",
      resource: {
        entityCode: "entity_case",
        operationKey: "create",
        authorizationTarget: "proposed",
        operatingOrganizationId: "org",
      },
    } as unknown as AuthorizationRequest;
    expect(
      await localBusinessPartnerCaseAuthority({ authorize }, read).authorize(
        create,
      ),
    ).toEqual({ allowed: false, reason: "case_binding_unavailable" });
    expect(authorize).not.toHaveBeenCalled();
  },
);
