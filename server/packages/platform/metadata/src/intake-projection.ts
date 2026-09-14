import { parseEntityIntakeFlows } from "@athyper/contract-platform-entity-runtime";
type Row = Record<string, any>;
/** Lower existing metadata.entity_flow/step rows. Never infer executable URLs or grant authority. */
export function compileEntityIntakeFlows(
  native: Readonly<Record<string, unknown>>,
) {
  const rows = (name: string): Row[] => {
    const value = native[name] ?? [];
    if (
      !Array.isArray(value) ||
      value.some((v) => !v || typeof v !== "object" || Array.isArray(v))
    )
      throw Error(`INTAKE_INVALID_BRANCH:${name}`);
    return value;
  };
  const flows = rows("flows").filter((r) => r.status !== "deprecated");
  const steps = rows("flowSteps");
  const operations = rows("operations").filter(
    (r) => r.status !== "deprecated",
  );
  const surfaces = rows("surfaces").filter((r) => r.status !== "deprecated");
  const allFlowIds = new Set(rows("flows").map((f) => f.id));
  if (steps.some((s) => !allFlowIds.has(s.entityFlowId)))
    throw Error("INTAKE_ORPHAN_STEP");
  const operation = (id: unknown) => {
    const found = operations.find((o) => o.id === id);
    if (!id || !found) throw Error("INTAKE_OPERATION_REQUIRED");
    return found.operationKey;
  };
  return parseEntityIntakeFlows(
    flows.map((f) => {
      const members = steps.filter((s) => s.entityFlowId === f.id);
      if (
        members.some((s) => !Number.isInteger(s.position) || s.position < 0) ||
        new Set(members.map((s) => s.position)).size !== members.length
      )
        throw Error("INTAKE_STEP_ORDER_INVALID");
      return {
        schemaVersion: 1,
        key: f.flowKey,
        kind: f.flowKind,
        title: f.title,
        description: f.description,
        navigation: f.navigationMode ?? "linear",
        allowDraftResume: f.allowDraftResume ?? true,
        entryOperation: operation(f.entryOperationId),
        completionOperation: operation(f.completionOperationId),
        steps: members
          .sort((a, b) => a.position - b.position)
          .map((s) => {
            const surface = surfaces.find((v) => v.id === s.entitySurfaceId);
            if (!surface) throw Error("INTAKE_SURFACE_REQUIRED");
            return {
              key: s.stepKey,
              surfaceKey: surface.surfaceKey,
              title: s.titleOverride ?? surface.title,
              description: s.description,
              optional: s.isOptional ?? false,
              entryCondition: s.entryCondition,
              completionCondition: s.completionCondition,
            };
          }),
      };
    }),
  );
}
