import type {
  Authorizer,
  AuthorizationDecision,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type {
  RecordCollectionScopeResolver,
  RecordCollectionScopeResolution,
} from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";

/** Admit selector metadata, never a row query or an implicit selected context.
 * Snapshot coordinates are candidates only: the catalog and normal authorizer
 * must validate a concrete target. No resource-free permission retry is used. */
export async function authorizeListContextDiscovery(input: {
  authorizer: Authorizer;
  context: VerifiedRequestContext;
  descriptor: EntityRuntimeDescriptor;
  resolution: Extract<
    RecordCollectionScopeResolution,
    { status: "context_required" }
  >;
  resolver: RecordCollectionScopeResolver;
}): Promise<Extract<AuthorizationDecision, { allowed: true }>> {
  const { context, descriptor, resolver, authorizer, resolution } = input;
  const denied = () =>
    new RecordServiceError(
      403,
      "FORBIDDEN",
      "Record operation is not permitted",
    );
  const requirement = resolution.workContext;
  const permissionCode = descriptor.operations.read?.permissionCode;
  if (
    !permissionCode ||
    !requirement ||
    requirement.schemaVersion !== 1 ||
    requirement.requiredCoordinates.length !== 1 ||
    context.permissions.tenantId !== context.tenantId ||
    context.permissions.principalId !== context.principalId ||
    context.permissions.planeKey !== context.planeKey
  )
    throw denied();
  const unscoped = await authorizer.authorize({
    context,
    permissionCode,
    observation: {
      entityCode: descriptor.entityCode,
      operationKey: "discover",
      surface: "list",
      phase: "discover",
    },
    resource: {
      tenantId: context.tenantId,
      entityCode: descriptor.entityCode,
      resourceCode: descriptor.entityCode,
      operationKey: "read",
    },
  });
  if (unscoped.allowed) return unscoped;
  if (unscoped.reason.includes("unavailable"))
    throw new RecordServiceError(
      503,
      "CONTEXT_DISCOVERY_UNAVAILABLE",
      "Context discovery is unavailable",
    );
  const coordinate = requirement.requiredCoordinates[0];
  // Other coordinate combinations need a registered enumeration strategy.
  const scopeKey =
    coordinate === "operatingOrganizationId"
      ? "operatingOrganizationIds"
      : coordinate === "companyCodeId"
        ? "companyCodeIds"
        : undefined;
  if (!scopeKey) throw denied();
  const ids = [
    ...new Set(
      context.permissions.authorizationScopes
        .filter((scope) => scope.permissionCode === permissionCode)
        .flatMap((scope) => scope[scopeKey]),
    ),
  ];
  // Fail closed rather than scan an unbounded grant snapshot.
  if (ids.length > 100)
    throw new RecordServiceError(
      503,
      "CONTEXT_DISCOVERY_LIMIT",
      "Context discovery is unavailable",
    );
  for (const id of ids) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      continue;
    const resolved = await resolver.resolve({
      context,
      descriptor,
      operationCode: "read",
      coordinate: { [coordinate!]: id },
    });
    if (resolved.status !== "ready") continue;
    const decision = await authorizer.authorize({
      context,
      permissionCode,
      observation: {
        entityCode: descriptor.entityCode,
        operationKey: "discover",
        surface: "list",
        phase: "discover",
      },
      resource: {
        tenantId: context.tenantId,
        entityCode: descriptor.entityCode,
        resourceCode: descriptor.entityCode,
        operationKey: "read",
        ...resolved.authorizationResource,
      },
    });
    if (decision.allowed) return decision;
  }
  throw denied();
}
