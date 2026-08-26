import type { PlaneKey } from "@athyper/server-foundation/context";
import type { SupportedLocale, TextDirection } from "@athyper/platform-i18n";

export interface ExperienceProfile {
  readonly localeCode: string;
  readonly languageCode: string;
  readonly timezoneCode: string;
  readonly dateFormat: string;
  readonly numberFormat: string;
  readonly weekStart: number;
  readonly weekendDays: readonly number[];
  readonly appearanceMode: "system" | "light" | "dark" | "high_contrast";
  readonly densityCode: "comfortable" | "compact";
}

export interface ExperienceLocalization {
  readonly uiLocale: string; readonly catalogLocale: string; readonly formatLocale: string; readonly direction: "ltr" | "rtl";
  readonly timeZone: string; readonly calendar: string; readonly numberingSystem: string; readonly weekStart: number;
  readonly weekendDays: readonly number[]; readonly fallbackLocales: readonly string[]; readonly catalogRevision: string;
  readonly source: { readonly uiLocale: "principal" | "tenant" | "platform" | "request"; readonly formatLocale: "principal" | "tenant" | "platform" | "request" };
}

export type LocaleCatalogStatus = "draft" | "translating" | "review" | "qualified" | "retired";
export interface ExperienceLocaleCatalog {
  readonly localeCode: SupportedLocale;
  readonly englishName: string;
  readonly nativeName: string;
  readonly direction: TextDirection;
  readonly rolloutWave: 0 | 1 | 2 | 3;
  readonly status: LocaleCatalogStatus;
  readonly coveragePct: number;
  readonly linguisticReviewPassed: boolean;
  readonly layoutReviewPassed: boolean;
  readonly automatedTestsPassed: boolean;
  readonly qualified: boolean;
}
export interface ExperienceLocalePolicy { readonly planeKey: PlaneKey; readonly catalogs: readonly ExperienceLocaleCatalog[]; readonly enabledLocales: readonly SupportedLocale[]; readonly defaultLocale: SupportedLocale; readonly fallbackLocale: "en"; readonly revision: string; }

export interface ExperienceModule {
  readonly code: string;
  readonly name: string;
  readonly iconKey?: string;
  readonly sortOrder: number;
  readonly primary: boolean;
}

export interface ExperienceWorkspace {
  readonly code: string;
  readonly name: string;
  readonly iconKey?: string;
  readonly sortOrder: number;
  readonly modules: readonly ExperienceModule[];
}

export interface EffectiveFeature {
  readonly code: string;
  readonly enabled: boolean;
  readonly source: "catalog_default" | "rollout" | "tenant_override" | "kill_switch" | "version_constraint";
}

export interface ExperienceBootstrap {
  readonly schemaVersion: 1;
  readonly state: "ready" | "context_not_ready";
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly revision: string;
  readonly identity: { readonly displayName: string; readonly secondaryLabel?: string; readonly initials: string };
  readonly tenant: { readonly id: string; readonly code: string; readonly displayName: string; readonly countryCode?:string;readonly logoAssetRef?:string };
  readonly profile: ExperienceProfile;
  readonly localization: ExperienceLocalization;
  readonly localePolicy: ExperienceLocalePolicy;
  readonly workspaces: readonly ExperienceWorkspace[];
  readonly permissions: readonly string[];
  readonly features: Readonly<Record<string, EffectiveFeature>>;
  readonly nextActions: readonly ("select_context" | "retry_later")[];
}

export type NeonCapabilityGroup = "finance" | "procurement" | "inventory" | "sales" | "people" | "projects";
export interface NeonWorkContextCompany {
  readonly companyCodeId: string; readonly code: string; readonly displayName: string;
  readonly legalEntityId: string; readonly legalEntityCode: string; readonly legalEntityName: string;
  readonly countryCode?: string;readonly logoAssetRef?:string; readonly functionalCurrency: string;
  readonly capabilityGroups: readonly NeonCapabilityGroup[];
}
export interface NeonWorkContextBootstrap {
  readonly schemaVersion: 1; readonly revision: string; readonly tenantId: string;
  readonly supportsAllPermitted: boolean; readonly companies: readonly NeonWorkContextCompany[];
}

