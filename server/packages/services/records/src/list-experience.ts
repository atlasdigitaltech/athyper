import { canDiscoverScopedNavigation } from "./navigation-context-discovery.js";
import {
  resolveEntityText,
  type EffectiveListActionV1,
  type PublishedListActionV1,
} from "@athyper/contract-platform-entity-list";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordCollectionScopeResolution } from "@athyper/server-contract-records";

/** Uses verified plane bindings and the authorizer, never browser permission flags. */
export async function effectiveListActions(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  scope: RecordCollectionScopeResolution,
  directoryNavigation = false,
): Promise<readonly EffectiveListActionV1[]> {
  const experience = descriptor.listPresentation?.experience;
  if (!experience) return Object.freeze([]);
  const result: EffectiveListActionV1[] = [];
  for (const action of experience.actions) {
    const permission = action.permissions.find(
      (item) => item.plane === context.planeKey,
    );
    if (
      !permission ||
      descriptor.operations[action.operationKey]?.permissionCode !==
        permission.permissionCode
    )
      continue;
    const bindings = context.permissions.operationBindings?.filter(
      (item) =>
        item.entityCode === descriptor.entityCode &&
        item.operationKey === action.operationKey,
    );
    // Fail closed if a release has not installed its authorization bindings.
    if (
      !bindings?.length ||
      bindings.some((item) => item.permissionCode !== permission.permissionCode)
    )
      continue;
    const publishedScopes = action.scopes.filter(
      (item) => item.plane === context.planeKey,
    );
    if (
      publishedScopes.some(
        (item) =>
          !bindings.every(
            (binding) =>
              binding.requiredScopeKinds.includes(item.scopeKind) &&
              binding.decisionMode === item.decisionMode,
          ),
      )
    )
      continue;
    const permissionOnlyEntry = action.entryPolicy === "permission_only";
    const rules = action.rules
      .filter((rule) => !rule.plane || rule.plane === context.planeKey)
      .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
    let denied = false,
      unresolved =
        (!permissionOnlyEntry && action.requiresPreflight) ||
        (!permissionOnlyEntry && publishedScopes.some((item) =>
          ["request_field", "record_field"].includes(item.coordinateSource),
        ));
    for (const rule of rules) {
      // Collection headers have no lifecycle record or verified capability decision.
      // Such conditions require a registered preflight, never a guessed permission.
      if (
        rule.lifecycleStateCode ||
        rule.lifecycleTransitionCode ||
        rule.requiredCapabilityCode
      ) {
        unresolved = true;
        continue;
      }
      if (rule.decision === "deny") denied = true;
    }
    if (denied) continue;
    const resource = {
      ...(scope.status === "ready" ? scope.authorizationResource : {}),
      tenantId: context.tenantId,
      entityCode: descriptor.entityCode,
      resourceCode: descriptor.entityCode,
      operationKey: action.operationKey,
    };
    const observation = {
      entityCode: descriptor.entityCode,
      operationKey: action.operationKey,
      surface: "action" as const,
      phase: "discover" as const,
    };
    let decision = await authorizer.authorize({
      observation,
      context,
      permissionCode: permission.permissionCode,
      ...(permissionOnlyEntry ? {} : { resource }),
    });
    if (
      !decision.allowed &&
      decision.reason === "scope_not_contained" &&
      directoryNavigation &&
      descriptor.directoryScope &&
      scope.status === "ready"
    ) {
      decision = await authorizer.authorize({
        context,
        permissionCode: permission.permissionCode,
        observation,
      });
    }
    const discoveredContext =
      directoryNavigation &&
      !decision.allowed &&
      decision.reason !== "entity_authorization_unavailable" &&
      !action.requiresPreflight &&
      (await canDiscoverScopedNavigation(
        authorizer,
        context,
        descriptor,
        action.operationKey,
        permission.permissionCode,
      ));
    if (!decision.allowed && !discoveredContext) {
      // Only contextual failures are useful to display; inaccessible actions stay hidden.
      if (decision.reason === "scope_coordinate_missing") {
        const baseAuthority = await authorizer.authorize({
          observation,
          context,
          permissionCode: permission.permissionCode,
        });
        if (baseAuthority.allowed)
          result.push(disabled(action, "context_required"));
      }
      continue;
    }
    if (
      !permissionOnlyEntry && !discoveredContext &&
      publishedScopes.some(
        (item) =>
          !scopeSatisfied(item.scopeKind, resource) ||
          (item.coordinateKey !== undefined &&
            typeof resource[item.coordinateKey as keyof typeof resource] !==
              "string") ||
          (item.coordinateSource === "relation_resolver" &&
            (scope.status !== "ready" ||
              !item.resolverKey ||
              scope.fingerprintMaterial["resolver"] !== item.resolverKey)),
      )
    ) {
      result.push(disabled(action, "context_required"));
      continue;
    }
    if (unresolved) {
      result.push(disabled(action, "preflight_required"));
      continue;
    }
    const route = experience.routes.find(
      (route) => route.surfaceKey === action.targetSurfaceKey,
    );
    if (!route) continue;
    result.push(
      Object.freeze({ ...base(action), ...(permissionOnlyEntry ? { requiresPreflight: false } : {}), state: "enabled", href: route.href }),
    );
  }
  return Object.freeze(result);
}
function base(action: PublishedListActionV1) {
  return {
    key: action.key,
    label: resolveEntityText(action.label),
    localizedLabel: action.label,
    placement: action.placement,
    selection: "none" as const,
    execution: "navigate" as const,
    requiresPreflight: action.requiresPreflight,
    supportsAllMatching: false,
  };
}
function disabled(
  action: PublishedListActionV1,
  reason: "context_required" | "preflight_required",
): EffectiveListActionV1 {
  const message =
    reason === "context_required"
      ? "Select the required work context to use this action."
      : "This action requires additional policy or record checks.";
  return Object.freeze({
    ...base(action),
    state: "disabled",
    requiresPreflight:
      reason === "preflight_required" || action.requiresPreflight,
    disabledReason: {
      code: reason.toUpperCase(),
      messageKey: `entity.action.${reason}`,
    },
    disabledMessage: { defaultLocale: "en", values: { en: message } },
  });
}
function scopeSatisfied(
  kind: string,
  resource: Readonly<Record<string, unknown>>,
): boolean {
  const coordinate = (
    {
      tenant: "tenantId",
      legal_entity: "legalEntityId",
      company_code: "companyCodeId",
      operating_organization: "operatingOrganizationId",
      network_account: "networkAccountId",
      network_relationship: "networkRelationshipId",
      workspace: "workspaceId",
      module: "moduleId",
      resource: "resourceId",
    } as Record<string, string>
  )[kind];
  return Boolean(coordinate && typeof resource[coordinate] === "string");
}

