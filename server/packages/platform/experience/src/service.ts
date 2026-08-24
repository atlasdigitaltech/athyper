import { createHash } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EffectiveFeature, ExperienceBootstrap, ExperienceModule, ExperienceProfile, ExperienceWorkspace, MeshNetworkAccountCatalog, NeonCapabilityGroup, NeonOperatingOrganizationCapability, NeonOperatingOrganizationCatalog, NeonWorkContextBootstrap } from "./contracts.js";
import type { ExperienceCache, ExperienceCatalogRecord, ExperienceFeatureRecord, ExperienceInvalidationHooks, ExperienceRepositoryProvider } from "./ports.js";

export class ExperienceAccessError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "ExperienceAccessError"; }
}

export interface ExperienceServiceOptions {
  readonly repositories: ExperienceRepositoryProvider;
  readonly cache?: ExperienceCache;
  readonly now?: () => Date;
}

const PLATFORM_PROFILE: ExperienceProfile = Object.freeze({
  localeCode: "en-US", languageCode: "en", timezoneCode: "UTC", dateFormat: "yyyy-MM-dd", numberFormat: "latn",
  weekStart: 1, weekendDays: Object.freeze([0, 6]), appearanceMode: "system", densityCode: "comfortable",
});

export function createExperienceService(options: ExperienceServiceOptions) {
  const now = options.now ?? (() => new Date());
  return Object.freeze({
    async bootstrap(context: VerifiedRequestContext, input: { readonly clientVersion?: string } = {}): Promise<ExperienceBootstrap> {
      assertSnapshotBoundToContext(context);
      const repository = options.repositories.require(context.planeKey);
      const cacheKey = `experience:${context.planeKey}:${context.tenantId}:${context.principalId}:${context.authEpoch}:${context.profileHash}:${input.clientVersion ?? "-"}`;
      const cached = await options.cache?.get(cacheKey);
      if (isBootstrap(cached)) return cached;
      const at = now();
      const identity = await repository.readIdentity(context, at);
      if (!identity) deny("EXPERIENCE_IDENTITY_NOT_FOUND", "The verified identity is not present in this plane");
      if (identity.tenantRealmKey !== context.realmKey) deny("EXPERIENCE_REALM_MISMATCH", "The tenant is not bound to the verified realm");
      if (identity.tenantStatus !== "active") deny("EXPERIENCE_TENANT_INACTIVE", "The tenant is not active");
      if (identity.principalStatus !== "active" || identity.principalAuthEpoch !== context.authEpoch) deny("EXPERIENCE_PRINCIPAL_INACTIVE", "The principal is inactive or its authorization epoch changed");
      if (!identity.identityBindingActive) deny("EXPERIENCE_IDENTITY_BINDING_INVALID", "No active identity binding exists for the verified realm");
      if (!identity.membershipActive) deny("EXPERIENCE_MEMBERSHIP_INACTIVE", "The principal has no active membership in this plane");

      const profile = await readProfileOrDefault(repository.readProfile.bind(repository), context);
      const presentation = identityPresentation(context, identity);
      if (!identity.subscriptionPlanId) {
        const result = contextNotReady(context, profile, presentation, revision({ identity, auth: authorizationRevision(context) }));
        await cache(options.cache, cacheKey, result, tags(context));
        return result;
      }
      const catalog = await repository.readCatalog(context, identity.subscriptionPlanId);
      if (!catalog?.planActive) {
        const result = contextNotReady(context, profile, presentation, revision({ identity, plan: catalog?.planRevision ?? "missing", auth: authorizationRevision(context) }));
        await cache(options.cache, cacheKey, result, tags(context));
        return result;
      }
      let featureRows: readonly ExperienceFeatureRecord[] = [];
      try { featureRows = await repository.readFeatures(context, at); } catch { /* Unknown flags are unavailable by default. */ }
      const entitledModuleIds = new Set(catalog.associations.map((row) => row.moduleId));
      const features = resolveFeatures(featureRows, context.tenantId, entitledModuleIds, input.clientVersion);
      const workspaces = resolveWorkspaces(catalog);
      const knownPermissions = new Map(catalog.permissions.map((permission) => [permission.code, permission.moduleId]));
      const permissions = [...new Set(context.permissions.allowed.filter((code) => {
        const moduleId = knownPermissions.get(code);
        return moduleId !== undefined && entitledModuleIds.has(moduleId);
      }))].sort();
      const result: ExperienceBootstrap = {
        schemaVersion: 1, state: "ready", planeKey: context.planeKey, tenantId: context.tenantId, principalId: context.principalId,
        revision: revision({ identity, profile, plan: catalog.planRevision, catalog: [...catalog.associations, ...catalog.permissions], features: featureRows, auth: authorizationRevision(context) }),
        ...presentation, profile, workspaces, permissions, features, nextActions: [],
      };
      await cache(options.cache, cacheKey, result, tags(context));
      return result;
    },
    async neonWorkContexts(context: VerifiedRequestContext): Promise<NeonWorkContextBootstrap> {
      assertSnapshotBoundToContext(context);
      if (context.planeKey !== "neon") deny("EXPERIENCE_NEON_CONTEXT_REQUIRED", "Company work contexts are available only in Neon");
      const repository = options.repositories.require("neon");
      const rows = await repository.readWorkContexts(context);
      const scopes = context.permissions.authorizationScopes;
      const tenantWide = scopes.some((scope) => scope.tenantWide);
      const companyIds = new Set(scopes.flatMap((scope) => scope.companyCodeIds));
      const legalEntityIds = new Set(scopes.flatMap((scope) => scope.legalEntityIds));
      const visible = rows.filter((row) => tenantWide || companyIds.has(row.companyCodeId) || legalEntityIds.has(row.legalEntityId));
      const companies = visible.map((row) => ({
        companyCodeId: row.companyCodeId, code: row.companyCode, displayName: row.companyDisplayName,
        legalEntityId: row.legalEntityId, legalEntityCode: row.legalEntityCode, legalEntityName: row.legalEntityName,
        ...(row.countryCode ? { countryCode: row.countryCode } : {}), functionalCurrency: row.functionalCurrency,
        capabilityGroups: capabilityGroups(scopes.filter((scope) => scope.tenantWide || scope.companyCodeIds.includes(row.companyCodeId) || scope.legalEntityIds.includes(row.legalEntityId)).map((scope) => scope.permissionCode)),
      }));
      return Object.freeze({ schemaVersion: 1, revision: revision({ tenantId: context.tenantId, auth: authorizationRevision(context), rows: visible }), tenantId: context.tenantId, supportsAllPermitted: companies.length > 1, companies: Object.freeze(companies) });
    },
    async neonOperatingOrganizations(context: VerifiedRequestContext): Promise<NeonOperatingOrganizationCatalog> {
      assertSnapshotBoundToContext(context);
      if (context.planeKey !== "neon") deny("EXPERIENCE_NEON_CONTEXT_REQUIRED", "Operating organizations are available only in Neon");
      const repository=options.repositories.require("neon"),at=now();
      const [organizations,companies]=await Promise.all([repository.readOperatingOrganizations(context,at),repository.readWorkContexts(context)]);
      const scopes=context.permissions.authorizationScopes;
      const tenantWide=scopes.some((scope)=>scope.tenantWide);
      const companyIds=new Set(scopes.flatMap((scope)=>scope.companyCodeIds));
      const legalEntityIds=new Set(scopes.flatMap((scope)=>scope.legalEntityIds));
      const permittedCompanies=new Set(companies.filter((company)=>tenantWide||companyIds.has(company.companyCodeId)||legalEntityIds.has(company.legalEntityId)).map((company)=>company.companyCodeId));
      const organizationIds=new Set(scopes.flatMap((scope)=>scope.operatingOrganizationIds));
      const visible=organizations.flatMap((organization)=>{
        if(!tenantWide&&!organizationIds.has(organization.id))return[];
        const assignments=organization.assignments.filter((assignment)=>permittedCompanies.has(assignment.companyCodeId));
        if(!assignments.length)return[];
        return [{id:organization.id,code:organization.code,displayName:organization.displayName,domain:organization.domain,...(organization.parentId?{parentId:organization.parentId}:{}),path:organization.path,capabilities:operatingOrganizationCapabilities(organization.domain),procurementProfileConfigured:organization.procurementProfileConfigured,salesProfileConfigured:organization.salesProfileConfigured,companyAssignments:Object.freeze(assignments.map((assignment)=>({companyCodeId:assignment.companyCodeId,participationRole:assignment.participationRole,effectiveFrom:assignment.effectiveFrom,...(assignment.effectiveUntil?{effectiveUntil:assignment.effectiveUntil}:{})}))),defaults:Object.freeze({...(organization.leadCompanyCodeId&&permittedCompanies.has(organization.leadCompanyCodeId)?{leadCompanyCodeId:organization.leadCompanyCodeId}:{}),...(organization.bookingCompanyCodeId&&permittedCompanies.has(organization.bookingCompanyCodeId)?{bookingCompanyCodeId:organization.bookingCompanyCodeId}:{}),...(organization.invoicingCompanyCodeId&&permittedCompanies.has(organization.invoicingCompanyCodeId)?{invoicingCompanyCodeId:organization.invoicingCompanyCodeId}:{}),...(organization.defaultCurrency?{currency:organization.defaultCurrency}:{})})}];
      });
      return Object.freeze({schemaVersion:1,revision:revision({tenantId:context.tenantId,effectiveAt:at.toISOString(),auth:authorizationRevision(context),rows:visible}),tenantId:context.tenantId,effectiveAt:at.toISOString(),organizations:Object.freeze(visible)});
    },
    async meshNetworkAccounts(context: VerifiedRequestContext): Promise<MeshNetworkAccountCatalog> {
      assertSnapshotBoundToContext(context);
      if(context.planeKey!=="mesh")deny("EXPERIENCE_MESH_CONTEXT_REQUIRED","Network accounts are available only in Mesh");
      const repository=options.repositories.require("mesh"),rows=await repository.readNetworkAccounts(context),scopes=context.permissions.authorizationScopes;
      const tenantWide=scopes.some((scope)=>scope.tenantWide),accountIds=new Set(scopes.flatMap((scope)=>scope.networkMembershipIds));
      const visible=rows.filter((row)=>tenantWide||accountIds.has(row.id));
      const relatedCounts=new Map<string,number>();
      for(const row of visible){const key=row.canonicalPartyId??row.id;relatedCounts.set(key,(relatedCounts.get(key)??0)+1);}
      const accounts=visible.map((row)=>Object.freeze({networkAccountId:row.id,code:row.code,displayName:row.displayName,...(row.legalName?{legalName:row.legalName}:{}),role:row.role,...(row.countryCode?{countryCode:row.countryCode}:{}),...(row.defaultCurrency?{defaultCurrency:row.defaultCurrency}:{}),source:row.source,relatedAccountCount:relatedCounts.get(row.canonicalPartyId??row.id)??1}));
      return Object.freeze({schemaVersion:1,revision:revision({tenantId:context.tenantId,auth:authorizationRevision(context),rows:visible}),tenantId:context.tenantId,accounts:Object.freeze(accounts)});
    },
  });
}

