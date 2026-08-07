import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  ATLAS_SUPPORT_SESSION_PERMISSION,
  ATLAS_SUPPORT_SESSION_TOKEN_VERSION,
  AtlasSupportSessionError,
  type AtlasSupportAuditEvent,
  type AtlasSupportScope,
  type AtlasSupportSessionRecord,
  type AtlasSupportSessionServiceDependencies,
  type StartedAtlasSupportSession,
  type StartAtlasSupportSessionRequest,
  type VerifiedAtlasSupportSession,
  type VerifyAtlasSupportSessionRequest,
} from "./atlas-support-session.types.js";
import type { VerifiedRequestContext } from "../permission-context/verified-request-context.js";

const DEFAULT_MAX_TTL_SECONDS = 30 * 60;
const MIN_TTL_SECONDS = 60;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,99}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

interface SupportTokenPayload {
  readonly version: typeof ATLAS_SUPPORT_SESSION_TOKEN_VERSION;
  readonly key_id: string;
  readonly session_id: string;
  readonly origin_tenant_id: string;
  readonly origin_principal_id: string;
  readonly origin_subject: string;
  readonly origin_auth_epoch: number;
  readonly target_tenant_id: string;
  readonly shadow_principal_id: string;
  readonly shadow_auth_epoch: number;
  readonly membership_id: string;
  readonly plane: "admin";
  readonly scopes: readonly AtlasSupportScope[];
  readonly ticket_id: string;
  readonly session_binding_hash: string;
  readonly issued_at: number;
  readonly expires_at: number;
}

export class AtlasSupportSessionService {
  private readonly now: () => Date;
  private readonly randomId: () => string;
  private readonly maximumTtlSeconds: number;

