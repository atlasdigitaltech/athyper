import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  BUSINESS_PARTNER_360_PERMISSIONS,
  BUSINESS_PARTNER_360_SECTION_DEFINITIONS,
  type BusinessPartner360PartyCategory,
  type BusinessPartner360Permission,
  type BusinessPartner360RoleLens,
  type BusinessPartner360SectionCode,
  type BusinessPartner360SectionManifest,
} from "@athyper/server-contract-master-data";

export interface BusinessPartner360PolicyInput {
  readonly directoryAdmitted?: boolean;
  readonly directoryScopeResources?: readonly Readonly<Record<string, unknown>>[];
  readonly historical?: boolean;
  readonly context: VerifiedRequestContext;
  readonly businessPartnerId: string;
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
  readonly category: BusinessPartner360PartyCategory;
  readonly roles: readonly ("supplier" | "customer" | "workforce")[];
  readonly roleLens: BusinessPartner360RoleLens;
  readonly scoped: boolean;
  readonly counts: Readonly<
    Partial<Record<BusinessPartner360SectionCode, number>>
  >;
  readonly lastChangedAt?: string;
}
export interface BusinessPartner360PolicyResult {
  readonly sections: readonly BusinessPartner360SectionManifest[];
  readonly granted: ReadonlySet<BusinessPartner360Permission>;
  readonly verificationRequired: ReadonlySet<BusinessPartner360Permission>;
}

export async function evaluateBusinessPartner360Policy(
  authorizer: Authorizer,
  input: BusinessPartner360PolicyInput,
): Promise<BusinessPartner360PolicyResult> {
  const granted = new Set<BusinessPartner360Permission>(),
    verificationRequired = new Set<BusinessPartner360Permission>(),
    sections: BusinessPartner360SectionManifest[] = [];
  const activeRoles =
    input.roleLens === "all"
      ? input.roles
      : input.roles.filter((role) => role === input.roleLens);
  const resource = {
    tenantId: input.context.tenantId,
    businessPartnerId: input.businessPartnerId,
    ...(input.operatingOrganizationId
      ? { operatingOrganizationId: input.operatingOrganizationId }
      : {}),
    ...(input.companyCodeId ? { companyCodeId: input.companyCodeId } : {}),
    ...(input.legalEntityId ? { legalEntityId: input.legalEntityId } : {}),
  };
  const authorizeDirectory = async (permissionCode: string, sectionCode: string) => {
    for (const scope of input.directoryScopeResources ?? []) {
      const decision = await authorizer.authorize({context:input.context,permissionCode,
        resource:{...scope,...resource,sectionCode,roleLens:input.roleLens,
          ...(sectionCode === "network" ? {entityCode:"business_partner",operationKey:"network_read"} : {})}});
      if (decision.allowed) return decision;
    }
    return undefined;
  };
  for (const definition of BUSINESS_PARTNER_360_SECTION_DEFINITIONS) {
    const roleApplicable =
      definition.visibleAcrossRoles ||
      definition.global ||
      definition.roles.some((role) => activeRoles.includes(role));
    const applicable =
      definition.categories.includes(input.category) && roleApplicable;
    if (!applicable) continue;
    let primaryPermission = definition.permission;
    let decision = await authorizer.authorize({
      context: input.context,
      permissionCode: definition.permission,
      resource: {
        ...resource,
        sectionCode: definition.code,
        roleLens: input.roleLens,
        ...(definition.code === "network"
          ? { entityCode: "business_partner", operationKey: "network_read" }
          : {}),
      },
    });
    if (
      !decision.allowed &&
      decision.reason === "scope_not_contained" &&
      input.directoryAdmitted &&
      !input.scoped
    ) {
decision = (await authorizeDirectory(definition.permission, definition.code)) ?? decision;
    }
    if (
      !decision.allowed &&
      definition.code === "qualifications-certificates"
    ) {
      primaryPermission = BUSINESS_PARTNER_360_PERMISSIONS.certificate;
      decision = await authorizer.authorize({
        context: input.context,
        permissionCode: primaryPermission,
        resource: { ...resource, sectionCode: definition.code },
      });
      if (
        !decision.allowed &&
        decision.reason === "scope_not_contained" &&
        input.directoryAdmitted &&
        !input.scoped
      )
decision = (await authorizeDirectory(primaryPermission, definition.code)) ?? decision;
    }
    if (!decision.allowed) continue;
    if (definition.global || input.scoped) granted.add(primaryPermission);
    for (const permission of definition.global || input.scoped
      ? definition.fieldPermissions
      : []) {
      const reveal =
        permission === BUSINESS_PARTNER_360_PERMISSIONS.bankReveal ||
        permission === BUSINESS_PARTNER_360_PERMISSIONS.taxReveal ||
        permission === BUSINESS_PARTNER_360_PERMISSIONS.identifierReveal;
      if (
        reveal &&
        input.historical
      )
        continue;
      let field = await authorizer.authorize({
        context: input.context,
        permissionCode: permission,
        resource: reveal
          ? { ...resource, ...(input.context.assurance !== "elevated" ? { actionCode: permission === BUSINESS_PARTNER_360_PERMISSIONS.identifierReveal ? "identifier_reveal" : permission === BUSINESS_PARTNER_360_PERMISSIONS.taxReveal ? "tax_reveal" : "bank_reveal" } : {}) }
          : { ...resource, sectionCode: definition.code },
      });
      if (
        !reveal &&
        !field.allowed &&
        field.reason === "scope_not_contained" &&
        definition.global &&
        input.directoryAdmitted &&
        !input.scoped
      )
field = (await authorizeDirectory(permission, definition.code)) ?? field;
      if (reveal && input.context.assurance !== "elevated") {
        if (field.allowed || field.reason === "mfa_required") verificationRequired.add(permission);
      } else if (field.allowed) granted.add(permission);
    }
    const scopeRequired = !definition.global && !input.scoped,
      count =
        input.counts[definition.code] ??
        (["requests", "activity"].includes(definition.code) ? undefined : 0);
    const amend = await authorizer.authorize({
      context: input.context,
      permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.amend,
      resource: { ...resource, sectionCode: definition.code },
    });
    sections.push({
      code: definition.code,
      applicable: true,
      authorization: "granted",
      state: scopeRequired
        ? "empty"
        : count === 0 &&
            definition.code !== "overview" &&
            definition.code !== "identity" &&
            definition.code !== "roles-scope"
          ? "empty"
          : "ready",
      ...(count === undefined ||
      definition.code === "comments" ||
      definition.code === "attachments" ||
      definition.code === "qualifications-certificates"
        ? {}
        : { count }),
      ...(scopeRequired
        ? { reasonCode: "BP_360_SCOPE_REQUIRED" as const }
        : {}),
      href: `/mdg/business-partner/${encodeURIComponent(input.businessPartnerId)}?section=${encodeURIComponent(definition.code)}&roleLens=${encodeURIComponent(input.roleLens)}`,
      ...(definition.code === "identifiers-tax"
        ? { redactionClass: "masked" as const }
        : { redactionClass: "none" as const }),
      ...(input.lastChangedAt ? { lastChangedAt: input.lastChangedAt } : {}),
      ...(amend.allowed
        ? {
            actions: [
              {
                code: "propose_change",
                href: `/mdg/business-partner/${encodeURIComponent(input.businessPartnerId)}?section=${encodeURIComponent(definition.code)}&action=propose-change`,
                permission: BUSINESS_PARTNER_360_PERMISSIONS.amend,
              },
            ],
          }
        : {}),
    });
  }
  return { sections: Object.freeze(sections), granted, verificationRequired };
}
