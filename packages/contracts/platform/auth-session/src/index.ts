export const SESSION_PLANES = Object.freeze(["studio", "neon", "mesh"] as const);
export type SessionPlane = (typeof SESSION_PLANES)[number];
export type SessionState = "anonymous" | "authenticated" | "required_action" | "context_required";
export type AssuranceLevel = "baseline" | "elevated";
export type SessionNextAction = "login" | "select_context" | "complete_required_action" | "continue" | "logout" | "refresh";

export interface SanitizedSession {
  readonly schemaVersion: 1;
  readonly state: SessionState;
  readonly plane: SessionPlane;
  readonly realmKey?: string;
  readonly expiresAt?: string;
  readonly tenantId?: string;
  readonly principalId?: string;
  readonly authEpoch?: number;
  readonly sessionVersion?: number;
  readonly configurationRevision?: string;
  readonly idleExpiresAt?: string;
  readonly absoluteExpiresAt?: string;
  readonly accessExpiresAt?: string;
  readonly assurance?: AssuranceLevel;
  readonly elevationExpiresAt?: string;
  readonly requiredActions: readonly string[];
  readonly allowedNextActions?: readonly SessionNextAction[];
}

export interface PrincipalQueryScope {
  readonly plane: SessionPlane;
  readonly tenantId: string;
  readonly principalId: string;
  readonly authEpoch: number;
}

/** Framework-free key roots. Feature packages append their own stable segments. */
export const principalQueryKeys = Object.freeze({
  root: (scope: PrincipalQueryScope) => ["principal", scope.plane, scope.tenantId, scope.authEpoch] as const,
  session: (plane: SessionPlane) => ["session", plane] as const,
  scopedSession: (scope: PrincipalQueryScope) => [...principalQueryKeys.root(scope), "session"] as const,
});

export function principalQueryScope(session: SanitizedSession): PrincipalQueryScope | undefined {
  return session.state === "authenticated" && session.tenantId && session.principalId && session.authEpoch !== undefined
    ? Object.freeze({ plane: session.plane, tenantId: session.tenantId, principalId: session.principalId, authEpoch: session.authEpoch })
    : undefined;
}

export function parseSanitizedSession(value: unknown): SanitizedSession {
  const record = object(value);
  if (record.schemaVersion !== 1) throw new TypeError("schemaVersion must be 1");
  const state = oneOf(record.state, ["anonymous", "authenticated", "required_action", "context_required"] as const, "state");
  const plane = oneOf(record.plane, SESSION_PLANES, "plane");
  // `requiredActions` was introduced without a schema-version bump. Treat an
  // omitted field from an older schema-v1 producer as the semantic empty set,
  // while continuing to reject malformed values and empty required-action
  // sessions below.
  const legacyEmptyRequiredActions = record.requiredActions !== null && typeof record.requiredActions === "object" && !Array.isArray(record.requiredActions) && Object.keys(record.requiredActions).length === 0;
  const requiredActions = record.requiredActions == null || legacyEmptyRequiredActions ? Object.freeze([] as string[]) : strings(record.requiredActions, "requiredActions");
  const tenantId = optionalText(record.tenantId, "tenantId");
  const principalId = optionalText(record.principalId, "principalId");
  const authEpoch = optionalInteger(record.authEpoch, "authEpoch");
  const sessionVersion = optionalInteger(record.sessionVersion, "sessionVersion");
  const realmKey = optionalText(record.realmKey, "realmKey");
  const configurationRevision = optionalText(record.configurationRevision, "configurationRevision");
  const expiresAt = optionalTimestamp(record.expiresAt, "expiresAt");
  const idleExpiresAt = optionalTimestamp(record.idleExpiresAt, "idleExpiresAt");
  const absoluteExpiresAt = optionalTimestamp(record.absoluteExpiresAt, "absoluteExpiresAt");
  const accessExpiresAt = optionalTimestamp(record.accessExpiresAt, "accessExpiresAt");
  const elevationExpiresAt = optionalTimestamp(record.elevationExpiresAt, "elevationExpiresAt");
  const assurance = record.assurance === undefined ? undefined : oneOf(record.assurance, ["baseline", "elevated"] as const, "assurance");
  const allowedNextActions = record.allowedNextActions === undefined ? undefined : oneOfStrings(record.allowedNextActions, ["login", "select_context", "complete_required_action", "continue", "logout", "refresh"] as const, "allowedNextActions");
  if (state === "anonymous" && (tenantId || principalId || authEpoch !== undefined)) throw new TypeError("anonymous session cannot expose principal context");
  if (state === "context_required" && (tenantId || principalId || authEpoch !== undefined)) throw new TypeError("context_required session cannot expose unselected principal context");
  if (state === "authenticated" && (!tenantId || !principalId || !realmKey || authEpoch === undefined || sessionVersion === undefined || !configurationRevision || !expiresAt || !idleExpiresAt || !absoluteExpiresAt || !assurance)) throw new TypeError("authenticated session requires realm, context, epoch, version, configuration, assurance, and expiry");
  if (state === "required_action" && requiredActions.length === 0) throw new TypeError("required_action session requires actions");
  return Object.freeze({ schemaVersion: 1, state, plane, ...(realmKey ? { realmKey } : {}), ...(expiresAt ? { expiresAt } : {}), ...(idleExpiresAt ? { idleExpiresAt } : {}), ...(absoluteExpiresAt ? { absoluteExpiresAt } : {}), ...(accessExpiresAt ? { accessExpiresAt } : {}), ...(tenantId ? { tenantId } : {}), ...(principalId ? { principalId } : {}), ...(authEpoch !== undefined ? { authEpoch } : {}), ...(sessionVersion !== undefined ? { sessionVersion } : {}), ...(configurationRevision ? { configurationRevision } : {}), ...(assurance ? { assurance } : {}), ...(elevationExpiresAt ? { elevationExpiresAt } : {}), requiredActions, ...(allowedNextActions ? { allowedNextActions } : {}) });
}

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("session must be an object"); return value as Record<string, unknown>; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty`); return value.trim(); }
function optionalText(value: unknown, name: string): string | undefined { return value === undefined ? undefined : text(value, name); }
function optionalInteger(value: unknown, name: string): number | undefined { if (value === undefined) return undefined; if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`); return value; }
function optionalTimestamp(value: unknown, name: string): string | undefined { const result = optionalText(value, name); if (result && !Number.isFinite(Date.parse(result))) throw new TypeError(`${name} must be an ISO timestamp`); return result; }
function strings(value: unknown, name: string): readonly string[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return Object.freeze([...new Set(value.map((item, index) => text(item, `${name}[${index}]`)))]); }
function oneOf<const T extends readonly string[]>(value: unknown, values: T, name: string): T[number] { if (typeof value !== "string" || !values.includes(value as T[number])) throw new TypeError(`${name} is invalid`); return value as T[number]; }
function oneOfStrings<const T extends readonly string[]>(value: unknown, values: T, name: string): readonly T[number][] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return Object.freeze([...new Set(value.map((item, index) => oneOf(item, values, `${name}[${index}]`)))]); }
