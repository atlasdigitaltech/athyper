import { createHash } from "node:crypto";
import {
  parseExperienceSurface,
  parsePersonalSurfaceArrangement,
  resolveEffectiveExperience,
  type EffectiveExperienceSurface,
  type ExperienceRegistryPolicy,
  type ExperienceSurface,
  type PersonalSurfaceArrangement,
  type PublishedExperienceLayer,
} from "@athyper/contract-platform-dashboard";
import { defaultExperienceSurface } from "@athyper/contract-platform-dashboard/defaults";
import {
  LOCALE_REGISTRY,
  SUPPORTED_UI_LOCALES,
  isSupportedLocale,
  matchSupportedLocale,
  textDirection,
  type SupportedLocale,
} from "@athyper/platform-i18n";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  EffectiveFeature,
  ExperienceBootstrap,
  ExperienceLocaleCatalog,
  ExperienceLocalePolicy,
  ExperienceLocalization,
  ExperienceModule,
  ExperienceProfile,
  ExperienceWorkspace,
  LocaleCatalogStatus,
  MeshNetworkAccountCatalog,
  NeonCapabilityGroup,
  NeonOperatingOrganizationCapability,
  NeonOperatingOrganizationCatalog,
  NeonWorkContextBootstrap,
} from "./contracts.js";
import type {
  ExperienceCache,
  ExperienceCatalogRecord,
  ExperienceFeatureRecord,
  ExperienceIdentityRecord,
  ExperienceInvalidationHooks,
  ExperienceLocaleCatalogGovernanceRecord,
  ExperienceRepositoryProvider,
  ExperienceSurfaceProjectionRecord,
  ExperienceSurfaceReleaseRecord,
  RouteSlugRedirectRecord,
} from "./ports.js";

export class ExperienceAccessError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExperienceAccessError";
  }
}

export interface ExperienceServiceOptions {
  readonly repositories: ExperienceRepositoryProvider;
  readonly cache?: ExperienceCache;
  readonly now?: () => Date;
}

const PLATFORM_PROFILE: ExperienceProfile = Object.freeze({
  localeCode: "en-US",
  languageCode: "en",
  timezoneCode: "UTC",
  dateFormat: "yyyy-MM-dd",
  numberFormat: "latn",
  weekStart: 1,
  weekendDays: Object.freeze([0, 6]),
  appearanceMode: "system",
  densityCode: "comfortable",
});
const SURFACE_REGISTRY_POLICY: ExperienceRegistryPolicy = Object.freeze({
  dataSources: new Set(["catalog.summary"]),
  actions: new Set(["catalog.navigate"]),
  extensions: new Set([
    "studio.preview",
    "neon.atlas-welcome",
    "mesh.network-overview",
  ]),
});

