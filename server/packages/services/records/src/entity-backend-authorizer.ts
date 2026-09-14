import { randomUUID } from "node:crypto";
import type {
  AuthorizationRequest,
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
  type EntityAuthorizationRuntime,
  type EntityAuthorizationProfileV1,
} from "@athyper/server-contract-metadata";
import {
  createEntityAccessEvaluator,
  type EntityAccessInput,
  type EntityScopeAdapter,
} from "./entity-authorization.js";
import {
  createEntityAuthorizationRolloutEvaluator,
  parseEntityAuthorizationRollout,
  entityAuthorizationProfileHash,
  type EntityAuthorizationRollout,
  type EntityAuthorizationRelease,
  type EntityAuthorizationQualification,
  type EntityAuthorizationShadowEvidence,
} from "./entity-authorization-rollout.js";

/** Set by owning services, never read from request JSON or advisory observations. */
export interface EntityBackendTarget extends Omit<
  EntityAccessInput,
  "context"
> {
  readonly fieldUses?: readonly {
    readonly field: string;
    readonly use: "read" | "search" | "filter" | "sort" | "group" | "export";
  }[];
  readonly writeFields?: readonly string[];
}
/** Trusted composition input, never accepted from service resource hints or HTTP.
 * Transitions retain BOTH source-domain authorization and the selected target
 * authorization. They cannot convert an existing grant into a target grant. */
export interface EntityBackendPermissionTransition {
  readonly operationKey: string;
  readonly sourcePermissionCode: string;
  readonly targetPermissionCode: string;
}
export interface EntityBackendAuthorizerOptions {
  readonly authority: Authorizer;
  readonly permissionTransitions?: readonly EntityBackendPermissionTransition[];
  readonly profile: EntityAuthorizationProfileV1;
  /** Exact signed runtime artifact. V1 or absent retains intersection behavior. */
  readonly runtime?: EntityAuthorizationRuntime;
  readonly rollout: EntityAuthorizationRollout;
  readonly scopes: EntityScopeAdapter;
  /** Exact owning-service classification. Unmapped selected requests fail closed. */
  readonly owns: (request: AuthorizationRequest) => boolean;
  readonly target: (
    request: AuthorizationRequest,
  ) => EntityBackendTarget | null;
  /** Reload current IAM evidence at each enforcement boundary, including jobs/downloads. */
  readonly refreshContext: (
    context: VerifiedRequestContext,
  ) => Promise<VerifiedRequestContext>;
  readonly currentRelease: () => Promise<EntityAuthorizationRelease>;
  readonly verifyQualification: (
    reference: string,
  ) => Promise<EntityAuthorizationQualification | null>;
  readonly currentRevocationWatermark: () => Promise<string>;
  readonly writeShadow: (
    evidence: EntityAuthorizationShadowEvidence,
  ) => Promise<void>;
  readonly diagnostic: (code: "SHADOW_UNAVAILABLE") => void;
  /** Qualification-host-only port. Must verify dedicated database/storage/queue
   * identities and the signed active release on every boundary. Never supplied
   * by the normal API/worker composition or by request data. It authorizes an
   * isolated experiment, not production activation or a qualification receipt. */
  readonly isolatedExecution?: {
    assertCurrent(release: EntityAuthorizationRelease): Promise<void>;
    diagnostic?: (event: {
      operationKey: string;
      stage: string;
      state: string;
      evaluationRef?: string;
      requestedOperationKey?: string;
      sourcePermissionCode?: string;
      sourceEntityCode?: string;
      sourceOperationKey?: string;
      sourceField?: string;
      providerOperationKey?: string;
      providerFieldPath?: string;
    }) => void;
  };
}
/** V1 retains the source/target intersection. Signed V2 read admissions retain
 * source constraints while requiring an explicit target allow. Never unions allows,
 * projects candidate bindings into enforcement, or caches principal authority.
 * Production activation still requires the existing signed rollout qualification.
 */