  constructor(
    private readonly deps: AtlasSupportSessionServiceDependencies,
  ) {
    if (Buffer.byteLength(deps.signingKey, "utf8") < 32) {
      throw new Error(
        "Atlas support-session signing key must contain at least 32 UTF-8 bytes.",
      );
    }
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(deps.signingKeyId)) {
      throw new Error("Atlas support-session signing key ID is invalid.");
    }
    this.now = deps.now ?? (() => new Date());
    this.randomId = deps.randomId ?? randomUUID;
    this.maximumTtlSeconds =
      deps.maximumTtlSeconds ?? DEFAULT_MAX_TTL_SECONDS;
  }

  async start(
    request: StartAtlasSupportSessionRequest,
  ): Promise<StartedAtlasSupportSession> {
    validateStartRequest(request, this.maximumTtlSeconds);
    const context = request.context;
    if (
      context.planeKey !== "admin"
      || !hasPermission(context, ATLAS_SUPPORT_SESSION_PERMISSION)
    ) {
      throw new AtlasSupportSessionError(
        "PERMISSION_DENIED",
        "Platform support permission is required.",
      );
    }
    if (
      request.stepUpBinding.actionClass !== "atlas_support"
      || request.stepUpBinding.subject !== request.originSubject
      || request.stepUpBinding.tenantId !== request.targetTenantId
      || !await this.deps.stepUp.isElevated(request.stepUpBinding)
    ) {
      throw new AtlasSupportSessionError(
        "MFA_REQUIRED",
        "A target-tenant and session-bound Atlas support MFA elevation is required.",
      );
    }

    const shadow = await this.deps.repository.resolveShadowPrincipal({
      originTenantId: context.tenantId,
      originPrincipalId: context.principalId,
      targetTenantId: request.targetTenantId,
    });
    if (!shadow) {
      throw new AtlasSupportSessionError(
        "SHADOW_PRINCIPAL_REQUIRED",
        "An active verified tenant-local support shadow is required.",
      );
    }

    const now = this.now();
    const expiresAt = new Date(
      now.getTime() + request.ttlSeconds * 1_000,
    );
    const sessionId = this.randomId();
    if (!UUID_RE.test(sessionId)) {
      throw new Error("Atlas support-session ID generator returned an invalid ID.");
    }
    const threadId = await this.deps.threads.createTenantThread({
      sessionId,
      targetTenantId: request.targetTenantId,
      shadowPrincipalId: shadow.shadowPrincipalId,
      plane: "admin",
    });
    if (!UUID_RE.test(threadId)) {
      throw new Error("Atlas support thread factory returned an invalid ID.");
    }

    const payload: SupportTokenPayload = Object.freeze({
      version: ATLAS_SUPPORT_SESSION_TOKEN_VERSION,
      key_id: this.deps.signingKeyId,
      session_id: sessionId,
      origin_tenant_id: context.tenantId,
      origin_principal_id: context.principalId,
      origin_subject: request.originSubject,
      origin_auth_epoch: context.authEpoch,
      target_tenant_id: request.targetTenantId,
      shadow_principal_id: shadow.shadowPrincipalId,
      shadow_auth_epoch: shadow.shadowAuthEpoch,
      membership_id: shadow.membershipId,
      plane: "admin",
      scopes: Object.freeze([...new Set(request.requestedScopes)].sort()),
      ticket_id: request.ticketId.trim(),
      session_binding_hash: sessionBindingHash(
        request.originSubject,
        request.stepUpBinding.sessionId,
      ),
      issued_at: Math.floor(now.getTime() / 1_000),
      expires_at: Math.floor(expiresAt.getTime() / 1_000),
    });
    const token = signPayload(
      payload,
      this.deps.signingKey,
    );
    const record: AtlasSupportSessionRecord = Object.freeze({
      sessionId,
      tokenHash: sha256(token),
      originTenantId: context.tenantId,
      originPrincipalId: context.principalId,
      originSubject: request.originSubject,
      originAuthEpoch: context.authEpoch,
      targetTenantId: request.targetTenantId,
      shadowPrincipalId: shadow.shadowPrincipalId,
      shadowAuthEpoch: shadow.shadowAuthEpoch,
      shadowMembershipId: shadow.membershipId,
      plane: "admin",
      allowedScopes: payload.scopes,
      ticketId: payload.ticket_id,
      reason: request.reason.trim(),
      threadId,
      sessionBindingHash: payload.session_binding_hash,
      issuedAt: now,
      expiresAt,
      endedAt: null,
      status: "active",
    });
    await this.deps.repository.create(record);
    await this.audit(record, "access_started");
    return Object.freeze({ token, session: record });
  }

  async verify(
    request: VerifyAtlasSupportSessionRequest,
  ): Promise<VerifiedAtlasSupportSession> {
    const payload = verifyToken(
      request.token,
      this.deps.signingKey,
      this.deps.signingKeyId,
    );
    const record = await this.deps.repository.find(payload.session_id);
    if (
      !record
      || record.tokenHash !== sha256(request.token)
      || !recordMatchesPayload(record, payload)
    ) {
      throw new AtlasSupportSessionError(
        "TOKEN_INVALID",
        "Atlas support session is invalid.",
      );
    }
    if (
      request.authenticatedOriginPrincipalId !== record.originPrincipalId
      || request.originSubject !== record.originSubject
      || sessionBindingHash(
        request.originSubject,
        request.originSessionId,
      ) !== record.sessionBindingHash
    ) {
      throw new AtlasSupportSessionError(
        "TOKEN_INVALID",
        "Atlas support session is bound to another actor or login session.",
      );
    }

    const now = this.now();
    if (
      record.expiresAt.getTime() <= now.getTime()
      || payload.expires_at <= Math.floor(now.getTime() / 1_000)
    ) {
      await this.deps.repository.end({
        sessionId: record.sessionId,
        endedAt: now,
        status: "expired",
      });
      throw new AtlasSupportSessionError(
        "SESSION_EXPIRED",
        "Atlas support session expired.",
      );
    }
    if (record.status !== "active" || record.endedAt) {
      throw new AtlasSupportSessionError(
        "SESSION_REVOKED",
        "Atlas support session is no longer active.",
      );
    }
    if (
      request.requestedScope
      && !record.allowedScopes.includes(request.requestedScope)
    ) {
      throw new AtlasSupportSessionError(
        "SCOPE_DENIED",
        "Atlas support session does not allow the requested capability.",
      );
    }
    if (!await this.deps.authEpochs.isCurrent({
      originTenantId: record.originTenantId,
      originPrincipalId: record.originPrincipalId,
      originAuthEpoch: record.originAuthEpoch,
      targetTenantId: record.targetTenantId,
      shadowPrincipalId: record.shadowPrincipalId,
      shadowAuthEpoch: record.shadowAuthEpoch,
      membershipId: record.shadowMembershipId,
    })) {
      throw new AtlasSupportSessionError(
        "AUTHORIZATION_STALE",
        "Atlas support authorization changed.",
      );
    }
    return Object.freeze({
      session: record,
      effectiveTenantId: record.targetTenantId,
      effectivePrincipalId: record.shadowPrincipalId,
      plane: "admin",
    });
  }

  async recordAccess(
    verified: VerifiedAtlasSupportSession,
    input: {
      readonly event: Extract<
        AtlasSupportAuditEvent,
        "data_read" | "exported"
      >;
      readonly scope: AtlasSupportScope;
      readonly resourceHash: string;
    },
  ): Promise<void> {
    if (
      !verified.session.allowedScopes.includes(input.scope)
      || !SHA256_RE.test(input.resourceHash)
    ) {
      throw new AtlasSupportSessionError(
        "SCOPE_DENIED",
        "Support audit input is outside the signed session scope.",
      );
    }
    await this.audit(
      verified.session,
      input.event,
      input.scope,
      input.resourceHash,
    );
  }

  async end(
    verified: VerifiedAtlasSupportSession,
  ): Promise<void> {
    const endedAt = this.now();
    const ended = await this.deps.repository.end({
      sessionId: verified.session.sessionId,
      endedAt,
      status: "ended",
    });
    if (ended) {
      await this.audit(verified.session, "access_ended", undefined, undefined, endedAt);
    }
  }

  private async audit(
    record: AtlasSupportSessionRecord,
    event: AtlasSupportAuditEvent,
    scope?: AtlasSupportScope,
    resourceHash?: string,
    occurredAt: Date = this.now(),
  ): Promise<void> {
    await this.deps.repository.appendAudit({
      sessionId: record.sessionId,
      event,
      occurredAt,
      originPrincipalId: record.originPrincipalId,
      targetTenantId: record.targetTenantId,
      shadowPrincipalId: record.shadowPrincipalId,
      ...(scope ? { scope } : {}),
      ...(resourceHash ? { resourceHash } : {}),
    });
  }
}