export function createExperienceInvalidationHooks(cache: ExperienceCache): ExperienceInvalidationHooks {
  const invalidate = (...values: string[]) => Promise.resolve(cache.invalidate(values));
  const hooks: ExperienceInvalidationHooks = {
    profileChanged: (plane, tenant, principal) => invalidate(`${plane}:profile`, `${plane}:tenant:${tenant}`, ...(principal ? [`${plane}:principal:${principal}`] : [])),
    catalogChanged: (plane) => invalidate(`${plane}:catalog`),
    planChanged: (plane, tenant) => invalidate(`${plane}:plan`, ...(tenant ? [`${plane}:tenant:${tenant}`] : [])),
    flagChanged: (plane, tenant) => invalidate(`${plane}:flag`, ...(tenant ? [`${plane}:tenant:${tenant}`] : [])),
    membershipChanged: (plane, tenant, principal) => invalidate(`${plane}:membership`, `${plane}:tenant:${tenant}`, `${plane}:principal:${principal}`),
    authorizationChanged: (plane, tenant, principal) => invalidate(`${plane}:authorization`, `${plane}:tenant:${tenant}`, `${plane}:principal:${principal}`),
  };
  return Object.freeze(hooks);
}

export function createMemoryExperienceCache(maxEntries = 1_000): ExperienceCache {
  const entries = new Map<string, { value: unknown; tags: readonly string[] }>();
  return {
    get: (key) => entries.get(key)?.value,
    set(key, value, entryTags) { entries.set(key, { value, tags: [...entryTags] }); if (entries.size > maxEntries) entries.delete(entries.keys().next().value as string); },
    invalidate(changed) { const set = new Set(changed); for (const [key, entry] of entries) if (entry.tags.some((tag) => set.has(tag))) entries.delete(key); },
  };
}

