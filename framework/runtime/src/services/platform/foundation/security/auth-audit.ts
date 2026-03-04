// framework/runtime/src/services/platform/foundation/security/auth-audit.ts
//
// Standard auth audit event types and helper for emitting structured audit records.

import type { AuditWriter } from "../../../../kernel/audit.js";

// ─── Event Types ─────────────────────────────────────────────────

export const AuthAuditEvent = {
    LOGIN_SUCCESS: "auth.login_success",
    LOGIN_FAILED: "auth.login_failed",
    REFRESH_SUCCESS: "auth.refresh_success",
    REFRESH_FAILED: "auth.refresh_failed",
    LOGOUT: "auth.logout",
    SESSION_KILLED: "auth.session_killed",
    JWKS_FETCH_FAILED: "auth.jwks_fetch_failed",
    CROSS_TENANT_REJECTION: "auth.cross_tenant_rejection",
    MFA_CHALLENGE_SUCCESS: "auth.mfa_challenge_success",
    MFA_CHALLENGE_FAILED: "auth.mfa_challenge_failed",
    SESSION_ROTATED: "auth.session_rotated",
    CSRF_VIOLATION: "auth.csrf_violation",
    IP_BINDING_MISMATCH: "auth.ip_binding_mismatch",
    ISSUER_MISMATCH: "auth.issuer_mismatch",
} as const;

export type AuthAuditEventType = (typeof AuthAuditEvent)[keyof typeof AuthAuditEvent];

// ─── Payload ─────────────────────────────────────────────────────

export interface AuthAuditPayload {
    event: AuthAuditEventType;
    tenantId?: string;
    realmKey?: string;
    userId?: string;
    principalId?: string;
    sessionIdHash?: string;
    ip?: string;
    userAgent?: string;
    reason?: string;
    meta?: Record<string, unknown>;
}

// ─── Emitter ─────────────────────────────────────────────────────

/**
 * Emit a structured auth audit event using the kernel audit writer.
 */
export async function emitAuthAudit(auditWriter: AuditWriter, payload: AuthAuditPayload): Promise<void> {
    await auditWriter.write({
        ts: new Date().toISOString(),
        type: payload.event,
        level: isFailureEvent(payload.event) ? "warn" : "info",
        actor: payload.userId
            ? { kind: "user", id: payload.userId }
            : { kind: "system" },
        meta: {
            tenantId: payload.tenantId,
            realmKey: payload.realmKey,
            principalId: payload.principalId,
            sessionIdHash: payload.sessionIdHash,
            ip: payload.ip,
            userAgent: payload.userAgent,
            reason: payload.reason,
            ...payload.meta,
        },
    });
}

function isFailureEvent(event: AuthAuditEventType): boolean {
    return event.includes("failed") || event.includes("rejection") || event.includes("violation") || event.includes("mismatch");
}