function validateStartRequest(
  request: StartAtlasSupportSessionRequest,
  maximumTtlSeconds: number,
): void {
  if (
    !UUID_RE.test(request.targetTenantId)
    || !TICKET_RE.test(request.ticketId.trim())
    || request.reason.trim().length < 10
    || request.reason.trim().length > 500
    || request.requestedScopes.length === 0
    || request.requestedScopes.length > 4
    || !Number.isInteger(request.ttlSeconds)
    || request.ttlSeconds < MIN_TTL_SECONDS
    || request.ttlSeconds > maximumTtlSeconds
  ) {
    throw new AtlasSupportSessionError(
      "INVALID_REQUEST",
      "Atlas support session request is invalid or outside policy bounds.",
    );
  }
}

function hasPermission(
  context: VerifiedRequestContext,
  permission: string,
): boolean {
  return context.permissions.allowed.has(permission)
    && !context.permissions.denied.has(permission)
    && !context.permissions.planLocked.has(permission)
    && !context.permissions.planeExcluded.has(permission);
}

function signPayload(
  payload: SupportTokenPayload,
  key: string,
): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url");
  const signature = createHmac("sha256", key)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(
  token: string,
  key: string,
  expectedKeyId: string,
): SupportTokenPayload {
  if (token.length > 8_192) throw tokenInvalid();
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw tokenInvalid();
  const expected = createHmac("sha256", key)
    .update(encoded)
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    throw tokenInvalid();
  }
  if (
    received.length !== expected.length
    || !timingSafeEqual(received, expected)
  ) {
    throw tokenInvalid();
  }
  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
  } catch {
    throw tokenInvalid();
  }
  if (!isPayload(value) || value.key_id !== expectedKeyId) {
    throw tokenInvalid();
  }
  return value;
}

