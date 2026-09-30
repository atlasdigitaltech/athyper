import { createHash } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type {
  AuthenticationRequest,
  AuthenticationResult,
  AuthenticationFailureCode,
  Authenticator,
  EffectivePermissionSnapshot,
  JwtClaims,
  PermissionResolver,
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
  /** Exact-plane database authority. When configured, token permission claims are not authorization authority. */
  readonly permissionResolver?: PermissionResolver;
  /** Resolves the effective tenant/principal from the verified issuer subject and requested context selector. */
  readonly resolveIdentityContext?: (input: IdentityContextResolutionInput) => Promise<ResolvedIdentityContext | undefined>;
}

export interface IdentityContextResolutionInput {
  readonly planeKey: PlaneKey;
  readonly realmKey: string;
  readonly subject: string;
  readonly requestedTenantId?: string;
  readonly tokenTenantId?: string;
  readonly tokenPrincipalId?: string;
  readonly organizationIds: readonly string[];
}

export interface ResolvedIdentityContext {
  readonly tenantId: string;
  readonly principalId: string;
  readonly authEpoch: number;
  readonly permissions?: EffectivePermissionSnapshot;
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

      let resolvedIdentity: ResolvedIdentityContext | undefined;
      if (options.resolveIdentityContext) {
        try {
          const organizationIds = organizationIdsFromClaims(token.claims);
          resolvedIdentity = await options.resolveIdentityContext({
            planeKey: request.planeKey,
            realmKey: stringClaim(token.claims, "realm") ?? stringClaim(token.claims, "realm_key") ?? options.config.defaultRealmKey,
            subject: token.subject,
            ...(request.requestedContext?.tenantId ? { requestedTenantId: request.requestedContext.tenantId } : {}),
            ...(stringClaim(token.claims, "tenant_id") ? { tokenTenantId: stringClaim(token.claims, "tenant_id") } : {}),
            ...(stringClaim(token.claims, "principal_id") ? { tokenPrincipalId: stringClaim(token.claims, "principal_id") } : {}),
            organizationIds,
          });
        } catch {
          await recordFailure(options.audit, request, "iam.authentication.denied", "identity_context_unavailable");
          return failure(503, "AUTH_AUTHORIZATION_UNAVAILABLE", "Identity context authority is unavailable");
        }
        if (!resolvedIdentity) {
          await recordFailure(options.audit, request, "iam.authentication.denied", "identity_context_missing");
          return failure(403, "AUTH_CONTEXT_MISMATCH", "Authenticated identity is not admitted to the requested context");
        }
      }

      const identity = identityFromClaims(token.claims, token.subject, request, options.config, options.now?.() ?? Date.now(), resolvedIdentity);
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
      if (options.config.requireAuthorizedRole && !hasAuthorizedRole(token.claims, request.planeKey)) {
        await recordFailure(options.audit, request, "iam.authentication.denied", "plane_role_missing");
        return failure(403, "AUTH_ACCESS_DENIED", "Account is not authorized for this plane");
      }
      const requiredAction = blockingRequiredAction(token.claims, request, options.config);
      if (requiredAction) {
        await recordFailure(options.audit, request, "iam.authentication.denied", "required_action", identity.context);
        return failure(403, "AUTH_REQUIRED_ACTION_PENDING", "Complete the pending account action before continuing");
      }

      let authenticatedContext = resolvedIdentity?.permissions
        ? Object.freeze({ ...identity.context, permissions: resolvedIdentity.permissions, profileHash: resolvedIdentity.permissions.profileHash })
        : identity.context;
      if (!resolvedIdentity?.permissions && options.permissionResolver) {
        try {
          const permissions = await options.permissionResolver.resolve(identity.context);
          authenticatedContext = Object.freeze({
            ...identity.context,
            permissions,
            profileHash: permissions.profileHash,
          });
        } catch (error) {
          const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
          await recordFailure(options.audit, request, "iam.authentication.denied",
            code === "AUTHZ_PLANE_ADMISSION_INACTIVE" ? "plane_admission" : "authorization_unavailable",
            identity.context);
          if (code === "AUTHZ_PLANE_ADMISSION_INACTIVE") {
            return failure(403, "AUTH_ACCESS_DENIED", "Account has no active authorization membership for this plane");
          }
          return failure(503, "AUTH_AUTHORIZATION_UNAVAILABLE", "Exact-plane authorization authority is unavailable");
        }
      }

