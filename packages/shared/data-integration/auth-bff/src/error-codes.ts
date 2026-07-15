// packages/shared/platform-auth/auth-bff/src/error-codes.ts
//
// Phase A â€” Single source of truth for the auth-failure contract.
//
// The server runtime (server/src/auth/auth-pipeline.ts) and BFF
// (validatePlaneServerSession) emit a small, finite set of error codes when
// they reject a request. The UI must translate every code into a sensible UX
// response â€” and historically this mapping was duplicated per app, drifting
// across plane teams. This module centralises it.
//
// `authFailurePresentation(code)` is pure data: a UI component picks the
// fields it needs (severity for toast intent, action button, redirect target,
// telemetry event name). The module deliberately has zero React dependency
// so it can be imported from middleware, page server components, telemetry
// processors, and CLI tooling alike.
//
// Adding a new code: edit AUTH_FAILURE_PRESENTATIONS only. The TypeScript
// `AuthFailureCode` union derives from the table so the compiler enforces
// exhaustiveness at every consumer.

// â”€â”€â”€ The contract â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AuthFailureSeverity =
  /** Surface as toast.error; user must take action before continuing. */
  | "error"
  /** Surface as toast.warning; user can continue but should resolve soon. */
  | "warning"
  /** Surface as toast.info; e.g. silently retried token refresh. */
  | "info"
  /** Surface as a full-page error screen (not a toast). */
  | "fatal";

export interface AuthFailureAction {
  /** Button label shown to the user. */
  readonly label: string;
  /**
   * Relative path or app-routable href. Apps interpolate `{plane}` to their
   * own root and `{returnUrl}` to the encoded current location.
   */
  readonly href: string;
  /**
   * Optional KC `kc_action` value to deep-link to a specific required-action
   * flow. The /account/complete-action page reads this and forwards.
   */
  readonly kcAction?: string;
}

export interface AuthFailurePresentation {
  readonly code: AuthFailureCode;
  readonly severity: AuthFailureSeverity;
  /** Short, user-friendly message. No correlation ID â€” those go in `detail`. */
  readonly message: string;
  /** One sentence elaborating the next step. Optional. */
  readonly description?: string;
  /** Primary CTA the UI should offer. Optional. */
  readonly action?: AuthFailureAction;
  /**
   * Where to navigate the user automatically (vs. showing a toast). When set,
   * the UI should perform a hard navigation rather than letting them retry
   * in place.
   */
  readonly autoNavigate?: string;
  /**
   * Whether the requestId / correlation ID should be displayed. Defaults to
   * false (UX clean). Fatal errors usually want true so support can triage.
   */
  readonly showCorrelationId?: boolean;
  /**
   * Telemetry event name to emit when the failure is surfaced to the user.
   * Lets observability correlate UI symptom â†’ server log via requestId.
   */
  readonly telemetryEvent: string;
}

// â”€â”€â”€ The table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Order: most common first â†’ least common. New codes go at the bottom.