function assertSnapshotBoundToContext(context: VerifiedRequestContext): void {
  const snapshot = context.permissions;
  if (snapshot.planeKey !== context.planeKey || snapshot.tenantId !== context.tenantId || snapshot.principalId !== context.principalId || snapshot.profileHash !== context.profileHash) {
    deny("EXPERIENCE_AUTH_CONTEXT_MISMATCH", "The verified authorization snapshot does not match the request context");
  }
}

function deny(code: string, message: string): never { throw new ExperienceAccessError(403, code, message); }
function authorizationRevision(context: VerifiedRequestContext) { return { principalFingerprint: context.permissions.principalFingerprint, profileHash: context.profileHash, schemaHash: context.permissions.schemaHash, resolvedAt: context.permissions.resolvedAt }; }
function revision(value: unknown): string { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; return JSON.stringify(value) ?? "null"; }
function tags(context: VerifiedRequestContext): string[] { return [`${context.planeKey}:profile`, `${context.planeKey}:catalog`, `${context.planeKey}:plan`, `${context.planeKey}:flag`, `${context.planeKey}:membership`, `${context.planeKey}:authorization`, `${context.planeKey}:tenant:${context.tenantId}`, `${context.planeKey}:principal:${context.principalId}`]; }
async function cache(store: ExperienceCache | undefined, key: string, value: ExperienceBootstrap, entryTags: readonly string[]) { await store?.set(key, value, entryTags); }
function isBootstrap(value: unknown): value is ExperienceBootstrap { return Boolean(value && typeof value === "object" && Reflect.get(value, "schemaVersion") === 1 && ["ready", "context_not_ready"].includes(String(Reflect.get(value, "state")))); }

