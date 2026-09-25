import {
  projectBusinessPartnerProvider,
  businessPartnerSummaryFieldPolicy,
} from "./projection-policy.js";
import { businessPartnerRecordHeader } from "./header.js";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import { parseInstant } from "@athyper/platform-temporal";
import { createHash } from "node:crypto";
import type { Authorizer } from "@athyper/server-contract-auth";
import {
  assertBusinessPartner360Phase1Contract,
  businessPartnerQualificationPermissions,
  businessPartnerRequestPermissions,
  BUSINESS_PARTNER_360_PERMISSIONS,
  BUSINESS_PARTNER_360_SCHEMA_VERSION,
  BUSINESS_PARTNER_360_SECTION_DEFINITIONS,
  type BusinessPartner360ActivitySummary,
  type BusinessPartner360AddressSummary,
  type BusinessPartner360CompletenessActionCode,
  type BusinessPartner360ContactSummary,
  type BusinessPartner360GovernedAction,
  type BusinessPartner360Header,
  type BusinessPartner360MaskedIdentifierSummary,
  type BusinessPartner360NetworkLocalData,
  type BusinessPartner360Overview,
  type BusinessPartner360PartyCategory,
  type BusinessPartner360Query,
  type BusinessPartner360RoleLens,
  type BusinessPartner360SectionCode,
  type BusinessPartner360Service,
  type BusinessPartner360SourceFreshness,
  type BusinessPartner360Summary,
} from "@athyper/server-contract-master-data";
import type {
  BusinessPartnerAggregate,
  BusinessPartnerRequestTransactionCoordinator,
} from "@athyper/server-contract-master-data";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import { MasterDataError } from "../../errors.js";
import { evaluateBusinessPartner360Policy } from "./access-policy.js";
import {
  readBusinessPartner360MeshNetwork,
  type BusinessPartner360MeshNetworkAdapter,
} from "../integrations/mesh-network-adapter.js";
import {
  evaluateBusinessPartner360Completeness,
  unavailableBusinessPartner360Completeness,
  type BusinessPartner360CompletenessEvidence,
  type BusinessPartner360ResolvedDefinition,
} from "../workflow/onboarding-completeness.js";

