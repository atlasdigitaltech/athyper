// lib/session-verdict.ts
//
// Shared session verdict computation — used by:
//   - app/(shell)/layout.tsx    (session gate: redirect on reauth_required)
//   - app/api/auth/debug/route.ts  (API hardening: 401 on reauth_required)
//
// Two orthogonal state dimensions:
//   Session state (lifecycle):  active | idle_warning | idle_expired | revoked
//   Token state (access token): valid | expiring | expired
//
// Overall verdict derives from the worst of both:
//   healthy          — session active, token valid
//   degraded         — token expiring, idle warning, or token expired (but recoverable)
//   reauth_required  — token expired + refresh invalid, OR session revoked/idle_expired

export type SessionState = "active" | "idle_warning" | "idle_expired" | "revoked";
export type TokenState   = "valid" | "expiring" | "expired";
export type Verdict      = "healthy" | "degraded" | "reauth_required";

export interface SessionStateResult {
    sessionState:   SessionState;
    tokenState:     TokenState;
    tokenRemaining: number | null;
    idleRemaining:  number | null;
    refreshValid:   boolean;
    verdict:        Verdict;
}

/** Session is killed after 15 minutes of inactivity. */
export const IDLE_TIMEOUT_SEC = 900;
/** Warn 3 minutes before idle timeout fires. */
export const IDLE_WARNING_SEC = 180;

/** Compute session state from raw Redis session data. */
export function computeSessionState(
    session: Record<string, unknown>,
    now: number,
): SessionStateResult {
    // Explicit revocation flag (set by admin kill-session or IAM change)
    if (session.revoked === true) {
        return {
            sessionState: "revoked",
            tokenState: "expired",
            tokenRemaining: null,
            idleRemaining: null,
            refreshValid: false,
            verdict: "reauth_required",
        };
    }

    const accessExpiresAt   = typeof session.accessExpiresAt   === "number" ? session.accessExpiresAt   : 0;
    const lastSeenAt        = typeof session.lastSeenAt        === "number" ? session.lastSeenAt        : 0;
    const refreshExpiresAt  = typeof session.refreshExpiresAt  === "number" ? session.refreshExpiresAt  : 0;

    // Token remaining (seconds until access token expires)
    const tokenRemaining = accessExpiresAt > 0 ? Math.max(0, accessExpiresAt - now) : null;

    // Idle remaining (time until idle timeout fires)
    const idleSince       = lastSeenAt > 0 ? now - lastSeenAt : 0;
    const idleRemaining   = lastSeenAt > 0 ? Math.max(0, IDLE_TIMEOUT_SEC - idleSince) : null;

    // Refresh token validity
    const hasRefreshToken = !!session.refreshToken;
    const refreshExpired  = refreshExpiresAt > 0 && now > refreshExpiresAt;
    const refreshValid    = hasRefreshToken && !refreshExpired;

    // ─── Token state (independent of session lifecycle) ──────────────
    const tokenExpired  = accessExpiresAt > 0 && now >= accessExpiresAt;
    const tokenExpiring = !tokenExpired && accessExpiresAt > 0 && accessExpiresAt - now < 120;
    const tokenState: TokenState = tokenExpired ? "expired" : tokenExpiring ? "expiring" : "valid";

    // ─── Session state (independent of token expiry) ─────────────────
    let sessionState: SessionState;
    if (lastSeenAt > 0 && idleSince >= IDLE_TIMEOUT_SEC) {
        sessionState = "idle_expired";
    } else if (lastSeenAt > 0 && idleRemaining !== null && idleRemaining <= IDLE_WARNING_SEC) {
        sessionState = "idle_warning";
    } else {
        sessionState = "active";
    }

    // ─── Overall verdict (worst of both dimensions) ──────────────────
    let verdict: Verdict;
    if (tokenExpired && !refreshValid) {
        verdict = "reauth_required";    // terminal: no way to recover tokens
    } else if (sessionState === "idle_expired") {
        verdict = "reauth_required";    // terminal: session timed out
    } else if (tokenExpired || tokenExpiring || sessionState === "idle_warning") {
        verdict = "degraded";           // recoverable: refresh or user activity can fix
    } else {
        verdict = "healthy";
    }

    return { sessionState, tokenState, tokenRemaining, idleRemaining, refreshValid, verdict };
}
