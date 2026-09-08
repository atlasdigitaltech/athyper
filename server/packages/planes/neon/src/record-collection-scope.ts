import {
  DOCUMENT_RELATIONSHIP_RESOLVER,
  documentCollectionRegistry,
  parseCollectionRelationship,
} from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  RecordCollectionScopeResolution,
  RecordCollectionScopeResolver,
} from "@athyper/server-contract-records";

interface NeonWorkContextCatalog {
  readonly revision: string;
  readonly companies: readonly {
    readonly companyCodeId: string;
    readonly legalEntityId: string;
    readonly code: string;
    readonly displayName: string;
    readonly legalEntityCode: string;
    readonly legalEntityName: string;
  }[];
}

interface NeonOperatingOrganizationCatalog {
  readonly revision: string;
  readonly organizations: readonly {
    readonly id: string;
    readonly code: string;
    readonly displayName: string;
    readonly companyAssignments: readonly { readonly companyCodeId: string }[];
  }[];
}

export interface NeonRecordCollectionScopeCatalog {
  neonWorkContexts(
    context: VerifiedRequestContext,
  ): Promise<NeonWorkContextCatalog>;
  neonOperatingOrganizations(
    context: VerifiedRequestContext,
  ): Promise<NeonOperatingOrganizationCatalog>;
}