const RAW_PRESENTATIONS = {
  // Session lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  SESSION_NOT_FOUND: {
    severity: "warning",
    message: "Your session ended.",
    description: "Please sign in to continue.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.session_not_found",
  },
  SESSION_IDLE_EXPIRED: {
    severity: "warning",
    message: "Signed out due to inactivity.",
    description: "For your security, we ended this session after a period of inactivity.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.session_idle_expired",
  },
  SESSION_EXPIRED: {
    severity: "warning",
    message: "Your session expired.",
    description: "Please sign in again.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.session_expired",
  },
  SESSION_REFRESH_EXPIRED: {
    severity: "warning",
    message: "Your sign-in expired.",
    description: "Please sign in again to continue.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.session_refresh_expired",
  },
  SESSION_REFRESH_FAILED: {
    severity: "info",
    message: "Reconnectingâ€¦",
    description: "We had trouble refreshing your session. Trying again shortly.",
    telemetryEvent: "auth.failure.session_refresh_failed",
  },
  SESSION_REFRESH_REVOKED: {
    severity: "error",
    message: "Your access was revoked.",
    description: "An administrator changed your access. Please sign in again.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.session_refresh_revoked",
  },
  SESSION_ROLE_REVOKED: {
    severity: "error",
    message: "Your access to this app was revoked.",
    description: "An administrator removed your access while you were signed in.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.session_role_revoked",
  },
  SESSION_BINDING_MISMATCH: {
    severity: "error",
    message: "We ended this session for security.",
    description: "The browser context changed. Please sign in again.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.session_binding_mismatch",
  },
  SESSION_STORE_UNAVAILABLE: {
    severity: "fatal",
    message: "Sign-in is temporarily unavailable.",
    description: "Session services are down. Please try again in a few minutes.",
    showCorrelationId: true,
    telemetryEvent: "auth.failure.session_store_unavailable",
  },

  // MFA / required actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  MFA_REQUIRED: {
    severity: "warning",
    message: "Verification required.",
    description: "Complete step-up verification to continue.",
    action: { label: "Verify", href: "{plane}/mfa/challenge?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/mfa/challenge?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.mfa_required",
  },
  REQUIRED_ACTION_PENDING: {
    severity: "error",
    message: "Complete a required account action.",
    description: "Your administrator has requested an action before continuing.",
    action: {
      label: "Complete now",
      href: "{plane}/account/complete-action?returnUrl={returnUrl}",
    },
    telemetryEvent: "auth.failure.required_action_pending",
  },

  // Authorization (claim/context mismatches) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  NO_PLATFORM_ACCESS: {
    severity: "fatal",
    message: "Your account is not authorized for this app.",
    description: "Ask your administrator to grant access.",
    action: { label: "Switch app", href: "/" },
    showCorrelationId: true,
    telemetryEvent: "auth.failure.no_platform_access",
  },
  AUTH_CONTEXT_MISMATCH: {
    severity: "fatal",
    message: "We could not authorize this request.",
    description:
      "The sign-in context does not match the session. Sign out and back in to refresh it.",
    action: { label: "Sign out", href: "{plane}/logout" },
    showCorrelationId: true,
    telemetryEvent: "auth.failure.auth_context_mismatch",
  },
  PLANE_MISMATCH: {
    severity: "fatal",
    message: "Wrong app for this account.",
    description: "Your token belongs to a different app. Switch and try again.",
    action: { label: "Switch app", href: "/" },
    showCorrelationId: true,
    telemetryEvent: "auth.failure.plane_mismatch",
  },
  TENANT_MISMATCH: {
    severity: "fatal",
    message: "Wrong tenant selected.",
    description:
      "Your sign-in does not match the selected tenant. Sign out and choose the right one.",
    action: { label: "Sign out", href: "{plane}/logout" },
    showCorrelationId: true,
    telemetryEvent: "auth.failure.tenant_mismatch",
  },
  TENANT_NOT_FOUND: {
    severity: "fatal",
    message: "Tenant not found.",
    description: "The tenant you selected no longer exists. Choose another.",
    action: { label: "Switch tenant", href: "{plane}/select-context" },
    showCorrelationId: true,
    telemetryEvent: "auth.failure.tenant_not_found",
  },
  TENANT_LOOKUP_FAILED: {
    severity: "fatal",
    message: "Tenant lookup failed.",
    description: "Please try again in a moment. If the problem persists, contact support.",
    showCorrelationId: true,
    telemetryEvent: "auth.failure.tenant_lookup_failed",
  },

  // Token-shape / verifier errors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  MISSING_TOKEN: {
    severity: "error",
    message: "Sign in required.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.missing_token",
  },
  INVALID_TOKEN: {
    severity: "error",
    message: "Your sign-in is invalid.",
    description: "Please sign in again to continue.",
    action: { label: "Sign in", href: "{plane}/login?returnUrl={returnUrl}" },
    autoNavigate: "{plane}/login?returnUrl={returnUrl}",
    telemetryEvent: "auth.failure.invalid_token",
  },
  MALFORMED_TOKEN: {
    severity: "fatal",
    message: "Your sign-in could not be parsed.",
    description:
      "The token returned by the identity provider failed schema validation. "
      + "Sign out and back in to get a fresh one; if the issue persists, contact support.",
    action: { label: "Sign out", href: "{plane}/logout" },
    showCorrelationId: true,
    telemetryEvent: "auth.failure.malformed_token",
  },
  MISSING_PLANE: {
    severity: "fatal",
    message: "App context missing.",
    description: "A required header is not set. Refresh the page; if the issue continues, contact support.",
    showCorrelationId: true,
    telemetryEvent: "auth.failure.missing_plane",
  },
  CONTEXT_RESOLUTION_FAILED: {
    severity: "fatal",
    message: "We could not resolve your access context.",
    description: "Please try again shortly.",
    showCorrelationId: true,
    telemetryEvent: "auth.failure.context_resolution_failed",
  },
  CONTEXT_NOT_ALLOWED: {
    severity: "fatal",
    message: "This account is not allowed in the selected context.",
    description: "Choose a different tenant or contact your administrator.",
    action: { label: "Switch tenant", href: "{plane}/select-context" },
    showCorrelationId: true,
    telemetryEvent: "auth.failure.context_not_allowed",
  },
  CSRF_VALIDATION_FAILED: {
    severity: "error",
    message: "Security validation failed.",
    description: "Refresh the page and try again.",
    telemetryEvent: "auth.failure.csrf_validation_failed",
  },
} as const satisfies Record<string, Omit<AuthFailurePresentation, "code">>;