export type NeonOperatingOrganizationCapability = "procurement" | "sales" | "shared_services";
export interface NeonOperatingOrganizationAssignment {
  readonly companyCodeId: string;
  readonly participationRole: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
}
export interface NeonOperatingOrganization {
  readonly id: string; readonly code: string; readonly displayName: string; readonly domain: string;
  readonly parentId?: string; readonly path: readonly string[];
  readonly capabilities: readonly NeonOperatingOrganizationCapability[];
  readonly procurementProfileConfigured: boolean; readonly salesProfileConfigured: boolean;
  readonly companyAssignments: readonly NeonOperatingOrganizationAssignment[];
  readonly defaults: { readonly leadCompanyCodeId?: string; readonly bookingCompanyCodeId?: string; readonly invoicingCompanyCodeId?: string; readonly currency?: string };
}
export interface NeonOperatingOrganizationCatalog {
  readonly schemaVersion: 1; readonly revision: string; readonly tenantId: string; readonly effectiveAt: string;
  readonly organizations: readonly NeonOperatingOrganization[];
}

export interface MeshNetworkAccount {
  readonly networkAccountId: string; readonly code: string; readonly displayName: string;
  readonly legalName?: string; readonly role: "buyer" | "supplier" | "both";
  readonly countryCode?: string; readonly defaultCurrency?: string;readonly logoAssetRef?:string;
  readonly source: "neon_projection" | "mesh"; readonly relatedAccountCount: number;
}
export interface MeshNetworkAccountCatalog {
  readonly schemaVersion: 1; readonly revision: string; readonly tenantId: string;
  readonly accounts: readonly MeshNetworkAccount[];
}

export const meshNetworkAccountCatalogSchema = {
  $id: "https://schemas.athyper.dev/mesh/network-account-catalog.v1.json",
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "revision", "tenantId", "accounts"],
  properties: {
    schemaVersion: { const: 1 }, revision: { type: "string", minLength: 16, maxLength: 128 }, tenantId: { type: "string", format: "uuid" },
    accounts: { type: "array", items: { type: "object", additionalProperties: false, required: ["networkAccountId", "code", "displayName", "role", "source", "relatedAccountCount"], properties: {
      networkAccountId: { type: "string", format: "uuid" }, code: { type: "string", minLength: 3, maxLength: 63 }, displayName: { type: "string", minLength: 1, maxLength: 256 }, legalName: { type: "string", minLength: 1, maxLength: 256 },
      role: { enum: ["buyer", "supplier", "both"] }, countryCode: { type: "string", pattern: "^[A-Z]{2}$" }, defaultCurrency: { type: "string", pattern: "^[A-Z]{3}$" },logoAssetRef:{type:"string",pattern:"^/[A-Za-z0-9][A-Za-z0-9_./-]*$",maxLength:1024},
      source: { enum: ["neon_projection", "mesh"] }, relatedAccountCount: { type: "integer", minimum: 1, maximum: 1000 },
    } } },
  },
} as const;