      try {
        await options.audit.record({
          eventCode: "iam.authentication.succeeded",
          action: "authenticate",
          outcome: "success",
          actor: { kind: "user", principalId: authenticatedContext.principalId },
          tenantId: authenticatedContext.tenantId,
          requestId: request.requestId,
          ...(request.correlationId ? { correlationId: request.correlationId } : {}),
          metadata: { planeKey: request.planeKey, realmKey: identity.context.realmKey },
        });
      } catch {
        return failure(503, "AUTH_AUDIT_UNAVAILABLE", "Authentication audit is unavailable");
      }
      return { ok: true, context: authenticatedContext };
    },
  };
}

function identityFromClaims(
  claims: JwtClaims,
  subject: string,
  request: AuthenticationRequest,
  config: IamConfig,
  resolvedAt: number,
  resolvedIdentity?: ResolvedIdentityContext,
): AuthenticationResult & { readonly mismatches?: readonly string[]; readonly organizationId?: string } {
  const planeKey = request.planeKey;
  const tenantId = resolvedIdentity?.tenantId ?? stringClaim(claims, "tenant_id");
  const principalId = resolvedIdentity?.principalId ?? stringClaim(claims, "principal_id") ?? subject.trim();
  if (!tenantId || !principalId) return failure(403, "AUTH_CLAIM_INVALID", "Required identity claims are missing");

  const claimPlane = planeFromClaims(claims);
  const realmClaim = stringClaim(claims, "realm") ?? stringClaim(claims, "realm_key");
  const organizationIds = organizationIdsFromClaims(claims);
  const organizationId = organizationIds[0];
  const mismatches: string[] = [];
  if (!claimPlane) mismatches.push("plane_claim_missing");
  else if (claimPlane !== planeKey) mismatches.push("plane");
  if (realmClaim && realmClaim !== config.defaultRealmKey) mismatches.push("realm");
  if (request.requestedContext?.tenantId && request.requestedContext.tenantId !== tenantId) mismatches.push("tenant_header");
  if (request.requestedContext?.realmKey && request.requestedContext.realmKey !== (realmClaim ?? config.defaultRealmKey)) mismatches.push("realm_header");
  if (request.requestedContext?.organizationId && !organizationIds.includes(request.requestedContext.organizationId)) mismatches.push("organization_header");
  if (request.requestedContext?.authEpoch !== undefined && request.requestedContext.authEpoch !== (resolvedIdentity?.authEpoch ?? numberClaim(claims, "auth_epoch") ?? 0)) mismatches.push("auth_epoch");

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
  const authEpoch = resolvedIdentity?.authEpoch ?? numberClaim(claims, "auth_epoch") ?? 0;
  const authenticationMethods = stringArrayClaim(claims, "amr");
  const assurance = elevatedAssurance(claims, authenticationMethods) ? "elevated" as const : "baseline" as const;
  const context: VerifiedRequestContext = Object.freeze({
    planeKey,
    realmKey: config.defaultRealmKey,
    tenantId,
    principalId,
    authEpoch,
    assurance,
    authenticationMethods,
    permissions,
    profileHash: permissions.profileHash,
    requestId: request.requestId,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
  });
  return { ok: true, context, mismatches: Object.freeze(mismatches), ...(organizationId ? { organizationId } : {}) };
}

function elevatedAssurance(claims: JwtClaims, methods: readonly string[]): boolean {
  if (methods.some((method) => ["otp", "webauthn", "mfa", "hwk"].includes(method.toLowerCase()))) return true;
  const acr = stringClaim(claims, "acr");
  return acr === "urn:athyper:assurance:elevated" || (acr !== undefined && /^\d+$/.test(acr) && Number(acr) >= 2);
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

/** Extracts immutable organization coordinates from supported Keycloak claim shapes. */
export function organizationIdsFromClaims(claims: JwtClaims): readonly string[] {
  const direct = [stringClaim(claims, "organization_id"), stringClaim(claims, "org_id")]
    .filter((value): value is string => Boolean(value));
  const organization = claims["organization"];
  if (typeof organization === "string" && organization.trim()) direct.push(organization.trim());
  else if (Array.isArray(organization)) {
    direct.push(...organization.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()));
  } else if (organization && typeof organization === "object") {
    direct.push(...Object.keys(organization).filter((value) => Boolean(value.trim())).map((value) => value.trim()));
  }
  return Object.freeze([...new Set(direct)]);
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