export type AuthFailureCode = keyof typeof RAW_PRESENTATIONS;

const AUTH_FAILURE_PRESENTATIONS: Record<AuthFailureCode, AuthFailurePresentation> =
  Object.fromEntries(
    Object.entries(RAW_PRESENTATIONS).map(([code, p]) => [
      code,
      { code: code as AuthFailureCode, ...p },
    ]),
  ) as Record<AuthFailureCode, AuthFailurePresentation>;

// â”€â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * True if `code` is a known auth failure code.
 */
export function isAuthFailureCode(code: unknown): code is AuthFailureCode {
  return typeof code === "string" && code in AUTH_FAILURE_PRESENTATIONS;
}

/**
 * Look up the UX presentation for a given code. Returns null for unknown codes
 * so callers can fall through to generic error handling.
 */
export function authFailurePresentation(
  code: string | null | undefined,
): AuthFailurePresentation | null {
  if (!isAuthFailureCode(code)) return null;
  return AUTH_FAILURE_PRESENTATIONS[code];
}

/**
 * Interpolate {plane} and {returnUrl} placeholders into an href / autoNavigate
 * target. `planeRoot` is the app-relative base (e.g. "" for root-mounted apps,
 * "/admin" when the plane is namespaced).
 */
export function resolveAuthFailureHref(
  template: string,
  args: { readonly planeRoot?: string; readonly returnUrl?: string },
): string {
  return template
    .replace(/\{plane\}/g, args.planeRoot ?? "")
    .replace(/\{returnUrl\}/g, encodeURIComponent(args.returnUrl ?? "/"));
}

/**
 * Best-effort extraction of an auth failure code from a fetch response body.
 * Returns null when the body is missing or doesn't carry a known code.
 */
export function extractAuthFailureCode(body: unknown): AuthFailureCode | null {
  if (!body || typeof body !== "object") return null;
  const candidate = (body as Record<string, unknown>).error;
  return isAuthFailureCode(candidate) ? candidate : null;
}

/**
 * Map auth severity to the toast intent used by @athyper/ui Toast.
 * Fatal severities don't render as toasts â€” callers should detect and handle.
 */
export function authSeverityToToastIntent(
  severity: AuthFailureSeverity,
): "success" | "warning" | "error" | "info" {
  if (severity === "info") return "info";
  if (severity === "warning") return "warning";
  return "error"; // error + fatal both render as error toast intent
}

// â”€â”€â”€ Aggregate view (telemetry / CLI introspection) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function listAuthFailureCodes(): readonly AuthFailureCode[] {
  return Object.keys(AUTH_FAILURE_PRESENTATIONS) as AuthFailureCode[];
}
