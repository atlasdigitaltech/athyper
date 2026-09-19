import { parseSanitizedSession, type SanitizedSession } from "@athyper/contract-platform-auth-session";
import { parseAuthorizationSnapshot, type AuthorizationSnapshot } from "@athyper/contract-platform-authorization";
import { parseNavigationCatalog, type NavigationCatalog } from "@athyper/contract-platform-navigation";
import { LOCALE_REGISTRY, createEffectiveLocalization, type EffectiveLocalization, type SupportedLocale, type TextDirection } from "@athyper/platform-i18n";

export interface PlatformBootstrap {
  readonly schemaVersion: 1;
  readonly session: SanitizedSession;
  readonly authorization: AuthorizationSnapshot;
  readonly navigation: NavigationCatalog;
}

export interface ExperienceProfile { readonly localeCode: string; readonly languageCode: string; readonly timezoneCode: string; readonly dateFormat: string; readonly numberFormat: string; readonly weekStart: number; readonly weekendDays: readonly number[]; readonly appearanceMode: "system" | "light" | "dark" | "high_contrast"; readonly densityCode: "comfortable" | "compact"; }
export interface ExperienceModule { readonly code: string; readonly name: string; readonly iconKey?: string; readonly sortOrder: number; readonly primary: boolean; }
export interface ExperienceWorkspace { readonly code: string; readonly name: string; readonly iconKey?: string; readonly sortOrder: number; readonly modules: readonly ExperienceModule[]; }
export interface ExperienceFeature { readonly code: string; readonly enabled: boolean; readonly source: "catalog_default" | "rollout" | "tenant_override" | "kill_switch" | "version_constraint"; }
export type LocaleCatalogStatus = "draft" | "translating" | "review" | "qualified" | "retired";
export interface ExperienceLocaleCatalog { readonly localeCode:SupportedLocale;readonly englishName:string;readonly nativeName:string;readonly direction:TextDirection;readonly rolloutWave:0|1|2|3;readonly status:LocaleCatalogStatus;readonly coveragePct:number;readonly linguisticReviewPassed:boolean;readonly layoutReviewPassed:boolean;readonly automatedTestsPassed:boolean;readonly qualified:boolean; }
export interface ExperienceLocalePolicy { readonly planeKey:"studio"|"neon"|"mesh";readonly catalogs:readonly ExperienceLocaleCatalog[];readonly enabledLocales:readonly SupportedLocale[];readonly defaultLocale:SupportedLocale;readonly fallbackLocale:"en";readonly revision:string; }
export interface ExperienceBootstrap {
  readonly schemaVersion: 1; readonly state: "ready" | "context_not_ready"; readonly planeKey: SanitizedSession["plane"];
  readonly tenantId: string; readonly principalId: string; readonly revision: string; readonly profile: ExperienceProfile;
  readonly localization: EffectiveLocalization;
  readonly localePolicy: ExperienceLocalePolicy;
  readonly identity: Readonly<{ displayName: string; secondaryLabel?: string; initials: string }>;
  readonly tenant: Readonly<{ id: string; code: string; displayName: string;countryCode?:string;logoAssetRef?:string }>;
  readonly workspaces: readonly ExperienceWorkspace[]; readonly permissions: readonly string[];
  readonly features: Readonly<Record<string, ExperienceFeature>>; readonly nextActions: readonly ("select_context" | "retry_later")[];
}

export const experienceQueryKeys = Object.freeze({
  bootstrap: (scope: { readonly plane: SanitizedSession["plane"]; readonly tenantId: string; readonly authEpoch: number }) => ["principal", scope.plane, scope.tenantId, scope.authEpoch, "experience", "bootstrap"] as const,
});

