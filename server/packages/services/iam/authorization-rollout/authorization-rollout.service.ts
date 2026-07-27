import {
  parseAuthorizationRolloutSnapshot,
  selectAuthorizationRollout,
  AuthorizationRolloutPolicyValidationError,
} from "./authorization-rollout.policy.js";
import {
  AUTHORIZATION_ROLLOUT_AUTHORITY_BY_PLANE,
  type AuthorizationRolloutContext,
  type AuthorizationRolloutPlane,
  type AuthorizationRolloutPolicyProvider,
  type AuthorizationRolloutSelection,
  type AuthorizationRolloutSelectionOptions,
} from "./authorization-rollout.types.js";

export interface AuthorizationRolloutServiceDeps {
  readonly planeKey: AuthorizationRolloutPlane;
  readonly policyProvider: AuthorizationRolloutPolicyProvider;
  readonly now?: () => number;
}

/**
 * Resolves evaluator mode from one caller-supplied, plane-local provider.
 *
 * This service deliberately has no dependency on control.feature_flag, a
 * database client, process environment, or another plane. Any provider/load/
 * validation/revision error selects the legacy evaluator.
 */
export class AuthorizationRolloutService {
  private readonly planeKey: AuthorizationRolloutPlane;
  private readonly policyProvider: AuthorizationRolloutPolicyProvider;
  private readonly now: () => number;

  constructor(deps: AuthorizationRolloutServiceDeps) {
    this.planeKey = deps.planeKey;
    this.policyProvider = deps.policyProvider;
    this.now = deps.now ?? Date.now;
  }

  async select(
    context: AuthorizationRolloutContext,
    options: AuthorizationRolloutSelectionOptions = {},
  ): Promise<AuthorizationRolloutSelection> {
    if (context.planeKey !== this.planeKey) {
      return this.legacy(context, "context_plane_mismatch");
    }

    const expectedAuthority =
      AUTHORIZATION_ROLLOUT_AUTHORITY_BY_PLANE[this.planeKey];
    if (
      this.policyProvider.planeKey !== this.planeKey
      || this.policyProvider.authority !== expectedAuthority
    ) {
      return this.legacy(context, "provider_mismatch");
    }

    let input: unknown;
    try {
      input = await this.policyProvider.loadSnapshot();
    } catch {
      return this.legacy(context, "policy_unavailable");
    }

    try {
      const snapshot = parseAuthorizationRolloutSnapshot(input);
      if (
        snapshot.planeKey !== this.planeKey
        || snapshot.authority !== expectedAuthority
      ) {
        return this.legacy(context, "provider_mismatch", {
          policyRevision: snapshot.revision,
        });
      }
      if (
        options.requiredRevision !== undefined
        && options.requiredRevision !== snapshot.revision
      ) {
        return this.legacy(context, "revision_mismatch", {
          policyRevision: snapshot.revision,
        });
      }
      return selectAuthorizationRollout(snapshot, context, this.now());
    } catch (error) {
      return this.legacy(context, "invalid_policy", {
        diagnosticCode:
          error instanceof AuthorizationRolloutPolicyValidationError
            ? error.code
            : "UNEXPECTED_POLICY_ERROR",
      });
    }
  }

  private legacy(
    context: AuthorizationRolloutContext,
    reason: AuthorizationRolloutSelection["reason"],
    extras: {
      readonly policyRevision?: string;
      readonly diagnosticCode?: string;
    } = {},
  ): AuthorizationRolloutSelection {
    return Object.freeze({
      mode: "legacy",
      planeKey: context.planeKey,
      permissionCode: context.permissionCode,
      reason,
      ...extras,
    });
  }
}
