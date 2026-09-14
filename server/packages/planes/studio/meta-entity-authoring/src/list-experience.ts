import {
  parsePublishedListExperience,
  STANDARD_VIEW_RELATIONSHIP_SOURCES,
  type PublishedListExperienceV1,
} from "@athyper/contract-platform-entity-list";
import type {
  MetaEntityGraph,
  MetaEntitySurface,
} from "@athyper/server-contract-meta-entity-authoring";

/** Surface placements refer to operations; permissions/rules/scopes are never authored twice. */
export function compileListExperience(
  graph: MetaEntityGraph,
  surface: MetaEntitySurface,
  registeredAttentionCounts: readonly string[] = [],
  registeredCollections: readonly string[] = [],
  registeredStandardViewSources: readonly string[] = STANDARD_VIEW_RELATIONSHIP_SOURCES,
): PublishedListExperienceV1 {
  const config = surface.layoutConfig?.["experience"] as
    Record<string, unknown> | undefined;
  const defaultLocale =
    typeof config?.["defaultLocale"] === "string"
      ? config["defaultLocale"]
      : "en";
  const text = (value: string) => ({
    defaultLocale,
    values: { [defaultLocale]: value },
  });
  const entryPolicies = (config?.["operationEntryPolicies"] ?? {}) as Record<string, unknown>;
  if (!entryPolicies || typeof entryPolicies !== "object" || Array.isArray(entryPolicies))
    throw new TypeError("Request entry policies must be an object");
  for (const [key, policy] of Object.entries(entryPolicies)) {
    if (policy !== "permission_only" || !graph.operations.some(op => op.operationKey === key && op.status !== "deprecated" && op.inputSurfaceKey))
      throw new TypeError("Request entry policy must reference an active operation with an input surface");
  }
  const labels = (config?.["actionLabels"] ?? {}) as Record<string, unknown>;
  const routes = (config?.["routes"] ?? []) as {
    surfaceKey: string;
    href: string;
  }[];
  for (const route of routes) {
    if (
      !(graph.surfaces ?? []).some(
        (target) =>
          target.surfaceKey === route.surfaceKey &&
          target.status !== "deprecated",
      )
    )
      throw new TypeError(`Unpublished target surface: ${route.surfaceKey}`);
  }
  const actions = (graph.surfaceOperations ?? [])
    .filter(
      (binding) =>
        binding.entitySurfaceId === surface.id &&
        binding.status !== "deprecated" &&
        ["primary", "secondary", "navigation", "navigation_overflow"].includes(
          binding.interactionTarget,
        ),
    )
    .map((binding) => {
      if (binding.selectionMode && binding.selectionMode !== "none")
        throw new TypeError("Header actions cannot require selected records");
      const operation = graph.operations.find(
        (operation) =>
          operation.id === binding.entityOperationId &&
          operation.status !== "deprecated",
      );
      if (!operation)
        throw new TypeError(
          `Unpublished operation: ${binding.entityOperationId}`,
        );
      const targetSurfaceKey =
        operation.inputSurfaceKey ?? operation.resultSurfaceKey;
      if (!targetSurfaceKey)
        throw new TypeError(
          `List navigation operation ${operation.operationKey} requires a target surface`,
        );
      return {
        key: binding.placementKey,
        label:
          labels[binding.placementKey] ??
          text(binding.labelOverride ?? operation.label),
        placement: ["navigation", "navigation_overflow"].includes(
          binding.interactionTarget,
        )
          ? "secondary"
          : binding.interactionTarget,
        position: binding.position,
        operationKey: operation.operationKey,
        ...(entryPolicies[operation.operationKey] === undefined ? {} : { entryPolicy: entryPolicies[operation.operationKey] }),
        targetSurfaceKey,
        permissions: (graph.operationPermissions ?? [])
          .filter(
            (item) =>
              item.entityOperationId === operation.id &&
              item.status !== "deprecated",
          )
          .map((item) => ({
            plane: item.targetPlane,
            permissionCode: item.permissionCode,
          })),
        rules: (graph.operationRules ?? [])
          .filter(
            (item) =>
              item.entityOperationId === operation.id &&
              item.status !== "deprecated",
          )
          .map((item) => ({
            key: item.ruleKey,
            priority: item.priority ?? 100,
            decision: item.decision,
            plane: item.planeCode,
            requiredCapabilityCode: item.requiredCapabilityCode,
            lifecycleStateCode: item.lifecycleStateCode,
            lifecycleTransitionCode: item.lifecycleTransitionCode,
          })),
        scopes: (graph.operationScopeBindings ?? [])
          .filter(
            (item) =>
              item.entityOperationId === operation.id &&
              item.status !== "deprecated",
          )
          .map((item) => ({
            plane: item.targetPlane,
            scopeKind: item.scopeKind,
            coordinateSource: item.coordinateSource,
            coordinateKey: item.coordinateKey,
            resolverKey: item.resolverKey,
            decisionMode: item.decisionMode,
          })),
        requiresPreflight: Boolean(
          (binding.visibilityRule &&
            Object.keys(binding.visibilityRule).length) ||
          binding.confirmationSurfaceId ||
          operation.requiresMfa ||
          operation.confirmationSurfaceKey ||
          (graph.lifecycleOperationBindings ?? []).some(
            (item) =>
              item.entityOperationId === operation.id &&
              item.status !== "deprecated",
          ) ||
          (graph.policyBindings ?? []).some(
            (item) =>
              item.entityOperationId === operation.id &&
              item.status !== "deprecated",
          ),
        ),
      };
    });
  for (const placementKey of Object.keys(labels)) {
    if (!actions.some((action) => action.key === placementKey))
      throw new TypeError(
        `Unknown action translation binding: ${placementKey}`,
      );
  }
  const navigationConfig = (config?.["navigation"] ?? {}) as Record<
    string,
    { kind: string; workflowKey?: string; attentionCountKey?: string }
  >;
  const navigationBindings = (graph.surfaceOperations ?? []).filter(
    (binding) =>
      binding.entitySurfaceId === surface.id &&
      binding.status !== "deprecated" &&
      ["navigation", "navigation_overflow"].includes(binding.interactionTarget),
  );
  for (const key of Object.keys(navigationConfig))
    if (!navigationBindings.some((item) => item.placementKey === key))
      throw new TypeError(`Unknown navigation binding: ${key}`);
  const navigation = navigationBindings.map((binding) => {
    const config = navigationConfig[binding.placementKey];
    if (!config)
      throw new TypeError(
        `Missing navigation contract: ${binding.placementKey}`,
      );
    const action = actions.find((item) => item.key === binding.placementKey)!;
    if (config.workflowKey) {
      const flow = graph.flows?.find(
        (item) =>
          item.flowKey === config.workflowKey && item.status !== "deprecated",
      );
      const target = graph.surfaces?.find(
        (item) => item.surfaceKey === action.targetSurfaceKey,
      );
      if (
        !flow ||
        !graph.flowSteps?.some(
          (step) =>
            step.entityFlowId === flow.id &&
            step.entitySurfaceId === target?.id,
        )
      )
        throw new TypeError(
          "Navigation workflow must include its target surface",
        );
    }
    if (
      config.attentionCountKey &&
      !registeredAttentionCounts.includes(config.attentionCountKey)
    )
      throw new TypeError("Attention count resolver is not registered");
    return {
      ...action,
      ...config,
      placement:
        binding.interactionTarget === "navigation" ? "direct" : "overflow",
    };
  });
  const result = parsePublishedListExperience({
    schemaVersion: 1,
    ...(config?.["standardViews"] ? {standardViews:config["standardViews"]} : {}),
    ...(config?.["application"] ? { application: config["application"] } : {}),
    header: config?.["header"] ?? {
      title: text(surface.title),
      ...(surface.description
        ? { description: text(surface.description) }
        : {}),
    },
    routes,
    actions: actions.filter(
      (action) =>
        !navigationBindings.some(
          (binding) => binding.placementKey === action.key,
        ),
    ),
    ...(navigation.length
      ? { navigation, currentSurfaceKey: surface.surfaceKey }
      : {}),
  });
  for (const section of result.navigation ?? []) {
    const collection = section.content?.entityCode;
    if (
      collection &&
      collection !== graph.entity.entityCode &&
      !registeredCollections.includes(collection)
    )
      throw new TypeError(`Unregistered section collection: ${collection}`);
  }
  for (const view of result.standardViews??[]) {
    if(view.entityCode!==graph.entity.entityCode)throw new TypeError("Standard views must target the same collection; use navigation for another collection");
    if(view.provider==="ownership"&&!graph.fields.some(field=>field.fieldKey===view.ownerField))throw new TypeError("Standard view ownership field is not registered");
    if(view.provider!=="ownership"&&!registeredStandardViewSources.includes(view.providerKey!))throw new TypeError("Standard view source is not registered");
    for (const workflowKey of view.approvalBinding?.workflowKeys ?? []) if (!graph.flows?.some(flow=>flow.flowKey===workflowKey&&flow.status!=="deprecated")) throw new TypeError("Standard view workflow is not registered");
    if(view.workflowKey&&!graph.flows?.some(flow=>flow.flowKey===view.workflowKey&&flow.status!=="deprecated"))throw new TypeError("Standard view workflow is not registered");
  }
  return result;
}
