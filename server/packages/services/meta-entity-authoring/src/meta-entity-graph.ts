import type {
  MetaEntityDiagnostic,
  MetaEntityPhase2Graph,
} from "@athyper/meta-entity-authoring-contracts";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function snake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function canonical(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") return String(value);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [snake(key), canonical(child)] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function byKey<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

/** DDL-shaped transport used only by the normalized row repository. */
export function toDatabaseMetaEntityGraph(graph: MetaEntityPhase2Graph): JsonValue {
  return canonical({
    runtimeProfile: graph.runtimeProfile,
    fields: graph.fields,
    keys: graph.keys,
    searchProfiles: graph.searchProfiles,
    relations: graph.relations,
    surfaces: graph.surfaces ?? [],
    operations: graph.operations ?? [],
    surfaceOperations: graph.surfaceOperations ?? [],
    operationRules: graph.operationRules ?? [],
    operationScopeBindings: graph.operationScopeBindings ?? [],
    flows: graph.flows ?? [],
    policyBindings: graph.policyBindings ?? [],
    fieldPolicyBindings: graph.fieldPolicyBindings ?? [],
    testCases: graph.testCases ?? [],
    lifecycleBindings: graph.lifecycleBindings ?? [],
    lifecycleOperationBindings: graph.lifecycleOperationBindings ?? [],
    numberingBindings: graph.numberingBindings ?? [],
  });
}

/** Stable, DDL-shaped source for checkpoints and semantic diffs. */
export function canonicalizeMetaEntityGraph(graph: MetaEntityPhase2Graph): JsonValue {
  const fieldKeyById = new Map(graph.fields.map((field) => [field.id, field.fieldKey] as const));
  const runtimeProfile = { ...graph.runtimeProfile };
  const surfaceKeyById = new Map((graph.surfaces ?? []).map((surface) => [surface.id, surface.surfaceKey] as const));
  const operationKeyById = new Map((graph.operations ?? []).map((operation) => [operation.id, operation.operationKey] as const));
  const flowKeyById = new Map((graph.flows ?? []).map((flow) => [flow.id, flow.flowKey] as const));
  delete (runtimeProfile as Partial<typeof runtimeProfile>).id;
  return canonical({
    schemaVersion: "5.2",
    runtimeProfile,
    fields: byKey(graph.fields, (field) => field.fieldKey).map((field) => {
      const { id: _id, keyUsageCount: _keyUsageCount, searchUsageCount: _searchUsageCount,
        relationUsageCount: _relationUsageCount, ...contractField } = field;
      return contractField;
    }),
    keys: byKey(graph.keys, (key) => key.keyKey).map((key) => ({
      keyKey: key.keyKey, keyKind: key.keyKind, uniquenessScope: key.uniquenessScope,
      nullSemantics: key.nullSemantics, status: key.status, replacementKeyKey: key.replacementKeyKey,
      deprecatedSinceReleaseNo: key.deprecatedSinceReleaseNo, plannedRemovalReleaseNo: key.plannedRemovalReleaseNo,
      fields: [...key.fields].sort((left, right) => left.position - right.position).map((binding) => ({
        fieldKey: fieldKeyById.get(binding.entityFieldId) ?? `missing:${binding.entityFieldId}`,
        position: binding.position,
      })),
    })),
    searchProfiles: byKey(graph.searchProfiles, (profile) => profile.searchKey).map((profile) => ({
      searchKey: profile.searchKey, searchKind: profile.searchKind, queryOperator: profile.queryOperator,
      minimumQueryLength: profile.minimumQueryLength, languageCode: profile.languageCode,
      normalizationMode: profile.normalizationMode, isDefault: profile.isDefault, status: profile.status,
      replacementSearchKey: profile.replacementSearchKey,
      deprecatedSinceReleaseNo: profile.deprecatedSinceReleaseNo,
      plannedRemovalReleaseNo: profile.plannedRemovalReleaseNo,
      fields: [...profile.fields].sort((left, right) => left.position - right.position).map((binding) => ({
        fieldKey: fieldKeyById.get(binding.entityFieldId) ?? `missing:${binding.entityFieldId}`,
        position: binding.position, matchMode: binding.matchMode, weight: binding.weight,
      })),
    })),
    relations: byKey(graph.relations, (relation) => relation.relationKey).map((relation) => ({
      relationKey: relation.relationKey, relationKind: relation.relationKind,
      resolutionKind: relation.resolutionKind, ownershipMode: relation.ownershipMode,
      mutationMode: relation.mutationMode, onDelete: relation.onDelete, onUpdate: relation.onUpdate,
      inverseRelationKey: relation.inverseRelationKey, status: relation.status,
      replacementRelationKey: relation.replacementRelationKey,
      deprecatedSinceReleaseNo: relation.deprecatedSinceReleaseNo,
      plannedRemovalReleaseNo: relation.plannedRemovalReleaseNo,
      targets: byKey(relation.targets, (target) => target.relationTargetKey).map((target) => ({
        relationTargetKey: target.relationTargetKey, targetEntityId: target.targetEntityId,
        targetKeyKey: target.targetKeyKey, discriminatorValue: target.discriminatorValue,
        isDefault: target.isDefault,
        fields: [...target.fields].sort((left, right) => left.position - right.position).map((binding) => ({
          sourceFieldKey: fieldKeyById.get(binding.sourceFieldId) ?? `missing:${binding.sourceFieldId}`,
          targetFieldKey: binding.targetFieldKey, position: binding.position,
        })),
      })),
    })),
    surfaces: byKey(graph.surfaces ?? [], (surface) => surface.surfaceKey).map((surface) => {
      const sectionKeyById = new Map(surface.sections.map((section) => [section.id, section.sectionKey] as const));
      return {
        surfaceKey: surface.surfaceKey, surfaceKind: surface.surfaceKind, title: surface.title,
        description: surface.description, layoutKind: surface.layoutKind, layoutConfig: surface.layoutConfig,
        isDefault: surface.isDefault, status: surface.status,
        replacementSurfaceKey: surface.replacementSurfaceKey,
        deprecatedSinceReleaseNo: surface.deprecatedSinceReleaseNo,
        plannedRemovalReleaseNo: surface.plannedRemovalReleaseNo,
        sections: byKey(surface.sections, (section) => section.sectionKey).map((section) => ({
          sectionKey: section.sectionKey,
          parentSectionKey: section.parentSectionId ? sectionKeyById.get(section.parentSectionId) ?? `missing:${section.parentSectionId}` : null,
          sectionKind: section.sectionKind, title: section.title, description: section.description,
          position: section.position, columnCount: section.columnCount, collapsible: section.collapsible,
          collapsedByDefault: section.collapsedByDefault, layoutConfig: section.layoutConfig,
        })),
        fieldBindings: byKey(surface.fieldBindings, (binding) => binding.bindingKey).map((binding) => ({
          bindingKey: binding.bindingKey,
          fieldKey: fieldKeyById.get(binding.entityFieldId) ?? `missing:${binding.entityFieldId}`,
          sectionKey: binding.sectionId ? sectionKeyById.get(binding.sectionId) ?? `missing:${binding.sectionId}` : null,
          position: binding.position, labelOverride: binding.labelOverride, helpText: binding.helpText,
          placeholder: binding.placeholder, widgetKey: binding.widgetKey, columnSpan: binding.columnSpan,
          showRequiredIndicator: binding.showRequiredIndicator, displayConfig: binding.displayConfig,
          visibilityRule: binding.visibilityRule, editabilityRule: binding.editabilityRule, status: binding.status,
        })),
      };
    }),
    operations: byKey(graph.operations ?? [], (operation) => operation.operationKey).map(({ id: _id, ...operation }) => operation),
    surfaceOperations: byKey(graph.surfaceOperations ?? [], (binding) => binding.placementKey).map(({ id: _id, surfaceId, operationId, sectionId, confirmationSurfaceId, ...binding }) => ({
      ...binding,
      surfaceKey: surfaceKeyById.get(surfaceId) ?? `missing:${surfaceId}`,
      operationKey: operationKeyById.get(operationId) ?? `missing:${operationId}`,
      sectionKey: sectionId ? (graph.surfaces ?? []).flatMap((surface) => surface.sections).find((section) => section.id === sectionId)?.sectionKey ?? `missing:${sectionId}` : null,
      confirmationSurfaceKey: confirmationSurfaceId ? surfaceKeyById.get(confirmationSurfaceId) ?? `missing:${confirmationSurfaceId}` : null,
    })),
    operationRules: byKey(graph.operationRules ?? [], (rule) => `${operationKeyById.get(rule.operationId) ?? rule.operationId}:${rule.ruleKey}`).map(({ id: _id, operationId, ...rule }) => ({
      ...rule, operationKey: operationKeyById.get(operationId) ?? `missing:${operationId}`,
    })),
    operationScopeBindings: byKey(
      graph.operationScopeBindings ?? [],
      (binding) => `${operationKeyById.get(binding.operationId) ?? binding.operationId}:${binding.targetPlane}:${binding.scopeKind}`,
    ).map(({ id: _id, operationId, ...binding }) => ({
      ...binding,
      operationKey: operationKeyById.get(operationId) ?? `missing:${operationId}`,
    })),
    flows: byKey(graph.flows ?? [], (flow) => flow.flowKey).map(({ id: _id, entryOperationId, completionOperationId, steps, ...flow }) => ({
      ...flow,
      entryOperationKey: entryOperationId ? operationKeyById.get(entryOperationId) ?? `missing:${entryOperationId}` : null,
      completionOperationKey: completionOperationId ? operationKeyById.get(completionOperationId) ?? `missing:${completionOperationId}` : null,
      steps: [...steps].sort((left, right) => left.position - right.position).map(({ id: _stepId, surfaceId, ...step }) => ({
        ...step, surfaceKey: surfaceKeyById.get(surfaceId) ?? `missing:${surfaceId}`,
      })),
    })),
    policyBindings: byKey(graph.policyBindings ?? [], (binding) => binding.bindingKey).map(({ id: _id, operationId, ...binding }) => ({
      ...binding, operationKey: operationId ? operationKeyById.get(operationId) ?? `missing:${operationId}` : null,
    })),
    fieldPolicyBindings: byKey(graph.fieldPolicyBindings ?? [], (binding) => binding.bindingKey).map(({ id: _id, fieldId, operationId, ...binding }) => ({
      ...binding, fieldKey: fieldKeyById.get(fieldId) ?? `missing:${fieldId}`,
      operationKey: operationId ? operationKeyById.get(operationId) ?? `missing:${operationId}` : null,
    })),
    testCases: byKey(graph.testCases ?? [], (test) => test.testKey).map(({ id: _id, operationId, flowId, ...test }) => ({
      ...test,
      operationKey: operationId ? operationKeyById.get(operationId) ?? `missing:${operationId}` : null,
      flowKey: flowId ? flowKeyById.get(flowId) ?? `missing:${flowId}` : null,
    })),
    lifecycleBindings: byKey(graph.lifecycleBindings ?? [], (binding) => binding.bindingKey).map(({ id: _id, stateFieldId, ...binding }) => ({
      ...binding, stateFieldKey: fieldKeyById.get(stateFieldId) ?? `missing:${stateFieldId}`,
    })),
    lifecycleOperationBindings: byKey(graph.lifecycleOperationBindings ?? [], (binding) => binding.mappingKey).map(({ id: _id, lifecycleBindingId, operationId, ...binding }) => ({
      ...binding,
      lifecycleBindingKey: (graph.lifecycleBindings ?? []).find((item) => item.id === lifecycleBindingId)?.bindingKey ?? `missing:${lifecycleBindingId}`,
      operationKey: operationKeyById.get(operationId) ?? `missing:${operationId}`,
    })),
    numberingBindings: byKey(graph.numberingBindings ?? [], (binding) => binding.bindingKey).map(({ id: _id, fieldId, operationId, ...binding }) => ({
      ...binding,
      fieldKey: fieldKeyById.get(fieldId) ?? `missing:${fieldId}`,
      operationKey: operationId ? operationKeyById.get(operationId) ?? `missing:${operationId}` : null,
    })),
  });
}

export function diffCanonicalPaths(previous: unknown, current: unknown, path = "$"): string[] {
  if (Object.is(previous, current)) return [];
  if (Array.isArray(previous) && Array.isArray(current)) {
    const paths = new Set<string>();
    const count = Math.max(previous.length, current.length);
    for (let index = 0; index < count; index += 1) {
      for (const changed of diffCanonicalPaths(previous[index], current[index], `${path}[${index}]`)) paths.add(changed);
    }
    return [...paths].sort();
  }
  if (previous && current && typeof previous === "object" && typeof current === "object") {
    const paths = new Set<string>();
    const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
    for (const key of [...keys].sort()) {
      for (const changed of diffCanonicalPaths(
        (previous as Record<string, unknown>)[key],
        (current as Record<string, unknown>)[key],
        `${path}.${key}`,
      )) paths.add(changed);
    }
    return [...paths].sort();
  }
  return [path];
}

export function validateMetaEntityGraph(graph: MetaEntityPhase2Graph): MetaEntityDiagnostic[] {
  const diagnostics: MetaEntityDiagnostic[] = [];
  const fieldIds = new Set(graph.fields.map((field) => field.id));
  const add = (code: string, message: string, section: MetaEntityDiagnostic["section"], objectId?: string): void => {
    diagnostics.push({ id: `${code}:${objectId ?? "graph"}`, code, severity: "error", message, section, objectId });
  };

  if (!graph.runtimeProfile) add("runtime_profile.required", "A runtime profile is required.", "overview");
  if (graph.fields.length === 0) add("field.required", "At least one field is required.", "fields");
  for (const key of graph.keys) {
    if (key.fields.length === 0) add("key.field.required", `Key ${key.keyKey} has no fields.`, "keys", key.id);
    for (const binding of key.fields) if (!fieldIds.has(binding.entityFieldId)) {
      add("key.field.missing", `Key ${key.keyKey} references an unknown field.`, "keys", binding.id);
    }
  }
  for (const profile of graph.searchProfiles) {
    if (profile.fields.length === 0) add("search.field.required", `Search ${profile.searchKey} has no fields.`, "search", profile.id);
    for (const binding of profile.fields) if (!fieldIds.has(binding.entityFieldId)) {
      add("search.field.missing", `Search ${profile.searchKey} references an unknown field.`, "search", binding.id);
    }
  }
  for (const relation of graph.relations) {
    if (relation.targets.length === 0) add("relation.target.required", `Relation ${relation.relationKey} has no target.`, "relations", relation.id);
    for (const target of relation.targets) for (const binding of target.fields) if (!fieldIds.has(binding.sourceFieldId)) {
      add("relation.field.missing", `Relation ${relation.relationKey} references an unknown source field.`, "relations", binding.id);
    }
  }
  const surfaces = graph.surfaces ?? [];
  const operations = graph.operations ?? [];
  const surfaceKeys = new Set(surfaces.map((surface) => surface.surfaceKey));
  const surfaceIds = new Set(surfaces.map((surface) => surface.id));
  const operationIds = new Set(operations.map((operation) => operation.id));
  for (const surface of surfaces) {
    const sectionIds = new Set(surface.sections.map((section) => section.id));
    for (const section of surface.sections) if (section.parentSectionId && !sectionIds.has(section.parentSectionId)) {
      add("surface.section.parent.missing", `Surface ${surface.surfaceKey} has an unknown parent section.`, "surfaces", section.id);
    }
    for (const binding of surface.fieldBindings) {
      if (!fieldIds.has(binding.entityFieldId)) add("surface.field.missing", `Surface ${surface.surfaceKey} references an unknown field.`, "surfaces", binding.id);
      if (binding.sectionId && !sectionIds.has(binding.sectionId)) add("surface.section.missing", `Surface ${surface.surfaceKey} references an unknown section.`, "surfaces", binding.id);
    }
  }
  for (const operation of operations) {
    for (const surfaceKey of [operation.inputSurfaceKey, operation.confirmationSurfaceKey, operation.resultSurfaceKey]) {
      if (surfaceKey && !surfaceKeys.has(surfaceKey)) add("operation.surface.missing", `Operation ${operation.operationKey} references unknown surface ${surfaceKey}.`, "operations", operation.id);
    }
    if (operation.operationKind !== "read" && !operation.handlerKey) add("operation.handler.required", `Operation ${operation.operationKey} requires a handler.`, "operations", operation.id);
  }
  for (const binding of graph.surfaceOperations ?? []) {
    if (!surfaceIds.has(binding.surfaceId) || !operationIds.has(binding.operationId)) add("surface.operation.missing", `Placement ${binding.placementKey} references an unknown surface or operation.`, "operations", binding.id);
    if (binding.confirmationSurfaceId && !surfaceIds.has(binding.confirmationSurfaceId)) add("surface.operation.confirmation.missing", `Placement ${binding.placementKey} references an unknown confirmation surface.`, "operations", binding.id);
  }
  for (const rule of graph.operationRules ?? []) if (!operationIds.has(rule.operationId)) add("operation.rule.operation.missing", `Rule ${rule.ruleKey} references an unknown operation.`, "operations", rule.id);
  for (const binding of graph.operationScopeBindings ?? []) {
    if (!operationIds.has(binding.operationId)) {
      add("operation.scope.operation.missing", `Scope binding ${binding.bindingKey} references an unknown operation.`, "operations", binding.id);
    }
    const fieldSource = ["request_field", "record_field", "collection_field"].includes(binding.coordinateSource);
    if (fieldSource !== Boolean(binding.coordinateKey)) {
      add("operation.scope.coordinate.invalid", `Scope binding ${binding.bindingKey} has an invalid coordinate key.`, "operations", binding.id);
    }
    if ((binding.coordinateSource === "relation_resolver") !== Boolean(binding.resolverKey)) {
      add("operation.scope.resolver.invalid", `Scope binding ${binding.bindingKey} has an invalid resolver key.`, "operations", binding.id);
    }
  }
  const flowIds = new Set((graph.flows ?? []).map((flow) => flow.id));
  for (const flow of graph.flows ?? []) {
    if (!flow.steps.length) add("flow.step.required", `Flow ${flow.flowKey} has no steps.`, "flows", flow.id);
    if (flow.entryOperationId && !operationIds.has(flow.entryOperationId)) add("flow.entry_operation.missing", `Flow ${flow.flowKey} references an unknown entry operation.`, "flows", flow.id);
    if (flow.completionOperationId && !operationIds.has(flow.completionOperationId)) add("flow.completion_operation.missing", `Flow ${flow.flowKey} references an unknown completion operation.`, "flows", flow.id);
    for (const step of flow.steps) if (!surfaceIds.has(step.surfaceId)) add("flow.step.surface.missing", `Flow ${flow.flowKey} references an unknown surface.`, "flows", step.id);
  }
  for (const binding of graph.policyBindings ?? []) if (binding.operationId && !operationIds.has(binding.operationId)) add("policy.operation.missing", `Policy binding ${binding.bindingKey} references an unknown operation.`, "policies", binding.id);
  for (const binding of graph.fieldPolicyBindings ?? []) {
    if (!fieldIds.has(binding.fieldId)) add("policy.field.missing", `Field policy ${binding.bindingKey} references an unknown field.`, "policies", binding.id);
    if (binding.operationId && !operationIds.has(binding.operationId)) add("policy.operation.missing", `Field policy ${binding.bindingKey} references an unknown operation.`, "policies", binding.id);
  }
  for (const test of graph.testCases ?? []) {
    if (test.operationId && !operationIds.has(test.operationId)) add("test.operation.missing", `Test ${test.testKey} references an unknown operation.`, "tests", test.id);
    if (test.flowId && !flowIds.has(test.flowId)) add("test.flow.missing", `Test ${test.testKey} references an unknown flow.`, "tests", test.id);
  }
  const lifecycleBindingIds = new Set((graph.lifecycleBindings ?? []).map((binding) => binding.id));
  const lifecyclePlanes = new Set<string>();
  for (const binding of graph.lifecycleBindings ?? []) {
    const field = graph.fields.find((item) => item.id === binding.stateFieldId);
    if (!field) add("lifecycle.state_field.missing", `Lifecycle ${binding.bindingKey} references an unknown state field.`, "lifecycle", binding.id);
    else if (field.status !== "active" || field.cardinality === "many" || !["string", "enum"].includes(field.dataType)) add("lifecycle.state_field.invalid", `Lifecycle ${binding.bindingKey} requires an active scalar string or enum field.`, "lifecycle", binding.id);
    if (lifecyclePlanes.has(binding.targetPlane)) add("lifecycle.plane.duplicate", `Only one lifecycle coordinate may target ${binding.targetPlane} in a change set.`, "lifecycle", binding.id);
    lifecyclePlanes.add(binding.targetPlane);
    if (binding.required && binding.status === "active" && !(graph.lifecycleOperationBindings ?? []).some((mapping) => mapping.lifecycleBindingId === binding.id && mapping.status === "active")) {
      add("lifecycle.operation.required", `Required lifecycle ${binding.bindingKey} needs at least one active operation mapping.`, "lifecycle", binding.id);
    }
  }
  for (const binding of graph.lifecycleOperationBindings ?? []) {
    if (!lifecycleBindingIds.has(binding.lifecycleBindingId)) add("lifecycle.binding.missing", `Lifecycle mapping ${binding.mappingKey} references an unknown lifecycle binding.`, "lifecycle", binding.id);
    if (!operationIds.has(binding.operationId)) add("lifecycle.operation.missing", `Lifecycle mapping ${binding.mappingKey} references an unknown operation.`, "lifecycle", binding.id);
  }
  const numberingTargets = new Set<string>();
  for (const binding of graph.numberingBindings ?? []) {
    const field = graph.fields.find((item) => item.id === binding.fieldId);
    if (!field) add("numbering.field.missing", `Numbering ${binding.bindingKey} references an unknown field.`, "numbering", binding.id);
    else if (field.status !== "active" || field.dataType !== "string" || field.cardinality !== "one"
      || field.valueOrigin !== "stored" || field.writeMode !== "write_once") {
      add("numbering.field.invalid", `Numbering ${binding.bindingKey} requires an active stored scalar write-once string field.`, "numbering", binding.id);
    }
    if (binding.assignmentMode === "automatic" && (!binding.operationId || !operationIds.has(binding.operationId))) {
      add("numbering.operation.required", `Automatic numbering ${binding.bindingKey} requires an active Entity operation.`, "numbering", binding.id);
    }
    if (binding.assignmentMode === "manual" && binding.operationId) {
      add("numbering.operation.prohibited", `Manual numbering ${binding.bindingKey} cannot have a triggering operation.`, "numbering", binding.id);
    }
    const target = `${binding.targetPlane}:${binding.fieldId}`;
    if (numberingTargets.has(target)) add("numbering.target.duplicate", `Field ${field?.fieldKey ?? binding.fieldId} already has a ${binding.targetPlane} numbering binding.`, "numbering", binding.id);
    numberingTargets.add(target);
  }
  return diagnostics;
}
