export type AccessDiagnosticKind = "unknown-permission" | "unknown-feature" | "unknown-module" | "server-denial";
export interface AccessDiagnostic { readonly kind: AccessDiagnosticKind; readonly code?: string; readonly status?: 401 | 403; }
export interface EffectiveFeatureDecision { readonly enabled: boolean; }
export interface AccessSnapshot {
  readonly sessionState: "anonymous" | "authenticated" | "required_action" | "context_required";
  readonly contextAvailable: boolean;
  readonly entitledModules: ReadonlySet<string>;
  readonly permissions: ReadonlySet<string>;
  readonly features: Readonly<Record<string, EffectiveFeatureDecision>>;
  readonly knownModules: ReadonlySet<string>;
  readonly knownPermissions?: ReadonlySet<string>;
  readonly knownFeatures?: ReadonlySet<string>;
  readonly onDiagnostic?: (event: AccessDiagnostic) => void;
}
export interface CreateAccessSnapshotInput {
  readonly sessionState: AccessSnapshot["sessionState"];
  readonly contextAvailable: boolean;
  readonly entitledModules: readonly string[];
  readonly permissions: readonly string[];
  readonly features: Readonly<Record<string, EffectiveFeatureDecision>>;
  readonly knownModules?: readonly string[];
  readonly knownPermissions?: readonly string[];
  readonly knownFeatures?: readonly string[];
  readonly onDiagnostic?: (event: AccessDiagnostic) => void;
}
export type AccessFailureReason = "session_unavailable" | "context_unavailable" | "not_entitled" | "not_permitted" | "feature_disabled" | "unknown_module" | "unknown_permission" | "unknown_feature";
export type AccessPresentation = "available" | "hidden" | "locked" | "unavailable";
export interface AccessDecision { readonly allowed: boolean; readonly presentation: AccessPresentation; readonly reason?: AccessFailureReason; }
export interface RouteAccessRequirement { readonly moduleCode: string; readonly requiredPermissions: readonly string[]; readonly requiredFeatures: readonly string[]; readonly navigation?: "primary" | "secondary" | "hidden"; }

export function createAccessSnapshot(input: CreateAccessSnapshotInput): AccessSnapshot {
  return Object.freeze({ sessionState: input.sessionState, contextAvailable: input.contextAvailable, entitledModules: frozenSet(input.entitledModules), permissions: frozenSet(input.permissions), features: Object.freeze({ ...input.features }), knownModules: frozenSet(input.knownModules ?? input.entitledModules), ...(input.knownPermissions ? { knownPermissions: frozenSet(input.knownPermissions) } : {}), ...(input.knownFeatures ? { knownFeatures: frozenSet(input.knownFeatures) } : {}), ...(input.onDiagnostic ? { onDiagnostic: input.onDiagnostic } : {}) });
}

/** Exact membership only. Wildcards are ordinary strings and are never expanded in the browser. */
export function hasPermission(snapshot: AccessSnapshot, code: string): boolean {
  if (!known(snapshot.knownPermissions, snapshot.permissions, code)) diagnostic(snapshot, "unknown-permission", code);
  return snapshot.permissions.has(code);
}
export function hasAnyPermission(snapshot: AccessSnapshot, codes: readonly string[]): boolean { return codes.some((code) => hasPermission(snapshot, code)); }
export function isFeatureEnabled(snapshot: AccessSnapshot, code: string): boolean {
  if (!known(snapshot.knownFeatures, new Set(Object.keys(snapshot.features)), code)) diagnostic(snapshot, "unknown-feature", code);
  return snapshot.features[code]?.enabled === true;
}

export function decideRouteAccess(snapshot: AccessSnapshot, requirement: RouteAccessRequirement): AccessDecision {
  if (snapshot.sessionState !== "authenticated") return decision(false, "unavailable", "session_unavailable");
  if (!snapshot.contextAvailable) return decision(false, "unavailable", "context_unavailable");
  if (!snapshot.knownModules.has(requirement.moduleCode)) { diagnostic(snapshot, "unknown-module", requirement.moduleCode); return decision(false, "unavailable", "unknown_module"); }
  if (!snapshot.entitledModules.has(requirement.moduleCode)) return decision(false, "locked", "not_entitled");
  for (const code of requirement.requiredPermissions) {
    if (!known(snapshot.knownPermissions, snapshot.permissions, code)) { diagnostic(snapshot, "unknown-permission", code); return decision(false, "unavailable", "unknown_permission"); }
    if (!snapshot.permissions.has(code)) return decision(false, "hidden", "not_permitted");
  }
  for (const code of requirement.requiredFeatures) {
    if (!known(snapshot.knownFeatures, new Set(Object.keys(snapshot.features)), code)) { diagnostic(snapshot, "unknown-feature", code); return decision(false, "unavailable", "unknown_feature"); }
    if (snapshot.features[code]?.enabled !== true) return decision(false, "locked", "feature_disabled");
  }
  return decision(true, requirement.navigation === "hidden" ? "hidden" : "available");
}

export interface ServerDenial { readonly authoritative: true; readonly kind: "session" | "permission"; readonly status: 401 | 403; readonly presentation: "unavailable" | "hidden"; }
export function classifyServerDenial(error: unknown, onDiagnostic?: (event: AccessDiagnostic) => void): ServerDenial | undefined {
  const record = error !== null && typeof error === "object" ? error as { status?: unknown; kind?: unknown } : undefined;
  const status = record?.status;
  if (status !== 401 && status !== 403 && record?.kind !== "authentication" && record?.kind !== "authorization") return undefined;
  const result: ServerDenial = Object.freeze(status === 401 || record?.kind === "authentication" ? { authoritative: true, kind: "session", status: 401, presentation: "unavailable" } : { authoritative: true, kind: "permission", status: 403, presentation: "hidden" });
  onDiagnostic?.(Object.freeze({ kind: "server-denial", status: result.status }));
  return result;
}

export async function runGuardedMutation<T>(operation: () => Promise<T>, onDenial: (denial: ServerDenial) => void | Promise<void>): Promise<T> {
  try { return await operation(); } catch (error) { const denial = classifyServerDenial(error); if (denial) await onDenial(denial); throw error; }
}

export function accessMessage(decision: AccessDecision): string {
  switch (decision.reason) {
    case "context_unavailable": return "Choose an available context to continue.";
    case "not_entitled": return "This capability is not available in your current plan.";
    case "not_permitted": return "You do not have access to this capability.";
    case "feature_disabled": return "This capability is currently unavailable.";
    case "session_unavailable": return "Sign in again to continue.";
    default: return decision.allowed ? "" : "This capability is unavailable.";
  }
}
function decision(allowed: boolean, presentation: AccessPresentation, reason?: AccessFailureReason): AccessDecision { return Object.freeze({ allowed, presentation, ...(reason ? { reason } : {}) }); }
function frozenSet(values: readonly string[]): ReadonlySet<string> { return new Set(values); }
function known(explicit: ReadonlySet<string> | undefined, fallback: ReadonlySet<string>, code: string): boolean { return (explicit ?? fallback).has(code); }
function diagnostic(snapshot: AccessSnapshot, kind: AccessDiagnosticKind, code: string): void { snapshot.onDiagnostic?.(Object.freeze({ kind, code })); }
