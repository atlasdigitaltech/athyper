import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

export interface ExperienceIdentityRecord {
  readonly tenantCode: string;
  readonly tenantDisplayName: string;
  readonly tenantCountryCode?: string;
  readonly tenantLogoAssetRef?: string;
  readonly tenantStatus: string;
  readonly tenantRealmKey: string;
  readonly subscriptionPlanId?: string;
  readonly tenantRevision: string;
  readonly principalStatus: string;
  readonly principalCode: string;
  readonly principalDisplayName: string;
  readonly principalSecondaryLabel?: string;
  readonly principalAuthEpoch: number;
  readonly principalRevision: string;
  readonly identityBindingActive: boolean;
  readonly membershipActive: boolean;
  readonly membershipRevision?: string;
}

export interface ExperienceLegalEntityRecord {
  readonly legalEntityId: string;
  readonly code: string;
  readonly displayName: string;
  readonly logoAssetRef?: string;
  readonly revision: string;
}

export interface ExperienceWorkContextRecord {
  readonly companyCodeId: string;
  readonly companyCode: string;
  readonly companyDisplayName: string;
  readonly legalEntityId: string;
  readonly legalEntityCode: string;
  readonly legalEntityName: string;
  readonly logoAssetRef?: string;
  readonly countryCode?: string;
  readonly functionalCurrency: string;
  readonly revision: string;
}

export interface ExperienceOperatingOrganizationAssignmentRecord {
  readonly companyCodeId: string;
  readonly participationRole: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly revision: string;
}

export interface ExperienceOperatingOrganizationRecord {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
  readonly organizationKind: "company_operations" | "business_operations" | "shared_operations";
  readonly capabilities: readonly ("finance" | "procurement" | "people" | "sales" | "operations" | "warehouse" | "projects")[];
  readonly parentId?: string;
  readonly path: readonly string[];
  readonly procurementProfileConfigured: boolean;
  readonly salesProfileConfigured: boolean;
  readonly leadCompanyCodeId?: string;
  readonly bookingCompanyCodeId?: string;
  readonly invoicingCompanyCodeId?: string;
  readonly defaultCurrency?: string;
  readonly assignments: readonly ExperienceOperatingOrganizationAssignmentRecord[];
  readonly revision: string;
}

export interface ExperienceNetworkAccountRecord {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
  readonly legalName?: string;
  readonly role: "buyer" | "supplier" | "both";
  readonly countryCode?: string;
  readonly defaultCurrency?: string;
  readonly logoAssetRef?: string;
  readonly canonicalPartyId?: string;
  readonly source: "neon_projection" | "mesh";
  readonly revision: string;
}

export interface ExperienceProfileRecord {
  readonly tenant?: Readonly<Record<string, unknown>>;
  readonly principal?: Readonly<Record<string, unknown>>;
  readonly revision: string;
}
export interface ExperienceLocaleCatalogGovernanceRecord {
  readonly localeCode: string;
  readonly status: string;
  readonly coveragePct: number;
  readonly linguisticReviewPassed: boolean;
  readonly layoutReviewPassed: boolean;
  readonly automatedTestsPassed: boolean;
}
export interface ExperienceLocalePolicyRecord {
  readonly catalogs?: readonly ExperienceLocaleCatalogGovernanceRecord[];
  readonly enabledLocales: readonly string[];
  readonly defaultLocale: string;
  readonly fallbackLocale: string;
  readonly revision: string;
}

export interface ExperienceSurfaceReleaseRecord {
  readonly id: string;
  readonly targetPlane: "studio" | "neon" | "mesh";
  readonly surfaceKey: string;
  readonly layer: "shared" | "tenant";
  readonly revision: number;
  readonly status: "draft" | "published" | "retired";
  readonly definition: Readonly<Record<string, unknown>>;
  readonly contentHash: string;
  readonly source: "human" | "atlas";
  readonly publishedAt?: string;
}
export interface ExperienceSurfaceProjectionRecord {
  readonly surfaceKey: string;
  readonly layer: "shared" | "tenant";
  readonly sourceReleaseId: string;
  readonly sourceRevision: number;
  readonly definition: Readonly<Record<string, unknown>>;
  readonly contentHash: string;
}
export interface PersonalSurfaceArrangementRecord {
  readonly surfaceKey: string;
  readonly baseRevision: number;
  readonly arrangement: Readonly<Record<string, unknown>>;
}
export interface RouteSlugRedirectRecord {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly redirectStatus: 301 | 308;
}

export interface ExperienceCatalogRecord {
  readonly planActive: boolean;
  readonly planRevision: string;
  readonly associations: readonly Readonly<{
    workspaceCode: string;
    workspaceName: string;
    workspaceIconKey?: string;
    workspaceSortOrder: number;
    workspaceSharedInfrastructure?: boolean;
    moduleId: string;
    moduleCode: string;
    moduleName: string;
    moduleIconKey?: string;
    moduleSortOrder: number;
    primary: boolean;
    revision: string;
  }>[];
  readonly permissions: readonly Readonly<{
    code: string;
    moduleId: string;
    revision: string;
  }>[];
}

export interface ExperienceFeatureRecord {
  readonly cohortStrategy: "tenant_sha256_v1" | "principal_fnv1a_v2";
  readonly id: string;
  readonly code: string;
  readonly moduleId?: string;
  readonly kind: "release_gate" | "kill_switch" | "experiment";
  readonly defaultEnabled: boolean;
  readonly rolloutPct?: number;
  readonly overrideEnabled?: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly revision: string;
}

