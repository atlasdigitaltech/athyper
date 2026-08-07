import type {
  StepUpBinding,
  StepUpService,
} from "../mfa/step-up.service.js";
import type { VerifiedRequestContext } from "../permission-context/verified-request-context.js";

export const ATLAS_SUPPORT_SESSION_PERMISSION =
  "ai.agent.admin.support_session";
export const ATLAS_SUPPORT_SESSION_TOKEN_VERSION =
  "atlas.support-session/v2";

export type AtlasSupportScope =
  | "permission_denial.explain"
  | "principal.find_current_scope"
  | "policy_trace.explain"
  | "tenant_health.summarize";

export type AtlasSupportAuditEvent =
  | "access_started"
  | "data_read"
  | "exported"
  | "access_ended"
  | "access_denied";

export interface AtlasSupportShadowPrincipal {
  readonly targetTenantId: string;
  readonly shadowPrincipalId: string;
  readonly shadowAuthEpoch: number;
  readonly membershipId: string;
}

export interface AtlasSupportSessionRecord {
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly originTenantId: string;
  readonly originPrincipalId: string;
  readonly originSubject: string;
  readonly originAuthEpoch: number;
  readonly targetTenantId: string;
  readonly shadowPrincipalId: string;
  readonly shadowAuthEpoch: number;
  readonly shadowMembershipId: string;
  readonly plane: "admin";
  readonly allowedScopes: readonly AtlasSupportScope[];
  readonly ticketId: string;
  readonly reason: string;
  readonly threadId: string;
  readonly sessionBindingHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly endedAt: Date | null;
  readonly status: "active" | "revoked" | "expired" | "ended";
}

export interface AtlasSupportAuditEntry {
  readonly sessionId: string;
  readonly event: AtlasSupportAuditEvent;
  readonly occurredAt: Date;
  readonly originPrincipalId: string;
  readonly targetTenantId: string;
  readonly shadowPrincipalId: string;
  readonly scope?: AtlasSupportScope;
  readonly resourceHash?: string;
  readonly safeReasonCode?: string;
}

export interface AtlasSupportSessionRepository {
  resolveShadowPrincipal(input: {
    readonly originTenantId: string;
    readonly originPrincipalId: string;
    readonly targetTenantId: string;
  }): Promise<AtlasSupportShadowPrincipal | null>;
  create(record: AtlasSupportSessionRecord): Promise<void>;
  find(sessionId: string): Promise<AtlasSupportSessionRecord | null>;
  end(input: {
    readonly sessionId: string;
    readonly endedAt: Date;
    readonly status: "revoked" | "expired" | "ended";
  }): Promise<boolean>;
  appendAudit(entry: AtlasSupportAuditEntry): Promise<void>;
}

export interface AtlasSupportThreadFactory {
  createTenantThread(input: {
    readonly sessionId: string;
    readonly targetTenantId: string;
    readonly shadowPrincipalId: string;
    readonly plane: "admin";
  }): Promise<string>;
}

export interface AtlasSupportAuthEpochRevalidator {
  isCurrent(input: {
    readonly originTenantId: string;
    readonly originPrincipalId: string;
    readonly originAuthEpoch: number;
    readonly targetTenantId: string;
    readonly shadowPrincipalId: string;
    readonly shadowAuthEpoch: number;
    readonly membershipId: string;
  }): Promise<boolean>;
}

export interface AtlasSupportSessionServiceDependencies {
  readonly repository: AtlasSupportSessionRepository;
  readonly stepUp: Pick<StepUpService, "isElevated">;
  readonly authEpochs: AtlasSupportAuthEpochRevalidator;
  readonly threads: AtlasSupportThreadFactory;
  readonly signingKey: string;
  readonly signingKeyId: string;
  readonly now?: () => Date;
  readonly randomId?: () => string;
  readonly maximumTtlSeconds?: number;
}

export interface StartAtlasSupportSessionRequest {
  readonly context: VerifiedRequestContext;
  readonly originSubject: string;
  readonly targetTenantId: string;
  readonly ticketId: string;
  readonly reason: string;
  readonly requestedScopes: readonly AtlasSupportScope[];
  readonly ttlSeconds: number;
  readonly stepUpBinding: StepUpBinding;
}

export interface StartedAtlasSupportSession {
  readonly token: string;
  readonly session: AtlasSupportSessionRecord;
}

export interface VerifyAtlasSupportSessionRequest {
  readonly token: string;
  readonly originSubject: string;
  readonly originSessionId: string;
  /** Must come from the authenticated server session, never a request header. */
  readonly authenticatedOriginPrincipalId: string;
  readonly requestedScope?: AtlasSupportScope;
}

export interface VerifiedAtlasSupportSession {
  readonly session: AtlasSupportSessionRecord;
  readonly effectiveTenantId: string;
  readonly effectivePrincipalId: string;
  readonly plane: "admin";
}

export class AtlasSupportSessionError extends Error {
  override readonly name = "AtlasSupportSessionError";

  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "PERMISSION_DENIED"
      | "MFA_REQUIRED"
      | "SHADOW_PRINCIPAL_REQUIRED"
      | "TOKEN_INVALID"
      | "SESSION_EXPIRED"
      | "SESSION_REVOKED"
      | "AUTHORIZATION_STALE"
      | "SCOPE_DENIED",
    message: string,
  ) {
    super(message);
  }
}