async function readProfileOrDefault(read: (context: VerifiedRequestContext) => Promise<{ tenant?: Readonly<Record<string, unknown>>; principal?: Readonly<Record<string, unknown>> }>, context: VerifiedRequestContext): Promise<ExperienceProfile> {
  try {
    const row = await read(context), tenant = row.tenant ?? {}, principal = row.principal ?? {};
    return {
      localeCode: text(principal.localeCode) ?? text(tenant.localeCode) ?? PLATFORM_PROFILE.localeCode,
      languageCode: text(principal.languageCode) ?? text(tenant.languageCode) ?? PLATFORM_PROFILE.languageCode,
      timezoneCode: text(principal.timezoneCode) ?? text(tenant.timezoneCode) ?? PLATFORM_PROFILE.timezoneCode,
      dateFormat: text(principal.dateFormat) ?? text(tenant.dateFormat) ?? PLATFORM_PROFILE.dateFormat,
      numberFormat: text(principal.numberFormat) ?? text(tenant.numberFormat) ?? PLATFORM_PROFILE.numberFormat,
      weekStart: integer(principal.weekStart, 0, 6) ?? integer(tenant.weekStart, 0, 6) ?? PLATFORM_PROFILE.weekStart,
      weekendDays: days(tenant.weekendDays) ?? PLATFORM_PROFILE.weekendDays,
      appearanceMode: appearance(principal.appearanceMode) ?? PLATFORM_PROFILE.appearanceMode,
      densityCode: density(principal.densityCode) ?? PLATFORM_PROFILE.densityCode,
    };
  } catch { return PLATFORM_PROFILE; }
}

function contextNotReady(context: VerifiedRequestContext, profile: ExperienceProfile, presentation: Pick<ExperienceBootstrap,"identity"|"tenant">, fingerprint: string): ExperienceBootstrap { return { schemaVersion: 1, state: "context_not_ready", planeKey: context.planeKey, tenantId: context.tenantId, principalId: context.principalId, revision: fingerprint, ...presentation, profile, workspaces: [], permissions: [], features: {}, nextActions: ["retry_later"] }; }
function identityPresentation(context:VerifiedRequestContext,identity:import("./ports.js").ExperienceIdentityRecord):Pick<ExperienceBootstrap,"identity"|"tenant"> { const displayName=cleanDisplay(identity.principalDisplayName)??cleanDisplay(identity.principalCode)??"Account"; return { identity:Object.freeze({displayName,...(cleanDisplay(identity.principalSecondaryLabel)?{secondaryLabel:cleanDisplay(identity.principalSecondaryLabel)}:{}),initials:initials(displayName)}),tenant:Object.freeze({id:context.tenantId,code:identity.tenantCode,displayName:cleanDisplay(identity.tenantDisplayName)??identity.tenantCode}) }; }
function cleanDisplay(value:string|undefined):string|undefined { const clean=value?.trim().replace(/\s+/g," "); return clean?clean.slice(0,256):undefined; }
function initials(value:string):string { const parts=value.trim().split(/\s+/u).filter(Boolean); const chosen=parts.length>1?[parts[0]!,parts.at(-1)!]:parts; return chosen.map((part)=>Array.from(part)[0]??"").join("").toLocaleUpperCase().slice(0,8)||"A"; }
function capabilityGroups(codes:readonly string[]):readonly NeonCapabilityGroup[] { const groups=new Set<NeonCapabilityGroup>(); for(const code of codes){ const lower=code.toLowerCase(); if(/finance|account|ledger|journal|invoice|payment|tax/.test(lower))groups.add("finance"); if(/procure|purchase|supplier|sourcing|contract/.test(lower))groups.add("procurement"); if(/inventory|warehouse|stock/.test(lower))groups.add("inventory"); if(/sales|customer|order|crm/.test(lower))groups.add("sales"); if(/people|employee|payroll|workforce|hr\./.test(lower))groups.add("people"); if(/project|task|wbs/.test(lower))groups.add("projects"); } return Object.freeze([...groups].sort()); }
function operatingOrganizationCapabilities(domain:string):readonly NeonOperatingOrganizationCapability[]{const capabilities:NeonOperatingOrganizationCapability[]=[];if(domain==="procurement"||domain==="both")capabilities.push("procurement");if(domain==="sales"||domain==="both")capabilities.push("sales");if(domain==="shared_services")capabilities.push("shared_services");return Object.freeze(capabilities);}
function resolveWorkspaces(catalog: ExperienceCatalogRecord): readonly ExperienceWorkspace[] {
  const groups = new Map<string, ExperienceWorkspace & { modules: ExperienceModule[] }>();
  for (const row of [...catalog.associations].sort((a, b) => a.workspaceSortOrder - b.workspaceSortOrder || a.workspaceCode.localeCompare(b.workspaceCode) || a.moduleSortOrder - b.moduleSortOrder || a.moduleCode.localeCompare(b.moduleCode))) {
    let group = groups.get(row.workspaceCode);
    if (!group) { group = { code: row.workspaceCode, name: row.workspaceName, ...(row.workspaceIconKey ? { iconKey: row.workspaceIconKey } : {}), sortOrder: row.workspaceSortOrder, modules: [] }; groups.set(row.workspaceCode, group); }
    group.modules.push({ code: row.moduleCode, name: row.moduleName, ...(row.moduleIconKey ? { iconKey: row.moduleIconKey } : {}), sortOrder: row.moduleSortOrder, primary: row.primary });
  }
  return [...groups.values()];
}