export const experienceBootstrapSchema = {
  $id: "https://schemas.athyper.dev/platform/experience-bootstrap.v1.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "state", "planeKey", "tenantId", "principalId", "revision", "identity", "tenant", "profile", "localization", "localePolicy", "workspaces", "permissions", "features", "nextActions"],
  properties: {
    schemaVersion: { const: 1 },
    state: { enum: ["ready", "context_not_ready"] },
    planeKey: { enum: ["studio", "neon", "mesh"] },
    tenantId: { type: "string", format: "uuid" },
    principalId: { type: "string", format: "uuid" },
    revision: { type: "string", minLength: 16, maxLength: 128 },
    identity: { type: "object", additionalProperties: false, required: ["displayName", "initials"], properties: { displayName: { type: "string", minLength: 1, maxLength: 256 }, secondaryLabel: { type: "string", minLength: 1, maxLength: 256 }, initials: { type: "string", minLength: 1, maxLength: 8 } } },
    tenant: { type: "object", additionalProperties: false, required: ["id", "code", "displayName"], properties: { id: { type: "string", format: "uuid" }, code: { type: "string", minLength: 2, maxLength: 63 }, displayName: { type: "string", minLength: 1, maxLength: 256 },countryCode:{type:"string",pattern:"^[A-Z]{2}$"},logoAssetRef:{type:"string",pattern:"^/[A-Za-z0-9][A-Za-z0-9_./-]*$",maxLength:1024} } },
    profile: {
      type: "object", additionalProperties: false,
      required: ["localeCode", "languageCode", "timezoneCode", "dateFormat", "numberFormat", "weekStart", "weekendDays", "appearanceMode", "densityCode"],
      properties: {
        localeCode: { type: "string" }, languageCode: { type: "string" }, timezoneCode: { type: "string" },
        dateFormat: { type: "string" }, numberFormat: { type: "string" }, weekStart: { type: "integer", minimum: 0, maximum: 6 },
        weekendDays: { type: "array", uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 6 } },
        appearanceMode: { enum: ["system", "light", "dark", "high_contrast"] }, densityCode: { enum: ["comfortable", "compact"] },
      },
    },
    localization: {
      type: "object", additionalProperties: false,
      required: ["uiLocale", "catalogLocale", "formatLocale", "direction", "timeZone", "calendar", "numberingSystem", "weekStart", "weekendDays", "fallbackLocales", "catalogRevision", "source"],
      properties: {
        uiLocale: { type: "string", minLength: 2, maxLength: 35 }, catalogLocale: { type: "string", minLength: 2, maxLength: 35 }, formatLocale: { type: "string", minLength: 2, maxLength: 35 }, direction: { enum: ["ltr", "rtl"] },
        timeZone: { type: "string", minLength: 1, maxLength: 64 }, calendar: { type: "string", minLength: 1, maxLength: 32 }, numberingSystem: { type: "string", minLength: 1, maxLength: 32 }, weekStart: { type: "integer", minimum: 0, maximum: 6 },
        weekendDays: { type: "array", uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 6 } }, fallbackLocales: { type: "array", uniqueItems: true, items: { type: "string", minLength: 2, maxLength: 35 } }, catalogRevision: { type: "string", minLength: 1, maxLength: 128 },
        source: { type: "object", additionalProperties: false, required: ["uiLocale", "formatLocale"], properties: { uiLocale: { enum: ["principal", "tenant", "platform", "request"] }, formatLocale: { enum: ["principal", "tenant", "platform", "request"] } } },
      },
    },
    localePolicy: { type:"object",additionalProperties:false,required:["planeKey","catalogs","enabledLocales","defaultLocale","fallbackLocale","revision"],properties:{planeKey:{enum:["studio","neon","mesh"]},catalogs:{type:"array",minItems:8,maxItems:8,items:{type:"object",additionalProperties:false,required:["localeCode","englishName","nativeName","direction","rolloutWave","status","coveragePct","linguisticReviewPassed","layoutReviewPassed","automatedTestsPassed","qualified"],properties:{localeCode:{enum:["en","ar","ms","zh-Hans","hi","ta","fr","de"]},englishName:{type:"string",minLength:1},nativeName:{type:"string",minLength:1},direction:{enum:["ltr","rtl"]},rolloutWave:{type:"integer",minimum:0,maximum:3},status:{enum:["draft","translating","review","qualified","retired"]},coveragePct:{type:"integer",minimum:0,maximum:100},linguisticReviewPassed:{type:"boolean"},layoutReviewPassed:{type:"boolean"},automatedTestsPassed:{type:"boolean"},qualified:{type:"boolean"}}}},enabledLocales:{type:"array",minItems:1,uniqueItems:true,items:{enum:["en","ar","ms","zh-Hans","hi","ta","fr","de"]}},defaultLocale:{enum:["en","ar","ms","zh-Hans","hi","ta","fr","de"]},fallbackLocale:{const:"en"},revision:{type:"string",minLength:1,maxLength:128}} },
    workspaces: { type: "array", items: { $ref: "#/$defs/workspace" } },
    permissions: { type: "array", uniqueItems: true, items: { type: "string" } },
    features: { type: "object", additionalProperties: { $ref: "#/$defs/feature" } },
    nextActions: { type: "array", uniqueItems: true, items: { enum: ["select_context", "retry_later"] } },
  },
  $defs: {
    module: { type: "object", additionalProperties: false, required: ["code", "name", "sortOrder", "primary"], properties: { code: { type: "string" }, name: { type: "string" }, iconKey: { type: "string" }, sortOrder: { type: "integer" }, primary: { type: "boolean" } } },
    workspace: { type: "object", additionalProperties: false, required: ["code", "name", "sortOrder", "modules"], properties: { code: { type: "string" }, name: { type: "string" }, iconKey: { type: "string" }, sortOrder: { type: "integer" }, modules: { type: "array", items: { $ref: "#/$defs/module" } } } },
    feature: { type: "object", additionalProperties: false, required: ["code", "enabled", "source"], properties: { code: { type: "string" }, enabled: { type: "boolean" }, source: { enum: ["catalog_default", "rollout", "tenant_override", "kill_switch", "version_constraint"] } } },
  },
} as const;