export function parseExperienceBootstrap(value: unknown): ExperienceBootstrap {
  const record = object(value, "experience bootstrap");
  if (record.schemaVersion !== 1) throw new TypeError("experience bootstrap schemaVersion must be 1");
  const state = oneOf(record.state, ["ready", "context_not_ready"] as const, "state");
  const planeKey = oneOf(record.planeKey, ["studio", "neon", "mesh"] as const, "planeKey");
  const profileRecord = object(record.profile, "profile");
  const identityRecord=object(record.identity,"identity"),tenantRecord=object(record.tenant,"tenant");
  const identity=Object.freeze({displayName:text(identityRecord.displayName,"identity.displayName"),...(optionalText(identityRecord.secondaryLabel)?{secondaryLabel:optionalText(identityRecord.secondaryLabel)}:{}),initials:text(identityRecord.initials,"identity.initials")});
  const tenant=Object.freeze({id:text(tenantRecord.id,"tenant.id"),code:code(tenantRecord.code,"tenant.code"),displayName:text(tenantRecord.displayName,"tenant.displayName"),...(country(tenantRecord.countryCode)?{countryCode:country(tenantRecord.countryCode)}:{}),...(assetRef(tenantRecord.logoAssetRef)?{logoAssetRef:assetRef(tenantRecord.logoAssetRef)}:{})});
  const profile: ExperienceProfile = Object.freeze({ localeCode: text(profileRecord.localeCode, "profile.localeCode"), languageCode: text(profileRecord.languageCode, "profile.languageCode"), timezoneCode: text(profileRecord.timezoneCode, "profile.timezoneCode"), dateFormat: text(profileRecord.dateFormat, "profile.dateFormat"), numberFormat: text(profileRecord.numberFormat, "profile.numberFormat"), weekStart: integer(profileRecord.weekStart, "profile.weekStart", 0, 6), weekendDays: numbers(profileRecord.weekendDays, "profile.weekendDays", 0, 6), appearanceMode: oneOf(profileRecord.appearanceMode, ["system", "light", "dark", "high_contrast"] as const, "profile.appearanceMode"), densityCode: oneOf(profileRecord.densityCode, ["comfortable", "compact"] as const, "profile.densityCode") });
  const localization = parseLocalization(record.localization, profile);
  const localePolicy=parseLocalePolicy(record.localePolicy,planeKey);
  const workspaces = array(record.workspaces, "workspaces").map((candidate, workspaceIndex) => { const workspace = object(candidate, `workspaces[${workspaceIndex}]`); return Object.freeze({ code: code(workspace.code, `workspaces[${workspaceIndex}].code`), name: text(workspace.name, `workspaces[${workspaceIndex}].name`), ...(optionalText(workspace.iconKey) ? { iconKey: optionalText(workspace.iconKey) } : {}), sortOrder: integer(workspace.sortOrder, `workspaces[${workspaceIndex}].sortOrder`, 0), modules: Object.freeze(array(workspace.modules, `workspaces[${workspaceIndex}].modules`).map((candidateModule, moduleIndex) => { const module = object(candidateModule, `workspaces[${workspaceIndex}].modules[${moduleIndex}]`); return Object.freeze({ code: code(module.code, "module.code"), name: text(module.name, "module.name"), ...(optionalText(module.iconKey) ? { iconKey: optionalText(module.iconKey) } : {}), sortOrder: integer(module.sortOrder, "module.sortOrder", 0), primary: boolean(module.primary, "module.primary") }); })) }); });
  const featuresRecord = object(record.features, "features"), features: Record<string, ExperienceFeature> = {};
  for (const [key, candidate] of Object.entries(featuresRecord)) { const feature = object(candidate, `features.${key}`), featureCode = code(feature.code, `features.${key}.code`); if (featureCode !== key) throw new TypeError(`features.${key}.code must match its key`); features[key] = Object.freeze({ code: featureCode, enabled: boolean(feature.enabled, `features.${key}.enabled`), source: oneOf(feature.source, ["catalog_default", "rollout", "tenant_override", "kill_switch", "version_constraint"] as const, `features.${key}.source`) }); }
  const result: ExperienceBootstrap = { schemaVersion: 1, state, planeKey, tenantId: text(record.tenantId, "tenantId"), principalId: text(record.principalId, "principalId"), revision: text(record.revision, "revision"), identity,tenant,profile, localization,localePolicy, workspaces: Object.freeze(workspaces), permissions: strings(record.permissions, "permissions"), features: Object.freeze(features), nextActions: oneOfStrings(record.nextActions, ["select_context", "retry_later"] as const, "nextActions") };
  if(result.tenant.id!==result.tenantId)throw new TypeError("tenant identity must match tenantId");
  if (state === "context_not_ready" && (result.workspaces.length || result.permissions.length || Object.keys(result.features).length)) throw new TypeError("context_not_ready bootstrap must not expose access");
  return Object.freeze(result);
}

