import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { activityCanonicalPermission, parseCapabilityBinding, parseCapabilityDeclaration } from "@athyper/server-contract-publication";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import { EntityCapabilityPolicyError } from "./entity-capability-policy.js";

export interface EntityActivityRequest {
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly recordId: string;
  readonly action: string;
  readonly idempotencyKey?: string;
}
type Release = NonNullable<Awaited<ReturnType<PinnedCompiledEntityReader["resolve"]>>>;

/** Resolve only signed Activity bindings and exact canonical permissions. Domain
 * providers must additionally enforce snapshot ownership and historical fields. */
export function createEntityActivityPolicy(options: {
  readonly reader: PinnedCompiledEntityReader;
  readonly authorizer: Authorizer;
  readonly authorizeParent: (input: EntityActivityRequest, release: Release) => Promise<boolean>;
}) {
  return {
    async resolve(input: EntityActivityRequest, admittedRelease?: Release) {
      const deny = (): never => { throw new EntityCapabilityPolicyError(); };
      const coordinate = { tenantId: input.context.tenantId, principalId: input.context.principalId, planeKey: input.context.planeKey, entityCode: input.entityCode };
      const release = admittedRelease ?? await options.reader.resolve(coordinate);
      if (!release || Object.entries(coordinate).some(([key, value]) => Reflect.get(release.coordinate, key) !== value)) return deny();
      const core = await options.reader.core(release);
      const declaration = parseCapabilityDeclaration((core.content.capabilities as Record<string, unknown> | undefined)?.activity, "activity", input.entityCode);
      if (!declaration.enabled || !await options.authorizeParent(input, release)) return deny();
      // operation() validates cold and cached immutable profile dependencies.
      const operation = await options.reader.operation(release);
      const binding = parseCapabilityBinding(operation.content.activityBinding, "activity", input.entityCode);
      const action = binding.actions.find(candidate => candidate.key === input.action);
      if (!action) return deny();
      if (action.idempotency === "required" && (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 256)) return deny();
      const resource = { tenantId: input.context.tenantId, resourceCode: input.entityCode, resourceId: input.recordId,
        recordId: input.recordId, entityType: input.entityCode, entityId: input.recordId };
      const allowed = new Set<string>();
      for (const candidate of binding.actions) {
        if ((await options.authorizer.authorize({ context: input.context, permissionCode: candidate.permissionCode, resource })).allowed) allowed.add(candidate.key);
      }
      if (!allowed.has(action.key)) return deny();
      const views = binding.views.filter(view => allowed.has(view === "timeline" ? "timeline_query" : view === "auditLog" ? "audit_query" : view === "versions" ? "versions_read" : "snapshots_read"));
      return { binding, action, release, releaseHash: release.release.releaseHash, policyHash: operation.artifactHash,
        projection: { schemaVersion: 1 as const, layouts: binding.layouts, views,
          defaultView: views.includes(binding.defaultView) ? binding.defaultView : views[0],
          actions: binding.actions.filter(candidate => allowed.has(candidate.key)).map(candidate => ({ key: candidate.key, idempotency: candidate.idempotency })),
          query: binding.query, releaseHash: release.release.releaseHash } };
    },
  };
}

/** Scoped service adapter; retain ordinary entity/field authorization unchanged.
 * Only the three reviewed legacy service identifiers are translated. */
export function createActivityServiceAuthorizer(authorizer: Authorizer): Authorizer {
  return {
    authorize: request => authorizer.authorize({ ...request, permissionCode: activityCanonicalPermission(request.permissionCode) ?? request.permissionCode }),
    ...(authorizer.enforcedEntityProfile ? { enforcedEntityProfile: authorizer.enforcedEntityProfile.bind(authorizer) } : {}),
    ...(authorizer.checkSourceConstraints ? { checkSourceConstraints: (request: Parameters<NonNullable<Authorizer["checkSourceConstraints"]>>[0]) => authorizer.checkSourceConstraints!({ ...request, permissionCode: activityCanonicalPermission(request.permissionCode) ?? request.permissionCode }) } : {}),
  };
}
