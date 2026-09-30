import { randomUUID } from "node:crypto";
import {
  entityAccessReasons,
  entityAccessStates,
  parseEntityAccessDecision,
  type EntityAccessDecisionV1,
  type EntityAccessState,
} from "@athyper/contract-platform-entity-runtime";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  entityScopeResolvers,
  type EntityAuthorizationProfileV1,
  type EntityScopeResolverKey,
  type EntityScopeCoordinate,
} from "@athyper/server-contract-metadata";

export type EntityScopeCoordinates = Readonly<
  Partial<Record<EntityScopeCoordinate, string>>
>;
export interface EntityAccessInput {
  readonly context: VerifiedRequestContext;
  readonly operationKey: string;
  readonly recordId?: string;
  readonly coordinates?: EntityScopeCoordinates;
  readonly phase: "discover" | "execute";
  readonly historical?: boolean;
}
/** Trusted owning-service port: load stored ownership or validate proposed targets.
 * It must check existence, tenant ownership, catalog access and relationship compatibility.
 * Never implement this port by echoing client coordinates. No writes during resolution.
 */
export interface EntityScopeAdapter {
  resolve(
    input: EntityAccessInput & {
      readonly entityCode: string;
      readonly resolver: EntityScopeResolverKey;
      readonly target: "existing" | "proposed" | "collection";
    },
  ): Promise<
    | {
        readonly state: "resolved";
        readonly coordinates: EntityScopeCoordinates;
      }
    | { readonly state: "invalid" }
  >;
  preflight(
    input: EntityAccessInput,
  ): Promise<"allowed" | "workflow_blocked" | "not_applicable">;
}
export interface EntityAccessEvaluator {
  evaluate(input: EntityAccessInput): Promise<EntityAccessDecisionV1>;
}