function resolveFeatures(rows: readonly ExperienceFeatureRecord[], tenantId: string, moduleIds: ReadonlySet<string>, clientVersion?: string): Readonly<Record<string, EffectiveFeature>> {
  const output: Record<string, EffectiveFeature> = {};
  for (const row of [...rows].sort((a, b) => a.code.localeCompare(b.code))) {
    if (row.moduleId && !moduleIds.has(row.moduleId)) continue;
    const minimum = text(row.metadata.minimumClientVersion);
    const maximum = text(row.metadata.maximumClientVersion);
    if ((minimum && (!clientVersion || compareVersions(clientVersion, minimum) < 0)) || (maximum && (!clientVersion || compareVersions(clientVersion, maximum) > 0))) { output[row.code] = { code: row.code, enabled: false, source: "version_constraint" }; continue; }
    let enabled = row.defaultEnabled, source: EffectiveFeature["source"] = "catalog_default";
    if (row.rolloutPct !== undefined) { enabled = enabled && cohort(tenantId, row.code) < row.rolloutPct; source = "rollout"; }
    if (row.kind === "kill_switch") { enabled = enabled && row.overrideEnabled !== false; source = "kill_switch"; }
    else if (row.overrideEnabled !== undefined) { enabled = row.overrideEnabled; source = "tenant_override"; }
    output[row.code] = { code: row.code, enabled, source };
  }
  return Object.freeze(output);
}
function cohort(tenantId: string, code: string): number { return Number.parseInt(createHash("sha256").update(`${tenantId}:${code}`).digest("hex").slice(0, 8), 16) % 100; }
function compareVersions(left: string, right: string): number { const parse = (value: string) => value.replace(/^v/, "").split(".").slice(0, 3).map((part) => Number.parseInt(part, 10)); const a = parse(left), b = parse(right); if (a.some(Number.isNaN) || b.some(Number.isNaN)) return -1; for (let i = 0; i < 3; i++) { const difference = (a[i] ?? 0) - (b[i] ?? 0); if (difference) return difference; } return 0; }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function integer(value: unknown, min: number, max: number): number | undefined { return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : undefined; }
function days(value: unknown): readonly number[] | undefined { return Array.isArray(value) && value.length > 0 && value.every((item) => integer(item, 0, 6) !== undefined) ? [...new Set(value as number[])] : undefined; }
function appearance(value: unknown): ExperienceProfile["appearanceMode"] | undefined { return ["system", "light", "dark", "high_contrast"].includes(String(value)) ? value as ExperienceProfile["appearanceMode"] : undefined; }
function density(value: unknown): ExperienceProfile["densityCode"] | undefined { return ["comfortable", "compact"].includes(String(value)) ? value as ExperienceProfile["densityCode"] : undefined; }