function isPayload(value: unknown): value is SupportTokenPayload {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "expires_at",
    "issued_at",
    "key_id",
    "origin_auth_epoch",
    "origin_principal_id",
    "origin_subject",
    "origin_tenant_id",
    "plane",
    "membership_id",
    "scopes",
    "session_binding_hash",
    "session_id",
    "shadow_auth_epoch",
    "shadow_principal_id",
    "target_tenant_id",
    "ticket_id",
    "version",
  ].sort();
  return JSON.stringify(keys) === JSON.stringify(expectedKeys)
    && value["version"] === ATLAS_SUPPORT_SESSION_TOKEN_VERSION
    && typeof value["key_id"] === "string"
    && UUID_RE.test(String(value["session_id"]))
    && UUID_RE.test(String(value["origin_tenant_id"]))
    && UUID_RE.test(String(value["origin_principal_id"]))
    && typeof value["origin_subject"] === "string"
    && Number.isInteger(value["origin_auth_epoch"])
    && UUID_RE.test(String(value["target_tenant_id"]))
    && UUID_RE.test(String(value["shadow_principal_id"]))
    && Number.isInteger(value["shadow_auth_epoch"])
    && UUID_RE.test(String(value["membership_id"]))
    && value["plane"] === "admin"
    && Array.isArray(value["scopes"])
    && value["scopes"].every(isSupportScope)
    && typeof value["ticket_id"] === "string"
    && SHA256_RE.test(String(value["session_binding_hash"]))
    && Number.isInteger(value["issued_at"])
    && Number.isInteger(value["expires_at"]);
}

function isSupportScope(value: unknown): value is AtlasSupportScope {
  return value === "permission_denial.explain"
    || value === "principal.find_current_scope"
    || value === "policy_trace.explain"
    || value === "tenant_health.summarize";
}

function recordMatchesPayload(
  record: AtlasSupportSessionRecord,
  payload: SupportTokenPayload,
): boolean {
  return record.sessionId === payload.session_id
    && record.originTenantId === payload.origin_tenant_id
    && record.originPrincipalId === payload.origin_principal_id
    && record.originSubject === payload.origin_subject
    && record.originAuthEpoch === payload.origin_auth_epoch
    && record.targetTenantId === payload.target_tenant_id
    && record.shadowPrincipalId === payload.shadow_principal_id
    && record.shadowAuthEpoch === payload.shadow_auth_epoch
    && record.shadowMembershipId === payload.membership_id
    && record.plane === payload.plane
    && record.ticketId === payload.ticket_id
    && record.sessionBindingHash === payload.session_binding_hash
    && record.issuedAt.getTime() === payload.issued_at * 1_000
    && record.expiresAt.getTime() === payload.expires_at * 1_000
    && JSON.stringify([...record.allowedScopes].sort())
      === JSON.stringify([...payload.scopes].sort());
}

function sessionBindingHash(subject: string, sessionId: string): string {
  return sha256(`${subject}\u0000${sessionId}\u0000atlas_support`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tokenInvalid(): AtlasSupportSessionError {
  return new AtlasSupportSessionError(
    "TOKEN_INVALID",
    "Atlas support session token is invalid.",
  );
}