export function parsePlatformBootstrap(value: unknown): PlatformBootstrap {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("bootstrap must be an object");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) throw new TypeError("bootstrap schemaVersion must be 1");
  return Object.freeze({ schemaVersion: 1, session: parseSanitizedSession(record.session), authorization: parseAuthorizationSnapshot(record.authorization), navigation: parseNavigationCatalog(record.navigation) });
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown>; }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty`); return value.trim(); }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function country(value:unknown):string|undefined{const result=optionalText(value);if(result&&!/^[A-Z]{2}$/.test(result))throw new TypeError("countryCode must be ISO alpha-2");return result;}
function assetRef(value:unknown):string|undefined{const result=optionalText(value);if(result&&(!/^\/[A-Za-z0-9][A-Za-z0-9_./-]{0,1022}$/.test(result)||/(^|\/)\.\.(\/|$)/.test(result)))throw new TypeError("logoAssetRef must be a safe same-origin path");return result;}
function code(value: unknown, name: string): string { const result = text(value, name); if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(result)) throw new TypeError(`${name} must be a catalog code`); return result; }
function boolean(value: unknown, name: string): boolean { if (typeof value !== "boolean") throw new TypeError(`${name} must be boolean`); return value; }
function integer(value: unknown, name: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number { if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`); return Number(value); }
function numbers(value: unknown, name: string, minimum: number, maximum: number): readonly number[] { return Object.freeze([...new Set(array(value, name).map((item, index) => integer(item, `${name}[${index}]`, minimum, maximum)))]); }
function strings(value: unknown, name: string): readonly string[] { return Object.freeze([...new Set(array(value, name).map((item, index) => text(item, `${name}[${index}]`)))].sort()); }
function oneOf<const Values extends readonly string[]>(value: unknown, values: Values, name: string): Values[number] { if (typeof value !== "string" || !values.includes(value as Values[number])) throw new TypeError(`${name} is invalid`); return value as Values[number]; }
function oneOfStrings<const Values extends readonly string[]>(value: unknown, values: Values, name: string): readonly Values[number][] { return Object.freeze(array(value, name).map((item, index) => oneOf(item, values, `${name}[${index}]`))); }