export const neonWorkContextBootstrapSchema = {
  $id: "https://schemas.athyper.dev/neon/work-context-bootstrap.v1.json",
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "revision", "tenantId", "supportsAllPermitted", "companies"],
  properties: {
    schemaVersion: { const: 1 }, revision: { type: "string", minLength: 16, maxLength: 128 }, tenantId: { type: "string", format: "uuid" }, supportsAllPermitted: { type: "boolean" },
    companies: { type: "array", items: { type: "object", additionalProperties: false, required: ["companyCodeId", "code", "displayName", "legalEntityId", "legalEntityCode", "legalEntityName", "functionalCurrency", "capabilityGroups"], properties: {
      companyCodeId: { type: "string", format: "uuid" }, code: { type: "string", minLength: 2, maxLength: 63 }, displayName: { type: "string", minLength: 1, maxLength: 256 },
      legalEntityId: { type: "string", format: "uuid" }, legalEntityCode: { type: "string", minLength: 2, maxLength: 63 }, legalEntityName: { type: "string", minLength: 1, maxLength: 256 },
      countryCode: { type: "string", minLength: 2, maxLength: 2 },logoAssetRef:{type:"string",pattern:"^/[A-Za-z0-9][A-Za-z0-9_./-]*$",maxLength:1024}, functionalCurrency: { type: "string", minLength: 3, maxLength: 3 },
      capabilityGroups: { type: "array", uniqueItems: true, items: { enum: ["finance", "procurement", "inventory", "sales", "people", "projects"] } },
    } } },
  },
} as const;

export const neonOperatingOrganizationCatalogSchema = {
  $id: "https://schemas.athyper.dev/neon/operating-organization-catalog.v1.json",
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "revision", "tenantId", "effectiveAt", "organizations"],
  properties: {
    schemaVersion: { const: 1 }, revision: { type: "string", minLength: 16, maxLength: 128 }, tenantId: { type: "string", format: "uuid" }, effectiveAt: { type: "string", format: "date-time" },
    organizations: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "code", "displayName", "domain", "path", "capabilities", "procurementProfileConfigured", "salesProfileConfigured", "companyAssignments", "defaults"], properties: {
      id: { type: "string", format: "uuid" }, code: { type: "string", minLength: 2, maxLength: 128 }, displayName: { type: "string", minLength: 1, maxLength: 256 }, domain: { type: "string", minLength: 1, maxLength: 64 }, parentId: { type: "string", format: "uuid" },
      path: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 256 } }, capabilities: { type: "array", uniqueItems: true, items: { enum: ["procurement", "sales", "shared_services"] } },
      procurementProfileConfigured: { type: "boolean" }, salesProfileConfigured: { type: "boolean" },
      companyAssignments: { type: "array", items: { type: "object", additionalProperties: false, required: ["companyCodeId", "participationRole", "effectiveFrom"], properties: { companyCodeId: { type: "string", format: "uuid" }, participationRole: { type: "string", minLength: 1, maxLength: 64 }, effectiveFrom: { type: "string", format: "date" }, effectiveUntil: { type: "string", format: "date" } } } },
      defaults: { type: "object", additionalProperties: false, properties: { leadCompanyCodeId: { type: "string", format: "uuid" }, bookingCompanyCodeId: { type: "string", format: "uuid" }, invoicingCompanyCodeId: { type: "string", format: "uuid" }, currency: { type: "string", minLength: 3, maxLength: 3 } } },
    } } },
  },
} as const;