export function createExperienceService(options: ExperienceServiceOptions) {
  const now = options.now ?? (() => new Date());
  return Object.freeze({
    async bootstrap(
      context: VerifiedRequestContext,
      input: { readonly clientVersion?: string } = {},
    ): Promise<ExperienceBootstrap> {
      assertSnapshotBoundToContext(context);
      const repository = options.repositories.require(context.planeKey);
      const cacheKey = `experience:${context.planeKey}:${context.tenantId}:${context.principalId}:${context.authEpoch}:${context.profileHash}:${input.clientVersion ?? "-"}`;
      const cacheGeneration = options.cache?.generation;
      const cached = await options.cache?.get(cacheKey);
      if (isBootstrap(cached)) return cached;
      const at = now();
      const identity = await repository.readIdentity(context, at);
      assertIdentityAdmission(context, identity);

      const localePolicy = normalizeLocalePolicy(
        context.planeKey,
        await repository.readLocalePolicy?.(context),
      );
      const resolvedProfile = await readProfileOrDefault(
        repository.readProfile.bind(repository),
        context,
      );
      const { profile, localization } = applyLocalePolicy(
        resolvedProfile,
        localePolicy,
      );
      const presentation = identityPresentation(context, identity);
      if (!identity.subscriptionPlanId) {
        const result = contextNotReady(
          context,
          profile,
          localization,
          localePolicy,
          presentation,
          revision({
            identity,
            profile,
            localePolicy,
            auth: authorizationRevision(context),
          }),
        );
        await cache(options.cache, cacheKey, result, tags(context), cacheGeneration);
        return result;
      }
      const catalog = await repository.readCatalog(
        context,
        identity.subscriptionPlanId,
      );
      if (!catalog?.planActive) {
        const result = contextNotReady(
          context,
          profile,
          localization,
          localePolicy,
          presentation,
          revision({
            identity,
            profile,
            localePolicy,
            plan: catalog?.planRevision ?? "missing",
            auth: authorizationRevision(context),
          }),
        );
        await cache(options.cache, cacheKey, result, tags(context), cacheGeneration);
        return result;
      }
      let featureRows: readonly ExperienceFeatureRecord[] = [];
      try {
        featureRows = await repository.readFeatures(context, at);
      } catch {
        /* Unknown flags are unavailable by default. */
      }
      const entitledModuleIds = new Set(
        catalog.associations.map((row) => row.moduleId),
      );
      const features = resolveFeatures(
        featureRows,
        context.tenantId,
        entitledModuleIds,
        input.clientVersion,
      );
      const workspaces = resolveWorkspaces(catalog);
      const knownPermissions = new Map(
        catalog.permissions.map((permission) => [
          permission.code,
          permission.moduleId,
        ]),
      );
      const permissions = [
        ...new Set(
          context.permissions.allowed.filter((code) => {
            const moduleId = knownPermissions.get(code);
            return moduleId !== undefined && entitledModuleIds.has(moduleId);
          }),
        ),
      ].sort();
      const result: ExperienceBootstrap = {
        schemaVersion: 1,
        state: "ready",
        planeKey: context.planeKey,
        tenantId: context.tenantId,
        principalId: context.principalId,
        revision: revision({
          identity,
          profile,
          localePolicy,
          plan: catalog.planRevision,
          catalog: [...catalog.associations, ...catalog.permissions],
          features: featureRows,
          auth: authorizationRevision(context),
        }),
        ...presentation,
        profile,
        localization,
        localePolicy,
        workspaces,
        permissions,
        features,
        nextActions: [],
      };
      await cache(options.cache, cacheKey, result, tags(context), cacheGeneration);
      return result;
    },
    async localePolicy(
      context: VerifiedRequestContext,
      targetPlane = context.planeKey,
    ): Promise<ExperienceLocalePolicy> {
      assertSnapshotBoundToContext(context);
      if (
        targetPlane !== context.planeKey &&
        (context.planeKey !== "studio" ||
          !context.permissions.allowed.includes(
            "studio.platform.catalog.manage",
          ))
      )
        deny(
          "EXPERIENCE_LOCALE_POLICY_FORBIDDEN",
          "Cross-plane locale policy requires Studio catalog authority",
        );
      const repository = options.repositories.require(targetPlane),
        target = { ...context, planeKey: targetPlane };
      return normalizeLocalePolicy(
        targetPlane,
        await repository.readLocalePolicy?.(target),
      );
    },
    async updateLocalePolicy(
      context: VerifiedRequestContext,
      targetPlane: VerifiedRequestContext["planeKey"],
      input: {
        readonly catalogs: readonly ExperienceLocaleCatalogGovernanceRecord[];
        readonly enabledLocales: readonly string[];
        readonly defaultLocale: string;
        readonly fallbackLocale: string;
      },
    ): Promise<ExperienceLocalePolicy> {
      assertSnapshotBoundToContext(context);
      if (
        context.planeKey !== "studio" ||
        !context.permissions.allowed.includes("studio.platform.catalog.manage")
      )
        deny(
          "EXPERIENCE_LOCALE_POLICY_FORBIDDEN",
          "Locale activation requires Studio catalog authority",
        );
      const policy = validateLocalePolicyInput(targetPlane, input),
        repository = options.repositories.require(targetPlane);
      if (!repository.updateLocalePolicy)
        throw Object.assign(new Error("Locale policy writer is unavailable"), {
          code: "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE",
        });
      const target = { ...context, planeKey: targetPlane },
        saved = await repository.updateLocalePolicy(target, {
          catalogs: policy.catalogs.map(
            ({
              localeCode,
              status,
              coveragePct,
              linguisticReviewPassed,
              layoutReviewPassed,
              automatedTestsPassed,
            }) => ({
              localeCode,
              status,
              coveragePct,
              linguisticReviewPassed,
              layoutReviewPassed,
              automatedTestsPassed,
            }),
          ),
          enabledLocales: policy.enabledLocales,
          defaultLocale: policy.defaultLocale,
          fallbackLocale: policy.fallbackLocale,
        });
      await options.cache?.invalidate([
        `${targetPlane}:profile`,
        `${targetPlane}:tenant:${context.tenantId}`,
      ]);
      return normalizeLocalePolicy(targetPlane, saved);
    },
    async updatePrincipalLocale(
      context: VerifiedRequestContext,
      localeCode: string,
    ): Promise<ExperienceBootstrap> {
      assertSnapshotBoundToContext(context);
      // Check admission before persisting a preference, even when bootstrap is cached.
      const repository = options.repositories.require(context.planeKey);
      assertIdentityAdmission(context, await repository.readIdentity(context, now()));
      const policy = normalizeLocalePolicy(
          context.planeKey,
          await repository.readLocalePolicy?.(context),
        ),
        canonical = canonicalLocale(localeCode, ""),
        catalog = canonical ? catalogCodeForLocale(canonical) : undefined;
      if (!catalog || !policy.enabledLocales.includes(catalog))
        throw new ExperienceAccessError(
          400,
          "EXPERIENCE_LOCALE_NOT_ENABLED",
          "The selected locale is not enabled and qualified for this plane",
        );
      if (!repository.updatePrincipalLocale)
        throw Object.assign(
          new Error("Locale preference writer is unavailable"),
          { code: "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
        );
      await repository.updatePrincipalLocale(context, canonical, policy.revision);
      await options.cache?.invalidate([
        `${context.planeKey}:profile`,
        `${context.planeKey}:principal:${context.principalId}`,
      ]);
      return this.bootstrap(context);
    },
    async saveSurfaceDraft(
      context: VerifiedRequestContext,
      input: Readonly<{
        targetPlane: VerifiedRequestContext["planeKey"];
        layer: "shared" | "tenant";
        definition: unknown;
        source?: "human" | "atlas";
        expectedContentHash?: string;
      }>,
    ): Promise<ExperienceSurfaceReleaseRecord> {
      requireSurfaceAuthority(context);
      let surface: ExperienceSurface;
      try {
        surface = parseExperienceSurface(
          input.definition,
          SURFACE_REGISTRY_POLICY,
        );
      } catch (cause) {
        throw new ExperienceAccessError(
          400,
          "EXPERIENCE_SURFACE_INVALID",
          cause instanceof Error
            ? cause.message
            : "Surface definition is invalid",
        );
      }
      if (surface.scope.plane !== input.targetPlane)
        throw new ExperienceAccessError(
          400,
          "EXPERIENCE_SURFACE_PLANE_MISMATCH",
          "Surface scope plane must match the target plane",
        );
      const repository = options.repositories.require("studio");
      if (!repository.saveSurfaceDraft)
        unavailable("Surface draft writer is unavailable");
      const definition = JSON.parse(JSON.stringify(surface)) as Record<
        string,
        unknown
      >;
      try {
        return await repository.saveSurfaceDraft(context, {
          targetPlane: input.targetPlane,
          surfaceKey: surface.id,
          layer: input.layer,
          definition,
          contentHash: stableHash(definition),
          source: input.source ?? "human",
          ...(input.expectedContentHash
            ? { expectedContentHash: input.expectedContentHash }
            : {}),
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          Reflect.get(error, "code") === "EXPERIENCE_SURFACE_DRAFT_CONFLICT"
        )
          throw new ExperienceAccessError(
            409,
            "EXPERIENCE_SURFACE_DRAFT_CONFLICT",
            "The draft changed after it was loaded; reload before saving",
          );
        throw error;
      }
    },
    async surfaceHistory(
      context: VerifiedRequestContext,
      targetPlane: VerifiedRequestContext["planeKey"],
      surfaceKey: string,
    ): Promise<readonly ExperienceSurfaceReleaseRecord[]> {
      requireSurfaceAuthority(context);
      const repository = options.repositories.require("studio");
      if (!repository.listSurfaceReleases)
        unavailable("Surface release history reader is unavailable");
      return repository.listSurfaceReleases(context, {
        targetPlane,
        surfaceKey,
      });
    },
    async rollbackSurface(
      context: VerifiedRequestContext,
      releaseId: string,
    ): Promise<ExperienceSurfaceReleaseRecord> {
      requireSurfaceAuthority(context);
      const repository = options.repositories.require("studio");
      if (!repository.rollbackSurfaceRelease)
        unavailable("Surface rollback writer is unavailable");
      const release = await repository.rollbackSurfaceRelease(
        context,
        releaseId,
      );
      if (!release)
        throw new ExperienceAccessError(
          404,
          "EXPERIENCE_SURFACE_RELEASE_NOT_FOUND",
          "The requested release does not exist",
        );
      return release;
    },
    async publishSurface(
      context: VerifiedRequestContext,
      releaseId: string,
    ): Promise<ExperienceSurfaceReleaseRecord> {
      requireSurfaceAuthority(context);
      const sourceRepository = options.repositories.require("studio");
      if (!sourceRepository.publishSurfaceRelease)
        unavailable("Surface publisher is unavailable");
      const release = await sourceRepository.publishSurfaceRelease(
        context,
        releaseId,
      );
      if (!release)
        throw new ExperienceAccessError(
          404,
          "EXPERIENCE_SURFACE_DRAFT_NOT_FOUND",
          "The requested draft is unavailable or no longer publishable",
        );
      const targetRepository = options.repositories.require(
        release.targetPlane,
      );
      if (!targetRepository.applySurfaceProjection)
        unavailable("Target surface projection writer is unavailable");
      await targetRepository.applySurfaceProjection(
        contextForPlane(context, release.targetPlane),
        release,
      );
      await options.cache?.invalidate([
        `${release.targetPlane}:experience-surface:${release.surfaceKey}`,
        `${release.targetPlane}:tenant:${context.tenantId}`,
      ]);
      return release;
    },
    async surface(
      context: VerifiedRequestContext,
      surfaceKey: string,
    ): Promise<EffectiveExperienceSurface> {
      const repository = options.repositories.require(context.planeKey);
      if (!repository.readSurfaceProjections)
        unavailable("Surface projection reader is unavailable");
      const system = defaultExperienceSurface(surfaceKey, context.planeKey);
      if (!system)
        throw new ExperienceAccessError(
          404,
          "EXPERIENCE_SURFACE_NOT_FOUND",
          "The requested system surface does not exist in this plane",
        );
      const [projections, personalRecord] = await Promise.all([
        repository.readSurfaceProjections(context, surfaceKey),
        repository.readPersonalSurfaceArrangement?.(context, surfaceKey),
      ]);
      let layers: PublishedExperienceLayer[];
      let arrangement: PersonalSurfaceArrangement | undefined;
      try {
        layers = projections.map((projection) => ({
          layer: projection.layer,
          surface: parseExperienceSurface(
            projection.definition,
            SURFACE_REGISTRY_POLICY,
          ),
        }));
        arrangement = personalRecord
          ? parsePersonalSurfaceArrangement(personalRecord.arrangement)
          : undefined;
      } catch (cause) {
        throw new ExperienceAccessError(
          500,
          "EXPERIENCE_SURFACE_PROJECTION_INVALID",
          cause instanceof Error
            ? cause.message
            : "A published surface projection is invalid",
        );
      }
      return resolveEffectiveExperience(system, layers, arrangement, {
        ...revisionForLayer(projections, "shared"),
        ...revisionForLayer(projections, "tenant"),
      });
    },
    async savePersonalArrangement(
      context: VerifiedRequestContext,
      surfaceKey: string,
      value: unknown,
    ): Promise<EffectiveExperienceSurface> {
      const repository = options.repositories.require(context.planeKey);
      if (!repository.savePersonalSurfaceArrangement)
        unavailable("Personal arrangement writer is unavailable");
      let arrangement: PersonalSurfaceArrangement;
      try {
        arrangement = parsePersonalSurfaceArrangement(value);
      } catch (cause) {
        throw new ExperienceAccessError(
          400,
          "EXPERIENCE_ARRANGEMENT_INVALID",
          cause instanceof Error
            ? cause.message
            : "Personal arrangement is invalid",
        );
      }
      if (arrangement.surfaceId !== surfaceKey)
        throw new ExperienceAccessError(
          400,
          "EXPERIENCE_ARRANGEMENT_SURFACE_MISMATCH",
          "Arrangement surfaceId must match the route surface key",
        );
      const current = await this.surface(context, surfaceKey);
      if (arrangement.baseRevision !== current.surface.revision)
        throw new ExperienceAccessError(
          409,
          "EXPERIENCE_ARRANGEMENT_STALE",
          "The surface changed; reload before saving this arrangement",
        );
      await repository.savePersonalSurfaceArrangement(context, {
        surfaceKey,
        baseRevision: arrangement.baseRevision,
        arrangement: JSON.parse(JSON.stringify(arrangement)) as Record<
          string,
          unknown
        >,
      });
      await options.cache?.invalidate([
        `${context.planeKey}:experience-surface:${surfaceKey}`,
        `${context.planeKey}:principal:${context.principalId}`,
      ]);
      return this.surface(context, surfaceKey);
    },
    async deletePersonalArrangement(
      context: VerifiedRequestContext,
      surfaceKey: string,
    ): Promise<EffectiveExperienceSurface> {
      const repository = options.repositories.require(context.planeKey);
      if (!repository.deletePersonalSurfaceArrangement)
        unavailable("Personal arrangement writer is unavailable");
      await repository.deletePersonalSurfaceArrangement(context, surfaceKey);
      await options.cache?.invalidate([
        `${context.planeKey}:experience-surface:${surfaceKey}`,
        `${context.planeKey}:principal:${context.principalId}`,
      ]);
      return this.surface(context, surfaceKey);
    },
    async routeRedirect(
      context: VerifiedRequestContext,
      sourcePath: string,
    ): Promise<RouteSlugRedirectRecord | undefined> {
      if (
        !/^\/[a-z0-9][a-z0-9/-]*$/.test(sourcePath) ||
        sourcePath.includes("..") ||
        sourcePath.includes("//")
      )
        throw new ExperienceAccessError(
          400,
          "EXPERIENCE_ROUTE_PATH_INVALID",
          "Route path is invalid",
        );
      const repository = options.repositories.require(context.planeKey);
      if (!repository.readRouteSlugRedirect)
        unavailable("Route redirect reader is unavailable");
      return repository.readRouteSlugRedirect(context, sourcePath, now());
    },
    async registerRouteRedirect(
      context: VerifiedRequestContext,
      input: Readonly<{
        targetPlane: VerifiedRequestContext["planeKey"];
        catalogKind: "workspace" | "module" | "entity";
        catalogCode: string;
        sourcePath: string;
        targetPath: string;
        redirectStatus: 301 | 308;
        sourceReleaseId: string;
      }>,
    ): Promise<RouteSlugRedirectRecord> {
      requireSurfaceAuthority(context);
      for (const path of [input.sourcePath, input.targetPath])
        if (
          !/^\/[a-z0-9][a-z0-9/-]*$/.test(path) ||
          path.includes("..") ||
          path.includes("//")
        )
          throw new ExperienceAccessError(
            400,
            "EXPERIENCE_ROUTE_PATH_INVALID",
            "Route path is invalid",
          );
      if (input.sourcePath === input.targetPath)
        throw new ExperienceAccessError(
          400,
          "EXPERIENCE_ROUTE_REDIRECT_LOOP",
          "Redirect source and target must differ",
        );
      const repository = options.repositories.require(input.targetPlane);
      if (!repository.registerRouteSlugRedirect)
        unavailable("Route redirect writer is unavailable");
      try {
        return await repository.registerRouteSlugRedirect(
          contextForPlane(context, input.targetPlane),
          input,
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          Reflect.get(error, "code") === "EXPERIENCE_ROUTE_REDIRECT_LOOP"
        )
          throw new ExperienceAccessError(
            409,
            "EXPERIENCE_ROUTE_REDIRECT_LOOP",
            "Route redirect would create a loop",
          );
        throw error;
      }
    },
    async neonWorkContexts(
      context: VerifiedRequestContext,
    ): Promise<NeonWorkContextBootstrap> {
      assertSnapshotBoundToContext(context);
      if (context.planeKey !== "neon")
        deny(
          "EXPERIENCE_NEON_CONTEXT_REQUIRED",
          "Company work contexts are available only in Neon",
        );
      const repository = options.repositories.require("neon");
      const rows = await repository.readWorkContexts(context);
      const scopes = context.permissions.authorizationScopes;
      const tenantWide = scopes.some((scope) => scope.tenantWide);
      const companyIds = new Set(
        scopes.flatMap((scope) => scope.companyCodeIds),
      );
      const legalEntityIds = new Set(
        scopes.flatMap((scope) => scope.legalEntityIds),
      );
      const visible = rows.filter(
        (row) =>
          tenantWide ||
          companyIds.has(row.companyCodeId) ||
          legalEntityIds.has(row.legalEntityId),
      );
      const companies = visible.map((row) => ({
        companyCodeId: row.companyCodeId,
        code: row.companyCode,
        displayName: row.companyDisplayName,
        legalEntityId: row.legalEntityId,
        legalEntityCode: row.legalEntityCode,
        legalEntityName: row.legalEntityName,
        ...(row.countryCode ? { countryCode: row.countryCode } : {}),
        ...(row.logoAssetRef ? { logoAssetRef: row.logoAssetRef } : {}),
        functionalCurrency: row.functionalCurrency,
        capabilityGroups: capabilityGroups(
          scopes
            .filter(
              (scope) =>
                scope.tenantWide ||
                scope.companyCodeIds.includes(row.companyCodeId) ||
                scope.legalEntityIds.includes(row.legalEntityId),
            )
            .map((scope) => scope.permissionCode),
        ),
      }));
      return Object.freeze({
        schemaVersion: 1,
        revision: revision({
          tenantId: context.tenantId,
          auth: authorizationRevision(context),
          rows: visible,
        }),
        tenantId: context.tenantId,
        supportsAllPermitted: companies.length > 1,
        companies: Object.freeze(companies),
      });
    },
    async neonOperatingOrganizations(
      context: VerifiedRequestContext,
    ): Promise<NeonOperatingOrganizationCatalog> {
      assertSnapshotBoundToContext(context);
      if (context.planeKey !== "neon")
        deny(
          "EXPERIENCE_NEON_CONTEXT_REQUIRED",
          "Operating organizations are available only in Neon",
        );
      const repository = options.repositories.require("neon"),
        at = now();
      const [organizations, companies] = await Promise.all([
        repository.readOperatingOrganizations(context, at),
        repository.readWorkContexts(context),
      ]);
      const scopes = context.permissions.authorizationScopes;
      const tenantWide = scopes.some((scope) => scope.tenantWide);
      const companyIds = new Set(
        scopes.flatMap((scope) => scope.companyCodeIds),
      );
      const legalEntityIds = new Set(
        scopes.flatMap((scope) => scope.legalEntityIds),
      );
      const permittedCompanies = new Set(
        companies
          .filter(
            (company) =>
              tenantWide ||
              companyIds.has(company.companyCodeId) ||
              legalEntityIds.has(company.legalEntityId),
          )
          .map((company) => company.companyCodeId),
      );
      const organizationIds = new Set(
        scopes.flatMap((scope) => scope.operatingOrganizationIds),
      );
      const visible = organizations.flatMap((organization) => {
        if (!tenantWide && !organizationIds.has(organization.id)) return [];
        const assignments = organization.assignments.filter((assignment) =>
          permittedCompanies.has(assignment.companyCodeId),
        );
        if (!assignments.length) return [];
        return [
          {
            id: organization.id,
            code: organization.code,
            displayName: organization.displayName,
            domain: organization.domain,
            ...(organization.parentId
              ? { parentId: organization.parentId }
              : {}),
            path: organization.path,
            capabilities: operatingOrganizationCapabilities(
              organization.domain,
            ),
            procurementProfileConfigured:
              organization.procurementProfileConfigured,
            salesProfileConfigured: organization.salesProfileConfigured,
            companyAssignments: Object.freeze(
              assignments.map((assignment) => ({
                companyCodeId: assignment.companyCodeId,
                participationRole: assignment.participationRole,
                effectiveFrom: assignment.effectiveFrom,
                ...(assignment.effectiveUntil
                  ? { effectiveUntil: assignment.effectiveUntil }
                  : {}),
              })),
            ),
            defaults: Object.freeze({
              ...(organization.leadCompanyCodeId &&
              permittedCompanies.has(organization.leadCompanyCodeId)
                ? { leadCompanyCodeId: organization.leadCompanyCodeId }
                : {}),
              ...(organization.bookingCompanyCodeId &&
              permittedCompanies.has(organization.bookingCompanyCodeId)
                ? { bookingCompanyCodeId: organization.bookingCompanyCodeId }
                : {}),
              ...(organization.invoicingCompanyCodeId &&
              permittedCompanies.has(organization.invoicingCompanyCodeId)
                ? {
                    invoicingCompanyCodeId: organization.invoicingCompanyCodeId,
                  }
                : {}),
              ...(organization.defaultCurrency
                ? { currency: organization.defaultCurrency }
                : {}),
            }),
          },
        ];
      });
      return Object.freeze({
        schemaVersion: 1,
        revision: revision({
          tenantId: context.tenantId,
          effectiveAt: at.toISOString(),
          auth: authorizationRevision(context),
          rows: visible,
        }),
        tenantId: context.tenantId,
        effectiveAt: at.toISOString(),
        organizations: Object.freeze(visible),
      });
    },
    async meshNetworkAccounts(
      context: VerifiedRequestContext,
    ): Promise<MeshNetworkAccountCatalog> {
      assertSnapshotBoundToContext(context);
      if (context.planeKey !== "mesh")
        deny(
          "EXPERIENCE_MESH_CONTEXT_REQUIRED",
          "Network accounts are available only in Mesh",
        );
      const repository = options.repositories.require("mesh"),
        rows = await repository.readNetworkAccounts(context),
        scopes = context.permissions.authorizationScopes;
      const tenantWide = scopes.some((scope) => scope.tenantWide),
        accountIds = new Set(
          scopes.flatMap((scope) => scope.networkMembershipIds),
        );
      const visible = rows.filter(
        (row) => tenantWide || accountIds.has(row.id),
      );
      const relatedCounts = new Map<string, number>();
      for (const row of visible) {
        const key = row.canonicalPartyId ?? row.id;
        relatedCounts.set(key, (relatedCounts.get(key) ?? 0) + 1);
      }
      const accounts = visible.map((row) =>
        Object.freeze({
          networkAccountId: row.id,
          code: row.code,
          displayName: row.displayName,
          ...(row.legalName ? { legalName: row.legalName } : {}),
          role: row.role,
          ...(row.countryCode ? { countryCode: row.countryCode } : {}),
          ...(row.defaultCurrency
            ? { defaultCurrency: row.defaultCurrency }
            : {}),
          ...(row.logoAssetRef ? { logoAssetRef: row.logoAssetRef } : {}),
          source: row.source,
          relatedAccountCount:
            relatedCounts.get(row.canonicalPartyId ?? row.id) ?? 1,
        }),
      );
      return Object.freeze({
        schemaVersion: 1,
        revision: revision({
          tenantId: context.tenantId,
          auth: authorizationRevision(context),
          rows: visible,
        }),
        tenantId: context.tenantId,
        accounts: Object.freeze(accounts),
      });
    },
  });
}

export function createExperienceInvalidationHooks(
  cache: ExperienceCache,
): ExperienceInvalidationHooks {
  const invalidate = (...values: string[]) =>
    Promise.resolve(cache.invalidate(values));
  const hooks: ExperienceInvalidationHooks = {
    profileChanged: (plane, tenant, principal) =>
      invalidate(
        `${plane}:profile`,
        `${plane}:tenant:${tenant}`,
        ...(principal ? [`${plane}:principal:${principal}`] : []),
      ),
    catalogChanged: (plane) => invalidate(`${plane}:catalog`),
    planChanged: (plane, tenant) =>
      invalidate(
        `${plane}:plan`,
        ...(tenant ? [`${plane}:tenant:${tenant}`] : []),
      ),
    flagChanged: (plane, tenant) =>
      invalidate(
        `${plane}:flag`,
        ...(tenant ? [`${plane}:tenant:${tenant}`] : []),
      ),
    membershipChanged: (plane, tenant, principal) =>
      invalidate(
        `${plane}:membership`,
        `${plane}:tenant:${tenant}`,
        `${plane}:principal:${principal}`,
      ),
    authorizationChanged: (plane, tenant, principal) =>
      invalidate(
        `${plane}:authorization`,
        `${plane}:tenant:${tenant}`,
        `${plane}:principal:${principal}`,
      ),
  };
  return Object.freeze(hooks);
}

export function createMemoryExperienceCache(
  maxEntries = 1_000,
): ExperienceCache {
  let generation = 0;
  const entries = new Map<
    string,
    { value: unknown; tags: readonly string[] }
  >();
  return {
    get generation() { return generation; },
    get: (key) => entries.get(key)?.value,
    set(key, value, entryTags, expectedGeneration) {
      if (expectedGeneration !== undefined && expectedGeneration !== generation) return;
      entries.set(key, { value, tags: [...entryTags] });
      if (entries.size > maxEntries)
        entries.delete(entries.keys().next().value as string);
    },
    invalidate(changed) {
      generation++;
      const set = new Set(changed);
      for (const [key, entry] of entries)
        if (entry.tags.some((tag) => set.has(tag))) entries.delete(key);
    },
  };
}

function assertSnapshotBoundToContext(context: VerifiedRequestContext): void {
  const snapshot = context.permissions;
  if (
    snapshot.planeKey !== context.planeKey ||
    snapshot.tenantId !== context.tenantId ||
    snapshot.principalId !== context.principalId ||
    snapshot.profileHash !== context.profileHash
  ) {
    deny(
      "EXPERIENCE_AUTH_CONTEXT_MISMATCH",
      "The verified authorization snapshot does not match the request context",
    );
  }
}

function deny(code: string, message: string): never {
  throw new ExperienceAccessError(403, code, message);
}
function requireSurfaceAuthority(context: VerifiedRequestContext): void {
  if (
    context.planeKey !== "studio" ||
    !context.permissions.allowed.includes("studio.platform.catalog.manage")
  )
    deny(
      "EXPERIENCE_SURFACE_FORBIDDEN",
      "Surface authoring and publication require Studio catalog authority",
    );
}
function unavailable(message: string): never {
  throw Object.assign(new Error(message), {
    code: "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE",
  });
}
function contextForPlane(
  context: VerifiedRequestContext,
  planeKey: VerifiedRequestContext["planeKey"],
): VerifiedRequestContext {
  return {
    ...context,
    planeKey,
    permissions: { ...context.permissions, planeKey },
  };
}
function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function authorizationRevision(context: VerifiedRequestContext) {
  return {
    principalFingerprint: context.permissions.principalFingerprint,
    profileHash: context.profileHash,
    schemaHash: context.permissions.schemaHash,
    resolvedAt: context.permissions.resolvedAt,
  };
}
function revision(value: unknown): string {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function tags(context: VerifiedRequestContext): string[] {
  return [
    `${context.planeKey}:profile`,
    `${context.planeKey}:catalog`,
    `${context.planeKey}:plan`,
    `${context.planeKey}:flag`,
    `${context.planeKey}:membership`,
    `${context.planeKey}:authorization`,
    `${context.planeKey}:tenant:${context.tenantId}`,
    `${context.planeKey}:principal:${context.principalId}`,
  ];
}
async function cache(
  store: ExperienceCache | undefined,
  key: string,
  value: ExperienceBootstrap,
  entryTags: readonly string[],
  expectedGeneration?: number,
) {
  await store?.set(key, value, entryTags, expectedGeneration);
}
function isBootstrap(value: unknown): value is ExperienceBootstrap {
  return Boolean(
    value &&
    typeof value === "object" &&
    Reflect.get(value, "schemaVersion") === 1 &&
    ["ready", "context_not_ready"].includes(
      String(Reflect.get(value, "state")),
    ),
  );
}

async function readProfileOrDefault(
  read: (context: VerifiedRequestContext) => Promise<{
    tenant?: Readonly<Record<string, unknown>>;
    principal?: Readonly<Record<string, unknown>>;
  }>,
  context: VerifiedRequestContext,
): Promise<{
  readonly profile: ExperienceProfile;
  readonly localization: ExperienceLocalization;
}> {
  try {
    const row = await read(context),
      tenant = row.tenant ?? {},
      principal = row.principal ?? {};
    const profile: ExperienceProfile = {
      localeCode:
        text(principal.localeCode) ??
        text(tenant.localeCode) ??
        PLATFORM_PROFILE.localeCode,
      languageCode:
        text(principal.languageCode) ??
        text(tenant.languageCode) ??
        PLATFORM_PROFILE.languageCode,
      timezoneCode:
        text(principal.timezoneCode) ??
        text(tenant.timezoneCode) ??
        PLATFORM_PROFILE.timezoneCode,
      dateFormat:
        text(principal.dateFormat) ??
        text(tenant.dateFormat) ??
        PLATFORM_PROFILE.dateFormat,
      numberFormat:
        text(principal.numberFormat) ??
        text(tenant.numberFormat) ??
        PLATFORM_PROFILE.numberFormat,
      weekStart:
        integer(principal.weekStart, 0, 6) ??
        integer(tenant.weekStart, 0, 6) ??
        PLATFORM_PROFILE.weekStart,
      weekendDays: days(tenant.weekendDays) ?? PLATFORM_PROFILE.weekendDays,
      appearanceMode:
        appearance(principal.appearanceMode) ?? PLATFORM_PROFILE.appearanceMode,
      densityCode:
        density(principal.densityCode) ?? PLATFORM_PROFILE.densityCode,
    };
    return {
      profile,
      localization: effectiveLocalization(
        profile,
        sourceOf(principal, tenant, "localeCode"),
      ),
    };
  } catch {
    return {
      profile: PLATFORM_PROFILE,
      localization: effectiveLocalization(PLATFORM_PROFILE, "platform"),
    };
  }
}

function contextNotReady(
  context: VerifiedRequestContext,
  profile: ExperienceProfile,
  localization: ExperienceLocalization,
  localePolicy: ExperienceLocalePolicy,
  presentation: Pick<ExperienceBootstrap, "identity" | "tenant">,
  fingerprint: string,
): ExperienceBootstrap {
  return {
    schemaVersion: 1,
    state: "context_not_ready",
    planeKey: context.planeKey,
    tenantId: context.tenantId,
    principalId: context.principalId,
    revision: fingerprint,
    ...presentation,
    profile,
    localization,
    localePolicy,
    workspaces: [],
    permissions: [],
    features: {},
    nextActions: ["retry_later"],
  };
}
function sourceOf(
  principal: Readonly<Record<string, unknown>>,
  tenant: Readonly<Record<string, unknown>>,
  key: string,
): "principal" | "tenant" | "platform" {
  return text(principal[key])
    ? "principal"
    : text(tenant[key])
      ? "tenant"
      : "platform";
}
function effectiveLocalization(
  profile: ExperienceProfile,
  source: "principal" | "tenant" | "platform",
): ExperienceLocalization {
  const uiLocale = canonicalLocale(
    profile.localeCode,
    canonicalLocale(profile.languageCode, "en-US"),
  );
  const locale = new Intl.Locale(uiLocale),
    language = locale.language.toLowerCase();
  const catalogLocale = matchSupportedLocale(uiLocale, SUPPORTED_UI_LOCALES);
  const direction = textDirection(catalogLocale);
  const numberingSystem = validNumberingSystem(profile.numberFormat)
    ? profile.numberFormat.toLowerCase()
    : locale.numberingSystem || "latn";
  return Object.freeze({
    uiLocale,
    catalogLocale,
    formatLocale: uiLocale,
    direction,
    timeZone: validTimeZone(profile.timezoneCode)
      ? profile.timezoneCode
      : "UTC",
    calendar: locale.calendar || "gregory",
    numberingSystem,
    weekStart: profile.weekStart,
    weekendDays: Object.freeze([...profile.weekendDays]),
    fallbackLocales: Object.freeze([...new Set([uiLocale, language, "en"])]),
    catalogRevision: "platform-ui:1",
    source: Object.freeze({ uiLocale: source, formatLocale: source }),
  });
}
function canonicalLocale(value: string, fallback: string): string {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? fallback;
  } catch {
    return fallback;
  }
}
function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function validNumberingSystem(value: string): boolean {
  try {
    return (
      new Intl.NumberFormat("en", { numberingSystem: value })
        .resolvedOptions()
        .numberingSystem.toLowerCase() === value.toLowerCase()
    );
  } catch {
    return false;
  }
}
function normalizeLocalePolicy(
  planeKey: VerifiedRequestContext["planeKey"],
  row:
    | {
        readonly catalogs?: readonly ExperienceLocaleCatalogGovernanceRecord[];
        readonly enabledLocales: readonly string[];
        readonly defaultLocale: string;
        readonly fallbackLocale: string;
        readonly revision: string;
      }
    | undefined,
): ExperienceLocalePolicy {
  const requestedEnabled = new Set(
    (row?.enabledLocales ?? ["en"]).filter(isSupportedLocale),
  );
  requestedEnabled.add("en");
  const governance = new Map(
    (row?.catalogs ?? [])
      .filter((item) => isSupportedLocale(item.localeCode))
      .map((item) => [item.localeCode as SupportedLocale, item]),
  );
  const catalogs = LOCALE_REGISTRY.map(
    (definition): ExperienceLocaleCatalog => {
      const persisted = governance.get(definition.code);
      const compatibilityQualified =
        !persisted &&
        (definition.code === "en" || !row?.catalogs) &&
        requestedEnabled.has(definition.code);
      const status =
        validCatalogStatus(persisted?.status) ??
        (compatibilityQualified ? "qualified" : "draft");
      const coveragePct =
        validCoverage(persisted?.coveragePct) ??
        (compatibilityQualified ? 100 : 0);
      const linguisticReviewPassed =
        persisted ? persisted.linguisticReviewPassed === true : compatibilityQualified;
      const layoutReviewPassed =
        persisted ? persisted.layoutReviewPassed === true : compatibilityQualified;
      const automatedTestsPassed =
        persisted ? persisted.automatedTestsPassed === true : compatibilityQualified;
      const qualified =
        status === "qualified" &&
        coveragePct === 100 &&
        linguisticReviewPassed &&
        layoutReviewPassed &&
        automatedTestsPassed;
      return Object.freeze({
        localeCode: definition.code,
        englishName: definition.englishName,
        nativeName: definition.nativeName,
        direction: definition.direction,
        rolloutWave: definition.rolloutWave,
        status,
        coveragePct,
        linguisticReviewPassed,
        layoutReviewPassed,
        automatedTestsPassed,
        qualified,
      });
    },
  );
  const qualified = new Set(
    catalogs
      .filter((catalog) => catalog.qualified)
      .map((catalog) => catalog.localeCode),
  );
  qualified.add("en");
  const enabled = LOCALE_REGISTRY.map((item) => item.code).filter(
    (code) => requestedEnabled.has(code) && qualified.has(code),
  );
  if (!enabled.includes("en")) enabled.unshift("en");
  const defaultLocale =
    isSupportedLocale(row?.defaultLocale) && enabled.includes(row.defaultLocale)
      ? row.defaultLocale
      : "en";
  return Object.freeze({
    planeKey,
    catalogs: Object.freeze(catalogs),
    enabledLocales: Object.freeze(enabled),
    defaultLocale,
    fallbackLocale: "en",
    revision: row?.revision ?? "locale-policy:default",
  });
}
function validateLocalePolicyInput(
  planeKey: VerifiedRequestContext["planeKey"],
  input: {
    readonly catalogs: readonly ExperienceLocaleCatalogGovernanceRecord[];
    readonly enabledLocales: readonly string[];
    readonly defaultLocale: string;
    readonly fallbackLocale: string;
  },
): ExperienceLocalePolicy {
  const rows = new Map<
    SupportedLocale,
    ExperienceLocaleCatalogGovernanceRecord
  >();
  for (const row of input.catalogs) {
    if (!isSupportedLocale(row.localeCode) || rows.has(row.localeCode))
      throw invalidLocalePolicy(
        "Catalog governance must contain each registered locale exactly once",
      );
    rows.set(row.localeCode, row);
  }
  if (rows.size !== SUPPORTED_UI_LOCALES.length)
    throw invalidLocalePolicy(
      "Catalog governance must contain every registered locale",
    );
  const catalogs = LOCALE_REGISTRY.map(
    (definition): ExperienceLocaleCatalog => {
      const row = rows.get(definition.code)!;
      const status = validCatalogStatus(row.status),
        coveragePct = validCoverage(row.coveragePct);
      if (!status || coveragePct === undefined)
        throw invalidLocalePolicy(
          `Catalog governance is invalid for ${definition.code}`,
        );
      const qualified =
        status === "qualified" &&
        coveragePct === 100 &&
        row.linguisticReviewPassed &&
        row.layoutReviewPassed &&
        row.automatedTestsPassed;
      if (status === "qualified" && !qualified)
        throw invalidLocalePolicy(
          `${definition.englishName} cannot be qualified until coverage and every review gate pass`,
        );
      return Object.freeze({
        localeCode: definition.code,
        englishName: definition.englishName,
        nativeName: definition.nativeName,
        direction: definition.direction,
        rolloutWave: definition.rolloutWave,
        status,
        coveragePct,
        linguisticReviewPassed: row.linguisticReviewPassed,
        layoutReviewPassed: row.layoutReviewPassed,
        automatedTestsPassed: row.automatedTestsPassed,
        qualified,
      });
    },
  );
  const enabled = [...new Set(input.enabledLocales)];
  if (
    input.fallbackLocale !== "en" ||
    !enabled.includes("en") ||
    enabled.some((code) => !isSupportedLocale(code))
  )
    throw invalidLocalePolicy("English must remain enabled as the fallback");
  const qualified = new Set(
    catalogs
      .filter((catalog) => catalog.qualified)
      .map((catalog) => catalog.localeCode),
  );
  if (enabled.some((code) => !qualified.has(code as SupportedLocale)))
    throw invalidLocalePolicy("Only fully qualified catalogs can be activated");
  if (
    !isSupportedLocale(input.defaultLocale) ||
    !enabled.includes(input.defaultLocale)
  )
    throw invalidLocalePolicy("The default locale must be enabled");
  return Object.freeze({
    planeKey,
    catalogs: Object.freeze(catalogs),
    enabledLocales: Object.freeze(enabled as SupportedLocale[]),
    defaultLocale: input.defaultLocale,
    fallbackLocale: "en",
    revision: "pending",
  });
}
function applyLocalePolicy(
  resolved: {
    readonly profile: ExperienceProfile;
    readonly localization: ExperienceLocalization;
  },
  policy: ExperienceLocalePolicy,
): {
  readonly profile: ExperienceProfile;
  readonly localization: ExperienceLocalization;
} {
  const catalog = catalogCodeForLocale(resolved.profile.localeCode);
  if (
    resolved.localization.source.uiLocale === "principal" &&
    catalog &&
    policy.enabledLocales.includes(catalog)
  ) return resolved;
  // Preserve regional formatting when the inherited locale matches the policy default.
  if (
    resolved.localization.source.uiLocale !== "principal" &&
    catalog === policy.defaultLocale
  ) return resolved;
  const profile = Object.freeze({
    ...resolved.profile,
    localeCode: policy.defaultLocale,
    languageCode: new Intl.Locale(policy.defaultLocale).language,
  });
  return { profile, localization: effectiveLocalization(profile, "tenant") };
}
function catalogCodeForLocale(value: string): SupportedLocale | undefined {
  const canonical = canonicalLocale(value, "");
  if (!canonical) return undefined;
  const match = matchSupportedLocale(canonical, SUPPORTED_UI_LOCALES);
  const requested = new Intl.Locale(canonical),
    matched = new Intl.Locale(match);
  return requested.language === matched.language
    ? (match as SupportedLocale)
    : undefined;
}
function validCatalogStatus(value: unknown): LocaleCatalogStatus | undefined {
  return ["draft", "translating", "review", "qualified", "retired"].includes(
    String(value),
  )
    ? (value as LocaleCatalogStatus)
    : undefined;
}
function validCoverage(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100
    ? Number(value)
    : undefined;
}
function invalidLocalePolicy(message: string): ExperienceAccessError {
  return new ExperienceAccessError(
    400,
    "EXPERIENCE_LOCALE_POLICY_INVALID",
    message,
  );
}
function identityPresentation(
  context: VerifiedRequestContext,
  identity: import("./ports.js").ExperienceIdentityRecord,
): Pick<ExperienceBootstrap, "identity" | "tenant"> {
  const displayName =
    cleanDisplay(identity.principalDisplayName) ??
    cleanDisplay(identity.principalCode) ??
    "Account";
  return {
    identity: Object.freeze({
      displayName,
      ...(cleanDisplay(identity.principalSecondaryLabel)
        ? { secondaryLabel: cleanDisplay(identity.principalSecondaryLabel) }
        : {}),
      initials: initials(displayName),
    }),
    tenant: Object.freeze({
      id: context.tenantId,
      code: identity.tenantCode,
      displayName:
        cleanDisplay(identity.tenantDisplayName) ?? identity.tenantCode,
      ...(identity.tenantCountryCode
        ? { countryCode: identity.tenantCountryCode }
        : {}),
      ...(identity.tenantLogoAssetRef
        ? { logoAssetRef: identity.tenantLogoAssetRef }
        : {}),
    }),
  };
}
function cleanDisplay(value: string | undefined): string | undefined {
  const clean = value?.trim().replace(/\s+/g, " ");
  return clean ? clean.slice(0, 256) : undefined;
}
function initials(value: string): string {
  const parts = value.trim().split(/\s+/u).filter(Boolean);
  const chosen = parts.length > 1 ? [parts[0]!, parts.at(-1)!] : parts;
  return (
    chosen
      .map((part) => Array.from(part)[0] ?? "")
      .join("")
      .toLocaleUpperCase()
      .slice(0, 8) || "A"
  );
}
function capabilityGroups(
  codes: readonly string[],
): readonly NeonCapabilityGroup[] {
  const groups = new Set<NeonCapabilityGroup>();
  for (const code of codes) {
    const lower = code.toLowerCase();
    if (/finance|account|ledger|journal|invoice|payment|tax/.test(lower))
      groups.add("finance");
    if (/procure|purchase|supplier|sourcing|contract/.test(lower))
      groups.add("procurement");
    if (/inventory|warehouse|stock/.test(lower)) groups.add("inventory");
    if (/sales|customer|order|crm/.test(lower)) groups.add("sales");
    if (/people|employee|payroll|workforce|hr\./.test(lower))
      groups.add("people");
    if (/project|task|wbs/.test(lower)) groups.add("projects");
  }
  return Object.freeze([...groups].sort());
}
function operatingOrganizationCapabilities(
  domain: string,
): readonly NeonOperatingOrganizationCapability[] {
  const capabilities: NeonOperatingOrganizationCapability[] = [];
  if (domain === "procurement" || domain === "both")
    capabilities.push("procurement");
  if (domain === "sales" || domain === "both") capabilities.push("sales");
  if (domain === "shared_services") capabilities.push("shared_services");
  return Object.freeze(capabilities);
}
function resolveWorkspaces(
  catalog: ExperienceCatalogRecord,
): readonly ExperienceWorkspace[] {
  const groups = new Map<
    string,
    ExperienceWorkspace & { modules: ExperienceModule[] }
  >();
  for (const row of [...catalog.associations].sort(
    (a, b) =>
      a.workspaceSortOrder - b.workspaceSortOrder ||
      a.workspaceCode.localeCompare(b.workspaceCode) ||
      a.moduleSortOrder - b.moduleSortOrder ||
      a.moduleCode.localeCompare(b.moduleCode),
  )) {
    if (row.workspaceSharedInfrastructure) continue;
    let group = groups.get(row.workspaceCode);
    if (!group) {
      group = {
        code: row.workspaceCode,
        name: row.workspaceName,
        ...(row.workspaceIconKey ? { iconKey: row.workspaceIconKey } : {}),
        sortOrder: row.workspaceSortOrder,
        modules: [],
      };
      groups.set(row.workspaceCode, group);
    }
    group.modules.push({
      code: row.moduleCode,
      name: row.moduleName,
      ...(row.moduleIconKey ? { iconKey: row.moduleIconKey } : {}),
      sortOrder: row.moduleSortOrder,
      primary: row.primary,
    });
  }
  return [...groups.values()];
}

function resolveFeatures(
  rows: readonly ExperienceFeatureRecord[],
  tenantId: string,
  moduleIds: ReadonlySet<string>,
  clientVersion?: string,
): Readonly<Record<string, EffectiveFeature>> {
  const output: Record<string, EffectiveFeature> = {};
  for (const row of [...rows].sort((a, b) => a.code.localeCompare(b.code))) {
    if (row.moduleId && !moduleIds.has(row.moduleId)) continue;
    const minimum = text(row.metadata.minimumClientVersion);
    const maximum = text(row.metadata.maximumClientVersion);
    if (
      (minimum &&
        (!clientVersion || compareVersions(clientVersion, minimum) < 0)) ||
      (maximum &&
        (!clientVersion || compareVersions(clientVersion, maximum) > 0))
    ) {
      output[row.code] = {
        code: row.code,
        enabled: false,
        source: "version_constraint",
      };
      continue;
    }
    let enabled = row.defaultEnabled,
      source: EffectiveFeature["source"] = "catalog_default";
    if (row.rolloutPct !== undefined) {
      enabled = enabled && cohort(tenantId, row.code) < row.rolloutPct;
      source = "rollout";
    }
    if (row.kind === "kill_switch") {
      enabled = enabled && row.overrideEnabled !== false;
      source = "kill_switch";
    } else if (row.overrideEnabled !== undefined) {
      enabled = row.overrideEnabled;
      source = "tenant_override";
    }
    output[row.code] = { code: row.code, enabled, source };
  }
  return Object.freeze(output);
}
function cohort(tenantId: string, code: string): number {
  return (
    Number.parseInt(
      createHash("sha256")
        .update(`${tenantId}:${code}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) % 100
  );
}
function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .replace(/^v/, "")
      .split(".")
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10));
  const a = parse(left),
    b = parse(right);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return -1;
  for (let i = 0; i < 3; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function integer(value: unknown, min: number, max: number): number | undefined {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : undefined;
}
function days(value: unknown): readonly number[] | undefined {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => integer(item, 0, 6) !== undefined)
    ? [...new Set(value as number[])]
    : undefined;
}
function appearance(
  value: unknown,
): ExperienceProfile["appearanceMode"] | undefined {
  return ["system", "light", "dark", "high_contrast"].includes(String(value))
    ? (value as ExperienceProfile["appearanceMode"])
    : undefined;
}
function density(value: unknown): ExperienceProfile["densityCode"] | undefined {
  return ["comfortable", "compact"].includes(String(value))
    ? (value as ExperienceProfile["densityCode"])
    : undefined;
}
function revisionForLayer(
  rows: readonly ExperienceSurfaceProjectionRecord[],
  layer: "shared" | "tenant",
): Readonly<{ sharedRevision?: number; tenantRevision?: number }> {
  const revision = rows.find((row) => row.layer === layer)?.sourceRevision;
  return revision === undefined
    ? {}
    : layer === "shared"
      ? { sharedRevision: revision }
      : { tenantRevision: revision };
}

function assertIdentityAdmission(
  context: VerifiedRequestContext,
  identity: ExperienceIdentityRecord | undefined,
): asserts identity is ExperienceIdentityRecord {
  if (!identity)
    deny(
      "EXPERIENCE_IDENTITY_NOT_FOUND",
      "The verified identity is not present in this plane",
    );
  if (identity.tenantRealmKey !== context.realmKey)
    deny(
      "EXPERIENCE_REALM_MISMATCH",
      "The tenant is not bound to the verified realm",
    );
  if (identity.tenantStatus !== "active")
    deny("EXPERIENCE_TENANT_INACTIVE", "The tenant is not active");
  if (
    identity.principalStatus !== "active" ||
    identity.principalAuthEpoch !== context.authEpoch
  )
    deny(
      "EXPERIENCE_PRINCIPAL_INACTIVE",
      "The principal is inactive or its authorization epoch changed",
    );
  if (!identity.identityBindingActive)
    deny(
      "EXPERIENCE_IDENTITY_BINDING_INVALID",
      "No active identity binding exists for the verified realm",
    );
  if (!identity.membershipActive)
    deny(
      "EXPERIENCE_MEMBERSHIP_INACTIVE",
      "The principal has no active membership in this plane",
    );
}