export interface BusinessPartner360Core {
  readonly id: string;
  readonly code: string;
  readonly category: BusinessPartner360PartyCategory;
  readonly name: string;
  readonly status: string;
  readonly version: number;
  readonly changedAt: string;
  readonly businessDate: string;
  readonly roles: readonly Readonly<{
    id?: string;
    code: "supplier" | "customer";
    roleCode?: string;
    status: string;
  }>[];
  readonly scopeValid: boolean;
  readonly scopeResolved: boolean;
}
export interface BusinessPartner360Fragments {
  readonly primaryAddress?: BusinessPartner360AddressSummary;
  readonly primaryContact?: BusinessPartner360ContactSummary;
  readonly identifiers: readonly BusinessPartner360MaskedIdentifierSummary[];
  readonly openWork: Readonly<{
    activeRequestCount?: number;
    returnedRequestCount?: number;
    expiringQualificationCount: number;
    expiringCertificateCount: number;
    pendingBankVerificationCount: number;
  }>;
  readonly recentActivity: readonly BusinessPartner360ActivitySummary[];
  readonly counts: Readonly<
    Partial<Record<BusinessPartner360SectionCode, number>>
  >;
  readonly provenance: readonly BusinessPartner360SourceFreshness[];
}
export interface BusinessPartner360CursorAnchor {
  readonly snapshotAt: string;
  readonly afterAt?: string;
  readonly afterId?: string;
  readonly afterSource?: string;
  readonly afterPrimary?: boolean;
  readonly collectionOrder?: "primary-first" | "newest-first";
}
export interface BusinessPartner360CommonSectionRead {
  readonly items: readonly unknown[];
  readonly next?: Readonly<{ at: string; id: string; primary?: boolean }>;
  readonly provenance: readonly BusinessPartner360SourceFreshness[];
  readonly redactions: readonly import("@athyper/server-contract-master-data").BusinessPartner360RedactionNotice[];
}
export interface BusinessPartner360RestrictedValue {
  readonly tokenOrValue: string;
  readonly protected: boolean;
}
export interface BusinessPartner360RoleCompanyRead {
  readonly data: unknown;
  readonly state: "ready" | "empty" | "partial";
  readonly provenance: readonly BusinessPartner360SourceFreshness[];
}
export interface BusinessPartner360CommercialControlRead {
  readonly data: unknown;
  readonly state: "ready" | "empty" | "partial";
  readonly provenance: readonly BusinessPartner360SourceFreshness[];
}
export interface BusinessPartner360ExplainabilityRead {
  readonly items: readonly unknown[];
  readonly summary?: Readonly<Record<string, number>>;
  readonly next?: Readonly<{ at: string; id: string; source: string }>;
  readonly provenance: readonly BusinessPartner360SourceFreshness[];
}
export interface BusinessPartner360NetworkRead {
  readonly data?: BusinessPartner360NetworkLocalData;
  readonly state: "ready" | "empty" | "stale" | "unavailable";
  readonly provenance: readonly BusinessPartner360SourceFreshness[];
}
export interface BusinessPartner360BusinessActivityProvider {
  readonly code: import("@athyper/server-contract-master-data").BusinessPartner360BusinessActivityProvider;
  read(input: {
    readonly context: import("@athyper/server-contract-auth").VerifiedRequestContext;
    readonly businessPartnerId: string;
    readonly operatingOrganizationId?: string;
    readonly companyCodeId?: string;
    readonly asOf: string;
  }): Promise<
    import("@athyper/server-contract-master-data").BusinessPartner360BusinessActivitySummary
  >;
}
export interface BusinessPartnerProtectedValueResolver {
  reveal(input: {
    readonly token: string;
    readonly purpose: string;
    readonly tenantId: string;
  }): Promise<string>;
}
export interface BusinessPartner360Repository<Transaction> {
  resolveCore(
    input: {
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly operatingOrganizationId?: string;
      readonly companyCodeId?: string;
      readonly legalEntityId?: string;
      readonly roleLens?: BusinessPartner360RoleLens;
      readonly asOf?: string;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360Core | null>;
  readOverview?(
    input: { readonly tenantId: string; readonly businessPartnerId: string; readonly includePersonIdentity?: boolean },
    transaction: Transaction,
  ): Promise<Readonly<Record<string, unknown>> | null>;
  readFragments(
    input: {
      readonly authorizeCase?: (caseId: string) => Promise<boolean>;
      readonly tenantId: string;
      readonly core: BusinessPartner360Core;
      readonly operatingOrganizationId?: string;
      readonly companyCodeId?: string;
      readonly legalEntityId?: string;
      readonly asOf: string;
      readonly permissions: ReadonlySet<string>;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360Fragments>;
  readCompletenessEvidence?(
    input: {
      readonly tenantId: string;
      readonly core: BusinessPartner360Core;
      readonly operatingOrganizationId?: string;
      readonly companyCodeId?: string;
      readonly legalEntityId?: string;
      readonly asOf: string;
      readonly permissions: ReadonlySet<string>;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360CompletenessEvidence>;
  readCommonSection(
    input: {
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly category: BusinessPartner360PartyCategory;
      readonly sectionCode:
        | "identity"
        | "contacts"
        | "addresses"
        | "identifiers-tax"
        | "governance"
        | "network"
        | "comments"
        | "attachments";
      readonly principalId?: string;
      readonly companyCodeId?: string;
      readonly certificateVisible?: boolean;
      readonly taxVisible?: boolean;
      readonly governanceVisible?: boolean;
      readonly contactVisible?: boolean;
      readonly addressVisible?: boolean;
      readonly authorizeRelatedPartner?: (businessPartnerId: string) => Promise<boolean>;
      readonly collectionOrder?: "primary-first" | "newest-first";
      readonly asOf: string;
      readonly limit: number;
      readonly cursor: BusinessPartner360CursorAnchor;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360CommonSectionRead>;
  readRoleCompanySection(
    input: {
      readonly authorizeAssignment?: (
        companyCodeId: string,
        operatingOrganizationId: string,
        role: "supplier" | "customer",
      ) => Promise<boolean>;
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly sectionCode:
        "roles-scope" | "supplier-company" | "customer-company";
      readonly operatingOrganizationId?: string;
      readonly companyCodeId?: string;
      readonly legalEntityId?: string;
      readonly asOf: string;
      readonly historical: boolean;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360RoleCompanyRead>;
  readCommercialControlSection(
    input: {
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly sectionCode:
        "banking" | "qualifications-certificates" | "credit";
      readonly operatingOrganizationId?: string;
      readonly companyCodeId?: string;
      readonly asOf: string;
      readonly historical: boolean;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360CommercialControlRead>;
  readExplainabilitySection(
    input: {
      readonly authorizeCase?: (caseId: string) => Promise<boolean>;
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly sectionCode: "requests" | "activity";
      readonly limit: number;
      readonly cursor: BusinessPartner360CursorAnchor;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360ExplainabilityRead>;
  readNetworkSection(
    input: {
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly roleLens: BusinessPartner360RoleLens;
      readonly freshAfter: string;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360NetworkRead>;
  claimRestrictedReveal?(
    input: {
      readonly tenantId: string;
      readonly principalId: string;
      readonly revealId: string;
      readonly commandCode:
        "business_partner.360.identifier_reveal" | "business_partner.360.tax_reveal" | "business_partner.360.bank_reveal";
      readonly fingerprint: string;
      readonly purposeExpiresAt: string;
    },
    transaction: Transaction,
  ): Promise<boolean>;
  readRestrictedTaxValue(
    input: {
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly taxRegistrationId: string;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360RestrictedValue | null>;
  readRestrictedIdentifierValue?(
    input: { readonly tenantId: string; readonly businessPartnerId: string; readonly identifierId: string },
    transaction: Transaction,
  ): Promise<BusinessPartner360RestrictedValue | null>;
  readRestrictedBankValue(
    input: {
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly bankAccountLinkId: string;
    },
    transaction: Transaction,
  ): Promise<BusinessPartner360RestrictedValue | null>;
  legacyAggregate(
    tenantId: string,
    businessPartnerId: string,
    operatingOrganizationId: string,
    transaction: Transaction,
  ): Promise<BusinessPartnerAggregate | null>;
}
export interface BusinessPartner360DefinitionResolver {
  resolve(): Promise<
    | BusinessPartner360ResolvedDefinition
    | Readonly<{
        code: "business_partner.onboarding";
        version: string;
        hash: string;
      }>
  >;
}

export function createBusinessPartner360Service<Transaction>(options: {
  readonly authorizer: Authorizer;
  readonly repository: BusinessPartner360Repository<Transaction>;
  readonly transactions: BusinessPartnerRequestTransactionCoordinator<Transaction>;
  readonly refreshAuthorizationContext?: (
    context: import("@athyper/server-contract-auth").VerifiedRequestContext,
  ) => Promise<import("@athyper/server-contract-auth").VerifiedRequestContext>;
  readonly authorizeCaseRead?: (
    query: BusinessPartner360Query,
    caseId: string,
  ) => Promise<boolean>;
  /** Published attachment capability, using the file's stored parent identity. */
  readonly authorizeCertificateAttachment?: (query: BusinessPartner360Query, attachmentId: string) => Promise<boolean>;
  readonly metadata?: MetadataReader;
  readonly admitDirectoryRecord?: (
    query: BusinessPartner360Query,
  ) => Promise<void | {readonly scopeResources: readonly Readonly<Record<string, unknown>>[]}>;
  readonly definitions: BusinessPartner360DefinitionResolver;
  readonly audit?: AuditRecorder<Transaction>;
  readonly protectedValues?: BusinessPartnerProtectedValueResolver;
  readonly businessActivityProviders?: readonly BusinessPartner360BusinessActivityProvider[];
  readonly meshNetwork?: BusinessPartner360MeshNetworkAdapter;
  readonly meshTimeoutMs?: number;
  readonly now?: () => Date;
}): BusinessPartner360Service & {
  legacyAggregate(
    query: BusinessPartner360Query & {
      readonly operatingOrganizationId: string;
    },
  ): Promise<BusinessPartnerAggregate>;
} {
  const now = options.now ?? (() => new Date());
  const resolve = async (
    query: BusinessPartner360Query,
    transaction: Transaction,
  ) => {
    if (query.context.planeKey !== "neon")
      throw new MasterDataError(
        400,
        "BP_360_SCOPE_INVALID",
        "Business Partner 360 executes only in NEON",
      );
    let directoryScopeResources: readonly Readonly<Record<string, unknown>>[] = [];
    try {
      directoryScopeResources = (await options.admitDirectoryRecord?.(query))?.scopeResources ?? [];
    } catch (error) {
      // The injected Records admission uses statusCode; BP HTTP routes serialize
      // MasterDataError.status. Preserve denials without leaking upstream detail.
      if (
        error instanceof Error &&
        error.name === "RecordServiceError" &&
        "statusCode" in error &&
        (error.statusCode === 403 || error.statusCode === 404)
      ) {
        if (error.statusCode === 404) throw notFound();
        throw new MasterDataError(
          403,
          "BP_360_RECORD_FORBIDDEN",
          "Business Partner access is not authorized",
        );
      }
      throw error;
    }
    let visible = await options.authorizer.authorize({
      context: query.context,
      permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.record,
      resource: {
        tenantId: query.context.tenantId,
        businessPartnerId: query.businessPartnerId,
        ...(query.operatingOrganizationId
          ? { operatingOrganizationId: query.operatingOrganizationId }
          : {}),
        ...(query.companyCodeId ? { companyCodeId: query.companyCodeId } : {}),
        ...(query.legalEntityId ? { legalEntityId: query.legalEntityId } : {}),
      },
    });
    // Unscoped discovery may use server-resolved parent scopes, never a bare
    // permission check. Explicit selected scopes and denials are not relaxed.
    if (
      !visible.allowed &&
      visible.reason === "scope_not_contained" &&
      !query.operatingOrganizationId && !query.companyCodeId && !query.legalEntityId &&
      options.admitDirectoryRecord &&
      (
        await options.metadata?.getEntityDescriptor(
          query.context,
          "business_partner",
        )
      )?.directoryScope
    ) {
      for (const scope of directoryScopeResources) {
        visible = await options.authorizer.authorize({
          context: query.context,
          permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.record,
          resource: {...scope, tenantId: query.context.tenantId, businessPartnerId: query.businessPartnerId},
        });
        if (visible.allowed) break;
      }
    }
    if (!visible.allowed) throw notFound();
    const core = await options.repository.resolveCore(
      {
        tenantId: query.context.tenantId,
        businessPartnerId: query.businessPartnerId,
        ...(query.operatingOrganizationId
          ? { operatingOrganizationId: query.operatingOrganizationId }
          : {}),
        ...(query.companyCodeId ? { companyCodeId: query.companyCodeId } : {}),
        ...(query.legalEntityId ? { legalEntityId: query.legalEntityId } : {}),
        ...(query.roleLens ? { roleLens: query.roleLens } : {}),
        ...(query.asOf ? { asOf: query.asOf } : {}),
      },
      transaction,
    );
    if (!core || !["organization", "person"].includes(core.category)) throw notFound();
    if (!core.scopeValid)
      throw new MasterDataError(
        400,
        "BP_360_SCOPE_INVALID",
        "The selected Business Partner scope is invalid",
      );
    const roleLens = query.roleLens ?? "all";
    if (
      roleLens !== "all" &&
      !core.roles.some((role) => role.code === roleLens)
    )
      throw new MasterDataError(
        400,
        "BP_360_SCOPE_INVALID",
        "The selected role lens is not available for this Business Partner",
      );
    return {
      core,
      roleLens,
      directoryScopeResources,
      asOf: query.asOf ?? core.businessDate,
      directoryAdmitted: Boolean(
        options.admitDirectoryRecord &&
        (
          await options.metadata?.getEntityDescriptor(
            query.context,
            "business_partner",
          )
        )?.directoryScope,
      ),
    };
  };
  const service: BusinessPartner360Service & {
    legacyAggregate(
      query: BusinessPartner360Query & {
        readonly operatingOrganizationId: string;
      },
    ): Promise<BusinessPartnerAggregate>;
  } = {
    async header(query): Promise<BusinessPartner360Header> {
      return options.transactions.run(
        "neon",
        { tenantId: query.context.tenantId, principalId: query.context.principalId },
        async (transaction) => {
          const { core } = await resolve(query, transaction);
          return Object.freeze({
            businessPartnerVersion: core.version,
            identity: Object.freeze({
              id: core.id,
              code: core.code,
              category: core.category,
              name: core.name,
              lifecycleStatus: core.status,
            }),
          });
        },
      );
    },
    async overview(query, projection): Promise<BusinessPartner360Overview> {
      return options.transactions.run(
        "neon",
        { tenantId: query.context.tenantId, principalId: query.context.principalId },
        async (transaction) => {
          const { core } = await resolve(query, transaction);
          if (projection?.requireIdentity && !(await options.authorizer.authorize({
            context: query.context, permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.identity,
            resource: { tenantId: query.context.tenantId, businessPartnerId: core.id,
              ...(query.operatingOrganizationId ? { operatingOrganizationId: query.operatingOrganizationId } : {}),
              ...(query.companyCodeId ? { companyCodeId: query.companyCodeId } : {}),
              ...(query.legalEntityId ? { legalEntityId: query.legalEntityId } : {}) },
          })).allowed) throw new MasterDataError(403, "BP_360_SECTION_FORBIDDEN", "Identity is not authorized");
          const stored = await options.repository.readOverview?.({
            tenantId: query.context.tenantId,
            businessPartnerId: core.id,
            includePersonIdentity: core.category === "person" && (await options.authorizer.authorize({
              context: query.context, permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.person,
              resource: {tenantId:query.context.tenantId,businessPartnerId:core.id},
            })).allowed,
          }, transaction);
          const values = stored ?? Object.freeze({
            id: core.id,
            code: core.code,
            name: core.name,
            partner_category: core.category,
            status: core.status,
            record_version: core.version,
          });
          return Object.freeze({ businessPartnerVersion: core.version, values: Object.freeze({ ...values }) });
        },
      );
    },
    async summary(query) {
      return options.transactions.run(
        "neon",
        {
          tenantId: query.context.tenantId,
          principalId: query.context.principalId,
        },
        async (transaction) => {
          const { core, roleLens, asOf, directoryAdmitted, directoryScopeResources } = await resolve(
              query,
              transaction,
            ),
            coordinates = {
              ...(query.operatingOrganizationId
                ? { operatingOrganizationId: query.operatingOrganizationId }
                : {}),
              ...(query.companyCodeId
                ? { companyCodeId: query.companyCodeId }
                : {}),
              ...(query.legalEntityId
                ? { legalEntityId: query.legalEntityId }
                : {}),
            };
          const preliminary = await evaluateBusinessPartner360Policy(
            options.authorizer,
            {
              historical: Boolean(query.asOf),
              directoryAdmitted,
              directoryScopeResources,
              context: query.context,
              businessPartnerId: core.id,
              ...coordinates,
              category: core.category,
              roles: core.roles.map((role) => role.code),
              roleLens,
              scoped: core.scopeResolved,
              counts: {},
              lastChangedAt: core.changedAt,
            },
          );
          const fragments = await options.repository.readFragments(
              {
                ...(options.authorizer.enforcedEntityProfile?.(
                  "neon",
                  "business_partner",
                )
                  ? {
                      authorizeCase: async (caseId: string) => {
                        if (!options.authorizeCaseRead)
                          throw new MasterDataError(
                            503,
                            "BP_CHILD_AUTHORIZATION_UNAVAILABLE",
                            "Independent case authorization is unavailable",
                          );
                        return options.authorizeCaseRead(query, caseId);
                      },
                    }
                  : {}),
                tenantId: query.context.tenantId,
                core,
                ...coordinates,
                asOf,
                permissions: preliminary.granted,
              },
              transaction,
            ),
            policy = await evaluateBusinessPartner360Policy(
              options.authorizer,
              {
                historical: Boolean(query.asOf),
                directoryAdmitted,
                directoryScopeResources,
                context: query.context,
                businessPartnerId: core.id,
                ...coordinates,
                category: core.category,
                roles: core.roles.map((role) => role.code),
                roleLens,
                scoped: core.scopeResolved,
                counts: fragments.counts,
                lastChangedAt: core.changedAt,
              },
            ),
            generatedAt = now().toISOString(),
            historical = Boolean(query.asOf);
          let definition: BusinessPartner360ResolvedDefinition | undefined;
          try {
            const candidate = await options.definitions.resolve();
            definition = "packs" in candidate ? candidate : undefined;
          } catch {
            /* Completeness is unavailable; this does not deny canonical identity reads or grant approval. */
          }
          const authoritativeEvidence = options.repository
              .readCompletenessEvidence
              ? await options.repository.readCompletenessEvidence(
                  {
                    tenantId: query.context.tenantId,
                    core,
                    ...coordinates,
                    asOf,
                    permissions: policy.granted,
                  },
                  transaction,
                )
              : {},
            evidence = {
              ...fallbackEvidence(core, fragments),
              ...authoritativeEvidence,
            },
            actions = historical
              ? {}
              : await resolveCompletenessActions(
                  options.authorizer,
                  query,
                  core.id,
                  roleLens,
                );
          const completeness = definition
              ? evaluateBusinessPartner360Completeness({
                  definition,
                  category: core.category,
                  roles: core.roles.map((role) => role.code),
                  roleLens,
                  hasOrganizationScope: Boolean(query.operatingOrganizationId),
                  hasCompanyScope: Boolean(query.companyCodeId),
                  hasWorkforceScope: Boolean(
                    query.legalEntityId || query.companyCodeId,
                  ),
                  asOf,
                  historical,
                  businessPartnerVersion: core.version,
                  policyFingerprint: digest([...policy.granted].sort()),
                  evidence,
                  actions,
                  evaluatedAt: generatedAt,
                })
              : unavailableBusinessPartner360Completeness(
                  generatedAt,
                  historical,
                ),
            publicDefinition = definition
              ? {
                  code: definition.code,
                  version: definition.version,
                  hash: definition.hash,
                }
              : {
                  code: "business_partner.onboarding" as const,
                  version: "unavailable",
                  hash: "0".repeat(64),
                };
          const summary: BusinessPartner360Summary = {
            schemaVersion: BUSINESS_PARTNER_360_SCHEMA_VERSION,
            asOf,
            generatedAt,
            businessPartnerVersion: core.version,
            definition: publicDefinition,
            scope: {
              businessPartnerId: core.id,
              ...coordinates,
              roleLens,
              asOf,
            },
            identity: {
              id: core.id,
              code: core.code,
              category: core.category,
              name: core.name,
              lifecycleStatus: core.status,
            },
            roles: core.roles,
            ...(fragments.primaryAddress
              ? { primaryAddress: fragments.primaryAddress }
              : {}),
            ...(fragments.primaryContact
              ? { primaryContact: fragments.primaryContact }
              : {}),
            identifiers: fragments.identifiers,
            completeness,
            openWork: fragments.openWork,
            recentActivity: fragments.recentActivity.slice(0, 5),
            sections: policy.sections,
            provenance: fragments.provenance,
          };
          const descriptor = await options.metadata?.getEntityDescriptor(query.context, "business_partner");
          const directoryScope = descriptor?.directoryScope?.mode;
          const presentation = descriptor?.recordPresentation;
          const canComment =
            !summary.completeness.readOnly &&
            policy.sections.some((item) => item.code === "comments") &&
            (
              await options.authorizer.authorize({
                context: query.context,
                permissionCode: "collaboration.comment.create",
                resource: {
                  tenantId: query.context.tenantId,
                  businessPartnerId: core.id,
                },
              })
            ).allowed;
          const result = {
            ...summary,
            collaboration: { canComment },
            ...(directoryScope ? { directoryScope } : {}),
            recordHeader: businessPartnerRecordHeader(
              summary,
              actions,
              presentation,
              `legacy:${query.context.profileHash}`,
            ),
          };
          assertBusinessPartner360Phase1Contract(result);
          if (Buffer.byteLength(JSON.stringify(result), "utf8") > 75 * 1024)
            throw new MasterDataError(
              503,
              "BP_360_PROVIDER_UNAVAILABLE",
              "Business Partner summary exceeded its bounded response budget",
            );
          return result;
        },
      );
    },
    async section(query) {
      const { companyCodeId: _bankCompany, operatingOrganizationId: _bankOrganization,
        legalEntityId: _bankLegal, roleLens: _bankRole, ...bankPartnerQuery } = query;
      return options.transactions.run(
        "neon",
        {
          tenantId: query.context.tenantId,
          principalId: query.context.principalId,
        },
        async (transaction) => {
          const { core, roleLens, asOf, directoryAdmitted, directoryScopeResources } = await resolve(
              query.sectionCode === "banking" ? bankPartnerQuery : query,
              transaction,
            ),
            coordinates = query.sectionCode === "banking" ? {} : {
              ...(query.operatingOrganizationId
                ? { operatingOrganizationId: query.operatingOrganizationId }
                : {}),
              ...(query.companyCodeId
                ? { companyCodeId: query.companyCodeId }
                : {}),
              ...(query.legalEntityId
                ? { legalEntityId: query.legalEntityId }
                : {}),
            };
          const policy = await evaluateBusinessPartner360Policy(
              options.authorizer,
              {
                historical: Boolean(query.asOf),
                directoryAdmitted,
                directoryScopeResources,
                context: query.context,
                businessPartnerId: core.id,
                ...coordinates,
                category: core.category,
                roles: core.roles.map((role) => role.code),
                roleLens,
                scoped: core.scopeResolved,
                counts: {},
                lastChangedAt: core.changedAt,
              },
            ),
            manifest = policy.sections.find(
              (section) => section.code === query.sectionCode,
            );
          if (!manifest) {
            const sectionDefinition =
                BUSINESS_PARTNER_360_SECTION_DEFINITIONS.find(
                  (item) => item.code === query.sectionCode,
                ),
              applicable =
                sectionDefinition &&
                sectionDefinition.categories.includes(core.category) &&
                (sectionDefinition.visibleAcrossRoles ||
                  sectionDefinition.global ||
                  sectionDefinition.roles.some((role) =>
                    core.roles.some((current) => current.code === role),
                  ));
            throw new MasterDataError(
              applicable ? 403 : 404,
              applicable
                ? "BP_360_SECTION_FORBIDDEN"
                : "BP_360_SECTION_NOT_APPLICABLE",
              applicable
                ? "The section is not authorized"
                : "The section is not applicable",
            );
          }
          if (manifest.reasonCode === "BP_360_SCOPE_REQUIRED")
            throw new MasterDataError(
              409,
              "BP_360_SCOPE_REQUIRED",
              "Select an authorized transaction context for this section",
            );
          const generatedAt = now().toISOString();
          let definitionHash = "0".repeat(64);
          try {
            definitionHash = (await options.definitions.resolve()).hash;
          } catch {
            /* Section data remains readable when completeness definition publication is unavailable. */
          }
          if (query.sectionCode === "network") {
            const relationshipCursor = decodeCursor(query.cursor, "network", core.id, generatedAt);
            const relationships = await options.repository.readCommonSection({
              tenantId: query.context.tenantId, businessPartnerId: core.id, category: core.category,
              sectionCode: "network", asOf, limit: query.limit ?? 25, cursor: relationshipCursor,
              governanceVisible: policy.granted.has(BUSINESS_PARTNER_360_PERMISSIONS.identity),
              authorizeRelatedPartner: async businessPartnerId => (await options.authorizer.authorize({
                context: query.context, permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.record,
                resource: { tenantId: query.context.tenantId, businessPartnerId, ...coordinates },
              })).allowed,
            }, transaction);
            const ownedRelationships = {
              commercialRelationships: relationships.items.filter(item => (item as Record<string, unknown>).kind === "relationship"),
              governanceRelations: relationships.items.filter(item => (item as Record<string, unknown>).kind === "governance"),
              ...(relationships.next ? { nextCursor: encodeCursor({ v: 1, section: "network", businessPartnerId: core.id,
                snapshotAt: relationshipCursor.snapshotAt, afterAt: relationships.next.at, afterId: relationships.next.id }) } : {}),
            };
            const collections = {
              commercial_relationships: ownedRelationships.commercialRelationships.map(item => {
                const row = item as Record<string, unknown>;
                return { id: row.id, source_business_partner_id: row.sourceBusinessPartnerId, target_business_partner_id: row.targetBusinessPartnerId,
                  relationship_type_code: row.relationshipTypeCode, country_code: row.countryCode, effective_from: row.effectiveFrom, effective_until: row.effectiveUntil, status: row.status };
              }),
              ...(policy.granted.has(BUSINESS_PARTNER_360_PERMISSIONS.identity) ? { governance_relations: ownedRelationships.governanceRelations.map(item => {
                const row = item as Record<string, unknown>;
                return { id: row.id, relation_type_code: row.relationTypeCode, member_name: row.memberName, member_type: row.memberType,
                  business_title: row.businessTitle, ownership_pct: row.ownershipPercent, appointed_date: row.appointedDate, end_of_term: row.endOfTerm, status: row.status };
              }) } : {}),
            };
            const freshAfter = new Date(
                now().getTime() - 24 * 60 * 60_000,
              ).toISOString(),
              local = await options.repository.readNetworkSection(
                {
                  tenantId: query.context.tenantId,
                  businessPartnerId: core.id,
                  roleLens,
                  freshAfter,
                },
                transaction,
              );
            if (!local.data)
              return {
                schemaVersion: 1,
                sectionCode: query.sectionCode,
                asOf,
                generatedAt,
                businessPartnerVersion: core.version,
                definitionHash,
                state: relationships.items.length ? "ready" : "empty",
                data: {
                  ...ownedRelationships,
                  collections,
                  live: {
                    state: "not_requested",
                    reasonCode: "MESH_RELATIONSHIP_COORDINATE_REQUIRED",
                  },
                } as never,
                provenance: [...relationships.provenance, ...local.provenance],
                redactions: [],
              };
            const receivedSource = local.data.provenance.find(
                (item) =>
                  item.sourceObject ===
                  "snapshot.mesh_business_partner_profile_received",
              ),
              schemaCompatible =
                receivedSource?.schemaCode ===
                  "mesh.business_partner_profile" &&
                (receivedSource.schemaVersion === 1 ||
                  receivedSource.schemaVersion === 2) &&
                receivedSource.fieldSetCode ===
                  `recipient_safe_v${receivedSource.schemaVersion}`,
              commercialRole = core.roles.some(
                (role) => role.code === local.data!.accountLink.proposedRole,
              ),
              relationshipValid =
                local.data.accountLink.status === "active" &&
                commercialRole;
            if (!schemaCompatible || !relationshipValid) {
              const reasonCode = !schemaCompatible
                ? "MESH_LOCAL_SCHEMA_INCOMPATIBLE"
                : "MESH_RELATIONSHIP_COORDINATE_INVALID";
              return {
                schemaVersion: 1,
                sectionCode: query.sectionCode,
                asOf,
                generatedAt,
                businessPartnerVersion: core.version,
                definitionHash,
                state: !schemaCompatible ? "unavailable" : local.state,
                data: {
                  ...ownedRelationships,
                  collections,
                  local: local.data,
                  live: { state: "not_requested", reasonCode },
                } as never,
                provenance: [...relationships.provenance, ...local.provenance],
                redactions: [],
              };
            }
            const live = await readBusinessPartner360MeshNetwork(
                options.meshNetwork,
                {
                  context: query.context,
                  sourceTenantId: local.data.accountLink.sourceTenantId,
                  sourceNetworkAccountId:
                    local.data.accountLink.sourceNetworkAccountId,
                  recipientNetworkAccountId:
                    local.data.accountLink.recipientNetworkAccountId,
                  networkRelationshipId:
                    local.data.accountLink.networkRelationshipId,
                },
                options.meshTimeoutMs ?? 1_500,
              ),
              state =
                local.state === "stale" || live.state === "stale"
                  ? "stale"
                  : live.state === "ready"
                    ? "ready"
                    : "partial";
            return {
              schemaVersion: 1,
              sectionCode: query.sectionCode,
              asOf,
              generatedAt,
              businessPartnerVersion: core.version,
              definitionHash,
              state,
              data: { ...ownedRelationships, collections, local: local.data, live } as never,
              provenance: [...relationships.provenance, ...local.provenance],
              redactions: [
                {
                  fieldCode: "network.bank_disclosure",
                  classification: "highly_restricted",
                  behavior: "presence_only",
                  reasonCode: "BP_360_SEPARATE_BANK_GOVERNANCE_REQUIRED",
                },
              ],
            };
          }
          if (query.sectionCode === "business-activity") {
            const providers = options.businessActivityProviders ?? [],
              settled = await Promise.allSettled(
                providers.map((provider) =>
                  provider.read({
                    context: query.context,
                    businessPartnerId: core.id,
                    ...(query.operatingOrganizationId
                      ? {
                          operatingOrganizationId:
                            query.operatingOrganizationId,
                        }
                      : {}),
                    ...(query.companyCodeId
                      ? { companyCodeId: query.companyCodeId }
                      : {}),
                    asOf,
                  }),
                ),
              ),
              items = settled.map((item, index) =>
                item.status === "fulfilled"
                  ? item.value
                  : {
                      provider: providers[index]!.code,
                      state: "unavailable" as const,
                      metrics: [],
                      reasonCode: "PROVIDER_UNAVAILABLE",
                      observedAt: generatedAt,
                    },
              );
            return {
              schemaVersion: 1,
              sectionCode: query.sectionCode,
              asOf,
              generatedAt,
              businessPartnerVersion: core.version,
              definitionHash,
              state: items.some((item) => item.state === "ready")
                ? "ready"
                : items.some((item) => item.state === "unavailable")
                  ? "partial"
                  : "empty",
              data: { providers: items } as never,
              provenance: items
                .filter((item) => item.state !== "unavailable")
                .map((item) => ({
                  plane: "neon" as const,
                  service: item.provider,
                  sourceObject: `${item.provider}.business_partner_summary`,
                  observedAt: item.observedAt,
                })),
              redactions: [],
            };
          }
          if (
            query.sectionCode === "requests" ||
            query.sectionCode === "activity"
          ) {
            const cursor = decodeCursor(
                query.cursor,
                query.sectionCode,
                core.id,
                generatedAt,
              ),
              limit = query.limit ?? 25,
              result = await options.repository.readExplainabilitySection(
                {
                  ...(options.authorizer.enforcedEntityProfile?.(
                    "neon",
                    "business_partner",
                  )
                    ? {
                        authorizeCase: async (caseId: string) => {
                          if (!options.authorizeCaseRead)
                            throw new MasterDataError(
                              503,
                              "BP_CHILD_AUTHORIZATION_UNAVAILABLE",
                              "Independent case authorization is unavailable",
                            );
                          return options.authorizeCaseRead(query, caseId);
                        },
                      }
                    : {}),
                  tenantId: query.context.tenantId,
                  businessPartnerId: core.id,
                  sectionCode: query.sectionCode,
                  limit: limit + 1,
                  cursor,
                },
                transaction,
              ),
              nextCursor = result.next
                ? encodeCursor({
                    v: 1,
                    section: query.sectionCode,
                    businessPartnerId: core.id,
                    snapshotAt: cursor.snapshotAt,
                    afterAt: result.next.at,
                    afterId: result.next.id,
                    afterSource: result.next.source,
                  })
                : undefined,
              data =
                query.sectionCode === "requests"
                  ? {
                      openWork: result.summary ?? {},
                      items: result.items,
                      ...(nextCursor ? { nextCursor } : {}),
                    }
                  : {
                      items: result.items,
                      ...(nextCursor ? { nextCursor } : {}),
                    };
            return {
              schemaVersion: 1,
              sectionCode: query.sectionCode,
              asOf,
              generatedAt,
              businessPartnerVersion: core.version,
              definitionHash,
              state: result.items.length ? "ready" : "empty",
              data: data as never,
              page: { ...(nextCursor ? { nextCursor } : {}), limit },
              provenance: result.provenance,
              redactions: [],
            };
          }
          if (isCommercialControlSection(query.sectionCode)) {
            const result =
              await options.repository.readCommercialControlSection(
                {
                  tenantId: query.context.tenantId,
                  businessPartnerId: core.id,
                  sectionCode: query.sectionCode,
                  ...(query.operatingOrganizationId
                    ? { operatingOrganizationId: query.operatingOrganizationId }
                    : {}),
                  ...(query.companyCodeId
                    ? { companyCodeId: query.companyCodeId }
                    : {}),
                  asOf,
                  historical: Boolean(query.asOf),
                },
                transaction,
              );
            return {
              schemaVersion: 1,
              sectionCode: query.sectionCode,
              asOf,
              generatedAt,
              businessPartnerVersion: core.version,
              definitionHash,
              state: result.state,
              data: (query.sectionCode === "qualifications-certificates"
                ? await authorizedCertificates(result.data, policy.granted,
                    options.authorizeCertificateAttachment ? id => options.authorizeCertificateAttachment!(query, id) : undefined)
                : query.sectionCode === "banking"
                  ? authorizedBankAccounts(result.data, policy.granted, policy.verificationRequired)
                  : result.data) as never,
              provenance: result.provenance,
              redactions:
                query.sectionCode === "banking"
                  ? [
                      {
                        fieldCode: "bank.account_identifier",
                        classification: "highly_restricted",
                        behavior: "masked",
                        reasonCode: "masked_by_policy",
                      },
                    ]
                  : [],
            };
          }
          if (isRoleCompanySection(query.sectionCode)) {
            const result = await options.repository.readRoleCompanySection(
              {
                authorizeAssignment: async (
                  companyCodeId,
                  operatingOrganizationId,
                  role,
                ) =>
                  (
                    await options.authorizer.authorize({
                      context: query.context,
                      permissionCode:
                        BUSINESS_PARTNER_360_SECTION_DEFINITIONS.find(
                          (d) =>
                            d.code ===
                            (role === "supplier"
                              ? "supplier-company"
                              : "customer-company"),
                        )!.permission,
                      resource: {
                        tenantId: query.context.tenantId,
                        businessPartnerId: core.id,
                        companyCodeId,
                        operatingOrganizationId,
                        roleLens: role,
                      },
                    })
                  ).allowed,
                tenantId: query.context.tenantId,
                businessPartnerId: core.id,
                sectionCode: query.sectionCode,
                ...coordinates,
                asOf,
                historical: Boolean(query.asOf),
              },
              transaction,
            );
            return {
              schemaVersion: 1,
              sectionCode: query.sectionCode,
              asOf,
              generatedAt,
              businessPartnerVersion: core.version,
              definitionHash,
              state: result.state,
              data: result.data as never,
              provenance: result.provenance,
              redactions: [],
            };
          }
          if (isCommonSection(query.sectionCode)) {
            let collectionOrder: "primary-first" | "newest-first" | undefined;
            if (
              query.sectionCode === "contacts" ||
              query.sectionCode === "addresses"
            ) {
              const descriptor = await options.metadata?.getEntityDescriptor(
                query.context,
                "business_partner",
              );
              collectionOrder =
                descriptor?.recordPresentation?.related?.find(
                  (p) => p.sectionKey === query.sectionCode,
                )?.collectionOrder ?? "newest-first";
            }
            const cursor = decodeCursor(
                query.cursor,
                query.sectionCode,
                core.id,
                generatedAt,
                collectionOrder,
              ),
              limit = query.limit ?? 25,
              result = await options.repository.readCommonSection(
                {
                  collectionOrder,
                  principalId: query.context.principalId,
                  companyCodeId: query.companyCodeId,
                  certificateVisible: policy.granted.has(
                    BUSINESS_PARTNER_360_PERMISSIONS.certificate,
                  ),
                  taxVisible: policy.granted.has(BUSINESS_PARTNER_360_PERMISSIONS.taxMasked),
                  contactVisible: policy.granted.has(BUSINESS_PARTNER_360_PERMISSIONS.contact),
                  addressVisible: policy.granted.has(BUSINESS_PARTNER_360_PERMISSIONS.address),
                  tenantId: query.context.tenantId,
                  businessPartnerId: core.id,
                  category: core.category,
                  sectionCode: query.sectionCode,
                  asOf,
                  limit,
                  cursor,
                },
                transaction,
              ),
              nextCursor = result.next
                ? encodeCursor({
                    v: 1,
                    section: query.sectionCode,
                    businessPartnerId: core.id,
                    snapshotAt: cursor.snapshotAt,
                    afterAt: result.next.at,
                    afterId: result.next.id,
                    ...(collectionOrder ? { collectionOrder } : {}),
                    ...(collectionOrder === "primary-first"
                      ? { afterPrimary: result.next.primary }
                      : {}),
                  })
                : undefined;
            return {
              schemaVersion: 1,
              sectionCode: query.sectionCode,
              asOf,
              generatedAt,
              businessPartnerVersion: core.version,
              definitionHash,
              state: result.items.length ? "ready" : "empty",
              data: {
                items:
                  query.sectionCode === "identifiers-tax"
                    ? result.items.map((item) =>
                        item !== null &&
                        typeof item === "object" &&
                        "kind" in item &&
                        item.kind === "tax"
                          ? {
                              ...item,
                              revealVerificationRequired: policy.verificationRequired.has(BUSINESS_PARTNER_360_PERMISSIONS.taxReveal),
                              revealable:
                                !query.asOf &&
                                query.context.assurance === "elevated" &&
                                policy.granted.has(
                                  BUSINESS_PARTNER_360_PERMISSIONS.taxReveal,
                                ),
                            }
                          : item !== null && typeof item === "object" &&
                              "kind" in item && item.kind === "identifier"
                            ? { ...item, revealVerificationRequired: policy.verificationRequired.has(BUSINESS_PARTNER_360_PERMISSIONS.identifierReveal), revealable: !query.asOf && query.context.assurance === "elevated" && policy.granted.has(BUSINESS_PARTNER_360_PERMISSIONS.identifierReveal) }
                            : item,
                      )
                    : result.items,
                ...(query.sectionCode === "identity" ? { collections: {
                  industry_crosswalk_reference_evidence: compiledCrosswalkRows(result.items),
                } } : {}),
                ...(nextCursor ? { nextCursor } : {}),
              } as never,
              page: { ...(nextCursor ? { nextCursor } : {}), limit },
              provenance: result.provenance,
              redactions: result.redactions,
            };
          }
          return {
            schemaVersion: 1,
            sectionCode: query.sectionCode,
            asOf,
            generatedAt,
            businessPartnerVersion: core.version,
            definitionHash,
            state: manifest.state,
            data: {} as never,
            provenance: [],
            redactions: [],
          };
        },
      );
    },
    async revealIdentifier(command) {
      if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(command.purpose))
        throw new MasterDataError(
          400,
          "BP_360_SCOPE_INVALID",
          "A valid reveal purpose is required",
        );
      return options.transactions.run(
        "neon",
        {
          tenantId: command.context.tenantId,
          principalId: command.context.principalId,
        },
        async (transaction) => {
          await resolve(
            {
              context: command.context,
              businessPartnerId: command.businessPartnerId,
              ...revealScope(command),
            },
            transaction,
          );
          const decision = await options.authorizer.authorize({
            context: command.context,
            permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.identifierReveal,
            resource: {
              tenantId: command.context.tenantId,
              businessPartnerId: command.businessPartnerId,
              ...revealScope(command),
              identifierId: command.identifierId,
              purpose: command.purpose,
            },
          });
          if (!decision.allowed)
            throw new MasterDataError(
              403,
              "BP_360_SECTION_FORBIDDEN",
              "Identifier reveal is not authorized",
            );
          if (!options.audit)
            throw new MasterDataError(
              503,
              "BP_360_PROVIDER_UNAVAILABLE",
              "Identifier reveal audit is unavailable",
            );
          const restricted = await options.repository.readRestrictedIdentifierValue?.(
            {
              tenantId: command.context.tenantId,
              businessPartnerId: command.businessPartnerId,
              identifierId: command.identifierId,
            },
            transaction,
          );
          if (!restricted)
            throw new MasterDataError(
              404,
              "BP_360_SECTION_NOT_APPLICABLE",
              "Identifier was not found",
            );
          const value = restricted.protected
            ? options.protectedValues
              ? await options.protectedValues.reveal({
                  token: restricted.tokenOrValue,
                  purpose: command.purpose,
                  tenantId: command.context.tenantId,
                })
              : undefined
            : restricted.tokenOrValue;
          if (!value)
            throw new MasterDataError(
              503,
              "BP_360_PROVIDER_UNAVAILABLE",
              "Protected-value reveal is unavailable",
            );
          const expiresAt = new Date(now().getTime() + 60_000).toISOString();
          await options.audit.record(
            {
              eventCode: "business_partner.identifier.revealed",
              action: "reveal",
              outcome: "success",
              actor: { kind: "user", principalId: command.context.principalId },
              tenantId: command.context.tenantId,
              entityType: "business_partner_identifier",
              entityId: command.identifierId,
              requestId: command.context.requestId,
              ...(command.context.correlationId
                ? { correlationId: command.context.correlationId }
                : {}),
              metadata: {
                businessPartnerId: command.businessPartnerId,
                purpose: command.purpose,
                expiresAt,
              },
            },
            transaction,
          );
          return {
            identifierId: command.identifierId,
            value,
            expiresAt,
            provenance: [
              {
                plane: "neon",
                service: "master-data",
                sourceObject: "master.business_partner_identifier",
                observedAt: now().toISOString(),
                schemaVersion: "1",
              },
            ],
          };
        },
      );
    },
    async revealTaxRegistration(command) {
      if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(command.purpose))
        throw new MasterDataError(
          400,
          "BP_360_SCOPE_INVALID",
          "A valid reveal purpose is required",
        );
      return options.transactions.run(
        "neon",
        {
          tenantId: command.context.tenantId,
          principalId: command.context.principalId,
        },
        async (transaction) => {
          await resolve(
            {
              context: command.context,
              businessPartnerId: command.businessPartnerId,
              ...revealScope(command),
            },
            transaction,
          );
          const decision = await options.authorizer.authorize({
            context: command.context,
            permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.taxReveal,
            resource: {
              tenantId: command.context.tenantId,
              businessPartnerId: command.businessPartnerId,
              ...revealScope(command),
              taxRegistrationId: command.taxRegistrationId,
              purpose: command.purpose,
            },
          });
          if (!decision.allowed)
            throw new MasterDataError(
              403,
              "BP_360_SECTION_FORBIDDEN",
              "Tax registration reveal is not authorized",
            );
          if (!options.audit)
            throw new MasterDataError(
              503,
              "BP_360_PROVIDER_UNAVAILABLE",
              "Tax registration reveal audit is unavailable",
            );
          const restricted = await options.repository.readRestrictedTaxValue(
            {
              tenantId: command.context.tenantId,
              businessPartnerId: command.businessPartnerId,
              taxRegistrationId: command.taxRegistrationId,
            },
            transaction,
          );
          if (!restricted)
            throw new MasterDataError(
              404,
              "BP_360_SECTION_NOT_APPLICABLE",
              "Tax registration was not found",
            );
          const value = restricted.protected
            ? options.protectedValues
              ? await options.protectedValues.reveal({
                  token: restricted.tokenOrValue,
                  purpose: command.purpose,
                  tenantId: command.context.tenantId,
                })
              : undefined
            : restricted.tokenOrValue;
          if (!value)
            throw new MasterDataError(
              503,
              "BP_360_PROVIDER_UNAVAILABLE",
              "Protected-value reveal is unavailable",
            );
          const expiresAt = new Date(now().getTime() + 60_000).toISOString();
          await options.audit.record(
            {
              eventCode: "business_partner.tax_registration.revealed",
              action: "reveal",
              outcome: "success",
              actor: { kind: "user", principalId: command.context.principalId },
              tenantId: command.context.tenantId,
              entityType: "business_partner_tax_registration",
              entityId: command.taxRegistrationId,
              requestId: command.context.requestId,
              ...(command.context.correlationId
                ? { correlationId: command.context.correlationId }
                : {}),
              metadata: {
                businessPartnerId: command.businessPartnerId,
                purpose: command.purpose,
                expiresAt,
              },
            },
            transaction,
          );
          return {
            taxRegistrationId: command.taxRegistrationId,
            value,
            expiresAt,
            provenance: [
              {
                plane: "neon",
                service: "master-data",
                sourceObject: "master.business_partner_tax_registration",
                observedAt: now().toISOString(),
                schemaVersion: "1",
              },
            ],
          };
        },
      );
    },
    async revealBankAccount(command) {
      if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(command.purpose))
        throw new MasterDataError(
          400,
          "BP_360_SCOPE_INVALID",
          "A valid reveal purpose is required",
        );
      return options.transactions.run(
        "neon",
        {
          tenantId: command.context.tenantId,
          principalId: command.context.principalId,
        },
        async (transaction) => {
          await resolve(
            {
              context: command.context,
              businessPartnerId: command.businessPartnerId,
              ...revealScope(command),
            },
            transaction,
          );
          const decision = await options.authorizer.authorize({
            context: command.context,
            permissionCode: BUSINESS_PARTNER_360_PERMISSIONS.bankReveal,
            resource: {
              tenantId: command.context.tenantId,
              businessPartnerId: command.businessPartnerId,
              ...revealScope(command),
              bankAccountLinkId: command.bankAccountLinkId,
              purpose: command.purpose,
            },
          });
          if (!decision.allowed)
            throw new MasterDataError(
              403,
              "BP_360_SECTION_FORBIDDEN",
              "Bank account reveal is not authorized",
            );
          if (!options.audit)
            throw new MasterDataError(
              503,
              "BP_360_PROVIDER_UNAVAILABLE",
              "Bank account reveal audit is unavailable",
            );
          const restricted = await options.repository.readRestrictedBankValue(
            {
              tenantId: command.context.tenantId,
              businessPartnerId: command.businessPartnerId,
              bankAccountLinkId: command.bankAccountLinkId,
            },
            transaction,
          );
          if (!restricted)
            throw new MasterDataError(
              404,
              "BP_360_SECTION_NOT_APPLICABLE",
              "Bank account link was not found",
            );
          const value = restricted.protected
            ? options.protectedValues
              ? await options.protectedValues.reveal({
                  token: restricted.tokenOrValue,
                  purpose: command.purpose,
                  tenantId: command.context.tenantId,
                })
              : undefined
            : restricted.tokenOrValue;
          if (!value)
            throw new MasterDataError(
              503,
              "BP_360_PROVIDER_UNAVAILABLE",
              "Protected-value reveal is unavailable",
            );
          const expiresAt = new Date(now().getTime() + 60_000).toISOString();
          await options.audit.record(
            {
              eventCode: "business_partner.bank_account.revealed",
              action: "reveal",
              outcome: "success",
              actor: { kind: "user", principalId: command.context.principalId },
              tenantId: command.context.tenantId,
              entityType: "business_partner_bank_account_link",
              entityId: command.bankAccountLinkId,
              requestId: command.context.requestId,
              ...(command.context.correlationId
                ? { correlationId: command.context.correlationId }
                : {}),
              metadata: {
                businessPartnerId: command.businessPartnerId,
                purpose: command.purpose,
                expiresAt,
              },
            },
            transaction,
          );
          return {
            bankAccountLinkId: command.bankAccountLinkId,
            value,
            expiresAt,
            provenance: [
              {
                plane: "neon",
                service: "master-data",
                sourceObject: "master.bank_account",
                observedAt: now().toISOString(),
                schemaVersion: "1",
              },
            ],
          };
        },
      );
    },
    async legacyAggregate(query) {
      return options.transactions.run(
        "neon",
        {
          tenantId: query.context.tenantId,
          principalId: query.context.principalId,
        },
        async (transaction) => {
          await resolve(query, transaction);
          const value = await options.repository.legacyAggregate(
            query.context.tenantId,
            query.businessPartnerId,
            query.operatingOrganizationId,
            transaction,
          );
          if (!value) throw notFound();
          return value;
        },
      );
    },
  };
  const claim = async (
    command: {
      readonly context: import("@athyper/server-contract-auth").VerifiedRequestContext;
      readonly businessPartnerId: string;
      readonly purpose: string;
      readonly revealId: string;
      readonly purposeExpiresAt: string;
      readonly operatingOrganizationId?: string;
      readonly companyCodeId?: string;
    },
    commandCode:
      "business_partner.360.identifier_reveal" | "business_partner.360.tax_reveal" | "business_partner.360.bank_reveal",
    resourceId: string,
    permissionCode: string,
  ) => {
    validateRevealClaim(
      command.purpose,
      command.revealId,
      command.purposeExpiresAt,
      now(),
    );
    await options.transactions.run(
      "neon",
      {
        tenantId: command.context.tenantId,
        principalId: command.context.principalId,
      },
      async (transaction) => {
        await resolve(
          {
            context: command.context,
            businessPartnerId: command.businessPartnerId,
            ...revealScope(command),
          },
          transaction,
        );
        const decision = await options.authorizer.authorize({
          context: command.context,
          permissionCode,
          resource: {
            tenantId: command.context.tenantId,
            businessPartnerId: command.businessPartnerId,
            ...revealScope(command),
            resourceId,
            purpose: command.purpose,
            purposeExpiresAt: command.purposeExpiresAt,
            permissionEpoch: command.context.authEpoch,
          },
        });
        if (!decision.allowed)
          throw new MasterDataError(
            403,
            "BP_360_SECTION_FORBIDDEN",
            "Restricted-value reveal is not authorized",
          );
        if (!options.audit)
          throw new MasterDataError(
            503,
            "BP_360_PROVIDER_UNAVAILABLE",
            "Restricted-value reveal audit is unavailable",
          );
        if (!options.repository.claimRestrictedReveal)
          throw new MasterDataError(
            503,
            "BP_360_PROVIDER_UNAVAILABLE",
            "Restricted-value replay protection is unavailable",
          );
        const claimed = await options.repository.claimRestrictedReveal(
          {
            tenantId: command.context.tenantId,
            principalId: command.context.principalId,
            revealId: command.revealId,
            commandCode,
            fingerprint: digest({
              businessPartnerId: command.businessPartnerId,
              ...revealScope(command),
              resourceId,
              purpose: command.purpose,
              purposeExpiresAt: command.purposeExpiresAt,
              permissionEpoch: command.context.authEpoch,
            }),
            purposeExpiresAt: command.purposeExpiresAt,
          },
          transaction,
        );
        if (!claimed)
          throw new MasterDataError(
            409,
            "BP_360_REVEAL_REPLAYED",
            "This restricted-value reveal command was already used",
          );
      },
    );
  };
  const freshQuery = async <T extends BusinessPartner360Query>(
    query: T,
  ): Promise<T> => {
    if (!options.authorizer.enforcedEntityProfile?.("neon", "business_partner"))
      return query;
    if (!options.refreshAuthorizationContext)
      throw new MasterDataError(
        503,
        "BP_PROVIDER_AUTHORIZATION_UNAVAILABLE",
        "Current provider authorization is unavailable",
      );
    const context = await options.refreshAuthorizationContext(query.context);
    if (
      context.tenantId !== query.context.tenantId ||
      context.principalId !== query.context.principalId ||
      context.planeKey !== query.context.planeKey ||
      context.realmKey !== query.context.realmKey ||
      context.authEpoch !== query.context.authEpoch
    )
      throw new MasterDataError(
        403,
        "BP_PROVIDER_AUTHORIZATION_CHANGED",
        "Provider identity changed",
      );
    return { ...query, context };
  };
  const recheckProjection = async (query: BusinessPartner360Query) => {
    const current = await freshQuery(query);
    if (current.context.profileHash !== query.context.profileHash)
      throw new MasterDataError(
        403,
        "BP_PROVIDER_AUTHORIZATION_CHANGED",
        "Provider authority changed during projection",
      );
  };
  return {
    ...service,
    async overview(query, projection): Promise<BusinessPartner360Overview> {
      query = await freshQuery(query);
      const result = await service.overview(query, projection);
      await recheckProjection(query);
      return result;
    },
    async summary(query) {
      query = await freshQuery(query);
      const result = await service.summary(query);
      if (
        !options.authorizer.enforcedEntityProfile?.("neon", "business_partner")
      )
        return result;
      const {
        primaryAddress: _address,
        primaryContact: _contact,
        identifiers: _identifiers,
        ...envelope
      } = result;
      const projected = await projectBusinessPartnerProvider({
        query,
        section: "summary",
        data: {
          primaryAddress: result.primaryAddress,
          primaryContact: result.primaryContact,
          identifiers: result.identifiers,
        },
        policy: businessPartnerSummaryFieldPolicy,
        authorizer: options.authorizer,
      });
      await recheckProjection(query);
      return {
        ...envelope,
        identifiers: [],
        ...(projected as Partial<
          Pick<
            BusinessPartner360Summary,
            "primaryAddress" | "primaryContact" | "identifiers"
          >
        >),
      };
    },
    async section<T = unknown>(
      query: Parameters<BusinessPartner360Service["section"]>[0],
    ) {
      const usageCompany = query.sectionCode === "banking" ? query.companyCodeId : undefined;
      if (query.sectionCode === "banking") {
        // Partner banking is independent of transaction/company selection.
        // Company usage/acceptance commands keep their own authorization.
        const { companyCodeId: _company, operatingOrganizationId: _organization,
          legalEntityId: _legalEntity, roleLens: _role, ...partnerQuery } = query;
        query = partnerQuery;
      }
      query = await freshQuery(query);
      const result = await service.section<T>({ ...query, ...(usageCompany ? { companyCodeId: usageCompany } : {}) });
      if (
        !options.authorizer.enforcedEntityProfile?.("neon", "business_partner")
      )
        return result;
      const providerData: unknown = result.data;
      const data = await projectBusinessPartnerProvider({
        query,
        section: query.sectionCode,
        data: providerData,
        authorizer: options.authorizer,
        authorizeCertificateAttachment: options.authorizeCertificateAttachment
          ? attachmentId => options.authorizeCertificateAttachment!(query, attachmentId)
          : undefined,
      });
      await recheckProjection(query);
      return { ...result, data: data as never };
    },
    async preflightReveal(query) {
      if (
        query.context.planeKey !== "neon" ||
        !["bank", "tax", "identifier"].includes(query.kind)
      )
        return "not_applicable";
      if (
        query.historical ||
        ((query.kind === "tax" || query.kind === "identifier") && query.context.assurance !== "elevated")
      )
        return "workflow_blocked";
      if (!options.audit || !options.repository.claimRestrictedReveal)
        return "not_applicable";
      // This is deliberately non-authorizing to avoid recursively entering this
      // preflight from the owning reveal permission check. No restricted values,
      // replay claims, audit writes or protected-value resolution occur here.
      return options.transactions.run(
        "neon",
        {
          tenantId: query.context.tenantId,
          principalId: query.context.principalId,
        },
        async (transaction) => {
          const core = await options.repository.resolveCore(
            {
              tenantId: query.context.tenantId,
              businessPartnerId: query.businessPartnerId,
            },
            transaction,
          );
          return core && core.id === query.businessPartnerId
            ? "allowed"
            : "not_applicable";
        },
      );
    },
    async revealIdentifier(command) {
      command = await freshQuery(command);
      if (command.context.assurance !== "elevated")
        throw new MasterDataError(
          403,
          "BP_360_STEP_UP_REQUIRED",
          "Elevated assurance is required to reveal an identifier",
        );
      await claim(
        command,
        "business_partner.360.identifier_reveal",
        command.identifierId,
        BUSINESS_PARTNER_360_PERMISSIONS.identifierReveal,
      );
      const result = await service.revealIdentifier!(command);
      await recheckProjection(command);
      validateRevealClaim(
        command.purpose,
        command.revealId,
        command.purposeExpiresAt,
        now(),
      );
      return result;
    },
    async revealTaxRegistration(command) {
      command = await freshQuery(command);
      if (command.context.assurance !== "elevated")
        throw new MasterDataError(
          403,
          "BP_360_STEP_UP_REQUIRED",
          "Elevated assurance is required to reveal a tax registration",
        );
      await claim(
        command,
        "business_partner.360.tax_reveal",
        command.taxRegistrationId,
        BUSINESS_PARTNER_360_PERMISSIONS.taxReveal,
      );
      const result = await service.revealTaxRegistration(command);
      await recheckProjection(command);
      validateRevealClaim(
        command.purpose,
        command.revealId,
        command.purposeExpiresAt,
        now(),
      );
      return result;
    },
    async revealBankAccount(command) {
      command = await freshQuery(command);
      if (command.context.assurance !== "elevated")
        throw new MasterDataError(403, "BP_360_STEP_UP_REQUIRED", "Elevated assurance is required to reveal a bank account");
      await claim(
        command,
        "business_partner.360.bank_reveal",
        command.bankAccountLinkId,
        BUSINESS_PARTNER_360_PERMISSIONS.bankReveal,
      );
      const result = await service.revealBankAccount(command);
      await recheckProjection(command);
      validateRevealClaim(
        command.purpose,
        command.revealId,
        command.purposeExpiresAt,
        now(),
      );
      return result;
    },
  };
}
function notFound() {
  return new MasterDataError(
    404,
    "BP_360_NOT_FOUND",
    "Business Partner was not found",
  );
}
function validateRevealClaim(
  purpose: string,
  revealId: string,
  purposeExpiresAt: string,
  clock: Date,
) {
  if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(purpose))
    throw new MasterDataError(
      400,
      "BP_360_SCOPE_INVALID",
      "A valid reveal purpose is required",
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      revealId,
    )
  )
    throw new MasterDataError(
      400,
      "BP_360_SCOPE_INVALID",
      "A valid revealId is required",
    );
  const expiresAt = parseInstant(purposeExpiresAt),
    now = clock.getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now)
    throw new MasterDataError(
      403,
      "BP_360_REVEAL_PURPOSE_EXPIRED",
      "The approved reveal purpose expired",
    );
  if (expiresAt > now + 60_000)
    throw new MasterDataError(
      400,
      "BP_360_SCOPE_INVALID",
      "Reveal purpose expiry cannot exceed 60 seconds",
    );
}
function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function fallbackEvidence(
  core: BusinessPartner360Core,
  fragments: BusinessPartner360Fragments,
): BusinessPartner360CompletenessEvidence {
  const fact = (
      state: "missing" | "present" | "verified" | "restricted_verified",
      value: unknown,
    ) => ({ state, fingerprint: digest(value) }),
    hasCommercialRole = core.roles.some(
      (role) => role.code === "supplier" || role.code === "customer",
    );
  return {
    "partner.name": fact(
      core.name ? "present" : "missing",
      Boolean(core.name),
    ),
    "partner.lifecycleStatus": fact(
      core.status === "active" ? "present" : "missing",
      core.status,
    ),
    "address.primary": fact(
      fragments.primaryAddress?.verified
        ? "verified"
        : fragments.primaryAddress
          ? "present"
          : "missing",
      fragments.primaryAddress?.verified ?? false,
    ),
    "contact.primary": fact(
      fragments.primaryContact?.verified
        ? "verified"
        : fragments.primaryContact
          ? "present"
          : "missing",
      fragments.primaryContact?.verified ?? false,
    ),
    "identifier.primary": fact(
      fragments.identifiers.some((item) => item.verified)
        ? "verified"
        : fragments.identifiers.length
          ? "present"
          : "missing",
      fragments.identifiers.map((item) => item.verified),
    ),
    "role.any_commercial": fact(
      hasCommercialRole ? "present" : "missing",
      hasCommercialRole,
    ),
    "role.supplier": fact(
      core.roles.some((role) => role.code === "supplier")
        ? "present"
        : "missing",
      core.roles.some((role) => role.code === "supplier"),
    ),
    "role.customer": fact(
      core.roles.some((role) => role.code === "customer")
        ? "present"
        : "missing",
      core.roles.some((role) => role.code === "customer"),
    ),
  };
}
async function resolveCompletenessActions(
  authorizer: Authorizer,
  query: BusinessPartner360Query,
  businessPartnerId: string,
  roleLens: BusinessPartner360RoleLens,
): Promise<
  Partial<
    Record<
      BusinessPartner360CompletenessActionCode,
      BusinessPartner360GovernedAction
    >
  >
> {
  const base = `/mdg/business-partner/${encodeURIComponent(businessPartnerId)}`,
    requestPermission = businessPartnerRequestPermissions.create,
    definitions: readonly Readonly<{
      code: BusinessPartner360CompletenessActionCode;
      label: string;
      href: string;
      authority: BusinessPartner360GovernedAction["authority"];
      permission: string;
      requestKind?: string;
    }>[] = [
      {
        code: "amend_partner",
        label: "Propose change",
        href: `/mdg/business-partner/requests?targetBusinessPartnerId=${encodeURIComponent(businessPartnerId)}&requestKind=amend_partner`,
        authority: "entity_case",
        permission: requestPermission,
        requestKind: "amend_partner",
      },
      {
        code: "add_role",
        label: "Add role",
        href: `${base}/roles/new`,
        authority: "entity_case",
        permission: requestPermission,
      },
      {
        code: "assign_organization",
        label: "Assign organization",
        href: `${base}/scope/new?kind=assign_organization`,
        authority: "entity_case",
        permission: requestPermission,
        requestKind: "assign_organization",
      },
      {
        code: "configure_company",
        label: "Configure company",
        href: `${base}/scope/new?kind=configure_company&role=${encodeURIComponent(roleLens)}`,
        authority: "entity_case",
        permission: requestPermission,
        requestKind: "configure_company",
      },
      {
        code: "lifecycle",
        label: "Change lifecycle",
        href: `${base}?section=identity&action=lifecycle`,
        authority: "entity_case",
        permission: requestPermission,
      },
      {
        code: "qualification",
        label: "Start qualification",
        href: `${base}?section=qualifications-certificates&action=qualification`,
        authority: "qualification",
        permission: businessPartnerQualificationPermissions.manage,
      },
      {
        code: "certification",
        label: "Add certification",
        href: `${base}?section=qualifications-certificates&action=certification`,
        authority: "certification",
        permission: requestPermission,
      },
    ],
    result: Partial<
      Record<
        BusinessPartner360CompletenessActionCode,
        BusinessPartner360GovernedAction
      >
    > = {};
  for (const definition of definitions) {
    const decision = await authorizer.authorize({
      context: query.context,
      permissionCode: definition.permission,
      resource: {
        tenantId: query.context.tenantId,
        businessPartnerId,
        actionCode: definition.code,
        ...(query.operatingOrganizationId
          ? { operatingOrganizationId: query.operatingOrganizationId }
          : {}),
        ...(query.companyCodeId ? { companyCodeId: query.companyCodeId } : {}),
        ...(query.legalEntityId ? { legalEntityId: query.legalEntityId } : {}),
      },
    });
    if (decision.allowed)
      result[definition.code] = {
        code: definition.code,
        label: definition.label,
        href: definition.href,
        authority: definition.authority,
        ...(definition.requestKind
          ? { requestKind: definition.requestKind }
          : {}),
        permission: definition.permission,
      };
  }
  return result;
}
function isCommonSection(
  value: BusinessPartner360SectionCode,
): value is
  | "identity"
  | "contacts"
  | "addresses"
  | "identifiers-tax"
  | "governance"
  | "comments"
  | "attachments" {
  return (
    value === "comments" ||
    value === "attachments" ||
    value === "identity" ||
    value === "contacts" ||
    value === "addresses" ||
    value === "identifiers-tax" ||
    value === "governance"
  );
}
function isRoleCompanySection(
  value: BusinessPartner360SectionCode,
): value is "roles-scope" | "supplier-company" | "customer-company" {
  return (
    value === "roles-scope" ||
    value === "supplier-company" ||
    value === "customer-company"
  );
}
function isCommercialControlSection(
  value: BusinessPartner360SectionCode,
): value is "banking" | "qualifications-certificates" | "credit" {
  return (
    value === "banking" ||
    value === "qualifications-certificates" ||
    value === "credit"
  );
}
interface CursorPayload {
  readonly v: 1;
  readonly section: string;
  readonly businessPartnerId: string;
  readonly snapshotAt: string;
  readonly afterAt?: string;
  readonly afterId?: string;
  readonly afterSource?: string;
  readonly afterPrimary?: boolean;
  readonly collectionOrder?: "primary-first" | "newest-first";
}
function encodeCursor(value: CursorPayload) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function decodeCursor(
  value: string | undefined,
  section: string,
  businessPartnerId: string,
  snapshotAt: string,
  collectionOrder?: "primary-first" | "newest-first",
): BusinessPartner360CursorAnchor {
  if (!value) return { snapshotAt };
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CursorPayload>;
    if (
      parsed.v !== 1 ||
      parsed.section !== section ||
      parsed.businessPartnerId !== businessPartnerId ||
      typeof parsed.snapshotAt !== "string" ||
      !Number.isFinite(parseInstant(parsed.snapshotAt)) ||
      typeof parsed.afterAt !== "string" ||
      !Number.isFinite(parseInstant(parsed.afterAt)) ||
      typeof parsed.afterId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.afterId) ||
      (parsed.afterSource !== undefined &&
        (typeof parsed.afterSource !== "string" ||
          parsed.afterSource.length > 64))
    )
      throw new Error();
    if (
      (parsed.collectionOrder !== undefined &&
        !["primary-first", "newest-first"].includes(parsed.collectionOrder)) ||
      (parsed.collectionOrder ?? "newest-first") !==
        (collectionOrder ?? "newest-first") ||
      (collectionOrder === "primary-first" &&
        typeof parsed.afterPrimary !== "boolean") ||
      (parsed.afterPrimary !== undefined &&
        typeof parsed.afterPrimary !== "boolean")
    )
      throw new Error();
    return {
      snapshotAt: parsed.snapshotAt,
      afterAt: parsed.afterAt,
      afterId: parsed.afterId,
      ...(parsed.afterPrimary !== undefined
        ? { afterPrimary: parsed.afterPrimary }
        : {}),
      ...(parsed.collectionOrder
        ? { collectionOrder: parsed.collectionOrder }
        : {}),
      ...(parsed.afterSource ? { afterSource: parsed.afterSource } : {}),
    };
  } catch {
    throw new MasterDataError(
      409,
      "BP_360_CURSOR_STALE",
      "The section cursor is invalid or belongs to another record",
    );
  }
}

async function authorizedCertificates(
  value: unknown,
  permissions: ReadonlySet<string>,
  authorizeAttachment?: (attachmentId: string) => Promise<boolean>,
) {
  const data = value as Readonly<Record<string, unknown>>;
  const certifications =
    permissions.has(BUSINESS_PARTNER_360_PERMISSIONS.certificate) &&
    Array.isArray(data.certifications)
      ? data.certifications
      : [];
  return {
    ...data,
    collections: {
      commodity_crosswalk_reference_evidence: permissions.has(BUSINESS_PARTNER_360_PERMISSIONS.qualification)
        ? compiledCrosswalkRows((Array.isArray(data.commodityCapabilities) ? data.commodityCapabilities : [])
            .flatMap((item: Record<string, unknown>) => Array.isArray(item.commodityCodes) ? item.commodityCodes : []))
        : [],
    },
    ...(!permissions.has(BUSINESS_PARTNER_360_PERMISSIONS.qualification)
      ? {
          qualifications: [],
          preferences: [],
          blocks: [],
          commodityCapabilities: [],
        }
      : {}),
    certifications: await Promise.all(certifications.map(async (item: Record<string, unknown>) => {
      const attachment = item.attachment as Record<string, unknown> | undefined;
      if (authorizeAttachment
        ? typeof attachment?.attachmentId === "string" && await authorizeAttachment(attachment.attachmentId)
        : permissions.has(BUSINESS_PARTNER_360_PERMISSIONS.attachment))
        return item;
      const { attachment: _attachment, ...safe } = item;
      return safe;
    })),
  };
}

function compiledCrosswalkRows(items: readonly unknown[]) {
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    if (!item || typeof item !== "object" || !("crosswalks" in item) || !Array.isArray(item.crosswalks)) continue;
    for (const row of item.crosswalks) {
      if (!row || typeof row !== "object" || typeof row.id !== "string" || row.readOnly !== true) continue;
      byId.set(row.id, Object.fromEntries(["id", "sourceDomainCode", "sourceCode", "targetDomainCode", "targetCode", "mappingType", "confidence", "provenance", "verified"].map(key => [key, row[key]])));
    }
  }
  return [...byId.values()];
}

function authorizedBankAccounts(
  value: unknown,
  permissions: ReadonlySet<string>,
  verificationRequired: ReadonlySet<string>,
) {
  const data = value as Readonly<Record<string, unknown>>;
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const collections = data.collections && typeof data.collections === "object" ? data.collections as Record<string, unknown> : undefined;
  return {
    ...data,
    ...(collections ? {collections:{...collections,bank_accounts:(Array.isArray(collections.bank_accounts) ? collections.bank_accounts : []).map((account:Record<string,unknown>)=>({...account,
      revealVerificationRequired:account.revealable === true && verificationRequired.has(BUSINESS_PARTNER_360_PERMISSIONS.bankReveal),
      revealable:account.revealable === true && permissions.has(BUSINESS_PARTNER_360_PERMISSIONS.bankReveal),
    }))}} : {}),
    accounts: accounts.map((account: Record<string, unknown>) => ({
      ...account,
      revealable:
        account.revealable === true &&
        permissions.has(BUSINESS_PARTNER_360_PERMISSIONS.bankReveal),
    })),
  };
}


/** Selected source scope must be a complete context and is checked against stored BP ownership. */
function revealScope(command: {
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
}) {
  if (
    Boolean(command.operatingOrganizationId) !== Boolean(command.companyCodeId)
  )
    throw new MasterDataError(
      400,
      "BP_360_SCOPE_INVALID",
      "Select an organization and company together",
    );
  return {
    ...(command.legalEntityId ? { legalEntityId: command.legalEntityId } : {}),
    ...(command.operatingOrganizationId && command.companyCodeId ? {
        operatingOrganizationId: command.operatingOrganizationId,
        companyCodeId: command.companyCodeId,
      } : {}),
  };
}
