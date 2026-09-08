import { parseStandardViews, type PublishedStandardViewV1 } from "./standard-views";
/** Published presentation is data, never executable UI or permission expressions. */
export interface EntityLocalizedTextV1 {
  readonly defaultLocale: string;
  readonly values: Readonly<Record<string, string>>;
}
export interface EntityListHeaderV1 {
  readonly iconKey?: string;
  readonly title: EntityLocalizedTextV1;
  readonly description?: EntityLocalizedTextV1;
}
export interface PublishedListActionV1 {
  readonly key: string;
  readonly label: EntityLocalizedTextV1;
  readonly placement: "primary" | "secondary";
  readonly position: number;
  readonly operationKey: string;
  readonly targetSurfaceKey: string;
  readonly permissions: readonly {
    readonly plane: "neon" | "mesh";
    readonly permissionCode: string;
  }[];
  readonly rules: readonly {
    readonly key: string;
    readonly priority: number;
    readonly decision: "allow" | "deny";
    readonly plane?: "neon" | "mesh" | "studio";
    readonly requiredCapabilityCode?: string;
    readonly lifecycleStateCode?: string;
    readonly lifecycleTransitionCode?: string;
  }[];
  readonly scopes: readonly {
    readonly plane: "neon" | "mesh";
    readonly scopeKind: string;
    readonly coordinateSource: string;
    readonly coordinateKey?: string;
    readonly resolverKey?: string;
    readonly decisionMode: string;
  }[];
  /** Conditions requiring record/flow evidence cannot be claimed as satisfied by a collection. */
  readonly requiresPreflight: boolean;
}
export interface EntityApplicationV1 {
  readonly key: string;
  readonly basePath: string;
  readonly defaultSectionKey: string;
}
export interface EntitySectionContentV1 {
  readonly kind: "overview" | "entity_list" | "task_list" | "custom";
  readonly entityCode?: string;
}
export function parseEntityApplication(raw: unknown): EntityApplicationV1 {
  const value = record(raw);
  return Object.freeze({
    key: key(value.key),
    basePath: parseEntityNavigationHref(value.basePath),
    defaultSectionKey: key(value.defaultSectionKey),
  });
}
function parseSectionContent(raw: unknown): EntitySectionContentV1 {
  const value = record(raw),
    kind = choice(value.kind, [
      "overview",
      "entity_list",
      "task_list",
      "custom",
    ] as const);
  if (["entity_list", "task_list"].includes(kind) && !value.entityCode)
    throw new TypeError("Collection sections require an entity reference");
  return Object.freeze({
    kind,
    ...optionalKeys(value, ["entityCode"] as const),
  });
}
export interface PublishedEntitySectionV1 extends Omit<
  PublishedListActionV1,
  "placement"
> {
  readonly placement: "direct" | "overflow";
  readonly kind: "overview" | "manage" | "review" | "function";
  readonly workflowKey?: string;
  readonly attentionCountKey?: string;
  readonly content?: EntitySectionContentV1;
}
export interface EffectiveEntitySectionV1 {
  readonly key: string;
  readonly label: EntityLocalizedTextV1;
  readonly placement: "direct" | "overflow";
  readonly surfaceKey: string;
  readonly href: string;
  readonly aliases: readonly string[];
  readonly attentionCount?: number;
  readonly content?: EntitySectionContentV1;
}
export function parseEffectiveEntitySections(
  raw: unknown,
): readonly EffectiveEntitySectionV1[] {
  const sections = list(raw).map((item) => {
    const value = record(item);
    return Object.freeze({
      key: key(value.key),
      ...(value.content === undefined
        ? {}
        : { content: parseSectionContent(value.content) }),
      label: parseEntityLocalizedText(value.label),
      placement: choice(value.placement, ["direct", "overflow"] as const),
      surfaceKey: key(value.surfaceKey),
      href: parseEntityNavigationHref(value.href),
      aliases: Object.freeze(
        list(value.aliases ?? []).map(parseEntityNavigationHref),
      ),
      ...(value.attentionCount === undefined
        ? {}
        : { attentionCount: integer(value.attentionCount) }),
    });
  });
  unique(sections.map((item) => item.key));
  unique(sections.map((item) => item.surfaceKey));
  return Object.freeze(sections);
}
export interface PublishedListExperienceV1 {
  readonly standardViews?: readonly PublishedStandardViewV1[];
  readonly schemaVersion: 1;
  readonly header: EntityListHeaderV1;
  readonly routes: readonly {
    readonly surfaceKey: string;
    readonly href: string;
    readonly aliases?: readonly string[];
  }[];
  readonly actions: readonly PublishedListActionV1[];
  readonly currentSurfaceKey?: string;
  readonly navigation?: readonly PublishedEntitySectionV1[];
  readonly application?: EntityApplicationV1;
}

