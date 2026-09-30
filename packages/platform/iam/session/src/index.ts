import { parseInstant } from "@athyper/platform-temporal";
import type { SanitizedSession, SessionNextAction } from "@athyper/contract-platform-auth-session";
export { parseSanitizedSession, SESSION_PLANES } from "@athyper/contract-platform-auth-session";
export type { AssuranceLevel, SanitizedSession, SessionNextAction, SessionPlane, SessionState } from "@athyper/contract-platform-auth-session";

export type SessionDecision = "anonymous" | "expired" | "required_action" | "context_required" | "ready" | "elevation_expired";
export function decideSession(session: SanitizedSession, now: number): SessionDecision {
  if (session.state === "anonymous") return "anonymous";
  if (expired(session.absoluteExpiresAt ?? session.expiresAt, now) || expired(session.idleExpiresAt, now)) return "expired";
  if (session.requiredActions.length || session.state === "required_action") return "required_action";
  if (!session.tenantId || session.state === "context_required") return "context_required";
  if (session.assurance === "elevated" && expired(session.elevationExpiresAt, now)) return "elevation_expired";
  return "ready";
}

export function allowedNextActions(decision: SessionDecision): readonly SessionNextAction[] {
  const map: Readonly<Record<SessionDecision, readonly SessionNextAction[]>> = {
    anonymous: ["login"], expired: ["login"], required_action: ["complete_required_action", "logout"],
    context_required: ["select_context", "logout"], ready: ["continue", "refresh", "logout"], elevation_expired: ["continue", "logout"],
  };
  return map[decision];
}

export function shouldTouchSession(input: { readonly now: number; readonly lastSeenAt: number; readonly idleExpiresAt: number; readonly minimumIntervalMs: number; readonly idleTtlMs: number }): boolean {
  return input.now - input.lastSeenAt >= input.minimumIntervalMs && input.idleExpiresAt - input.now < input.idleTtlMs - input.minimumIntervalMs;
}
export function requiresRefresh(input: { readonly now: number; readonly accessExpiresAt?: number; readonly skewMs?: number }): boolean { return input.accessExpiresAt !== undefined && input.accessExpiresAt - input.now <= (input.skewMs ?? 60_000); }
/** Only application-local destinations may survive an authentication round trip. */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://local.invalid");
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== "https://local.invalid" || path.startsWith("//") || /[\\\x00-\x1f\x7f]/.test(path)) return "/";
    // Normalize decoded dot segments before checking reserved routes as well.
    const normalized = new URL(path, "https://local.invalid").pathname;
    if (/^\/(?:api|_next|sign-in|logout|select-context|auth)(?:\/|$)/i.test(normalized)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/"; }
}

function expired(value: string | undefined, now: number): boolean { return value !== undefined && parseInstant(value) <= now; }
