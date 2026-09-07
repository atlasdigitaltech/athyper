import { stablePercentageCohort, featurePercentageCohort } from "@athyper/server-foundation";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { LOCALE_REGISTRY } from "@athyper/platform-i18n";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { validateRuntimeSchema } from "@athyper/server-runtime-http";
import { describe, expect, it } from "vitest";
import { experienceBootstrapSchema, meshNetworkAccountCatalogSchema, neonOperatingOrganizationCatalogSchema } from "./contracts.js";
import type { ExperiencePlaneRepository } from "./ports.js";
import { createExperienceInvalidationHooks, createExperienceService, createMemoryExperienceCache, ExperienceAccessError } from "./service.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const principalId = "20000000-0000-4000-8000-000000000001";
const moduleId = "30000000-0000-4000-8000-000000000001";
const context: VerifiedRequestContext = {
  planeKey: "neon", realmKey: "neon", tenantId, principalId, authEpoch: 4, requestId: "request-1", profileHash: "profile-1",
  permissions: { planeKey: "neon", tenantId, principalId, principalFingerprint: "principal-fp", profileHash: "profile-1", schemaHash: "schema-1", resolvedAt: 1, allowed: ["finance.invoice.read", "unknown.permission.read"], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};

function repository(overrides: Partial<ExperiencePlaneRepository> = {}): ExperiencePlaneRepository {
  return {
    async readIdentity() { return { tenantCode:"tenant",tenantDisplayName:"Tenant Alpha",tenantStatus: "active", tenantRealmKey: "neon", subscriptionPlanId: "40000000-0000-4000-8000-000000000001", tenantRevision: "tenant:1",principalCode:"user.one",principalDisplayName:"User One",principalSecondaryLabel:"user.one", principalStatus: "active", principalAuthEpoch: 4, principalRevision: "principal:1", identityBindingActive: true, membershipActive: true, membershipRevision: "membership:1" }; },
    async readProfile() { return { tenant: { localeCode: "en-MY", timezoneCode: "Asia/Kuala_Lumpur", weekendDays: [0, 6] }, principal: { localeCode: "fr-FR", appearanceMode: "dark", densityCode: "compact" }, revision: "profile:1" }; },
    async readCatalog() { return { planActive: true, planRevision: "plan:1", associations: [{ workspaceCode: "finance", workspaceName: "Finance", workspaceSortOrder: 2, moduleId, moduleCode: "invoicing", moduleName: "Invoicing", moduleSortOrder: 3, primary: true, revision: "catalog:1" }], permissions: [{ code: "finance.invoice.read", moduleId, revision: "permission:1" }] }; },
    async readFeatures() { return [{ id: "feature-1", code: "finance.invoice_v2", moduleId, kind: "release_gate", cohortStrategy: "principal_fnv1a_v2", defaultEnabled: false, overrideEnabled: true, metadata: {}, revision: "flag:1" }, { id: "feature-2", code: "finance.future", moduleId, kind: "release_gate", cohortStrategy: "principal_fnv1a_v2", defaultEnabled: true, metadata: { minimumClientVersion: "2.0.0" }, revision: "flag:2" }]; },
    async readWorkContexts(){return[];},
    async readOperatingOrganizations(){return[];},
    async readNetworkAccounts(){return[];},
    ...overrides,
  };
}

function service(repo = repository()) { return createExperienceService({ repositories: createExactPlaneRepositoryProvider({ neon: repo }, { unavailableCode: "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" }), now: () => new Date("2026-08-12T00:00:00Z") }); }

describe("experience effective-access projection", () => {
  it("keeps an explicit user density preference above the next-request runtime default",async()=>{
    const repo=repository({readProfile:async()=>({tenant:{},principal:{densityCode:"comfortable"},revision:"1"})});
    const runtime=createExperienceService({repositories:createExactPlaneRepositoryProvider({neon:repo}),readRuntimeDefaults:async()=>({densityCode:"compact",configurationRevision:"revision-1"})});
    expect((await runtime.bootstrap(context)).profile.densityCode).toBe("comfortable");
  });

  it.each(["tenant_sha256_v1", "principal_fnv1a_v2"] as const)("uses persisted %s assignments",async cohortStrategy=>{
    const code="finance.rollout";
    const repo=repository({readFeatures:async()=>[{id:"flag",code,moduleId,kind:"release_gate",defaultEnabled:true,cohortStrategy,rolloutPct:50,metadata:{},revision:"1"}]});
    for(let i=0;i<20;i++) {
      const principal=`principal-${i}`,c={...context,principalId:principal,permissions:{...context.permissions,principalId:principal}};
      expect((await service(repo).bootstrap(c)).features[code]!.enabled).toBe(featurePercentageCohort(cohortStrategy,tenantId,principal,code)<50);
    }
  });
  it("refreshes cached bootstrap when the database entitlement revision changes without a local invalidation", async () => {
    let revision="base", included=false, reads=0;
    const base=repository();
    const repo=repository({readEntitlementRevision:async()=>revision,readCatalog:async(...args)=>{
      reads++; const catalog=(await base.readCatalog(...args))!;
      return {...catalog,associations:included?catalog.associations:[]};
    }});
    const cached=createExperienceService({repositories:createExactPlaneRepositoryProvider({neon:repo}),cache:createMemoryExperienceCache()});
    expect((await cached.bootstrap(context)).workspaces).toHaveLength(0);
    await cached.bootstrap(context); expect(reads).toBe(1);
    // A different host commits an override, or a scheduled start becomes effective.
    revision="override-active"; included=true;
    expect((await cached.bootstrap(context)).workspaces).toHaveLength(1); expect(reads).toBe(2);
    revision="override-expired"; included=false;
    expect((await cached.bootstrap(context)).workspaces).toHaveLength(0); expect(reads).toBe(3);
  });

  it("uses the control API's stable tenant/principal/feature cohort",async()=>{
    const code="finance.rollout",seen=new Set<boolean>();
    const repo=repository({readFeatures:async()=>[{id:"flag",code,moduleId,kind:"release_gate",cohortStrategy: "principal_fnv1a_v2", defaultEnabled:true,rolloutPct:50,metadata:{},revision:"1"}]});
    for(let i=0;i<20;i++){
      const principal=`principal-${i}`,c={...context,principalId:principal,permissions:{...context.permissions,principalId:principal}};
      const enabled=(await service(repo).bootstrap(c)).features[code]!.enabled;
      expect(enabled).toBe(stablePercentageCohort(`${tenantId}:${principal}:${code}`)<50);seen.add(enabled);
    }
    expect(seen.size).toBe(2);
  });

  it("refreshes feature results for remote writes and scheduled boundaries without local cache eviction",async()=>{
    let revision="on",enabled=true,reads=0;
    const base=repository();const repo=repository({readFeatureRevision:async()=>revision,readFeatures:async(...args)=>{
      reads++;return (await base.readFeatures(...args)).map(flag=>({...flag,overrideEnabled:enabled}));
    }});
    const cached=createExperienceService({repositories:createExactPlaneRepositoryProvider({neon:repo}),cache:createMemoryExperienceCache()});
    expect((await cached.bootstrap(context)).features["finance.invoice_v2"]?.enabled).toBe(true);
    await cached.bootstrap(context);expect(reads).toBe(1);
    revision="off";enabled=false;
    expect((await cached.bootstrap(context)).features["finance.invoice_v2"]?.enabled).toBe(false);expect(reads).toBe(2);
  });

  it("inherits typed profile fields, orders catalog, filters unknown permissions, and resolves flags", async () => {
    const first = await service().bootstrap(context, { clientVersion: "1.5.0" });
    const second = await service().bootstrap(context, { clientVersion: "1.5.0" });
    expect(first).toMatchObject({ state: "ready", profile: { localeCode: "en", timezoneCode: "Asia/Kuala_Lumpur", appearanceMode: "dark", densityCode: "compact" }, localePolicy:{enabledLocales:["en"],defaultLocale:"en",fallbackLocale:"en"},permissions: ["finance.invoice.read"] });
    expect(first.localePolicy.catalogs).toHaveLength(8);
    expect(first.localePolicy.catalogs.map(({localeCode,rolloutWave})=>[localeCode,rolloutWave])).toEqual([["en",0],["ar",1],["ms",1],["zh-Hans",1],["hi",2],["ta",2],["fr",3],["de",3]]);
    expect(first.workspaces[0]?.modules[0]).toMatchObject({ code: "invoicing", primary: true });
    expect(first.features["finance.invoice_v2"]).toMatchObject({ enabled: true, source: "tenant_override" });
    expect(first.features["finance.future"]).toMatchObject({ enabled: false, source: "version_constraint" });
    expect(first.revision).toBe(second.revision);
    expect(validateRuntimeSchema(experienceBootstrapSchema, first)).toBe(first);
  });

  it("keeps shared infrastructure entitled without projecting it as a navigation workspace", async () => {
    const infrastructureModuleId="30000000-0000-4000-8000-000000000002";
    const repo=repository({async readCatalog(){return{planActive:true,planRevision:"plan:shared",associations:[
      {workspaceCode:"core",workspaceName:"Core Platform",workspaceSortOrder:1,workspaceSharedInfrastructure:true,moduleId:infrastructureModuleId,moduleCode:"iam",moduleName:"Identity & Access Management",moduleSortOrder:1,primary:true,revision:"catalog:core"},
      {workspaceCode:"mdg",workspaceName:"Master Data Governance",workspaceSortOrder:10,workspaceSharedInfrastructure:false,moduleId,moduleCode:"bp",moduleName:"Business Partner Management",moduleSortOrder:1,primary:true,revision:"catalog:mdg"},
    ],permissions:[{code:"platform.identity.read",moduleId:infrastructureModuleId,revision:"permission:core"},{code:"finance.invoice.read",moduleId,revision:"permission:bp"}]};}});
    const result=await service(repo).bootstrap({...context,permissions:{...context.permissions,allowed:["platform.identity.read","finance.invoice.read"]}});
    expect(result.workspaces.map((workspace)=>workspace.code)).toEqual(["mdg"]);
    expect(result.permissions).toEqual(["finance.invoice.read","platform.identity.read"]);
  });

  it("returns context-not-ready without modules or permissions when provisioning has no plan", async () => {
    const repo = repository({ async readIdentity() { return { tenantCode:"tenant",tenantDisplayName:"Tenant Alpha",tenantStatus: "active", tenantRealmKey: "neon", tenantRevision: "tenant:1",principalCode:"user.one",principalDisplayName:"User One", principalStatus: "active", principalAuthEpoch: 4, principalRevision: "principal:1", identityBindingActive: true, membershipActive: true }; } });
    await expect(service(repo).bootstrap(context)).resolves.toMatchObject({ state: "context_not_ready", workspaces: [], permissions: [], features: {}, nextActions: ["retry_later"] });
  });

  it.each([
    ["tenant", { tenantStatus: "suspended" }, "EXPERIENCE_TENANT_INACTIVE"],
    ["principal", { principalStatus: "disabled" }, "EXPERIENCE_PRINCIPAL_INACTIVE"],
    ["binding", { identityBindingActive: false }, "EXPERIENCE_IDENTITY_BINDING_INVALID"],
    ["membership", { membershipActive: false }, "EXPERIENCE_MEMBERSHIP_INACTIVE"],
  ])("fails closed for inactive %s", async (_name, change, code) => {
    const base = await repository().readIdentity(context, new Date());
    const repo = repository({ async readIdentity() { return { ...base!, ...change }; } });
    await expect(service(repo).bootstrap(context)).rejects.toMatchObject({ code } satisfies Partial<ExperienceAccessError>);
  });

  it("never falls through to another plane repository", async () => {
    await expect(service().bootstrap({ ...context, planeKey: "mesh", permissions: { ...context.permissions, planeKey: "mesh" } })).rejects.toMatchObject({ code: "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE", planeKey: "mesh" });
  });

  it("fails flags closed when the feature repository is unavailable", async () => {
    const result = await service(repository({ async readFeatures() { throw new Error("database unavailable"); } })).bootstrap(context);
    expect(result.features).toEqual({});
  });

  it("uses safe platform profile defaults only after identity admission succeeds", async () => {
    const result = await service(repository({ async readProfile() { throw new Error("profile unavailable"); } })).bootstrap(context);
    expect(result.profile).toMatchObject({ localeCode: "en-US", timezoneCode: "UTC", appearanceMode: "system", densityCode: "comfortable" });
  });

  it("honors an enabled Arabic principal locale and derives RTL",async()=>{const result=await service(repository({async readLocalePolicy(){return{enabledLocales:["en","ar"],defaultLocale:"en",fallbackLocale:"en",revision:"policy:1"};},async readProfile(){return{principal:{localeCode:"ar-SA",languageCode:"ar"},revision:"profile:ar"};}})).bootstrap(context);expect(result).toMatchObject({profile:{localeCode:"ar-SA"},localization:{catalogLocale:"ar",direction:"rtl"},localePolicy:{enabledLocales:["en","ar"]}});});

  it("rejects a user locale that the active plane has not enabled",async()=>{await expect(service(repository({async readLocalePolicy(){return{enabledLocales:["en"],defaultLocale:"en",fallbackLocale:"en",revision:"policy:1"};},async updatePrincipalLocale(){throw new Error("must not write");}})).updatePrincipalLocale(context,"ar")).rejects.toMatchObject({status:400,code:"EXPERIENCE_LOCALE_NOT_ENABLED"});});

  it("accepts qualified Simplified Chinese and maps regional Chinese to the script catalog",async()=>{const result=await service(repository({async readLocalePolicy(){return{catalogs:[{localeCode:"zh-Hans",status:"qualified",coveragePct:100,linguisticReviewPassed:true,layoutReviewPassed:true,automatedTestsPassed:true}],enabledLocales:["en","zh-Hans"],defaultLocale:"en",fallbackLocale:"en",revision:"policy:zh"};},async readProfile(){return{principal:{localeCode:"zh-CN",languageCode:"zh"},revision:"profile:zh"};}})).bootstrap(context);expect(result).toMatchObject({profile:{localeCode:"zh-CN"},localization:{catalogLocale:"zh-Hans",direction:"ltr"},localePolicy:{enabledLocales:["en","zh-Hans"]}});});

  it("does not expose a catalog until lifecycle, coverage, and every gate are qualified",async()=>{const result=await service(repository({async readLocalePolicy(){return{catalogs:[{localeCode:"ms",status:"review",coveragePct:100,linguisticReviewPassed:true,layoutReviewPassed:true,automatedTestsPassed:true}],enabledLocales:["en","ms"],defaultLocale:"ms",fallbackLocale:"en",revision:"policy:review"};},async readProfile(){return{principal:{localeCode:"ms-MY"},revision:"profile:ms"};}})).bootstrap(context);expect(result).toMatchObject({profile:{localeCode:"en"},localization:{catalogLocale:"en"},localePolicy:{enabledLocales:["en"],defaultLocale:"en"}});expect(result.localePolicy.catalogs.find((catalog)=>catalog.localeCode==="ms")?.qualified).toBe(false);});

  it("rejects Studio activation until the target plane catalog is fully qualified",async()=>{const studioContext={...context,planeKey:"studio" as const,realmKey:"studio",permissions:{...context.permissions,planeKey:"studio" as const,allowed:["studio.platform.catalog.manage"]}};let writes=0;const target=repository({async updateLocalePolicy(_context,policy){writes++;return{...policy,revision:"saved:1"};}});const projection=createExperienceService({repositories:createExactPlaneRepositoryProvider({studio:repository(),neon:target})});const catalogs=LOCALE_REGISTRY.map((entry)=>({localeCode:entry.code,status:entry.code==="en"?"qualified":"draft",coveragePct:entry.code==="en"?100:0,linguisticReviewPassed:entry.code==="en",layoutReviewPassed:entry.code==="en",automatedTestsPassed:entry.code==="en"}));await expect(projection.updateLocalePolicy(studioContext,"neon",{catalogs,enabledLocales:["en","ms"],defaultLocale:"en",fallbackLocale:"en"})).rejects.toMatchObject({status:400,code:"EXPERIENCE_LOCALE_POLICY_INVALID"});expect(writes).toBe(0);});

  it("returns only Neon companies covered by effective company or legal-entity scope", async()=>{
    const companyA="50000000-0000-4000-8000-000000000001",companyB="50000000-0000-4000-8000-000000000002",legalA="60000000-0000-4000-8000-000000000001",legalB="60000000-0000-4000-8000-000000000002";
    const scoped={...context,permissions:{...context.permissions,authorizationScopes:[{permissionCode:"finance.invoice.read",tenantWide:false,legalEntityIds:[legalA],companyCodeIds:[],operatingOrganizationIds:[],networkMembershipIds:[],visibility:"team" as const}]}};
    const repo=repository({async readWorkContexts(){return[{companyCodeId:companyA,companyCode:"alpha",companyDisplayName:"Alpha",legalEntityId:legalA,legalEntityCode:"le-alpha",legalEntityName:"Alpha Legal",countryCode:"MY",functionalCurrency:"MYR",revision:"row:alpha"},{companyCodeId:companyB,companyCode:"beta",companyDisplayName:"Beta",legalEntityId:legalB,legalEntityCode:"le-beta",legalEntityName:"Beta Legal",countryCode:"SG",functionalCurrency:"SGD",revision:"row:beta"}];}});
    const result=await service(repo).neonWorkContexts(scoped);
    expect(result.companies).toHaveLength(1);expect(result.companies[0]).toMatchObject({companyCodeId:companyA,capabilityGroups:["finance"]});expect(result.supportsAllPermitted).toBe(false);
  });

  it("does not expose company master data when the authorization snapshot has no scope",async()=>{
    const repo=repository({async readWorkContexts(){return[{companyCodeId:"50000000-0000-4000-8000-000000000001",companyCode:"alpha",companyDisplayName:"Alpha",legalEntityId:"60000000-0000-4000-8000-000000000001",legalEntityCode:"le-alpha",legalEntityName:"Alpha Legal",functionalCurrency:"MYR",revision:"row:alpha"}];}});
    await expect(service(repo).neonWorkContexts(context)).resolves.toMatchObject({companies:[],supportsAllPermitted:false});
  });

  it("intersects operating-organization and company authorization without member-company propagation",async()=>{
    const companyA="50000000-0000-4000-8000-000000000001",companyB="50000000-0000-4000-8000-000000000002",legalA="60000000-0000-4000-8000-000000000001",legalB="60000000-0000-4000-8000-000000000002",organizationA="70000000-0000-4000-8000-000000000001",organizationB="70000000-0000-4000-8000-000000000002";
    const scoped={...context,permissions:{...context.permissions,authorizationScopes:[{permissionCode:"neon.procurement.purchase_order.create",tenantWide:false,legalEntityIds:[legalA],companyCodeIds:[],operatingOrganizationIds:[organizationA],networkMembershipIds:[],visibility:"team" as const}]}};
    const repo=repository({
      async readWorkContexts(){return[{companyCodeId:companyA,companyCode:"alpha",companyDisplayName:"Alpha",legalEntityId:legalA,legalEntityCode:"le-alpha",legalEntityName:"Alpha Legal",functionalCurrency:"MYR",revision:"company:a"},{companyCodeId:companyB,companyCode:"beta",companyDisplayName:"Beta",legalEntityId:legalB,legalEntityCode:"le-beta",legalEntityName:"Beta Legal",functionalCurrency:"SGD",revision:"company:b"}];},
      async readOperatingOrganizations(){return[{id:organizationA,code:"global.buy",displayName:"Global Procurement",domain:"procurement",path:["Global Procurement"],procurementProfileConfigured:true,salesProfileConfigured:false,leadCompanyCodeId:companyA,assignments:[{companyCodeId:companyA,participationRole:"lead",effectiveFrom:"2026-01-01",revision:"assignment:a"},{companyCodeId:companyB,participationRole:"participant",effectiveFrom:"2026-01-01",revision:"assignment:b"}],revision:"organization:a"},{id:organizationB,code:"other.buy",displayName:"Other Procurement",domain:"procurement",path:["Other Procurement"],procurementProfileConfigured:true,salesProfileConfigured:false,assignments:[{companyCodeId:companyA,participationRole:"participant",effectiveFrom:"2026-01-01",revision:"assignment:c"}],revision:"organization:b"}];},
    });
    const result=await service(repo).neonOperatingOrganizations(scoped);
    expect(result.organizations).toHaveLength(1);expect(result.organizations[0]).toMatchObject({id:organizationA,capabilities:["procurement"],defaults:{leadCompanyCodeId:companyA},companyAssignments:[{companyCodeId:companyA}]});
    expect(validateRuntimeSchema(neonOperatingOrganizationCatalogSchema,result)).toBe(result);
  });

  it("does not infer company access from an operating-organization grant",async()=>{
    const organizationId="70000000-0000-4000-8000-000000000001";
    const scoped={...context,permissions:{...context.permissions,authorizationScopes:[{permissionCode:"neon.procurement.purchase_order.create",tenantWide:false,legalEntityIds:[],companyCodeIds:[],operatingOrganizationIds:[organizationId],networkMembershipIds:[],visibility:"team" as const}]}};
    const repo=repository({async readOperatingOrganizations(){return[{id:organizationId,code:"global.buy",displayName:"Global Procurement",domain:"procurement",path:["Global Procurement"],procurementProfileConfigured:true,salesProfileConfigured:false,assignments:[{companyCodeId:"50000000-0000-4000-8000-000000000001",participationRole:"participant",effectiveFrom:"2026-01-01",revision:"assignment:a"}],revision:"organization:a"}];}});
    await expect(service(repo).neonOperatingOrganizations(scoped)).resolves.toMatchObject({organizations:[]});
  });

  it("returns only Mesh accounts in the principal authorization snapshot and flags related visible accounts",async()=>{
    const accountA="80000000-0000-4000-8000-000000000001",accountB="80000000-0000-4000-8000-000000000002",accountC="80000000-0000-4000-8000-000000000003",party="90000000-0000-4000-8000-000000000001";
    const meshContext={...context,planeKey:"mesh" as const,permissions:{...context.permissions,planeKey:"mesh" as const,authorizationScopes:[{permissionCode:"mesh.account.read",tenantWide:false,legalEntityIds:[],companyCodeIds:[],operatingOrganizationIds:[],networkMembershipIds:[accountA,accountB],visibility:"team" as const}]}};
    const repo=repository({async readNetworkAccounts(){return[{id:accountA,code:"buyer.apac",displayName:"Athyper APAC Procurement",role:"buyer",canonicalPartyId:party,source:"neon_projection",revision:"account:a"},{id:accountB,code:"supplier.apac",displayName:"Athyper Supplier APAC",role:"supplier",canonicalPartyId:party,source:"mesh",revision:"account:b"},{id:accountC,code:"supplier.hidden",displayName:"Hidden Supplier",role:"supplier",source:"mesh",revision:"account:c"}];}});
    const projection=createExperienceService({repositories:createExactPlaneRepositoryProvider({mesh:repo})});
    const result=await projection.meshNetworkAccounts(meshContext);
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.map((account)=>account.relatedAccountCount)).toEqual([2,2]);
    expect(validateRuntimeSchema(meshNetworkAccountCatalogSchema,result)).toBe(result);
  });

  it("keeps rollout cohorts stable and invalidates cached authorization projections", async () => {
    let reads = 0;
    const repo = repository({ async readFeatures() { reads += 1; return [{ id: "cohort", code: "finance.cohort", moduleId, kind: "experiment", cohortStrategy: "principal_fnv1a_v2", defaultEnabled: true, rolloutPct: 50, metadata: {}, revision: "cohort:1" }]; } });
    const cache = createMemoryExperienceCache();
    const projection = createExperienceService({ repositories: createExactPlaneRepositoryProvider({ neon: repo }), cache });
    const first = await projection.bootstrap(context);
    const second = await projection.bootstrap(context);
    expect(second.features["finance.cohort"]?.enabled).toBe(first.features["finance.cohort"]?.enabled);
    expect(reads).toBe(1);
    await createExperienceInvalidationHooks(cache).authorizationChanged("neon", tenantId, principalId);
    await projection.bootstrap(context);
    expect(reads).toBe(2);
  });

  it("validates in Studio, publishes once, and applies only an exact-plane projection", async () => {
    const studioContext:VerifiedRequestContext={...context,planeKey:"studio",realmKey:"studio",permissions:{...context.permissions,planeKey:"studio",allowed:["studio.platform.catalog.manage"]}};
    let projectedPlane="", projectedRelease="";
    const draft={id:"a0000000-0000-4000-8000-000000000001",targetPlane:"neon" as const,surfaceKey:"neon.home",layer:"tenant" as const,revision:1,status:"draft" as const,definition:{},contentHash:"a".repeat(64),source:"human" as const};
    const studio=repository({async saveSurfaceDraft(_context,input){expect(input.source).toBe("human");return{...draft,definition:input.definition,contentHash:input.contentHash};},async publishSurfaceRelease(){return{...draft,status:"published",publishedAt:"2026-08-31T00:00:00Z"};}});
    const neon=repository({async applySurfaceProjection(target,release){projectedPlane=target.planeKey;projectedRelease=release.id;}});
    const projection=createExperienceService({repositories:createExactPlaneRepositoryProvider({studio,neon})});
    const saved=await projection.saveSurfaceDraft(studioContext,{targetPlane:"neon",layer:"tenant",definition:{schema:"athyper-experience-surface/1",id:"neon.home",revision:1,scope:{kind:"home",plane:"neon"},title:"Home",blocks:[{id:"welcome",type:"text",text:"Welcome"}]}});
    expect(saved.contentHash).toMatch(/^[0-9a-f]{64}$/);
    await expect(projection.publishSurface(studioContext,saved.id)).resolves.toMatchObject({status:"published"});
    expect({projectedPlane,projectedRelease}).toEqual({projectedPlane:"neon",projectedRelease:draft.id});
  });

  it("rejects unregistered executable surface references before persistence",async()=>{const studioContext:VerifiedRequestContext={...context,planeKey:"studio",realmKey:"studio",permissions:{...context.permissions,planeKey:"studio",allowed:["studio.platform.catalog.manage"]}};let writes=0;const studio=repository({async saveSurfaceDraft(){writes++;throw new Error("must not write");}});const projection=createExperienceService({repositories:createExactPlaneRepositoryProvider({studio})});await expect(projection.saveSurfaceDraft(studioContext,{targetPlane:"studio",layer:"tenant",definition:{schema:"athyper-experience-surface/1",id:"studio.home",revision:1,scope:{kind:"home",plane:"studio"},title:"Home",blocks:[{id:"unsafe",type:"extension",extension:"arbitrary.code"}]}})).rejects.toMatchObject({status:400,code:"EXPERIENCE_SURFACE_INVALID"});expect(writes).toBe(0);});

  it("resolves system, shared, tenant, and revision-bound personal layers in order",async()=>{let saved:unknown;const tenantDefinition={schema:"athyper-experience-surface/1",id:"neon.home",revision:3,scope:{kind:"home",plane:"neon"},title:"Tenant home",blocks:[{id:"visible.card",type:"text",text:"Visible"},{id:"hidden.card",type:"text",text:"Hidden"}]};const repo=repository({async readSurfaceProjections(){return[{surfaceKey:"neon.home",layer:"shared",sourceReleaseId:"shared",sourceRevision:2,definition:{...tenantDefinition,revision:2,title:"Shared home"},contentHash:"a".repeat(64)},{surfaceKey:"neon.home",layer:"tenant",sourceReleaseId:"tenant",sourceRevision:3,definition:tenantDefinition,contentHash:"b".repeat(64)}];},async readPersonalSurfaceArrangement(){return{surfaceKey:"neon.home",baseRevision:3,arrangement:{schema:"athyper-experience-arrangement/1",surfaceId:"neon.home",baseRevision:3,hidden:["hidden.card"],spans:{"visible.card":2}}};},async savePersonalSurfaceArrangement(_context,input){saved=input;return input;}});const projection=service(repo);await expect(projection.surface(context,"neon.home")).resolves.toMatchObject({surface:{title:"Tenant home",blocks:[{id:"visible.card",span:2}]},provenance:{systemRevision:1,sharedRevision:2,tenantRevision:3,personalApplied:true}});await projection.savePersonalArrangement(context,"neon.home",{schema:"athyper-experience-arrangement/1",surfaceId:"neon.home",baseRevision:3,hidden:[]});expect(saved).toMatchObject({surfaceKey:"neon.home",baseRevision:3});await expect(projection.savePersonalArrangement(context,"neon.home",{schema:"athyper-experience-arrangement/1",surfaceId:"neon.home",baseRevision:2})).rejects.toMatchObject({status:409,code:"EXPERIENCE_ARRANGEMENT_STALE"});});
});


