import { createHash } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type {
  AuthenticationRequest,
  AuthenticationResult,
  AuthenticationFailureCode,
  Authenticator,
  EffectivePermissionSnapshot,
  JwtClaims,
  TokenVerifier,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { normalizePlaneKey, type PlaneKey } from "@athyper/server-foundation/context";

import type { IamConfig } from "./iam-config.js";
import { evaluateRequiredActions } from "./required-actions.js";

export interface IamServiceOptions {
  readonly tokenVerifier: TokenVerifier;
  readonly audit: AuditRecorder;
  readonly config: IamConfig;
  readonly now?: () => number;
  /** Cross-checks issuer claims against local IAM projections without exposing projection values in audit. */
  readonly verifyContextProjection?: (context: { readonly tenantId: string; readonly realmKey: string; readonly organizationId?: string; readonly principalId: string }) => Promise<readonly ("tenant" | "realm" | "organization")[]>;
}

export function createIamService(options: IamServiceOptions): Authenticator {
  return {
    async authenticate(request): Promise<AuthenticationResult> {
      let token;
      try { token = await options.tokenVerifier.verify(request.token); }
      catch {
        await recordFailure(options.audit, request, "iam.authentication.failed", "invalid_token");
        return failure(401, "AUTH_TOKEN_INVALID", "Authentication token is invalid");
      }

      const identity = identityFromClaims(token.claims, token.subject, request, options.config, options.now?.() ?? Date.now());
      if (!identity.ok) {
        await recordFailure(options.audit, request, "iam.authentication.denied", identity.code);
        return identity;
      }
      const mismatches = [...(identity.mismatches ?? [])];
      if (options.verifyContextProjection) {
        mismatches.push(...await options.verifyContextProjection({ tenantId: identity.context.tenantId, realmKey: identity.context.realmKey, ...(identity.organizationId ? { organizationId: identity.organizationId } : {}), principalId: identity.context.principalId }));
      }
      if (mismatches.length && options.config.claimContextMode !== "off") {
        await recordContextMismatch(options.audit, request, mismatches);
        if (options.config.claimContextMode === "enforce") return failure(403, "AUTH_CONTEXT_MISMATCH", "Authenticated context does not match the requested context");
      }
      const requiredAction = blockingRequiredAction(token.claims, request, options.config);
      if (requiredAction) {
        await recordFailure(options.audit, request, "iam.authentication.denied", "required_action", identity.context);
        return failure(403, "AUTH_REQUIRED_ACTION_PENDING", "Complete the pending account action before continuing");
      }

      try {
        await options.audit.record({
          eventCode: "iam.authentication.succeeded",
          action: "authenticate",
          outcome: "success",
          actor: { kind: "user", principalId: identity.context.principalId },
          tenantId: identity.context.tenantId,
          requestId: request.requestId,
          ...(request.correlationId ? { correlationId: request.correlationId } : {}),
          metadata: { planeKey: request.planeKey, realmKey: identity.context.realmKey },
        });
      } catch {
        return failure(503, "AUTH_AUDIT_UNAVAILABLE", "Authentication audit is unavailable");
      }
      return identity;
    },
  };
}

function identityFromClaims(
  claims: JwtClaims,
  subject: string,
  request: AuthenticationRequest,
  config: IamConfig,
  resolvedAt: number,
): AuthenticationResult & { readonly mismatches?: readonly string[]; readonly organizationId?: string } {
  const planeKey = request.planeKey;
  const tenantId = stringClaim(claims, "tenant_id");
  const principalId = stringClaim(claims, "principal_id") ?? subject.trim();
  if (!tenantId || !principalId) return failure(403, "AUTH_CLAIM_INVALID", "Required identity claims are missing");

  const claimPlane = planeFromClaims(claims);
  const realmClaim = stringClaim(claims, "realm") ?? stringClaim(claims, "realm_key");
  const organizationId = stringClaim(claims, "organization_id") ?? stringClaim(claims, "org_id");
  const mismatches: string[] = [];
  if (!claimPlane) mismatches.push("plane_claim_missing");
  else if (claimPlane !== planeKey) mismatches.push("plane");
  if (realmClaim && realmClaim !== config.defaultRealmKey) mismatches.push("realm");
  if (request.requestedContext?.tenantId && request.requestedContext.tenantId !== tenantId) mismatches.push("tenant_header");
  if (request.requestedContext?.realmKey && request.requestedContext.realmKey !== (realmClaim ?? config.defaultRealmKey)) mismatches.push("realm_header");
  if (request.requestedContext?.organizationId && request.requestedContext.organizationId !== organizationId) mismatches.push("organization_header");
  if (mismatches.length === 0 && config.requireAuthorizedRole && !hasAuthorizedRole(claims, planeKey)) {
    return failure(403, "AUTH_ACCESS_DENIED", "Account is not authorized for this plane");
  }

  const allowed = Object.freeze([...stringArrayClaim(claims, "permissions")]);
  const entries = Object.freeze(allowed.map((code) => Object.freeze({ code, status: "allow" as const, reason: "allowed" as const })));
  const permissions: EffectivePermissionSnapshot = Object.freeze({
    planeKey,
    tenantId,
    principalId,
    principalFingerprint: digest(principalId),
    profileHash: digest([...allowed].sort().join("\n")),
    schemaHash: "claims-v1",
    resolvedAt,
    allowed,
    denied: Object.freeze([]),
    planLocked: Object.freeze([]),
    planeExcluded: Object.freeze([]),
    entries,
    authorizationScopes: Object.freeze([]),
  });
  const authEpoch = numberClaim(claims, "auth_epoch") ?? 0;
  const context: VerifiedRequestContext = Object.freeze({
    planeKey,
    realmKey: config.defaultRealmKey,
    tenantId,
    principalId,
    authEpoch,
    permissions,
    profileHash: permissions.profileHash,
    requestId: request.requestId,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
  });
  return { ok: true, context, mismatches: Object.freeze(mismatches), ...(organizationId ? { organizationId } : {}) };
}

async function recordContextMismatch(audit: AuditRecorder, request: AuthenticationRequest, mismatches: readonly string[]): Promise<void> {
  try {
    await audit.record({ eventCode: "iam.context.mismatch", action: "authenticate", outcome: "denied", actor: { kind: "system" }, requestId: request.requestId,
      metadata: { rollout: "claim-first", evidence: [...new Set(mismatches)].sort(), planeFingerprint: digest(request.planeKey) } });
  } catch { /* Context rejection does not depend on audit availability. */ }
}

function blockingRequiredAction(claims: JwtClaims, request: AuthenticationRequest, config: IamConfig): string | undefined {
  if (!config.enforceRequiredActions || !request.route) return undefined;
  const decision = evaluateRequiredActions({ actions: stringArrayClaim(claims, "required_actions"), path: request.route.path, method: request.route.method, matrix: config.requiredActionsMatrix });
  return decision.allowed ? undefined : decision.action;
}

async function recordFailure(
  audit: AuditRecorder,
  request: AuthenticationRequest,
  eventCode: string,
  reason: string,
  context?: VerifiedRequestContext,
): Promise<void> {
  try {
    await audit.record({
      eventCode,
      action: "authenticate",
      outcome: "denied",
      actor: context ? { kind: "user", principalId: context.principalId } : { kind: "system" },
      ...(context ? { tenantId: context.tenantId } : {}),
      requestId: request.requestId,
      metadata: { reason, planeKey: request.planeKey },
    });
  } catch { /* A denied request must remain denied even when its audit sink is unavailable. */ }
}

function failure(status: 401 | 403 | 503, code: AuthenticationFailureCode, message: string): AuthenticationResult {
  return { ok: false, status, code, message };
}

function planeFromClaims(claims: JwtClaims): PlaneKey | undefined {
  const plane = stringClaim(claims, "plane");
  if (plane === "studio" || plane === "neon" || plane === "mesh") return normalizePlaneKey(plane);
  const azp = stringClaim(claims, "azp");
  const match = azp?.match(/^(studio|neon|mesh)-web$/);
  return match ? normalizePlaneKey(match[1] as "studio" | "neon" | "mesh") : undefined;
}

function hasAuthorizedRole(claims: JwtClaims, plane: PlaneKey): boolean {
  const access = claims["resource_access"];
  if (!access || typeof access !== "object" || Array.isArray(access)) return false;
  const clients = [`${plane}-web`];
  return clients.some((clientKey) => {
    const client = (access as Record<string, unknown>)[clientKey];
    if (!client || typeof client !== "object" || Array.isArray(client)) return false;
    const roles = (client as Record<string, unknown>)["roles"];
    return Array.isArray(roles) && roles.includes("AUTHORIZED");
  });
}

function stringClaim(claims: JwtClaims, name: string): string | undefined {
  const value = claims[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberClaim(claims: JwtClaims, name: string): number | undefined {
  const value = claims[name];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function stringArrayClaim(claims: JwtClaims, name: string): readonly string[] {
  const value = claims[name];
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))] : [];
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
