// packages/shared/platform-auth/auth-common/src/required-actions.ts
//
// Phase G â€” Shared required-actions matrix algorithm.
//
// Both the server runtime pipeline (server/src/auth/auth-pipeline.ts) and
// the BFF session pipeline (packages/shared/platform-auth/auth-bff/src/auth-pipeline.ts)
// implemented their own copy of the prefix-matching algorithm. This module
// is the single source of truth â€” surface-specific wrappers translate the
// generic `MatrixMatch` result into their own error types and matrices.
//
// Why generic + thin wrappers rather than one unified pipeline:
//   - Matrices ARE intentionally surface-specific. The server gate sees
//     "/api/finance/" paths; the BFF gate sees "/finance/" paths. Sharing
//     the matrix WOULD be a bug, not an improvement.
//   - The thing that should NEVER drift is the matching algorithm itself
//     (mutating-method filter, prefix containment check, "no-route blocks
//     on any action" semantics), so that's what we extract.

/**
 * Result of a matrix lookup. Generic shape â€” callers map to per-surface
 * error types (REQUIRED_ACTION_PENDING with their union).
 */
export interface MatrixMatch {
  /** True when the request should be blocked. */
  readonly blocked: boolean;
  /** The action whose prefix matched the route. */
  readonly blockingAction?: string;
  /** Detail payload to surface in logs/audit; never user-facing. */
  readonly detail?: Record<string, unknown>;
}

export interface MatrixMatchInput {
  /** Pending KC required-action codes. */
  readonly requiredActions: readonly string[];
  /** Route + method. When absent (gateway / verify endpoint), ANY pending action blocks. */
  readonly route?: { readonly path: string; readonly method: string };
  /** Matrix: action code â†’ list of path prefixes that block on it. */
  readonly matrix: Record<string, readonly string[]>;
}

/**
 * Decide whether the matrix blocks this request.
 *
 * Semantics (locked):
 *   - Empty requiredActions â‡’ never blocked.
 *   - No route â‡’ ANY pending action blocks (most conservative; matches
 *     /api/auth/verify and validatePlaneServerSession behaviour).
 *   - Non-mutating method (GET / HEAD / OPTIONS) â‡’ never blocked. Reads
 *     stay open so users can see WHY they're blocked.
 *   - Mutating method â‡’ blocked iff requiredActions âˆ© matrix.keys yields
 *     an action whose prefix is a strict prefix of the path.
 */
export function matchRequiredActions(input: MatrixMatchInput): MatrixMatch {
  if (input.requiredActions.length === 0) return { blocked: false };

  if (!input.route) {
    return {
      blocked: true,
      blockingAction: input.requiredActions[0],
      detail: { requiredActions: input.requiredActions },
    };
  }

  if (!isMutatingMethod(input.route.method)) return { blocked: false };

  for (const action of input.requiredActions) {
    const prefixes = input.matrix[action];
    if (!prefixes) continue;
    for (const prefix of prefixes) {
      if (input.route.path.startsWith(prefix)) {
        return {
          blocked: true,
          blockingAction: action,
          detail: {
            requiredActions: input.requiredActions,
            route: input.route.path,
            method: input.route.method,
          },
        };
      }
    }
  }

  return { blocked: false };
}

/**
 * Extract the canonical required-actions list from KC claims. Accepts both
 * `required_actions` (snake_case â€” KC standard) and `requiredActions`
 * (camelCase â€” legacy tooling). Snake_case wins when both are present.
 */
export function extractRequiredActionsFromClaims(
  claims: Record<string, unknown>,
): string[] {
  const raw = claims["required_actions"] ?? claims["requiredActions"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

/**
 * Returns true for HTTP methods that should be gated. Reads (GET/HEAD/
 * OPTIONS) intentionally bypass so users can navigate to the page that
 * explains the block.
 */
export function isMutatingMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

// â”€â”€â”€ Matrix loader (env JSON with safe default fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Minimal env-bag shape â€” kept node-agnostic so auth-common stays portable. */
export type EnvLike = Readonly<Record<string, string | undefined>>;

declare const process: { env: EnvLike } | undefined;

/**
 * Generic env JSON loader for action-matrix-shaped config. Used by both the
 * server matrix (AUTH_REQUIRED_ACTIONS_MATRIX) and the BFF matrix
 * (AUTH_BFF_REQUIRED_ACTIONS_MATRIX) â€” the per-surface module passes its
 * env name and built-in default, this helper handles the parse + validate.
 */
export function loadMatrixFromEnv(
  envName: string,
  fallback: Record<string, readonly string[]>,
  env?: EnvLike,
): Record<string, readonly string[]> {
  const source: EnvLike = env ?? (typeof process !== "undefined" ? process.env : {});
  const raw = source[envName];
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
          out[key] = value as string[];
        }
      }
      return out;
    }
  } catch {
    // bad JSON falls back to the surface default â€” the auth-flag validator
    // (Phase C R5) emits the structured warning at bootstrap time.
  }
  return fallback;
}
