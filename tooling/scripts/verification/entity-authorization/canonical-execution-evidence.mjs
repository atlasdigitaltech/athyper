/** Parse execution diagnostics only. Profile-preview shadow events cannot qualify
 * a canonical runtime. The caller must separately verify image/artifact/session. */
export function canonicalExecutionComparisons(events) {
  const groups = new Map(),
    gaps = [];
  for (const event of events) {
    if (event.kind !== "isolated_target_decision") continue;
    if (
      typeof event.evaluationRef !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        event.evaluationRef,
      ) ||
      typeof event.requestedOperationKey !== "string" ||
      !event.requestedOperationKey
    ) {
      gaps.push({ reason: "uncorrelated_execution_event" });
      continue;
    }
    const group = groups.get(event.evaluationRef) ?? [];
    group.push(event);
    groups.set(event.evaluationRef, group);
  }
  const comparisons = [];
  for (const [evaluationRef, group] of groups) {
    const operations = [...new Set(group.map((e) => e.requestedOperationKey))];
    const source = group.filter((e) =>
      ["source_authority", "source_scope"].includes(e.stage),
    );
    const final = group.filter((e) => e.stage === "backend_complete");
    if (
      operations.length !== 1 ||
      source.length !== 1 ||
      final.length !== 1 ||
      source[0].operationKey !== operations[0] ||
      final[0].operationKey !== operations[0] ||
      !["allowed", "denied"].includes(source[0].state) ||
      !["allowed", "denied", "unavailable"].includes(final[0].state)
    ) {
      gaps.push({
        evaluationRef,
        reason: "incomplete_or_conflicting_execution",
      });
      continue;
    }
    comparisons.push({
      evaluationRef,
      operationKey: operations[0],
      legacy: source[0].state,
      target: final[0].state,
      differs: source[0].state !== final[0].state,
      sourceConstraints: group
        .filter((e) => e.stage === "source_constraints")
        .map((e) => ({ operationKey: e.operationKey, state: e.state })),
      trace: group.map((e) => ({
        operationKey: e.operationKey,
        stage: e.stage,
        state: e.state,
      })),
    });
  }
  return {
    schemaVersion: 1,
    comparisons,
    mappingGaps: gaps,
    diagnosticComplete: comparisons.length > 0 && gaps.length === 0,
    acceptanceRecorded: false,
    releaseQualificationEstablished: false,
  };
}