describe("localization review regressions", () => {
  const catalogs = LOCALE_REGISTRY.map(({code}) => ({localeCode:code,status:"qualified",coveragePct:100,linguisticReviewPassed:true,layoutReviewPassed:true,automatedTestsPassed:true}));
  const policy = {catalogs,enabledLocales:["en","ar","fr"],defaultLocale:"ar",fallbackLocale:"en",revision:"policy:1"};
  const studio: VerifiedRequestContext = {...context,planeKey:"studio",permissions:{...context.permissions,planeKey:"studio",allowed:["studio.platform.catalog.manage"]}};

  it("uses the policy default for an inherited English profile while retaining personal choices", async () => {
    const repo = repository({async readLocalePolicy(){return policy;},async readProfile(){return {tenant:{localeCode:"en-US"},revision:"1"};}});
    expect(await service(repo).bootstrap(context)).toMatchObject({profile:{localeCode:"ar"},localization:{direction:"rtl",source:{uiLocale:"tenant"}}});
    expect(await service({...repo,async readProfile(){return {principal:{localeCode:"fr-FR"},revision:"1"};}}).bootstrap(context)).toMatchObject({profile:{localeCode:"fr-FR"}});
  });

  it("does not qualify missing catalog evidence in an explicit governance record", async () => {
    const result = await service(repository({async readLocalePolicy(){return {...policy,catalogs:catalogs.filter(row=>row.localeCode!=="ar")};}})).localePolicy(context);
    expect(result.enabledLocales).not.toContain("ar");
    expect(result.defaultLocale).toBe("en");
  });

  it("preserves a canonical regional preference, refreshes cached bootstrap, and changes context-not-ready revisions", async () => {
    let localeCode = "en";
    const base = await repository().readIdentity(context,new Date());
    const repo = repository({async readIdentity(){return {...base!,subscriptionPlanId:undefined};},async readLocalePolicy(){return policy;},async readProfile(){return {principal:{localeCode},revision:"unchanged"};},async updatePrincipalLocale(_context,selected){localeCode=selected;}});
    const projection = createExperienceService({repositories:createExactPlaneRepositoryProvider({neon:repo}),cache:createMemoryExperienceCache()});
    const before = await projection.bootstrap(context);
    const after = await projection.updatePrincipalLocale(context,"fr-fr");
    expect(localeCode).toBe("fr-FR");
    expect(after).toMatchObject({state:"context_not_ready",profile:{localeCode:"fr-FR"},localization:{formatLocale:"fr-FR"}});
    expect(after.revision).not.toBe(before.revision);
    expect(await projection.bootstrap(context)).toEqual(after);
  });

  it("rejects an inactive principal before writing even with a cached bootstrap", async () => {
    let active=true,writes=0;
    const base=await repository().readIdentity(context,new Date());
    const repo=repository({async readIdentity(){return {...base!,principalStatus:active?"active":"disabled"};},async readLocalePolicy(){return policy;},async updatePrincipalLocale(){writes++;}});
    const projection=createExperienceService({repositories:createExactPlaneRepositoryProvider({neon:repo}),cache:createMemoryExperienceCache()});
    await projection.bootstrap(context);active=false;
    await expect(projection.updatePrincipalLocale(context,"ar")).rejects.toMatchObject({status:403,code:"EXPERIENCE_PRINCIPAL_INACTIVE"});
    expect(writes).toBe(0);
  });

  it("binds every localization operation to the authorization snapshot before repository access", async () => {
    const projection=createExperienceService({repositories:{require(){throw new Error("must not access repository");}}});
    const mismatched={...studio,tenantId:"another-tenant"};
    for(const operation of [()=>projection.localePolicy(mismatched,"neon"),()=>projection.updateLocalePolicy(mismatched,"neon",policy),()=>projection.updatePrincipalLocale(mismatched,"en")]){
      await expect(operation()).rejects.toMatchObject({status:403,code:"EXPERIENCE_AUTH_CONTEXT_MISMATCH"});
    }
  });

  it("requires Studio catalog authority for cross-plane reads and all policy writes", async () => {
    const projection=service();
    await expect(projection.localePolicy(context,"mesh")).rejects.toMatchObject({status:403});
    await expect(projection.updateLocalePolicy(context,"neon",policy)).rejects.toMatchObject({status:403});
    await expect(projection.localePolicy({...studio,permissions:{...studio.permissions,allowed:[]}},"neon")).rejects.toMatchObject({status:403});
  });

  it("writes only the requested plane and invalidates its tenant's cached experience", async () => {
    let current=policy;
    const repo=repository({async readLocalePolicy(){return current;},async readProfile(){return {revision:"1"};},async updateLocalePolicy(target,input){expect(target).toMatchObject({planeKey:"neon",tenantId});current={...input,catalogs:input.catalogs!,revision:"2"} as typeof policy;return current;}});
    const projection=createExperienceService({repositories:createExactPlaneRepositoryProvider({neon:repo}),cache:createMemoryExperienceCache()});
    expect((await projection.bootstrap(context)).profile.localeCode).toBe("ar");
    await projection.updateLocalePolicy(studio,"neon",{...policy,defaultLocale:"fr"});
    expect((await projection.bootstrap(context)).profile.localeCode).toBe("fr");
  });

  it.each(["invalid_locale","es-ES",""])("rejects unsupported or malformed principal locale %s", async (locale) => {
    await expect(service(repository({async readLocalePolicy(){return policy;},async updatePrincipalLocale(){throw new Error("must not write");}})).updatePrincipalLocale(context,locale)).rejects.toMatchObject({status:400,code:"EXPERIENCE_LOCALE_NOT_ENABLED"});
  });
});