export type EntityAttentionCountResolver = (input: {
  readonly context: VerifiedRequestContext;
  readonly descriptor: EntityRuntimeDescriptor;
  readonly scope: RecordCollectionScopeResolution;
}) => Promise<number | undefined>;
/** Count adapters must enforce user assignment and row scope; unknown never becomes zero. */
export async function effectiveEntityNavigation(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  scope: RecordCollectionScopeResolution,
  counts: Readonly<Record<string, EntityAttentionCountResolver>> = {},
): Promise<
  readonly import("@athyper/contract-platform-entity-list").EffectiveEntitySectionV1[]
> {
  const experience = descriptor.listPresentation?.experience;
  if (!experience?.navigation?.length) return Object.freeze([]);
  const actions = await effectiveListActions(
    authorizer,
    context,
    {
      ...descriptor,
      listPresentation: {
        ...descriptor.listPresentation,
        experience: {
          ...experience,
          actions: experience.navigation.map((section) => ({
            ...section,
            placement: "secondary" as const,
          })),
        },
      },
    },
    scope,
    true,
  );
  const result: import("@athyper/contract-platform-entity-list").EffectiveEntitySectionV1[] =
    [];
  for (const section of experience.navigation) {
    const action = actions.find(
      (action) => action.key === section.key && action.state === "enabled",
    );
    const route = experience.routes.find(
      (route) => route.surfaceKey === section.targetSurfaceKey,
    );
    if (!action?.href || !route) continue;
    let attentionCount: number | undefined;
    if (
      section.attentionCountKey &&
      Object.hasOwn(counts, section.attentionCountKey) &&
      scope.status === "ready" &&
      section.scopes
        .filter((s) => s.plane === context.planeKey)
        .every((s) => scopeSatisfied(s.scopeKind, scope.authorizationResource))
    ) {
      try {
        const count = await counts[section.attentionCountKey]!({
          context,
          descriptor,
          scope,
        });
        if (Number.isSafeInteger(count) && count! >= 0) attentionCount = count;
      } catch {
        /* A failed count does not revoke an authorized destination. */
      }
    }
    result.push(
      Object.freeze({
        key: section.key,
        label: section.label,
        placement: section.placement,
        surfaceKey: section.targetSurfaceKey,
        ...(section.content ? { content: section.content } : {}),
        href: action.href,
        aliases: route.aliases ?? [],
        ...(attentionCount === undefined ? {} : { attentionCount }),
      }),
    );
  }
  return Object.freeze(result);
}
