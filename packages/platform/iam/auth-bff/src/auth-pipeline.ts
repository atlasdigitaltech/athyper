// packages/shared/platform-auth/auth-bff/src/auth-pipeline.ts
//
// Phase B + Phase G â€” BFF mirror of server/src/auth/auth-pipeline.ts.
//
// validatePlaneServerSession (cookie-based traffic) shares the same enforcement
// concepts as the bearer API: AUTHORIZED on `${plane}-web`, KC required-actions
// matrix. The MATCHING ALGORITHM lives in @athyper/platform-iam-auth-common â€” this module
// only owns surface-specific concerns (the BFF matrix paths are different
// from the API matrix paths, and the error union is its own).

import {
  clientHasRole,
  loadMatrixFromEnv,
  matchRequiredActions,
} from "@athyper/platform-iam-auth-common";

// â”€â”€â”€ Error model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type SessionPipelineErrorCode =
  | "REQUIRED_ACTION_PENDING"
  | "SESSION_ROLE_REVOKED";

export interface SessionPipelineError {
  readonly code: SessionPipelineErrorCode;
  readonly status: number;
  readonly message: string;
  readonly blockingAction?: string;
  readonly detail?: Record<string, unknown>;
}

// â”€â”€â”€ BFF matrix (intentionally distinct from the API matrix) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Default matrix for the BFF surface â€” paths are relative to the app's BFF
 * route base (e.g. "/finance/"), NOT the API base (e.g. "/api/finance/").
 * Sharing the matrix with the server runtime would be a bug, not an
 * improvement. Phase G consolidates the matching ALGORITHM only.
 */
export const BFF_DEFAULT_REQUIRED_ACTION_MATRIX: Record<string, readonly string[]> = {
  UPDATE_PASSWORD: ["/"],
  VERIFY_EMAIL: ["/finance/", "/ap/", "/ar/"],
  CONFIGURE_TOTP: ["/workflow/", "/settings/security", "/setup/groups", "/setup/roles"],
};

/**
 * Load the BFF matrix from env (AUTH_BFF_REQUIRED_ACTIONS_MATRIX). Falls
 * back to the built-in conservative posture on missing or malformed JSON.
 */
export function loadBffRequiredActionMatrix(): Record<string, readonly string[]> {
  return loadMatrixFromEnv(
    "AUTH_BFF_REQUIRED_ACTIONS_MATRIX",
    BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
  );
}

// â”€â”€â”€ Step: required-actions enforcement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface EnforceRequiredActionsInput {
  readonly requiredActions: readonly string[];
  readonly route?: { readonly path: string; readonly method: string };
  readonly matrix?: Record<string, readonly string[]>;
}

/**
 * BFF-surface wrapper around the shared matching algorithm. Translates the
 * generic MatrixMatch into the SessionPipelineError shape consumed by the
 * BFF audit / response surfaces.
 */
export function enforceRequiredActions(
  input: EnforceRequiredActionsInput,
): { ok: boolean; error?: SessionPipelineError } {
  const matrix = input.matrix ?? loadBffRequiredActionMatrix();
  const match = matchRequiredActions({
    requiredActions: input.requiredActions,
    ...(input.route ? { route: input.route } : {}),
    matrix,
  });
  if (!match.blocked) return { ok: true };
  return {
    ok: false,
    error: {
      code: "REQUIRED_ACTION_PENDING",
      status: 403,
      message: "Complete the pending account action before continuing.",
      ...(match.blockingAction ? { blockingAction: match.blockingAction } : {}),
      ...(match.detail ? { detail: match.detail } : {}),
    },
  };
}

// â”€â”€â”€ Step: AUTHORIZED role check (against cached access-token claims) â”€â”€â”€â”€â”€â”€â”€â”€

export interface EnforceSessionRoleInput {
  readonly resourceAccess: unknown;
  readonly clientId: string;
}

export function enforceSessionAuthorizedRole(
  input: EnforceSessionRoleInput,
): { ok: boolean; error?: SessionPipelineError } {
  if (clientHasRole(input.resourceAccess, input.clientId, "AUTHORIZED")) {
    return { ok: true };
  }
  return {
    ok: false,
    error: {
      code: "SESSION_ROLE_REVOKED",
      status: 401,
      message: "Your access to this app was revoked. Please sign in again.",
      detail: { clientId: input.clientId },
    },
  };
}

// â”€â”€â”€ Full BFF pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface EnforceSessionPipelineInput {
  /** Required-actions list captured at login / refresh / periodic check. */
  readonly requiredActions: readonly string[];
  /**
   * Resource-access claims block from the cached access token. When provided
   * AND `clientId` is set, the AUTHORIZED check runs.
   */
  readonly resourceAccess?: unknown;
  /** `${planeKey}-web` â€” derived by the caller from session.plane. */
  readonly clientId?: string;
  /** Optional downstream route info for matrix-based enforcement. */
  readonly route?: { readonly path: string; readonly method: string };
}

export interface EnforceSessionPipelineOptions {
  readonly enforceAuthorized?: boolean;
  readonly enforceRequiredActions?: boolean;
  readonly requiredActionsMatrix?: Record<string, readonly string[]>;
}

export interface EnforceSessionPipelineResult {
  readonly ok: boolean;
  readonly error?: SessionPipelineError;
}

/**
 * Compose the BFF-side enforcement steps. Used by validatePlaneServerSession
 * (no route info â†’ any pending action blocks) and by individual route handlers
 * that want per-route matrix behavior.
 */
export function enforceSessionPipeline(
  input: EnforceSessionPipelineInput,
  options: EnforceSessionPipelineOptions = {},
): EnforceSessionPipelineResult {
  if (options.enforceAuthorized !== false && input.resourceAccess && input.clientId) {
    const role = enforceSessionAuthorizedRole({
      resourceAccess: input.resourceAccess,
      clientId: input.clientId,
    });
    if (!role.ok) return { ok: false, ...(role.error ? { error: role.error } : {}) };
  }

  if (options.enforceRequiredActions !== false) {
    const ra = enforceRequiredActions({
      requiredActions: input.requiredActions,
      ...(input.route ? { route: input.route } : {}),
      ...(options.requiredActionsMatrix ? { matrix: options.requiredActionsMatrix } : {}),
    });
    if (!ra.ok) return { ok: false, ...(ra.error ? { error: ra.error } : {}) };
  }

  return { ok: true };
}