export type EntityAccessStage = "contract" | "deferred" | "binding" | "record" | "input_scope" | "ownership" | "scope_conflict" | "permission" | "parent_read" | "context" | "verification" | "historical" | "preflight" | "complete";
export function createEntityAccessEvaluator(options: {
  readonly profile: EntityAuthorizationProfileV1;
  readonly authorityRevision: string;
  readonly authorizer: Authorizer;
  readonly scopes: EntityScopeAdapter;
  /** Trusted diagnostic sink only. Never included in the client decision DTO. */
  readonly diagnostic?: (event: { operationKey: string; stage: EntityAccessStage; state: EntityAccessState }) => void;
}): EntityAccessEvaluator {
  const { profile, authorizer, scopes } = options;
  return {
    async evaluate(input) {
      const decisionRef = randomUUID();
      let stage: EntityAccessStage = "contract";
      const result = (
        state: EntityAccessState,
        missingCoordinates?: readonly string[],
      ) => {
        try { options.diagnostic?.({ operationKey: input.operationKey, stage, state }); } catch { /* Telemetry cannot change access. */ }
        return parseEntityAccessDecision({
          schemaVersion: 1,
          state,
          reasonCode: entityAccessReasons[entityAccessStates.indexOf(state)],
          operationKey: input.operationKey,
          authorityRevision: options.authorityRevision,
          decisionRef,
          ...(missingCoordinates ? { missingCoordinates } : {}),
        });
      };
      if (profile.planeKey === input.context.planeKey &&
          input.context.tenantId &&
          profile.deferredOperations?.includes(input.operationKey))
        { stage = "deferred"; return result("unavailable"); }
      const operation = profile.operations.find(
        (item) => item.key === input.operationKey,
      );
      if (
        !operation ||
        profile.planeKey !== input.context.planeKey ||
        !input.context.tenantId
      )
        return result("denied");
      stage = "binding";
      const bindings = input.context.permissions?.operationBindings?.filter(
        (binding) =>
          binding.entityCode === profile.entityCode &&
          binding.operationKey === operation.key,
      );
      const requiredKinds = entityScopeResolvers[operation.scope].map(
        (key) =>
          ({
            operatingOrganizationId: "operating_organization",
            companyCodeId: "company_code",
            workspaceId: "workspace",
            networkRelationshipId: "network_relationship",
          })[key],
      );
      if (
        !bindings?.length ||
        bindings.some(
          (binding) =>
            binding.permissionCode !== operation.permissionCode ||
            (binding.decisionMode !== "authorize" &&
              binding.decisionMode !== (operation.target === "collection" ? "collection" : "entity_resource")) ||
            requiredKinds.some(
              (kind) => !binding.requiredScopeKinds.includes(kind),
            ) ||
            binding.requiredScopeKinds.some(
              (kind) => kind !== "tenant" && !requiredKinds.includes(kind),
            ),
        )
      )
        return result("denied");
      stage = "record";
      if (
        (operation.target === "existing" || operation.requiresParentRead) &&
        !input.recordId
      )
        return result("denied");
      try {
        stage = "input_scope";
        const supplied = input.coordinates ?? {};
        if (
          Object.entries(supplied).some(
            ([key, value]) =>
              ![
                "operatingOrganizationId",
                "companyCodeId",
                "workspaceId",
                "networkRelationshipId",
              ].includes(key) ||
              typeof value !== "string" ||
              !value.trim() ||
              value.length > 160,
          )
        )
          return result("denied");
        stage = "ownership";
        const resolved = await scopes.resolve({
          ...input,
          entityCode: profile.entityCode,
          resolver: operation.scope,
          target: operation.target,
        });
        if (resolved.state !== "resolved") return result("denied");
        if (
          Object.entries(resolved.coordinates).some(
            ([key, value]) =>
              ![
                "operatingOrganizationId",
                "companyCodeId",
                "workspaceId",
                "networkRelationshipId",
              ].includes(key) ||
              typeof value !== "string" ||
              !value.trim() ||
              value.length > 160,
          )
        )
          return result("denied");
        stage = "scope_conflict";
        // Conflicts between stored/derived ownership and explicit input never use a preference rule.
        for (const [key, value] of Object.entries(supplied))
          if (resolved.coordinates[key as EntityScopeCoordinate] !== value)
            return result("denied");
        const required = entityScopeResolvers[operation.scope];
        const missing = required.filter((key) => !resolved.coordinates[key]);
        const resource = {
          ...resolved.coordinates,
          tenantId: input.context.tenantId,
          entityCode: profile.entityCode,
          resourceCode: profile.entityCode,
          operationKey: operation.key,
          ...(input.recordId ? { recordId: input.recordId } : {}),
        };
        stage = "permission";
        const authority = await authorizer.authorize({
          context: input.context,
          permissionCode: operation.permissionCode,
          resource,
        });
        const discovery = async () => {
          if (!operation.discoveryOperation) return false;
          const entry = profile.operations.find(
            (item) => item.key === operation.discoveryOperation,
          )!;
          return (
            await authorizer.authorize({
              context: input.context,
              permissionCode: entry.permissionCode,
              resource: {
                tenantId: input.context.tenantId,
                entityCode: profile.entityCode,
                resourceCode: profile.entityCode,
                operationKey: entry.key,
                ...(input.recordId ? { recordId: input.recordId } : {}),
              },
            })
          ).allowed;
        };
        if (
          !authority.allowed &&
          ![
            "scope_coordinate_missing",
            "scope_not_contained",
            "mfa_required",
          ].includes(authority.reason)
        )
          return result("denied");
        stage = "parent_read";
        if (operation.requiresParentRead) {
          const parent = await createEntityAccessEvaluator(options).evaluate({
            context: input.context,
            operationKey: profile.recordReadOperation,
            recordId: input.recordId!,
            phase: "execute",
          });
          if (parent.state !== "allowed")
            return result(
              parent.state === "unavailable" ? "unavailable" : "denied",
            );
        }
        stage = "context";
        if (missing.length) {
          if (input.phase === "discover" && (await discovery()))
            return result("context_required", missing);
          return result("denied");
        }
        stage = "verification";
        if (!authority.allowed) {
          if (
            authority.reason === "mfa_required" &&
            input.phase === "discover" &&
            (await discovery())
          )
            return result("verification_required");
          return result("denied");
        }
        stage = "historical";
        if (input.historical && operation.effect !== "read")
          return result("workflow_blocked");
        stage = "preflight";
        if (operation.requiresPreflight) {
          if (input.phase === "discover") return result("preflight_required");
          const state = await scopes.preflight(input);
          if (state !== "allowed") return result(state);
        }
        stage = "complete";
        return result("allowed");
      } catch {
        return result("unavailable");
      }
    },
  };
}