/** Plane-owned mapping from validated Neon work context to a closed repository constraint. */
export function createNeonRecordCollectionScopeResolver(
  catalog: NeonRecordCollectionScopeCatalog,
  eligiblePartners?: (
    context: VerifiedRequestContext,
    coordinate: NonNullable<
      Parameters<RecordCollectionScopeResolver["resolve"]>[0]["coordinate"]
    >,
  ) => Promise<readonly string[]>,
): RecordCollectionScopeResolver {
  return Object.freeze({
    async resolve(
      input: Parameters<RecordCollectionScopeResolver["resolve"]>[0],
    ): Promise<RecordCollectionScopeResolution> {
      const rule = input.descriptor.directoryScope;
      if(input.coordinate?.partnerRole && !["supplier","customer"].includes(input.coordinate.partnerRole)) return forbidden("INVALID_PARTNER_ROLE","Unsupported partner role");
      if(input.coordinate?.eligibleOperation && !["order","invoice","payment"].includes(input.coordinate.eligibleOperation)) return forbidden("INVALID_ELIGIBILITY_OPERATION","Unsupported transaction operation");
      if((input.coordinate?.partnerRole || input.coordinate?.eligibleOperation) && (!rule || !isBusinessPartner(input) || input.operationCode!=="read")) return forbidden("DIRECTORY_FILTER_UNAVAILABLE","The published entity does not support partner directory filters");
      for (const key of ["partnerRole", "eligibleOperation"] as const) {
        const value = input.coordinate?.[key];
        if (value && !rule?.quickFilters?.find(filter => filter.key === key)?.options.some(option => option.value === value)) return forbidden("DIRECTORY_FILTER_UNAVAILABLE", "The published contract does not permit this scope filter");
      }
      const multi = input.coordinate?.companyCodeIds !== undefined || input.coordinate?.operatingOrganizationIds !== undefined;
      if (multi && (!rule || !isBusinessPartner(input) || input.operationCode !== "read")) return forbidden("DIRECTORY_FILTER_UNAVAILABLE", "Multiple scopes require a published directory rule");
      if (rule && input.operationCode === "read" && isBusinessPartner(input)) {
        const coordinate = input.coordinate;
        const selectedCompanies = coordinate?.companyCodeIds;
        const selectedOrganizations = coordinate?.operatingOrganizationIds;
        for (const ids of [selectedCompanies, selectedOrganizations]) if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))) return forbidden("INVALID_WORK_CONTEXT", "Invalid directory scope selection");
        if ((selectedCompanies && (coordinate?.companyCodeId || coordinate?.legalEntityId)) || (selectedOrganizations && coordinate?.operatingOrganizationId)) return forbidden("INVALID_WORK_CONTEXT", "Conflicting scope coordinates");
        const [work, operating] = await Promise.all([
          selectedCompanies?.length || coordinate?.companyCodeId || coordinate?.legalEntityId || ["company","organization_company"].includes(rule.mode) ? catalog.neonWorkContexts(input.context) : Promise.resolve({revision:"unused",companies:[]}),
          selectedOrganizations?.length || coordinate?.operatingOrganizationId || ["organization","organization_company"].includes(rule.mode) ? catalog.neonOperatingOrganizations(input.context) : Promise.resolve({revision:"unused",organizations:[]}),
        ]);
        if (selectedCompanies?.some(id => !work.companies.some(c => c.companyCodeId === id))) return forbidden("NEON_WORK_CONTEXT_NOT_PERMITTED", "Company is not permitted");
        if (selectedOrganizations?.some(id => !operating.organizations.some(o => o.id === id))) return forbidden("NEON_OPERATING_ORGANIZATION_NOT_PERMITTED", "Organization is not permitted");
        const organization = coordinate?.operatingOrganizationId
          ? operating.organizations.find(
              (item) => item.id === coordinate.operatingOrganizationId,
            )
          : undefined;
        const company = coordinate?.companyCodeId
          ? work.companies.find(
              (item) =>
                item.companyCodeId === coordinate.companyCodeId &&
                item.legalEntityId === coordinate.legalEntityId,
            )
          : undefined;
        if (coordinate?.operatingOrganizationId && !organization)
          return forbidden(
            "NEON_OPERATING_ORGANIZATION_NOT_PERMITTED",
            "Organization is not permitted",
          );
        if (
          (coordinate?.companyCodeId || coordinate?.legalEntityId) &&
          !company
        )
          return forbidden(
            "NEON_WORK_CONTEXT_NOT_PERMITTED",
            "Company is not permitted",
          );
        if (
          organization &&
          company &&
          !organization.companyAssignments.some(
            (item) => item.companyCodeId === company.companyCodeId,
          )
        )
          return forbidden(
            "NEON_WORK_CONTEXT_INCOMPATIBLE",
            "Organization and company are incompatible",
          );
        const organizationIds = selectedOrganizations?.length ? [...new Set(selectedOrganizations)].sort() : organization
          ? [organization.id]
          : ["organization", "organization_company"].includes(rule.mode)
            ? operating.organizations.map((item) => item.id)
            : undefined;
        const companyIds = selectedCompanies?.length ? [...new Set(selectedCompanies)].sort() : company
          ? [company.companyCodeId]
          : ["company", "organization_company"].includes(rule.mode)
            ? work.companies.map((item) => item.companyCodeId)
            : undefined;
        if (
          coordinate?.eligibleOperation &&
          (multi || !organization ||
            !company ||
            !coordinate.partnerRole ||
            !eligiblePartners)
        )
          return forbidden(
            "ELIGIBILITY_CONTEXT_REQUIRED",
            "Select role, organization and company to check transaction eligibility",
          );
        const eligibleIds = coordinate?.eligibleOperation
          ? await eligiblePartners!(input.context, coordinate)
          : undefined;
        const partnerRole = coordinate?.partnerRole;
        return {
          status: "ready",
          authorizationResource: {
            ...(organization
              ? { operatingOrganizationId: organization.id }
              : {}),
            ...(company
              ? {
                  companyCodeId: company.companyCodeId,
                  legalEntityId: company.legalEntityId,
                }
              : {}),
          },
          constraints:
            organizationIds || companyIds || partnerRole || eligibleIds
              ? [
                  {
                    kind: "neon.business_partner.directory.v1",
                    ...(partnerRole ? { partnerRole } : {}),
                    ...(eligibleIds ? { eligibleIds } : {}),
                    ...(organizationIds ? { organizationIds } : {}),
                    ...(companyIds ? { companyIds } : {}),
                  },
                ]
              : [],
          labels: [
            {
              key: "directory",
              label: "Directory filters",
              value: rule.mode === "tenant" ? "Tenant directory" : "Authorized directory",
            },
          ],
          fingerprintMaterial: { directory: JSON.stringify({rule,organizationIds,companyIds,partnerRole,eligibleIds,eligibleOperation:coordinate?.eligibleOperation}) },
        };
      }
      if (rule && input.operationCode === "read" && rule.mode !== "tenant")
        return forbidden(
          "DIRECTORY_SCOPE_RESOLVER_REQUIRED",
          "This entity requires a registered directory scope resolver",
        );
      const relationship = input.descriptor.collectionRelationship;
      if (
        !relationship &&
        Object.values(documentCollectionRegistry).some(
          (source) =>
            source.schema === input.descriptor.storage.schema &&
            source.object === input.descriptor.storage.object,
        )
      )
        return forbidden(
          "COLLECTION_RELATIONSHIP_REQUIRED",
          "A published document relationship is required",
        );
      if (relationship)
        parseCollectionRelationship(relationship, input.descriptor.storage);
      if (!isBusinessPartner(input) && !relationship) return tenantScope();
      const resolver = relationship
        ? DOCUMENT_RELATIONSHIP_RESOLVER
        : ("neon.business_partner.operating_organization.v1" as const);
      const coordinate = input.coordinate;
      if (
        (coordinate?.companyCodeId && !coordinate.legalEntityId) ||
        (!coordinate?.companyCodeId && coordinate?.legalEntityId)
      )
        return forbidden(
          "NEON_WORK_CONTEXT_INVALID",
          "Company and legal-entity coordinates must be supplied together",
        );
      if (!coordinate?.operatingOrganizationId)
        return Object.freeze({
          status: "context_required",
          labels: Object.freeze([
            {
              key: "operating_organization",
              label: "Operating organization",
              value: "Selection required",
            },
          ]),
        });

      const [workContexts, operatingOrganizations] = await Promise.all([
        catalog.neonWorkContexts(input.context),
        catalog.neonOperatingOrganizations(input.context),
      ]);
      const company = coordinate.companyCodeId
        ? workContexts.companies.find(
            (candidate) =>
              candidate.companyCodeId === coordinate.companyCodeId &&
              candidate.legalEntityId === coordinate.legalEntityId,
          )
        : undefined;
      if (coordinate.companyCodeId && !company)
        return forbidden(
          "NEON_WORK_CONTEXT_NOT_PERMITTED",
          "The selected company and legal entity are not permitted for this principal",
        );
      const organization = operatingOrganizations.organizations.find(
        (candidate) => candidate.id === coordinate.operatingOrganizationId,
      );
      if (!organization)
        return forbidden(
          "NEON_OPERATING_ORGANIZATION_NOT_PERMITTED",
          "The selected operating organization is not permitted for this principal",
        );
      if (
        company &&
        !organization.companyAssignments.some(
          (assignment) => assignment.companyCodeId === company.companyCodeId,
        )
      )
        return forbidden(
          "NEON_WORK_CONTEXT_INCOMPATIBLE",
          "The selected operating organization is not assigned to the selected company",
        );

      const authorizationResource = Object.freeze({
        operatingOrganizationId: organization.id,
        ...(company
          ? {
              companyCodeId: company.companyCodeId,
              legalEntityId: company.legalEntityId,
            }
          : {}),
      });
      const labels = Object.freeze([
        ...(company
          ? [
              {
                key: "company",
                label: "Company",
                value: `${company.code} · ${company.displayName}`,
              },
            ]
          : []),
        {
          key: "operating_organization",
          label: "Operating organization",
          value: `${organization.code} · ${organization.displayName}`,
        },
      ]);
      return Object.freeze({
        status: "ready",
        authorizationResource,
        constraints: Object.freeze([
          Object.freeze({
            kind: resolver,
            operatingOrganizationId: organization.id,
          }),
        ]),
        labels,
        fingerprintMaterial: Object.freeze({
          resolver,
          ...(relationship
            ? { relationship: JSON.stringify(relationship) }
            : {}),
          operatingOrganizationId: organization.id,
          ...(company
            ? {
                companyCodeId: company.companyCodeId,
                legalEntityId: company.legalEntityId,
              }
            : {}),
        }),
      });
    },
  });
}

function isBusinessPartner(
  input: Parameters<RecordCollectionScopeResolver["resolve"]>[0],
): boolean {
  const descriptor = input.descriptor;
  return (
    (input.operationCode === "read" || input.operationCode === "import") &&
    descriptor.planeKey === "neon" &&
    descriptor.entityCode === "business_partner" &&
    descriptor.storage.schema === "master" &&
    descriptor.storage.object === "business_partner"
  );
}

function tenantScope(): Extract<
  RecordCollectionScopeResolution,
  { readonly status: "ready" }
> {
  return Object.freeze({
    status: "ready",
    authorizationResource: Object.freeze({}),
    constraints: Object.freeze([]),
    labels: Object.freeze([]),
    fingerprintMaterial: Object.freeze({ mode: "tenant" }),
  });
}
function forbidden(
  code: string,
  message: string,
): Extract<RecordCollectionScopeResolution, { readonly status: "forbidden" }> {
  return Object.freeze({
    status: "forbidden",
    code,
    message,
    labels: Object.freeze([]),
  });
}