export function createEntityBackendAuthorizer(
  options: EntityBackendAuthorizerOptions,
): Authorizer {
  const rollout = parseEntityAuthorizationRollout(options.rollout),
    profile = parseEntityAuthorizationProfile(options.profile);
  if (
    profile.entityCode !== rollout.release.entityCode ||
    profile.planeKey !== rollout.release.planeKey ||
    entityAuthorizationProfileHash(profile) !== rollout.release.profileHash
  )
    throw new Error("ENTITY_BACKEND_PROFILE_MISMATCH");
  const runtime = options.runtime
    ? parseEntityAuthorizationRuntime(options.runtime, profile)
    : undefined;
  if (
    runtime &&
    (entityAuthorizationProfileHash(options.runtime) !==
      rollout.release.bindingsHash ||
      runtime.runtimeVersion !== rollout.release.runtimeVersion)
  )
    throw Error("ENTITY_BACKEND_RUNTIME_MISMATCH");
  const admission =
    runtime?.schemaVersion === 2 ? runtime.canonicalReadAdmission : undefined;
  if (admission && !options.authority.checkSourceConstraints)
    throw Error("ENTITY_SOURCE_CONSTRAINT_VERIFIER_MISSING");
  const transitions = new Map<string, string>();
  for (const transition of options.permissionTransitions ?? []) {
    const operation = profile.operations.find(
      (o) => o.key === transition.operationKey,
    );
    const key = `${transition.operationKey}:${transition.sourcePermissionCode}`;
    if (
      !operation ||
      !transition.sourcePermissionCode ||
      operation.permissionCode !== transition.targetPermissionCode ||
      transition.sourcePermissionCode === transition.targetPermissionCode ||
      transitions.has(key)
    )
      throw new Error("ENTITY_BACKEND_TRANSITION_MISMATCH");
    transitions.set(key, transition.targetPermissionCode);
  }
  if (
    admission?.transitions.some(
      (t) =>
        transitions.get(`${t.operationKey}:${t.sourcePermissionCode}`) !==
        t.targetPermissionCode,
    )
  )
    throw Error("ENTITY_CANONICAL_TRANSITION_MISMATCH");
  // Existing bounded shadow observers own advisory comparison. This execution
  // boundary does not replay legacy calls or preflight while shadow is selected.
  if (rollout.mode !== "enforce") return options.authority;
  return {
    ...(options.authority.checkSourceConstraints
      ? {
          checkSourceConstraints: options.authority.checkSourceConstraints.bind(
            options.authority,
          ),
        }
      : {}),
    enforcedEntityProfile: (planeKey, entityCode) =>
      planeKey === profile.planeKey && entityCode === profile.entityCode
        ? rollout.release.profileHash
        : options.authority.enforcedEntityProfile?.(planeKey, entityCode),
    async authorize(request) {
      if (
        request.context.planeKey !== profile.planeKey ||
        !options.owns(request)
      )
        return options.authority.authorize(request);
      const evaluationRef = options.isolatedExecution?.diagnostic
        ? randomUUID()
        : undefined;
      let requestedOperationKey = "unmapped";
      const traceHint = (key: string) => {
        const value = request.resource?.[key];
        return typeof value === "string" &&
          /^[a-zA-Z0-9_.\[\]-]{1,160}$/.test(value)
          ? value
          : undefined;
      };
      const trace = (event: {
        operationKey: string;
        stage: string;
        state: string;
      }) => {
        const hints = Object.fromEntries(
          Object.entries({
            sourceEntityCode: traceHint("entityCode"),
            sourceOperationKey: traceHint("operationKey"),
            sourceField: traceHint("field"),
            providerOperationKey: traceHint("providerOperationKey"),
            providerFieldPath: traceHint("providerFieldPath"),
          }).filter(([, value]) => value !== undefined),
        );
        try {
          options.isolatedExecution?.diagnostic?.({
            ...event,
            ...hints,
            sourcePermissionCode: request.permissionCode,
            ...(evaluationRef ? { evaluationRef } : {}),
            requestedOperationKey,
          });
        } catch {
          /* Qualification telemetry cannot alter authorization. */
        }
      };
      const finish = (
        decision: Awaited<ReturnType<Authorizer["authorize"]>>,
      ) => {
        trace({
          operationKey: requestedOperationKey,
          stage: "backend_complete",
          state: decision.allowed
            ? "allowed"
            : decision.reason === "entity_authorization_unavailable"
              ? "unavailable"
              : "denied",
        });
        return decision;
      };
      try {
        const context = await options.refreshContext(request.context);
        if (
          context.tenantId !== request.context.tenantId ||
          context.principalId !== request.context.principalId ||
          context.planeKey !== request.context.planeKey ||
          context.realmKey !== request.context.realmKey ||
          context.authEpoch < request.context.authEpoch ||
          context.permissions.tenantId !== context.tenantId ||
          context.permissions.principalId !== context.principalId ||
          context.permissions.planeKey !== context.planeKey
        )
          throw new Error("ENTITY_BACKEND_CONTEXT_MISMATCH");
        const current = { ...request, context },
          legacy = await options.authority.authorize(current);
        const target = options.target(current);
        if (!target) {
          return finish({
            allowed: false,
            reason: "entity_authorization_unmapped",
          });
        }
        requestedOperationKey = target.operationKey;
        trace({
          operationKey: target.operationKey,
          stage:
            !legacy.allowed && legacy.reason === "scope_not_contained"
              ? "source_scope"
              : "source_authority",
          state: legacy.allowed ? "allowed" : "denied",
        });
        if (profile.deferredOperations?.includes(target.operationKey)) {
          // A reviewed deferral is a stable denial, not a dependency outage.
          // Providers can omit this field without returning unrelated values or
          // turning an otherwise readable summary into a transient 503.
          return finish({
            allowed: false,
            reason: "entity_authorization_deferred",
          });
        }
        const operation = profile.operations.find(
          (o) => o.key === target.operationKey,
        );
        // Do not let the mapping silently substitute a more permissive capability.
        if (
          !operation ||
          (operation.permissionCode !== request.permissionCode &&
            transitions.get(`${operation.key}:${request.permissionCode}`) !==
              operation.permissionCode)
        ) {
          return finish({
            allowed: false,
            reason: "entity_authorization_binding_mismatch",
          });
        }
        const canonical =
          admission?.transitions.some(
            (t) =>
              t.operationKey === operation.key &&
              (request.permissionCode === t.sourcePermissionCode ||
                request.permissionCode === t.targetPermissionCode),
          ) === true;
        const domainFacts: Record<string, unknown> = {};
        for (const key of [
          "proposalOnly",
          "makerCheckerEnforced",
          "submittedBy",
          "approvedEvidencePinned",
          "requiresElevatedAssurance",
          "externalApplicant",
          "restrictedSessionRequired",
          "ownedRequestRequired",
          "qualificationControl",
          "preferenceControl",
          "createdBy",
        ])
          if (request.resource?.[key] !== undefined)
            domainFacts[key] = request.resource[key];
        const evaluator = createEntityAccessEvaluator({
          profile,
          authorityRevision: rollout.release.profileHash,
          ...(options.isolatedExecution?.diagnostic
            ? { diagnostic: trace }
            : {}),
          scopes: options.scopes,
          authorizer: {
            authorize: async (input) => {
              const resource = { ...domainFacts, ...input.resource };
              const source = canonical
                ? admission?.transitions.find(
                    (t) =>
                      t.operationKey === resource["operationKey"] &&
                      t.targetPermissionCode === input.permissionCode,
                  )
                : undefined;
              if (source) {
                // Resolve source constraints on the SAME stored coordinates that
                // the target evaluator supplied, never shell/provider selectors.
                const constraints = await options.authority
                  .checkSourceConstraints!({
                  ...input,
                  permissionCode: source.sourcePermissionCode,
                  resource,
                });
                trace({
                  operationKey: String(resource["operationKey"]),
                  stage: "source_constraints",
                  state: constraints.state,
                });
                if (constraints.state === "unavailable")
                  throw Error("ENTITY_SOURCE_CONSTRAINTS_UNAVAILABLE");
                if (constraints.state !== "satisfied")
                  return { allowed: false, reason: constraints.reason };
              }
              return options.authority.authorize({ ...input, resource });
            },
          },
        });
        const selected = createEntityAuthorizationRolloutEvaluator({
          ...options,
          rollout,
          legacy: {
            evaluate: async (input) => ({
              schemaVersion: 1,
              state: legacy.allowed ? "allowed" : "denied",
              reasonCode: legacy.allowed ? "AUTHORIZED" : "ACCESS_DENIED",
              operationKey: input.operationKey,
              authorityRevision: rollout.release.profileHash,
              decisionRef: "legacy",
            }),
          },
          target: evaluator,
        });
        if (options.isolatedExecution)
          await options.isolatedExecution.assertCurrent(rollout.release);
        const decision = await (
          options.isolatedExecution ? evaluator : selected
        ).evaluate({ ...target, context });
        // Stable denial reason deliberately cannot trigger legacy scope retries.
        if ((!canonical && !legacy.allowed) || decision.state !== "allowed")
          return finish({
            allowed: false,
            reason:
              decision.state === "unavailable"
                ? "entity_authorization_unavailable"
                : "entity_authorization_denied",
          });
        for (const field of target.writeFields ?? []) {
          if (
            operation.effect !== "write" ||
            !profile.fieldPolicies.some(
              (p) =>
                p.fields.includes(field) &&
                p.writeOperations.includes(operation.key),
            )
          )
            return finish({
              allowed: false,
              reason: "entity_field_write_denied",
            });
        }
        for (const { field, use } of target.fieldUses ?? []) {
          const policy = profile.fieldPolicies.find((p) =>
            p.fields.includes(field),
          );
          if (
            !policy ||
            (use !== "read" && !policy.queryUses.includes(use)) ||
            policy.representation === "masked"
          )
            return finish({
              allowed: false,
              reason: "entity_field_use_denied",
            });
          // No protected value is projected by this gate. Masked groups require an
          // explicit provider projection/reveal path; ordinary reads remain closed.
          const readOperation = profile.operations.find(
            (o) => o.key === policy.readOperation,
          );
          const collectionRootRead =
            !target.recordId &&
            profile.ownership === "tenant.record.v1" &&
            profile.directory.population === "tenant" &&
            readOperation?.key === profile.recordReadOperation;
          // Collection projection requires directory authority independently of
          // export authority. Existing-record authorization remains mandatory in
          // the query service before any returned row is exposed.
          const fieldOperation = collectionRootRead
            ? profile.directory.operation
            : policy.readOperation;
          const read = await evaluator.evaluate({
            ...target,
            context,
            operationKey: fieldOperation,
            phase: "execute",
          });
          if (read.state !== "allowed")
            return finish({
              allowed: false,
              reason: "entity_field_use_denied",
            });
        }
        return finish(canonical ? { allowed: true } : legacy);
      } catch {
        return finish({
          allowed: false,
          reason: "entity_authorization_unavailable",
        });
      }
    },
  };
}

/** Selected enforcement also requires the owning descriptor to carry that profile. */
export function usesEntityBackendAuthorization(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: import("@athyper/server-contract-metadata").EntityRuntimeDescriptor,
): boolean {
  const expected = authorizer.enforcedEntityProfile?.(
    context.planeKey,
    descriptor.entityCode,
  );
  if (!expected) return false;
  if (
    !descriptor.authorization ||
    entityAuthorizationProfileHash(descriptor.authorization) !== expected
  )
    throw new Error("ENTITY_BACKEND_DESCRIPTOR_PROFILE_MISMATCH");
  return true;
}