/** Root DTO fields only; nested providers must supply their own validated profile. */
export async function projectEntityFields(
  profile: EntityAuthorizationProfileV1,
  evaluator: EntityAccessEvaluator,
  input: EntityAccessInput,
  values: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> {
  const output: Record<string, unknown> = {};
  for (const policy of profile.fieldPolicies) {
    if (
      (
        await evaluator.evaluate({
          ...input,
          operationKey: policy.readOperation,
          phase: "execute",
        })
      ).state !== "allowed"
    )
      continue;
    for (const key of policy.fields)
      if (Object.hasOwn(values, key)) {
        // Values such as nested contact channels require their own provider policy.
        const value = values[key];
        if (value !== null && typeof value === "object")
          throw new TypeError(
            "Nested field requires an authorized provider projection",
          );
        output[key] =
          policy.representation === "masked" && value !== null ? "••••" : value;
      }
  }
  return Object.freeze(output);
}
export async function assertEntityFieldWrite(
  profile: EntityAuthorizationProfileV1,
  evaluator: EntityAccessEvaluator,
  input: EntityAccessInput,
  patch: Readonly<Record<string, unknown>>,
): Promise<void> {
  const operation = profile.operations.find(
    (item) => item.key === input.operationKey,
  );
  if (
    operation?.effect !== "write" ||
    (await evaluator.evaluate({ ...input, phase: "execute" })).state !==
      "allowed"
  )
    throw new Error("ENTITY_WRITE_FORBIDDEN");
  for (const key of Object.keys(patch))
    if (
      !profile.fieldPolicies.some(
        (policy) =>
          policy.fields.includes(key) &&
          policy.writeOperations.includes(input.operationKey),
      )
    )
      throw new Error("ENTITY_FIELD_WRITE_FORBIDDEN");
}
export async function assertEntityFieldQuery(
  profile: EntityAuthorizationProfileV1,
  evaluator: EntityAccessEvaluator,
  input: EntityAccessInput,
  field: string,
  use: "search" | "filter" | "sort" | "group" | "export",
): Promise<void> {
  const policy = profile.fieldPolicies.find(
    (policy) => policy.fields.includes(field) && policy.queryUses.includes(use),
  );
  if (
    !policy ||
    (
      await evaluator.evaluate({
        ...input,
        operationKey: policy.readOperation,
        phase: "execute",
      })
    ).state !== "allowed"
  )
    throw new Error("ENTITY_FIELD_QUERY_FORBIDDEN");
}

/** Parent admission never replaces independent child admission. */
export async function authorizeEntityRelationship(options: {
  readonly parent: EntityAccessEvaluator;
  readonly parentInput: EntityAccessInput;
  readonly child: EntityAccessEvaluator;
  readonly childInput: EntityAccessInput;
}): Promise<boolean> {
  if (
    (
      await options.parent.evaluate({
        ...options.parentInput,
        phase: "execute",
      })
    ).state !== "allowed"
  )
    return false;
  return (
    (await options.child.evaluate({ ...options.childInput, phase: "execute" }))
      .state === "allowed"
  );
}