export function resolveEntityText(
  text: EntityLocalizedTextV1,
  locale?: string,
): string {
  const requested = locale ? canonicalLocale(locale) : text.defaultLocale;
  const parts = requested.split("-");
  while (parts.length) {
    const match = Object.keys(text.values).find(
      (key) => key.toLowerCase() === parts.join("-").toLowerCase(),
    );
    if (match) return text.values[match]!;
    parts.pop();
  }
  return text.values[text.defaultLocale]!;
}

export function parseEntityLocalizedText(raw: unknown): EntityLocalizedTextV1 {
  const value = record(raw),
    defaultLocale = canonicalLocale(string(value.defaultLocale));
  const values: Record<string, string> = {};
  for (const [locale, text] of Object.entries(record(value.values))) {
    const canonical = canonicalLocale(locale);
    if (Object.hasOwn(values, canonical))
      throw new TypeError("Duplicate translation locale");
    values[canonical] = string(text);
  }
  if (!Object.hasOwn(values, defaultLocale))
    throw new TypeError("Default locale translation is required");
  return Object.freeze({ defaultLocale, values: Object.freeze(values) });
}
export function parseEntityListHeader(raw: unknown): EntityListHeaderV1 {
  const value = record(raw);
  return Object.freeze({
    ...(value.iconKey === undefined ? {} : { iconKey: key(value.iconKey) }),
    title: parseEntityLocalizedText(value.title),
    ...(value.description === undefined
      ? {}
      : { description: parseEntityLocalizedText(value.description) }),
  });
}
export function parseEntityNavigationHref(raw: unknown): string {
  const href = string(raw);
  // Published collection actions have static, same-origin destinations only.
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(href) || href.startsWith("//"))
    throw new TypeError(
      "Entity action destination must be a static same-origin path",
    );
  return href;
}
export function parsePublishedListExperience(
  raw: unknown,
): PublishedListExperienceV1 {
  const value = record(raw);
  if (value.schemaVersion !== 1)
    throw new TypeError("Unsupported list experience version");
  const header = parseEntityListHeader(value.header);
  const routes = list(value.routes).map((item) => {
    const route = record(item);
    return Object.freeze({
      surfaceKey: key(route.surfaceKey),
      href: parseEntityNavigationHref(route.href),
      ...(route.aliases === undefined
        ? {}
        : {
            aliases: Object.freeze(
              list(route.aliases).map(parseEntityNavigationHref),
            ),
          }),
    });
  });
  unique(routes.map((route) => route.surfaceKey));
  unique(routes.flatMap((route) => [route.href, ...(route.aliases ?? [])]));
  routes.sort((a, b) => compare(a.surfaceKey, b.surfaceKey));
  const actions = list(value.actions).map((item) => {
    const action = record(item);
    const permissions = list(action.permissions).map((item) => {
      const permission = record(item);
      return Object.freeze({
        plane: choice(permission.plane, ["neon", "mesh"] as const),
        permissionCode: key(permission.permissionCode),
      });
    });
    unique(permissions.map((permission) => permission.plane));
    permissions.sort((a, b) => compare(a.plane, b.plane));
    if (!permissions.length)
      throw new TypeError(
        "A published action requires an operation permission binding",
      );
    const rules = list(action.rules).map((item) => {
      const rule = record(item);
      return Object.freeze({
        key: key(rule.key),
        priority: integer(rule.priority),
        decision: choice(rule.decision, ["allow", "deny"] as const),
        ...(rule.plane === undefined
          ? {}
          : { plane: choice(rule.plane, ["neon", "mesh", "studio"] as const) }),
        ...optionalKeys(rule, [
          "requiredCapabilityCode",
          "lifecycleStateCode",
          "lifecycleTransitionCode",
        ] as const),
      });
    });
    unique(rules.map((rule) => rule.key));
    rules.sort((a, b) => a.priority - b.priority || compare(a.key, b.key));
    const scopes = list(action.scopes).map((item) => {
      const scope = record(item);
      return Object.freeze({
        plane: choice(scope.plane, ["neon", "mesh"] as const),
        scopeKind: choice(scope.scopeKind, [
          "tenant",
          "workspace",
          "module",
          "company_code",
          "legal_entity",
          "operating_organization",
          "network_account",
          "network_relationship",
          "resource",
        ] as const),
        coordinateSource: choice(scope.coordinateSource, [
          "tenant_context",
          "request_field",
          "record_field",
          "collection_field",
          "relation_resolver",
        ] as const),
        decisionMode: choice(scope.decisionMode, [
          "entity_resource",
          "collection",
        ] as const),
        ...optionalKeys(scope, ["coordinateKey", "resolverKey"] as const),
      });
    });
    scopes.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
    for (const scope of scopes) {
      if (
        (scope.coordinateSource === "relation_resolver") !==
        Boolean(scope.resolverKey)
      )
        throw new TypeError(
          "Scope resolver reference is required only for relation resolution",
        );
      if (
        ["request_field", "record_field", "collection_field"].includes(
          scope.coordinateSource,
        ) !== Boolean(scope.coordinateKey)
      )
        throw new TypeError("Scope field reference does not match its source");
      if (
        (scope.scopeKind === "tenant") !==
        (scope.coordinateSource === "tenant_context")
      )
        throw new TypeError("Tenant scopes require tenant context");
    }
    if (typeof action.requiresPreflight !== "boolean")
      throw new TypeError("requiresPreflight must be boolean");
    return Object.freeze({
      key: key(action.key),
      label: parseEntityLocalizedText(action.label),
      placement: choice(action.placement, ["primary", "secondary"] as const),
      position: integer(action.position),
      operationKey: key(action.operationKey),
      targetSurfaceKey: key(action.targetSurfaceKey),
      permissions: Object.freeze(permissions),
      rules: Object.freeze(rules),
      scopes: Object.freeze(scopes),
      requiresPreflight: action.requiresPreflight,
    });
  });
  unique(actions.map((action) => action.key));
  if (actions.filter((action) => action.placement === "primary").length > 1)
    throw new TypeError("Only one primary list action may be published");
  for (const action of actions)
    if (!routes.some((route) => route.surfaceKey === action.targetSurfaceKey))
      throw new TypeError("Action target surface is not registered");
  actions.sort(
    (a, b) =>
      a.position - b.position || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const navigation =
    value.navigation === undefined
      ? undefined
      : list(value.navigation).map((item) => {
          const section = record(item);
          const parsed = parsePublishedListExperience({
            schemaVersion: 1,
            header,
            routes,
            actions: [{ ...section, placement: "secondary" }],
          }).actions[0]!;
          const kind = choice(section.kind, [
            "overview",
            "manage",
            "review",
            "function",
          ] as const);
          if (kind === "review" && !section.workflowKey)
            throw new TypeError(
              "Review navigation requires a registered workflow",
            );
          return Object.freeze({
            ...parsed,
            ...(section.content === undefined
              ? {}
              : { content: parseSectionContent(section.content) }),
            kind,
            placement: choice(section.placement, [
              "direct",
              "overflow",
            ] as const),
            ...optionalKeys(section, [
              "workflowKey",
              "attentionCountKey",
            ] as const),
          });
        });
  if (navigation) {
    unique(navigation.map((item) => item.key));
    unique(navigation.map((item) => item.targetSurfaceKey));
    navigation.sort((a, b) => a.position - b.position || compare(a.key, b.key));
  }
  const currentSurfaceKey =
    value.currentSurfaceKey === undefined
      ? undefined
      : key(value.currentSurfaceKey);
  if (
    currentSurfaceKey &&
    !routes.some((route) => route.surfaceKey === currentSurfaceKey)
  )
    throw new TypeError("Current surface is not registered");
  if (value.application !== undefined) {
    const application = parseEntityApplication(value.application);
    if (
      !navigation?.some(
        (section) => section.key === application.defaultSectionKey,
      )
    )
      throw new TypeError("Default application section is not registered");
    for (const section of navigation ?? [])
      if (!section.content)
        throw new TypeError("Application sections require content bindings");
    if (!routes.some((route) => route.href === application.basePath))
      throw new TypeError("Application base route is not registered");
  }
  return Object.freeze({
    ...(value.standardViews === undefined ? {} : { standardViews: parseStandardViews(value.standardViews) }),
    schemaVersion: 1,
    header,
    ...(value.application === undefined
      ? {}
      : { application: parseEntityApplication(value.application) }),
    routes: Object.freeze(routes),
    actions: Object.freeze(actions),
    ...(navigation === undefined
      ? {}
      : { navigation: Object.freeze(navigation) }),
    ...(currentSurfaceKey ? { currentSurfaceKey } : {}),
  });
}
function canonicalLocale(value: string): string {
  return Intl.getCanonicalLocales(value)[0]!;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Expected an object");
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new TypeError("Expected a bounded array");
  return value;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    throw new TypeError("Expected non-empty text");
  return value;
}
function key(value: unknown): string {
  const result = string(value);
  if (!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,190}$/.test(result))
    throw new TypeError("Invalid metadata reference");
  return result;
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new TypeError("Expected non-negative integer");
  return Number(value);
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T))
    throw new TypeError("Invalid contract enum");
  return value as T;
}
function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length)
    throw new TypeError("Duplicate metadata key");
}
function optionalKeys<K extends string>(
  value: Record<string, unknown>,
  keys: readonly K[],
): Partial<Record<K, string>> {
  return Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((name) => [name, key(value[name])]),
  ) as Partial<Record<K, string>>;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
