import {
  compileEntityIntakeFlows,
  compileEntityIntakeSurfaces,
} from "@athyper/contract-platform-entity-runtime";
import { qualifySurface } from "./composition-structure";
import { record, rows, type Json } from "./workbench-model";

// Reason codes emitted by the existing PermissionAuthorizer, not inferred decisions.
export const denialGuidance: Record<string, string> = {
  missing_permission:
    "Check the user's effective role and group grants in the target tenant, including validity dates.",
  denied_by_grant:
    "An explicit deny applies. Inspect deny grants before adding an allow grant.",
  mfa_required:
    "Complete interactive MFA in the affected application session; refreshing a token alone does not elevate assurance.",
  plan_locked:
    "Check the target tenant's plan entitlement for this permission.",
  plane_excluded:
    "The permission is excluded from this plane. Check publication targets and plane membership.",
  entitlement_unavailable:
    "Check the required feature entitlement in the target tenant.",
  operation_binding_missing:
    "Check that the active target release supplies this entity-operation binding.",
  operation_binding_ambiguous:
    "Resolve conflicting active operation bindings; adding user grants will not fix the ambiguity.",
  operation_permission_mismatch:
    "Compare the endpoint permission with the active entity-operation permission binding.",
  operation_coordinate_incomplete:
    "Supply both entity code and operation key in the authorization resource.",
  scope_coordinate_missing:
    "Check the required scope kinds and the resource coordinates supplied by the endpoint.",
};

export const configurationProperties: Record<string, readonly string[]> = {
  surfaceFieldBindings: ["required"],
  flows: ["title", "description", "navigationMode", "allowDraftResume"],
  flowSteps: ["titleOverride", "description", "isOptional"],
};
export function qualifyConfiguration(
  graph: Json,
  collection: string,
  id: string,
) {
  const matches = rows(graph[collection]).filter((r) => r.id === id);
  if (!id || matches.length !== 1)
    throw Error("The stored identity is missing or ambiguous.");
  const row = matches[0]!;
  if (!configurationProperties[collection] || row.status === "deprecated")
    throw Error("This configuration is read-only.");
  if (collection === "surfaceFieldBindings")
    qualifySurface(graph, String(row.entitySurfaceId));
  else {
    for (const branch of ["flows", "flowSteps", "operations", "surfaces"]) {
      const members = rows(graph[branch]);
      if (
        members.some((r) => !r.id) ||
        new Set(members.map((r) => r.id)).size !== members.length
      )
        throw Error("Resolve missing or duplicate workflow references first.");
    }
    const flow =
      collection === "flows"
        ? row
        : rows(graph.flows).find((f) => f.id === row.entityFlowId);
    if (!flow || flow.status === "deprecated")
      throw Error("The parent flow is unavailable.");
    compileEntityIntakeFlows(graph);
  }
  return row;
}
export function configurationEdit(
  graph: Json,
  collection: string,
  id: string,
  property: string,
  value: string | boolean,
): Json {
  const row = qualifyConfiguration(graph, collection, id);
  if (!configurationProperties[collection]?.includes(property))
    throw Error("This property is not qualified for editing.");
  if (["required", "isOptional", "allowDraftResume"].includes(property)) {
    if (typeof value !== "boolean") throw Error("Choose Yes or No.");
  } else if (typeof value !== "string" || !value.trim() || value.length > 2000)
    throw Error("Enter text up to 2,000 characters.");
  if (
    property === "navigationMode" &&
    !["linear", "free"].includes(String(value))
  )
    throw Error("Choose linear or free navigation.");
  const next = {
    ...graph,
    [collection]: rows(graph[collection]).map((r) =>
      r === row
        ? property === "required"
          ? {
              ...r,
              displayConfig: { ...record(r.displayConfig), required: value },
            }
          : { ...r, [property]: value }
        : r,
    ),
  };
  if (collection === "surfaceFieldBindings") compileEntityIntakeSurfaces(next);
  else compileEntityIntakeFlows(next);
  return next;
}

/** Stored requirements and binding defects only. Never manufacture a live access decision. */
export function permissionDiagnosis(
  graph: Json,
  operationId: string,
  plane: string,
) {
  const ops = rows(graph.operations).filter((o) => o.id === operationId);
  if (!operationId || ops.length !== 1)
    return {
      findings: ["Operation identity is missing or ambiguous."],
      permissions: [],
      scopes: [],
      rules: [],
      mfa: false,
    };
  const op = ops[0]!;
  const bindings = rows(graph.operationPermissions).filter(
    (p) =>
      p.entityOperationId === operationId &&
      p.targetPlane === plane &&
      p.status !== "deprecated",
  );
  const permissions = bindings.length
    ? bindings.map((p) => p.permissionCode)
    : op.permissionCode
      ? [op.permissionCode]
      : [];
  const scopes = rows(graph.operationScopeBindings).filter(
    (p) =>
      p.entityOperationId === operationId &&
      p.targetPlane === plane &&
      p.status !== "deprecated",
  );
  const rules = rows(graph.operationRules).filter(
    (p) =>
      p.entityOperationId === operationId &&
      (!p.planeCode || p.planeCode === plane) &&
      p.status !== "deprecated",
  );
  const findings: string[] = [];
  if (op.status === "deprecated") findings.push("The operation is deprecated.");
  if (
    !permissions.length ||
    permissions.some((p) => typeof p !== "string" || !p)
  )
    findings.push(
      "No usable permission requirement is declared for this plane.",
    );
  if (bindings.length > 1)
    findings.push(
      "Multiple active permission bindings require review; this view cannot determine precedence.",
    );
  if (!scopes.length)
    findings.push(
      "No scope binding is declared. This does not establish unrestricted access.",
    );
  for (const scope of scopes)
    if (!scope.scopeKind || !scope.coordinateSource)
      findings.push(
        `Scope ${String(scope.bindingKey ?? scope.id)} has incomplete coordinates.`,
      );
  if (rules.some((r) => r.decision === "deny"))
    findings.push(
      "A deny rule is declared. Its conditions must be evaluated by the target runtime.",
    );
  return { findings, permissions, scopes, rules, mfa: op.requiresMfa === true };
}
