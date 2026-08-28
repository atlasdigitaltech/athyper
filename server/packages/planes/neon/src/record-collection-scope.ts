import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { RecordCollectionScopeResolution, RecordCollectionScopeResolver } from "@athyper/server-contract-records";

interface NeonWorkContextCatalog {
  readonly revision: string;
  readonly companies: readonly { readonly companyCodeId: string; readonly legalEntityId: string; readonly code: string; readonly displayName: string; readonly legalEntityCode: string; readonly legalEntityName: string }[];
}

interface NeonOperatingOrganizationCatalog {
  readonly revision: string;
  readonly organizations: readonly { readonly id: string; readonly code: string; readonly displayName: string; readonly companyAssignments: readonly { readonly companyCodeId: string }[] }[];
}

export interface NeonRecordCollectionScopeCatalog {
  neonWorkContexts(context: VerifiedRequestContext): Promise<NeonWorkContextCatalog>;
  neonOperatingOrganizations(context: VerifiedRequestContext): Promise<NeonOperatingOrganizationCatalog>;
}

/** Plane-owned mapping from validated Neon work context to a closed repository constraint. */
export function createNeonRecordCollectionScopeResolver(catalog: NeonRecordCollectionScopeCatalog): RecordCollectionScopeResolver {
  return Object.freeze({
    async resolve(input: Parameters<RecordCollectionScopeResolver["resolve"]>[0]): Promise<RecordCollectionScopeResolution> {
      if (!isBusinessPartner(input)) return tenantScope();
      const coordinate = input.coordinate;
      if ((coordinate?.companyCodeId && !coordinate.legalEntityId) || (!coordinate?.companyCodeId && coordinate?.legalEntityId)) return forbidden("NEON_WORK_CONTEXT_INVALID", "Company and legal-entity coordinates must be supplied together");
      if (!coordinate?.operatingOrganizationId) return Object.freeze({ status: "context_required", labels: Object.freeze([{ key: "operating_organization", label: "Operating organization", value: "Selection required" }]) });

      const [workContexts, operatingOrganizations] = await Promise.all([catalog.neonWorkContexts(input.context), catalog.neonOperatingOrganizations(input.context)]);
      const company = coordinate.companyCodeId ? workContexts.companies.find((candidate) => candidate.companyCodeId === coordinate.companyCodeId && candidate.legalEntityId === coordinate.legalEntityId) : undefined;
      if (coordinate.companyCodeId && !company) return forbidden("NEON_WORK_CONTEXT_NOT_PERMITTED", "The selected company and legal entity are not permitted for this principal");
      const organization = operatingOrganizations.organizations.find((candidate) => candidate.id === coordinate.operatingOrganizationId);
      if (!organization) return forbidden("NEON_OPERATING_ORGANIZATION_NOT_PERMITTED", "The selected operating organization is not permitted for this principal");
      if (company && !organization.companyAssignments.some((assignment) => assignment.companyCodeId === company.companyCodeId)) return forbidden("NEON_WORK_CONTEXT_INCOMPATIBLE", "The selected operating organization is not assigned to the selected company");

      const authorizationResource = Object.freeze({
        operatingOrganizationId: organization.id,
        ...(company ? { companyCodeId: company.companyCodeId, legalEntityId: company.legalEntityId } : {}),
      });
      const labels = Object.freeze([
        ...(company ? [{ key: "company", label: "Company", value: `${company.code} · ${company.displayName}` }] : []),
        { key: "operating_organization", label: "Operating organization", value: `${organization.code} · ${organization.displayName}` },
      ]);
      return Object.freeze({
        status: "ready",
        authorizationResource,
        constraints: Object.freeze([{ kind: "neon.business_partner.operating_organization.v1" as const, operatingOrganizationId: organization.id }]),
        labels,
        fingerprintMaterial: Object.freeze({ resolver: "neon.business_partner.operating_organization.v1", operatingOrganizationId: organization.id, ...(company ? { companyCodeId: company.companyCodeId, legalEntityId: company.legalEntityId } : {}) }),
      });
    },
  });
}

function isBusinessPartner(input: Parameters<RecordCollectionScopeResolver["resolve"]>[0]): boolean {
  const descriptor = input.descriptor;
  return (input.operationCode === "read" || input.operationCode === "import") && descriptor.planeKey === "neon" && descriptor.entityCode === "business_partner" && descriptor.storage.schema === "master" && descriptor.storage.object === "business_partner";
}

function tenantScope(): Extract<RecordCollectionScopeResolution, { readonly status: "ready" }> { return Object.freeze({ status: "ready", authorizationResource: Object.freeze({}), constraints: Object.freeze([]), labels: Object.freeze([]), fingerprintMaterial: Object.freeze({ mode: "tenant" }) }); }
function forbidden(code: string, message: string): Extract<RecordCollectionScopeResolution, { readonly status: "forbidden" }> { return Object.freeze({ status: "forbidden", code, message, labels: Object.freeze([]) }); }
