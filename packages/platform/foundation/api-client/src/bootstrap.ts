import { parseSanitizedSession, type SanitizedSession } from "@athyper/contract-platform-auth-session";
import { parseAuthorizationSnapshot, type AuthorizationSnapshot } from "@athyper/contract-platform-authorization";
import { parseNavigationCatalog, type NavigationCatalog } from "@athyper/contract-platform-navigation";

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
export interface ExperienceBootstrap {
  readonly schemaVersion: 1; readonly state: "ready" | "context_not_ready"; readonly planeKey: SanitizedSession["plane"];
  readonly tenantId: string; readonly principalId: string; readonly revision: string; readonly profile: ExperienceProfile;
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
  const profile: ExperienceProfile = Object.freeze({ localeCode: text(profileRecord.localeCode, "profile.localeCode"), languageCode: text(profileRecord.languageCode, "profile.languageCode"), timezoneCode: text(profileRecord.timezoneCode, "profile.timezoneCode"), dateFormat: text(profileRecord.dateFormat, "profile.dateFormat"), numberFormat: text(profileRecord.numberFormat, "profile.numberFormat"), weekStart: integer(profileRecord.weekStart, "profile.weekStart", 0, 6), weekendDays: numbers(profileRecord.weekendDays, "profile.weekendDays", 0, 6), appearanceMode: oneOf(profileRecord.appearanceMode, ["system", "light", "dark", "high_contrast"] as const, "profile.appearanceMode"), densityCode: oneOf(profileRecord.densityCode, ["comfortable", "compact"] as const, "profile.densityCode") });
  const workspaces = array(record.workspaces, "workspaces").map((candidate, workspaceIndex) => { const workspace = object(candidate, `workspaces[${workspaceIndex}]`); return Object.freeze({ code: code(workspace.code, `workspaces[${workspaceIndex}].code`), name: text(workspace.name, `workspaces[${workspaceIndex}].name`), ...(optionalText(workspace.iconKey) ? { iconKey: optionalText(workspace.iconKey) } : {}), sortOrder: integer(workspace.sortOrder, `workspaces[${workspaceIndex}].sortOrder`, 0), modules: Object.freeze(array(workspace.modules, `workspaces[${workspaceIndex}].modules`).map((candidateModule, moduleIndex) => { const module = object(candidateModule, `workspaces[${workspaceIndex}].modules[${moduleIndex}]`); return Object.freeze({ code: code(module.code, "module.code"), name: text(module.name, "module.name"), ...(optionalText(module.iconKey) ? { iconKey: optionalText(module.iconKey) } : {}), sortOrder: integer(module.sortOrder, "module.sortOrder", 0), primary: boolean(module.primary, "module.primary") }); })) }); });
  const featuresRecord = object(record.features, "features"), features: Record<string, ExperienceFeature> = {};
  for (const [key, candidate] of Object.entries(featuresRecord)) { const feature = object(candidate, `features.${key}`), featureCode = code(feature.code, `features.${key}.code`); if (featureCode !== key) throw new TypeError(`features.${key}.code must match its key`); features[key] = Object.freeze({ code: featureCode, enabled: boolean(feature.enabled, `features.${key}.enabled`), source: oneOf(feature.source, ["catalog_default", "rollout", "tenant_override", "kill_switch", "version_constraint"] as const, `features.${key}.source`) }); }
  const result: ExperienceBootstrap = { schemaVersion: 1, state, planeKey, tenantId: text(record.tenantId, "tenantId"), principalId: text(record.principalId, "principalId"), revision: text(record.revision, "revision"), profile, workspaces: Object.freeze(workspaces), permissions: strings(record.permissions, "permissions"), features: Object.freeze(features), nextActions: oneOfStrings(record.nextActions, ["select_context", "retry_later"] as const, "nextActions") };
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
function code(value: unknown, name: string): string { const result = text(value, name); if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(result)) throw new TypeError(`${name} must be a catalog code`); return result; }
function boolean(value: unknown, name: string): boolean { if (typeof value !== "boolean") throw new TypeError(`${name} must be boolean`); return value; }
function integer(value: unknown, name: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number { if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`); return Number(value); }
function numbers(value: unknown, name: string, minimum: number, maximum: number): readonly number[] { return Object.freeze([...new Set(array(value, name).map((item, index) => integer(item, `${name}[${index}]`, minimum, maximum)))]); }
function strings(value: unknown, name: string): readonly string[] { return Object.freeze([...new Set(array(value, name).map((item, index) => text(item, `${name}[${index}]`)))].sort()); }
function oneOf<const Values extends readonly string[]>(value: unknown, values: Values, name: string): Values[number] { if (typeof value !== "string" || !values.includes(value as Values[number])) throw new TypeError(`${name} is invalid`); return value as Values[number]; }
function oneOfStrings<const Values extends readonly string[]>(value: unknown, values: Values, name: string): readonly Values[number][] { return Object.freeze(array(value, name).map((item, index) => oneOf(item, values, `${name}[${index}]`))); }
