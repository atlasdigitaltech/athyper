export interface FeatureDecision { readonly code: string; readonly enabled: boolean; readonly source: "catalog" | "tenant_override" | "kill_switch"; readonly revision: string; }
export interface AuthorizationSnapshot { readonly schemaVersion: 1; readonly profileHash: string; readonly allowed: readonly string[]; readonly features: Readonly<Record<string, FeatureDecision>>; }

export function parseAuthorizationSnapshot(value: unknown): AuthorizationSnapshot {
  const record = object(value, "authorization snapshot");
  if (record.schemaVersion !== 1) throw new TypeError("schemaVersion must be 1");
  const allowed = canonicalCodes(record.allowed, "allowed");
  const source = object(record.features, "features");
  const features: Record<string, FeatureDecision> = {};
  for (const [key, candidate] of Object.entries(source)) {
    const item = object(candidate, `features.${key}`);
    const featureCode = canonicalCode(item.code, `features.${key}.code`);
    if (featureCode !== key) throw new TypeError(`features.${key}.code must match its key`);
    if (typeof item.enabled !== "boolean") throw new TypeError(`features.${key}.enabled must be boolean`);
    const decisionSource = oneOf(item.source, ["catalog", "tenant_override", "kill_switch"] as const, `features.${key}.source`);
    features[key] = Object.freeze({ code: featureCode, enabled: item.enabled, source: decisionSource, revision: text(item.revision, `features.${key}.revision`) });
  }
  return Object.freeze({ schemaVersion: 1, profileHash: text(record.profileHash, "profileHash"), allowed, features: Object.freeze(features) });
}

export function hasPermission(snapshot: AuthorizationSnapshot, permission: string): boolean { return snapshot.allowed.includes(permission); }
export function isFeatureEnabled(snapshot: AuthorizationSnapshot, feature: string): boolean { return snapshot.features[feature]?.enabled === true; }

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown>; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty`); return value.trim(); }
function canonicalCode(value: unknown, name: string): string { const result = text(value, name); if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(result)) throw new TypeError(`${name} must be a canonical code`); return result; }
function canonicalCodes(value: unknown, name: string): readonly string[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return Object.freeze([...new Set(value.map((item, index) => canonicalCode(item, `${name}[${index}]`)))].sort()); }
function oneOf<const T extends readonly string[]>(value: unknown, values: T, name: string): T[number] { if (typeof value !== "string" || !values.includes(value as T[number])) throw new TypeError(`${name} is invalid`); return value as T[number]; }