export interface ExperiencePlaneRepository {
  readFeatureRevision?(
    context: VerifiedRequestContext,
    at: Date,
  ): Promise<string>;
  /** Read before cache lookup; changes across commits and effective-date boundaries. */
  readEntitlementRevision?(
    context: VerifiedRequestContext,
    at: Date,
  ): Promise<string>;
  readIdentity(
    context: VerifiedRequestContext,
    at: Date,
  ): Promise<ExperienceIdentityRecord | undefined>;
  readProfile(
    context: VerifiedRequestContext,
  ): Promise<ExperienceProfileRecord>;
  readCatalog(
    context: VerifiedRequestContext,
    subscriptionPlanId: string,
  ): Promise<ExperienceCatalogRecord | undefined>;
  readFeatures(
    context: VerifiedRequestContext,
    at: Date,
  ): Promise<readonly ExperienceFeatureRecord[]>;
  readWorkContexts(
    context: VerifiedRequestContext,
  ): Promise<readonly ExperienceWorkContextRecord[]>;
  /** Tenant-wide Legal Entity catalog, independent of Company Code visibility — required to admit a Legal-Entity-only grant with no matching company row. */
  readLegalEntities(
    context: VerifiedRequestContext,
  ): Promise<readonly ExperienceLegalEntityRecord[]>;
  readOperatingOrganizations(
    context: VerifiedRequestContext,
    at: Date,
  ): Promise<readonly ExperienceOperatingOrganizationRecord[]>;
  readNetworkAccounts(
    context: VerifiedRequestContext,
  ): Promise<readonly ExperienceNetworkAccountRecord[]>;
  readLocalePolicy?(
    context: VerifiedRequestContext,
  ): Promise<ExperienceLocalePolicyRecord>;
  updateLocalePolicy?(
    context: VerifiedRequestContext,
    policy: Omit<ExperienceLocalePolicyRecord, "revision">,
  ): Promise<ExperienceLocalePolicyRecord>;
  updatePrincipalLocale?(
    context: VerifiedRequestContext,
    localeCode: string,
    expectedPolicyRevision: string,
  ): Promise<void>;
  saveSurfaceDraft?(
    context: VerifiedRequestContext,
    input: Readonly<{
      targetPlane: "studio" | "neon" | "mesh";
      surfaceKey: string;
      layer: "shared" | "tenant";
      definition: Readonly<Record<string, unknown>>;
      contentHash: string;
      source: "human" | "atlas";
      expectedContentHash?: string;
    }>,
  ): Promise<ExperienceSurfaceReleaseRecord>;
  listSurfaceReleases?(
    context: VerifiedRequestContext,
    input: Readonly<{
      targetPlane: "studio" | "neon" | "mesh";
      surfaceKey: string;
    }>,
  ): Promise<readonly ExperienceSurfaceReleaseRecord[]>;
  rollbackSurfaceRelease?(
    context: VerifiedRequestContext,
    releaseId: string,
  ): Promise<ExperienceSurfaceReleaseRecord | undefined>;
  publishSurfaceRelease?(
    context: VerifiedRequestContext,
    releaseId: string,
  ): Promise<ExperienceSurfaceReleaseRecord | undefined>;
  applySurfaceProjection?(
    context: VerifiedRequestContext,
    release: ExperienceSurfaceReleaseRecord,
  ): Promise<void>;
  readSurfaceProjections?(
    context: VerifiedRequestContext,
    surfaceKey: string,
  ): Promise<readonly ExperienceSurfaceProjectionRecord[]>;
  readPersonalSurfaceArrangement?(
    context: VerifiedRequestContext,
    surfaceKey: string,
  ): Promise<PersonalSurfaceArrangementRecord | undefined>;
  savePersonalSurfaceArrangement?(
    context: VerifiedRequestContext,
    input: PersonalSurfaceArrangementRecord,
  ): Promise<PersonalSurfaceArrangementRecord>;
  deletePersonalSurfaceArrangement?(
    context: VerifiedRequestContext,
    surfaceKey: string,
  ): Promise<void>;
  readRouteSlugRedirect?(
    context: VerifiedRequestContext,
    sourcePath: string,
    at: Date,
  ): Promise<RouteSlugRedirectRecord | undefined>;
  registerRouteSlugRedirect?(
    context: VerifiedRequestContext,
    input: Readonly<{
      catalogKind: "workspace" | "module" | "entity";
      catalogCode: string;
      sourcePath: string;
      targetPath: string;
      redirectStatus: 301 | 308;
      sourceReleaseId: string;
    }>,
  ): Promise<RouteSlugRedirectRecord>;
}

export type ExperienceRepositoryProvider =
  ExactPlaneRepositoryProvider<ExperiencePlaneRepository>;

export type ExperienceInvalidationKind =
  "profile" | "catalog" | "plan" | "flag" | "membership" | "authorization";
export interface ExperienceCache {
  /** Invalidation generation used to reject stale in-flight cache writes. */
  readonly generation?: number;
  get(key: string): Promise<unknown> | unknown;
  set(
    key: string,
    value: unknown,
    tags: readonly string[],
    expectedGeneration?: number,
  ): Promise<void> | void;
  invalidate(tags: readonly string[]): Promise<void> | void;
}

export interface ExperienceInvalidationHooks {
  profileChanged(
    planeKey: string,
    tenantId: string,
    principalId?: string,
  ): Promise<void>;
  catalogChanged(planeKey: string): Promise<void>;
  planChanged(planeKey: string, tenantId?: string): Promise<void>;
  flagChanged(planeKey: string, tenantId?: string): Promise<void>;
  membershipChanged(
    planeKey: string,
    tenantId: string,
    principalId: string,
  ): Promise<void>;
  authorizationChanged(
    planeKey: string,
    tenantId: string,
    principalId: string,
  ): Promise<void>;
}