describe("localization concurrent requests", () => {
  it("does not repopulate the cache with a bootstrap started before PATCH invalidation", async () => {
    let selected = "en";
    let first = true;
    let reached!: () => void;
    let release!: () => void;
    const paused = new Promise<void>(resolve => { reached = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const base = repository();
    const repo = repository({
      async readLocalePolicy() { return {enabledLocales:["en","ar"],defaultLocale:"en",fallbackLocale:"en",revision:"policy:1"}; },
      async readProfile() { return {principal:{localeCode:selected},revision:selected}; },
      async readFeatures(ctx,at) { if(first){first=false;reached();await resume;}return base.readFeatures(ctx,at); },
      async updatePrincipalLocale(_context,locale,revision) { expect(revision).toBe("policy:1");selected=locale; },
    });
    const projection = createExperienceService({repositories:createExactPlaneRepositoryProvider({neon:repo}),cache:createMemoryExperienceCache()});
    const old = projection.bootstrap(context);
    await paused;
    try {
      expect((await projection.updatePrincipalLocale(context,"ar")).profile.localeCode).toBe("ar");
    } finally { release(); }
    expect((await old).profile.localeCode).toBe("en");
    expect((await projection.bootstrap(context)).profile.localeCode).toBe("ar");
  });

  it("fails closed for incorrectly typed review evidence loaded from JSON", async () => {
    const result=await service(repository({async readLocalePolicy(){return {catalogs:[{localeCode:"ar",status:"qualified",coveragePct:100,linguisticReviewPassed:"false" as unknown as boolean,layoutReviewPassed:true,automatedTestsPassed:true}],enabledLocales:["en","ar"],defaultLocale:"ar",fallbackLocale:"en",revision:"1"};}})).localePolicy(context);
    expect(result.enabledLocales).toEqual(["en"]);
    expect(result.catalogs.find(row=>row.localeCode==="ar")).toMatchObject({qualified:false,linguisticReviewPassed:false});
  });
});