function parseLocalization(value: unknown, profile: ExperienceProfile): EffectiveLocalization {
  if (value === undefined) return createEffectiveLocalization({ uiLocale: profile.localeCode, formatLocale: profile.localeCode, timeZone: profile.timezoneCode, numberingSystem: profile.numberFormat, weekStart: profile.weekStart, weekendDays: profile.weekendDays });
  const record = object(value, "localization"), source = object(record.source, "localization.source");
  return Object.freeze({
    uiLocale: text(record.uiLocale, "localization.uiLocale"), catalogLocale: text(record.catalogLocale, "localization.catalogLocale"), formatLocale: text(record.formatLocale, "localization.formatLocale"),
    direction: oneOf(record.direction, ["ltr", "rtl"] as const, "localization.direction"), timeZone: text(record.timeZone, "localization.timeZone"), calendar: text(record.calendar, "localization.calendar"), numberingSystem: text(record.numberingSystem, "localization.numberingSystem"),
    weekStart: integer(record.weekStart, "localization.weekStart", 0, 6), weekendDays: numbers(record.weekendDays, "localization.weekendDays", 0, 6), fallbackLocales: strings(record.fallbackLocales, "localization.fallbackLocales"), catalogRevision: text(record.catalogRevision, "localization.catalogRevision"),
    source: Object.freeze({ uiLocale: oneOf(source.uiLocale, ["principal", "tenant", "platform", "request"] as const, "localization.source.uiLocale"), formatLocale: oneOf(source.formatLocale, ["principal", "tenant", "platform", "request"] as const, "localization.source.formatLocale") }),
  });
}
export function parseExperienceLocalePolicy(value:unknown,expectedPlane?:ExperienceLocalePolicy["planeKey"]):ExperienceLocalePolicy{
  const compatibility=(planeKey:ExperienceLocalePolicy["planeKey"]):ExperienceLocalePolicy=>Object.freeze({planeKey,catalogs:Object.freeze(LOCALE_REGISTRY.map((entry)=>Object.freeze({localeCode:entry.code,englishName:entry.englishName,nativeName:entry.nativeName,direction:entry.direction,rolloutWave:entry.rolloutWave,status:entry.code==="en"||entry.code==="ar"?"qualified" as const:"draft" as const,coveragePct:entry.code==="en"||entry.code==="ar"?100:0,linguisticReviewPassed:entry.code==="en"||entry.code==="ar",layoutReviewPassed:entry.code==="en"||entry.code==="ar",automatedTestsPassed:entry.code==="en"||entry.code==="ar",qualified:entry.code==="en"||entry.code==="ar"}))),enabledLocales:Object.freeze(["en","ar"] as const),defaultLocale:"en",fallbackLocale:"en",revision:"locale-policy:compatibility"});
  if(value===undefined){if(!expectedPlane)throw new TypeError("localePolicy is required");return compatibility(expectedPlane);}
  const record=object(value,"localePolicy"),policyPlane=oneOf(record.planeKey,["studio","neon","mesh"] as const,"localePolicy.planeKey");
  if(expectedPlane&&policyPlane!==expectedPlane)throw new TypeError("localePolicy.planeKey must match planeKey");
  const localeCodes=["en","ar","ms","zh-Hans","hi","ta","fr","de"] as const;
  const catalogs=Object.freeze(array(record.catalogs,"localePolicy.catalogs").map((candidate,index)=>{const row=object(candidate,`localePolicy.catalogs[${index}]`);return Object.freeze({localeCode:oneOf(row.localeCode,localeCodes,"localeCode"),englishName:text(row.englishName,"englishName"),nativeName:text(row.nativeName,"nativeName"),direction:oneOf(row.direction,["ltr","rtl"] as const,"direction"),rolloutWave:integer(row.rolloutWave,"rolloutWave",0,3) as 0|1|2|3,status:oneOf(row.status,["draft","translating","review","qualified","retired"] as const,"status"),coveragePct:integer(row.coveragePct,"coveragePct",0,100),linguisticReviewPassed:boolean(row.linguisticReviewPassed,"linguisticReviewPassed"),layoutReviewPassed:boolean(row.layoutReviewPassed,"layoutReviewPassed"),automatedTestsPassed:boolean(row.automatedTestsPassed,"automatedTestsPassed"),qualified:boolean(row.qualified,"qualified")});}));
  if(catalogs.length!==localeCodes.length||new Set(catalogs.map((item)=>item.localeCode)).size!==localeCodes.length)throw new TypeError("localePolicy.catalogs must contain all registered locales");
  for(const definition of LOCALE_REGISTRY){const catalog=catalogs.find((item)=>item.localeCode===definition.code)!;if(catalog.englishName!==definition.englishName||catalog.nativeName!==definition.nativeName||catalog.direction!==definition.direction||catalog.rolloutWave!==definition.rolloutWave)throw new TypeError(`localePolicy catalog metadata is invalid for ${definition.code}`);const qualified=catalog.status==="qualified"&&catalog.coveragePct===100&&catalog.linguisticReviewPassed&&catalog.layoutReviewPassed&&catalog.automatedTestsPassed;if(catalog.qualified!==qualified)throw new TypeError(`localePolicy qualification is invalid for ${definition.code}`);}
  const enabled=oneOfStrings(record.enabledLocales,localeCodes,"localePolicy.enabledLocales");if(!enabled.length)throw new TypeError("localePolicy.enabledLocales must not be empty");
  if(enabled.some((locale)=>!catalogs.find((catalog)=>catalog.localeCode===locale)?.qualified))throw new TypeError("localePolicy can enable only qualified catalogs");
  const defaultLocale=oneOf(record.defaultLocale,localeCodes,"localePolicy.defaultLocale"),fallbackLocale=oneOf(record.fallbackLocale,["en"] as const,"localePolicy.fallbackLocale");if(!enabled.includes(defaultLocale)||!enabled.includes(fallbackLocale))throw new TypeError("localePolicy defaults must be enabled");
  return Object.freeze({planeKey:policyPlane,catalogs,enabledLocales:enabled,defaultLocale,fallbackLocale,revision:text(record.revision,"localePolicy.revision")});
}
function parseLocalePolicy(value:unknown,planeKey:ExperienceLocalePolicy["planeKey"]):ExperienceLocalePolicy{return parseExperienceLocalePolicy(value,planeKey);}
