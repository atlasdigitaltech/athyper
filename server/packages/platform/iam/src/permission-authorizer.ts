import type {
  Authorizer,
  EffectiveAuthorizationScope,
  EffectivePermissionRequirement,
  EffectivePermissionSnapshot,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";

export interface AuthorizationPolicyGate {
  evaluate(input: {
    readonly context: VerifiedRequestContext;
    readonly permissionCode: string;
    readonly resource?: Readonly<Record<string, unknown>>;
    readonly requirement?: EffectivePermissionRequirement;
  }): Promise<{
    readonly allowed: boolean;
    readonly sodSatisfied?: boolean;
    readonly reason?: string;
  }>;
}

/** Authorizes exclusively from the verified, immutable permission snapshot. */
export interface PermissionAuthorizerOptions {
  readonly policyGate?: AuthorizationPolicyGate;
  /** Current published catalog/entitlement lookup for source permissions with no
   * grant evidence. Never read from request payloads or inferred from target grants. */
  readonly readSourceRequirement?: (
    context: VerifiedRequestContext,
    permissionCode: string,
  ) => Promise<EffectivePermissionRequirement | null>;
}
export function createPermissionAuthorizer(
  options: PermissionAuthorizerOptions = {},
): Authorizer {
  return {
    checkSourceConstraints: (request) =>
      checkSourceConstraints(options, request),
    async authorize({ context, permissionCode, resource }) {
      const permissions = context.permissions;
      if (
        permissions.tenantId !== context.tenantId ||
        permissions.principalId !== context.principalId ||
        permissions.planeKey !== context.planeKey
      ) {
        return {
          allowed: false,
          reason: "authorization_snapshot_context_mismatch",
        };
      }
      if (
        resourceTenant(resource) &&
        resourceTenant(resource) !== context.tenantId
      ) {
        return { allowed: false, reason: "tenant_boundary_failed" };
      }
      const permissionEvidence = permissions.evidence?.filter(
        (item) => item.permissionCode === permissionCode,
      );
      if (
        !resource &&
        permissionEvidence?.some((item) => item.effect === "deny")
      ) {
        return { allowed: false, reason: "denied_by_grant" };
      }
      if (
        resource &&
        permissionEvidence?.some(
          (item) =>
            item.effect === "deny" && covers(item, resource, context.tenantId),
        )
      ) {
        return { allowed: false, reason: "denied_by_grant" };
      }
      if (permissions.denied.includes(permissionCode)) {
        return { allowed: false, reason: "denied_by_grant" };
      }
      if (permissions.planLocked.includes(permissionCode)) {
        return { allowed: false, reason: "plan_locked" };
      }
      if (permissions.planeExcluded.includes(permissionCode)) {
        return { allowed: false, reason: "plane_excluded" };
      }
      const requirement = permissions.requirements?.find(
        (item) => item.permissionCode === permissionCode,
      );
      if (requirement && !requirement.entitled)
        return { allowed: false, reason: "entitlement_unavailable" };
      if (requirement?.requiresMfa && context.assurance !== "elevated")
        return { allowed: false, reason: "mfa_required" };
      const operationFailure = validateOperationBinding(
        permissions,
        permissionCode,
        resource,
      );
      if (operationFailure) return { allowed: false, reason: operationFailure };
      if (!permissions.allowed.includes(permissionCode)) {
        return { allowed: false, reason: "missing_permission" };
      }
      const evidence = permissionEvidence?.filter(
        (item) => item.effect === "allow",
      );
      if (
        !resource &&
        evidence?.length &&
        evidence.every((item) => item.proof === "record_acl")
      ) {
        return { allowed: false, reason: "resource_required" };
      }
      if (
        resource &&
        evidence &&
        evidence.length > 0 &&
        !evidence.some((item) => covers(item, resource, context.tenantId))
      ) {
        return { allowed: false, reason: "scope_not_contained" };
      }
      if (requirement?.requiresSod && !options.policyGate)
        return { allowed: false, reason: "sod_evidence_required" };
      if (
        (requirement?.riskTier === "high" ||
          requirement?.riskTier === "critical") &&
        !options.policyGate
      )
        return { allowed: false, reason: "hard_policy_evidence_required" };
      if (options.policyGate) {
        const policy = await options.policyGate.evaluate({
          context,
          permissionCode,
          ...(resource ? { resource } : {}),
          ...(requirement ? { requirement } : {}),
        });
        if (!policy.allowed)
          return {
            allowed: false,
            reason: policy.reason ?? "hard_policy_failed",
          };
        if (requirement?.requiresSod && policy.sodSatisfied !== true)
          return { allowed: false, reason: "sod_evidence_required" };
      }
      const scope: EffectiveAuthorizationScope | undefined =
        permissions.authorizationScopes.find(
          (candidate) => candidate.permissionCode === permissionCode,
        );
      return scope ? { allowed: true, scope } : { allowed: true };
    },
  };
}

function validateOperationBinding(
  permissions: EffectivePermissionSnapshot,
  permissionCode: string,
  resource: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  const entityCode =
    typeof resource?.["entityCode"] === "string"
      ? resource["entityCode"]
      : undefined;
  const operationKey =
    typeof resource?.["operationKey"] === "string"
      ? resource["operationKey"]
      : undefined;
  if (!entityCode && !operationKey) return undefined;
  if (!entityCode || !operationKey) return "operation_coordinate_incomplete";
  if (permissions.operationBindings === undefined) return undefined;
  const matches = permissions.operationBindings.filter(
    (item) =>
      item.entityCode === entityCode && item.operationKey === operationKey,
  );
  if (!matches.length) return "operation_binding_missing";
  const signatures = new Set(
    matches.map(
      (item) =>
        `${item.permissionCode}\0${item.decisionMode}\0${item.requiredScopeKinds.join(",")}`,
    ),
  );
  if (signatures.size !== 1) return "operation_binding_ambiguous";
  const binding = matches[0]!;
  if (binding.permissionCode !== permissionCode)
    return "operation_permission_mismatch";
  for (const kind of binding.requiredScopeKinds) {
    const key = scopeCoordinateKey(kind);
    if (kind !== "tenant" && (!key || typeof resource?.[key] !== "string"))
      return "scope_coordinate_missing";
  }
  return undefined;
}

function scopeCoordinateKey(kind: string): string | undefined {
  return (
    {
      legal_entity: "legalEntityId",
      company_code: "companyCodeId",
      operating_organization: "operatingOrganizationId",
      network_account: "networkAccountId",
      network_relationship: "networkRelationshipId",
      workspace: "workspaceId",
      module: "moduleId",
      resource: "resourceId",
    } as Readonly<Record<string, string>>
  )[kind];
}

function resourceTenant(
  resource: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  return typeof resource?.["tenantId"] === "string"
    ? resource["tenantId"]
    : undefined;
}

function covers(
  evidence: NonNullable<EffectivePermissionSnapshot["evidence"]>[number],
  resource: Readonly<Record<string, unknown>>,
  tenantId: string,
): boolean {
  if (evidence.proof === "record_acl") {
    return (
      resource["resourceCode"] === evidence.resourceCode &&
      resource["recordId"] === evidence.recordId
    );
  }
  if (evidence.scopeKind === "tenant") return evidence.targetId === tenantId;
  if (resource["scopeTargetId"] === evidence.scopeTargetId) return true;
  const coordinate: Readonly<Record<string, string>> = {
    legal_entity: "legalEntityId",
    company_code: "companyCodeId",
    operating_organization: "operatingOrganizationId",
    network_account: "networkAccountId",
    network_relationship: "networkRelationshipId",
    workspace: "workspaceId",
    module: "moduleId",
    resource: "resourceId",
  };
  const key = coordinate[evidence.scopeKind];
  return key !== undefined && resource[key] === evidence.targetId;
}

/** Does not test source allows or source allow coverage, and does not manufacture
 * permission evidence. Native binding and target allow checks remain mandatory
 * at the canonical backend boundary. Missing catalog facts fail closed. */
async function checkSourceConstraints(
  options: PermissionAuthorizerOptions,
  {
    context,
    permissionCode,
    resource,
  }: import("@athyper/server-contract-auth").AuthorizationRequest,
): Promise<
  Awaited<ReturnType<NonNullable<Authorizer["checkSourceConstraints"]>>>
> {
  const p = context.permissions;
  if (
    p.tenantId !== context.tenantId ||
    p.principalId !== context.principalId ||
    p.planeKey !== context.planeKey
  )
    return {
      state: "denied",
      reason: "authorization_snapshot_context_mismatch",
    };
  if (resourceTenant(resource) && resourceTenant(resource) !== context.tenantId)
    return { state: "denied", reason: "tenant_boundary_failed" };
  if (
    p.denied.includes(permissionCode) ||
    p.evidence?.some(
      (e) =>
        e.permissionCode === permissionCode &&
        e.effect === "deny" &&
        (!resource || covers(e, resource, context.tenantId)),
    )
  )
    return { state: "denied", reason: "denied_by_grant" };
  if (p.planLocked.includes(permissionCode))
    return { state: "denied", reason: "plan_locked" };
  if (p.planeExcluded.includes(permissionCode))
    return { state: "denied", reason: "plane_excluded" };
  try {
    const requirement = options.readSourceRequirement
      ? await options.readSourceRequirement(context, permissionCode)
      : p.requirements?.find((r) => r.permissionCode === permissionCode);
    if (!requirement || requirement.permissionCode !== permissionCode)
      return { state: "unavailable", reason: "source_requirement_unavailable" };
    if (!requirement.entitled)
      return { state: "denied", reason: "entitlement_unavailable" };
    if (requirement.requiresMfa && context.assurance !== "elevated")
      return { state: "denied", reason: "mfa_required" };
    if (requirement.requiresSod && !options.policyGate)
      return { state: "denied", reason: "sod_evidence_required" };
    if (
      ["high", "critical"].includes(requirement.riskTier) &&
      !options.policyGate
    )
      return { state: "denied", reason: "hard_policy_evidence_required" };
    if (options.policyGate) {
      const policy = await options.policyGate.evaluate({
        context,
        permissionCode,
        ...(resource ? { resource } : {}),
        requirement,
      });
      if (!policy.allowed)
        return {
          state: "denied",
          reason: policy.reason ?? "hard_policy_failed",
        };
      if (requirement.requiresSod && policy.sodSatisfied !== true)
        return { state: "denied", reason: "sod_evidence_required" };
    }
    return { state: "satisfied" };
  } catch {
    return { state: "unavailable", reason: "source_constraints_unavailable" };
  }
}
