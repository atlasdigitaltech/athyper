// packages/shared/platform-auth/identity-gate/src/auth-failure-handler.ts
//
// Phase A â€” Auth failure dispatcher.
//
// Pure (no React) helper that decides what the UI should do when an auth
// failure code surfaces. Consumed by:
//   - the fetch interceptor wrapping relayFetch / apiFetch
//   - the global error boundary
//   - the BFF session validation page wrapper
//
// All decisions come from the single source of truth (@athyper/auth-bff/
// error-codes); this module turns the contract into a callable plan for
// the host app.

import {
  authFailurePresentation,
  authSeverityToToastIntent,
  isAuthFailureCode,
  resolveAuthFailureHref,
  type AuthFailureCode,
  type AuthFailurePresentation,
  type AuthFailureSeverity,
} from "@athyper/auth-bff/error-codes";

export type { AuthFailureCode, AuthFailureSeverity };

/** Outcome of dispatching one auth failure. */
export interface AuthFailureOutcome {
  readonly handled: boolean;
  readonly code: AuthFailureCode | null;
  readonly presentation: AuthFailurePresentation | null;
  /** Resolved href (placeholders interpolated) for the primary action. */
  readonly actionHref: string | null;
  /** Resolved auto-navigate target (placeholders interpolated). */
  readonly navigateHref: string | null;
  /** Toast intent if the host wants to render one ("error" for fatal). */
  readonly toastIntent: "success" | "warning" | "error" | "info" | null;
}

export interface AuthFailureEvent {
  readonly event: string;
  readonly code: AuthFailureCode;
  readonly requestId?: string;
  readonly severity: AuthFailureSeverity;
}

export interface AuthFailureDispatcherDeps {
  /**
   * App-root href used to expand `{plane}` placeholders. Defaults to `""`
   * (root-mounted apps). Pass `/admin` for namespaced deployments.
   */
  readonly planeRoot?: string;
  /**
   * Return-url to fold into login/redirect targets. Defaults to the current
   * `window.location.pathname` when called in a browser, otherwise `/`.
   */
  readonly getReturnUrl?: () => string;
  /**
   * Toast-emitter; if omitted, the dispatcher silently no-ops the toast
   * branch (page-level error boundaries still receive the outcome).
   */
  readonly emitToast?: (input: {
    title: string;
    description?: string;
    intent: "success" | "warning" | "error" | "info";
    action?: { label: string; onClick: () => void };
    /** Optional correlation id appended to description by the host. */
    correlationId?: string;
  }) => void;
  /**
   * Navigation hook. Called for auto-navigate codes and as the click handler
   * of action buttons. Defaults to `window.location.assign(href)` when
   * omitted; pass `router.push` for client-side nav.
   */
  readonly navigate?: (href: string) => void;
  /**
   * Functional notification emitted for every recognized auth failure before
   * telemetry, navigation, or toast presentation. Use this for deterministic
   * cache/session invalidation; it must not be replaced by a telemetry sink.
   */
  readonly onAuthFailure?: (input: AuthFailureEvent) => void;
  /**
   * Telemetry sink. Receives the event name from the presentation table plus
   * the request id (if known) so dashboards can join UI symptom â†’ server log.
   */
  readonly recordTelemetry?: (input: AuthFailureEvent) => void;
}

function defaultReturnUrl(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

function defaultNavigate(href: string): void {
  if (typeof window !== "undefined") {
    window.location.assign(href);
  }
}

/**
 * Translate a raw auth failure into a host-app side effect plan.
 *
 * @param input.code        the error code emitted by the server / BFF
 * @param input.requestId   correlation id (used for telemetry + showCorrelationId)
 * @param input.detail      structured error detail from the server
 */
export function dispatchAuthFailure(
  input: {
    readonly code: string | null | undefined;
    readonly requestId?: string | undefined;
    readonly detail?: Record<string, unknown> | undefined;
  },
  deps: AuthFailureDispatcherDeps = {},
): AuthFailureOutcome {
  if (!isAuthFailureCode(input.code)) {
    return {
      handled: false,
      code: null,
      presentation: null,
      actionHref: null,
      navigateHref: null,
      toastIntent: null,
    };
  }

  const presentation = authFailurePresentation(input.code)!;
  const planeRoot = deps.planeRoot ?? "";
  const returnUrl = (deps.getReturnUrl ?? defaultReturnUrl)();
  const interpolate = (template: string): string =>
    resolveAuthFailureHref(template, { planeRoot, returnUrl });

  const actionHref = presentation.action ? interpolate(presentation.action.href) : null;
  const navigateHref = presentation.autoNavigate ? interpolate(presentation.autoNavigate) : null;
  const toastIntent = presentation.severity === "fatal"
    ? null // fatal renders as a full-page screen, not a toast
    : authSeverityToToastIntent(presentation.severity);

  const authFailureEvent: AuthFailureEvent = {
    event: presentation.telemetryEvent,
    code: presentation.code,
    requestId: input.requestId,
    severity: presentation.severity,
  };

  // Functional invalidation is deliberately independent from observability.
  // Both run before navigation so consumers can clear sensitive scoped state.
  deps.onAuthFailure?.(authFailureEvent);
  deps.recordTelemetry?.(authFailureEvent);

  // Auto-navigate codes win over toast; the page is about to change anyway.
  if (navigateHref) {
    (deps.navigate ?? defaultNavigate)(navigateHref);
    return {
      handled: true,
      code: presentation.code,
      presentation,
      actionHref,
      navigateHref,
      toastIntent,
    };
  }

  if (toastIntent && deps.emitToast) {
    deps.emitToast({
      title: presentation.message,
      ...(presentation.description ? { description: presentation.description } : {}),
      intent: toastIntent,
      ...(presentation.action && actionHref
        ? {
            action: {
              label: presentation.action.label,
              onClick: () => (deps.navigate ?? defaultNavigate)(actionHref),
            },
          }
        : {}),
      ...(presentation.showCorrelationId && input.requestId
        ? { correlationId: input.requestId }
        : {}),
    });
  }

  return {
    handled: true,
    code: presentation.code,
    presentation,
    actionHref,
    navigateHref,
    toastIntent,
  };
}

/**
 * Adapt a fetch Response â†’ outcome. Use this in the fetch interceptor to
 * keep the call-site logic to one line:
 *
 *   await dispatchAuthFailureFromResponse(response, deps);
 */
export async function dispatchAuthFailureFromResponse(
  response: Response,
  deps: AuthFailureDispatcherDeps = {},
): Promise<AuthFailureOutcome> {
  if (response.ok) {
    return {
      handled: false,
      code: null,
      presentation: null,
      actionHref: null,
      navigateHref: null,
      toastIntent: null,
    };
  }
  let body: Record<string, unknown> = {};
  try {
    body = await response.clone().json() as Record<string, unknown>;
  } catch {
    // non-JSON body â€” no auth code available
  }
  return dispatchAuthFailure(
    {
      code: typeof body["error"] === "string" ? (body["error"] as string) : null,
      ...(typeof body["requestId"] === "string"
        ? { requestId: body["requestId"] as string }
        : {}),
      ...(body["detail"] && typeof body["detail"] === "object"
        ? { detail: body["detail"] as Record<string, unknown> }
        : {}),
    },
    deps,
  );
}
