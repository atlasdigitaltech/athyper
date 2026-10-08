import {
  ENTITY_LIST_MAX_FILTERS,
  ENTITY_LIST_MAX_SORT_LEVELS,
  entityListRelativeDateRange,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityListDescriptorV1,
  ListFilterOperator,
  ListFilterV1,
  ListSortV1,
  ListValueKind,
} from "@athyper/contract-platform-entity-list";
export const COLLECTION_SCHEMA = "athyper.collection-presentation/1" as const;
export type CollectionPlane = "neon" | "mesh" | "studio";
export interface CollectionField {
  key: string;
  label: string;
  valueKind: ListValueKind;
  operators: readonly ListFilterOperator[];
  sortable: boolean;
  groupable: boolean;
  choices?: readonly { value: string | number | boolean; label: string }[];
  choiceSource?: string;
}
export interface CollectionState {
  query: string;
  filters: readonly ListFilterV1[];
  sort: readonly ListSortV1[];
  group?: string;
  density: "compact" | "comfortable" | "spacious";
}
export interface CollectionConfiguration {
  schema: typeof COLLECTION_SCHEMA;
  collectionKey: string;
  title: string;
  description: string;
  providerKey: string;
  providerVersion: 1;
  viewVersion: 1;
  targetPlanes: readonly CollectionPlane[];
  rendererKey: string;
  searchFields: readonly string[];
  fields: readonly CollectionField[];
  quickFields: readonly string[];
  defaultState: CollectionState;
  views: readonly { key: string; label: string; state: CollectionState }[];
  surfaces: readonly ("page" | "drawer")[];
  actionKeys: readonly string[];
  maxPageSize: number;
}
export interface CollectionProvider {
  key: string;
  version: 1;
  rendererKeys: readonly string[];
  actionKeys: readonly string[];
  fields: readonly CollectionField[];
  searchFields: readonly string[];
  maxPageSize: number;
}
const enumField = (
  key: string,
  label: string,
  values: string[],
  groupable = false,
): CollectionField => ({
  key,
  label,
  valueKind: "enum",
  operators: ["eq", "in"],
  sortable: false,
  groupable,
  choices: values.map((value) => ({
    value,
    label: value.replaceAll("_", " "),
  })),
});
const textField = (key: string, label: string): CollectionField => ({
  key,
  label,
  valueKind: "text",
  operators: ["contains"],
  sortable: false,
  groupable: false,
});
const dateField = (key: string, label: string): CollectionField => ({
  key,
  label,
  valueKind: "datetime",
  operators: ["eq", "gte", "lte", "relative"],
  sortable: true,
  groupable: true,
});
const entityField: CollectionField = {
  key: "entity",
  label: "Entity type",
  valueKind: "reference",
  operators: ["eq", "in"],
  sortable: false,
  groupable: true,
  choiceSource: "activity.authorized-entities.v1",
};
export const COLLECTION_PROVIDERS: readonly CollectionProvider[] = [
  {
    key: "platform.activity.notifications.v1",
    version: 1,
    rendererKeys: ["activity.notification.v1"],
    actionKeys: ["open_record", "mark_read", "dismiss"],
    searchFields: ["title", "summary", "recordLabel"],
    maxPageSize: 100,
    fields: [
      textField("title", "Title"),
      textField("summary", "Summary"),
      textField("recordLabel", "Related record"),
      enumField("read", "Read status", ["read", "unread"]),
      {
        ...enumField("type", "Activity type", [], true),
        choiceSource: "activity.authorized-types.v1",
      },
      entityField,
      dateField("createdAt", "Created"),
    ],
  },
  {
    key: "platform.activity.inbox.v1",
    version: 1,
    rendererKeys: ["activity.task.v1"],
    actionKeys: ["open_record", "open_task"],
    searchFields: ["title", "summary", "recordLabel"],
    maxPageSize: 100,
    fields: [
      textField("title", "Title"),
      textField("summary", "Summary"),
      textField("recordLabel", "Related record"),
      enumField(
        "status",
        "Task status",
        ["open", "claimed", "in_progress", "blocked", "completed", "cancelled"],
        true,
      ),
      {
        ...enumField(
          "priority",
          "Priority",
          ["low", "normal", "high", "urgent"],
          true,
        ),
        sortable: true,
      },
      enumField("assignment", "Assignment", ["me", "team"]),
      enumField(
        "due",
        "Due date",
        ["overdue", "today", "upcoming", "none"],
        true,
      ),
      dateField("dueAt", "Due at"),
      dateField("createdAt", "Created"),
      entityField,
    ],
  },
];
function object(v: unknown, name: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new TypeError(`${name} must be an object`);
  return v as Record<string, unknown>;
}
function text(v: unknown, name: string, max = 160): string {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new TypeError(`${name} must be a nonempty string (maximum ${max})`);
  return v;
}
function list(v: unknown, name: string, max = 50): unknown[] {
  if (!Array.isArray(v) || v.length > max)
    throw new TypeError(`${name} must be an array (maximum ${max})`);
  return v;
}
function only(v: Record<string, unknown>, keys: string[], name: string) {
  for (const k of Object.keys(v))
    if (!keys.includes(k))
      throw new TypeError(`Unknown ${name} property: ${k}`);
}
function unique(values: readonly string[], name: string) {
  if (new Set(values).size !== values.length)
    throw new TypeError(`Duplicate ${name}`);
}
function code(v: unknown, name: string) {
  const s = text(v, name, 126);
  if (!/^[a-z][a-z0-9_.-]*$/.test(s)) throw new TypeError(`Invalid ${name}`);
  return s;
}
export function parseCollectionState(
  raw: unknown,
  fields: readonly CollectionField[],
): CollectionState {
  const s = object(raw, "view state");
  only(s, ["query", "filters", "sort", "group", "density"], "view state");
  const query = s.query === undefined ? "" : s.query;
  if (typeof query !== "string" || query.length > 200)
    throw new TypeError("Search must be at most 200 characters");
  const field = (key: unknown) => {
    const f = fields.find((f) => f.key === key);
    if (!f) throw new TypeError(`Unknown view field: ${String(key)}`);
    return f;
  };
  const filters = list(s.filters ?? [], "filters", ENTITY_LIST_MAX_FILTERS).map(
    (raw) => {
      const f = object(raw, "filter");
      only(f, ["field", "operator", "value"], "filter");
      const d = field(f.field);
      if (!d.operators.includes(f.operator as ListFilterOperator))
        throw new TypeError(
          `Unsupported operator ${String(f.operator)} for ${d.key}`,
        );
      const op = f.operator as ListFilterOperator,
        value = f.value;
      if (!["is_null", "is_not_null"].includes(op)) {
        const values =
          op === "in" || op === "between"
            ? list(value, "filter values", 50)
            : [value];
        if (!values.length || (op === "between" && values.length !== 2))
          throw new TypeError("Invalid filter value count");
        for (const x of values) {
          if (
            typeof x !== "string" &&
            typeof x !== "number" &&
            typeof x !== "boolean"
          )
            throw new TypeError("Filter values must be scalar");
          if (typeof x === "string" && x.length > 500)
            throw new TypeError("Filter value is too long");
          if (typeof x === "number" && !Number.isFinite(x))
            throw new TypeError("Filter number must be finite");
          if (op === "relative") {
            if (!entityListRelativeDateRange(x))
              throw new TypeError("Unsupported relative period");
          } else if (d.valueKind === "date" || d.valueKind === "datetime") {
            if (typeof x !== "string" || !Number.isFinite(Date.parse(x)))
              throw new TypeError(`Invalid date for ${d.key}`);
          } else if (d.choices?.length && !d.choices.some((c) => c.value === x))
            throw new TypeError(`Unknown choice for ${d.key}`);
        }
      }
      return {
        field: d.key,
        operator: op,
        ...(value !== undefined ? { value } : {}),
      } as ListFilterV1;
    },
  );
  const sort = list(s.sort ?? [], "sort", ENTITY_LIST_MAX_SORT_LEVELS).map(
    (raw) => {
      const v = object(raw, "sort");
      only(v, ["field", "direction"], "sort");
      const f = field(v.field);
      if (!f.sortable || !["asc", "desc"].includes(String(v.direction)))
        throw new TypeError(`Unsupported sort for ${f.key}`);
      return { field: f.key, direction: v.direction as "asc" | "desc" };
    },
  );
  unique(
    sort.map((s) => s.field),
    "sort field",
  );
  const group = s.group === undefined ? undefined : field(s.group);
  if (group && !group.groupable)
    throw new TypeError(`Grouping unsupported for ${group.key}`);
  const density = s.density ?? "comfortable";
  if (!["compact", "comfortable", "spacious"].includes(String(density)))
    throw new TypeError("Unsupported density");
  return {
    query,
    filters,
    sort,
    ...(group ? { group: group.key } : {}),
    density: density as CollectionState["density"],
  };
}
export function parseCollectionConfiguration(
  raw: unknown,
  providers: readonly CollectionProvider[] = COLLECTION_PROVIDERS,
): CollectionConfiguration {
  const v = object(raw, "collection");
  only(
    v,
    [
      "schema",
      "collectionKey",
      "title",
      "description",
      "providerKey",
      "providerVersion",
      "viewVersion",
      "targetPlanes",
      "rendererKey",
      "searchFields",
      "fields",
      "quickFields",
      "defaultState",
      "views",
      "surfaces",
      "actionKeys",
      "maxPageSize",
    ],
    "collection",
  );
  if (
    v.schema !== COLLECTION_SCHEMA ||
    v.providerVersion !== 1 ||
    v.viewVersion !== 1
  )
    throw new TypeError("Unsupported collection schema/provider/view version");
  const p = providers.find((p) => p.key === v.providerKey);
  if (!p)
    throw new TypeError(
      `Unsupported collection provider: ${String(v.providerKey)}`,
    );
  const collectionKey = code(v.collectionKey, "collection key");
  if (
    p.key.startsWith("platform.activity.") &&
    collectionKey !==
      `activity.${p.key.includes("notifications") ? "notifications" : "inbox"}`
  )
    throw new TypeError("Collection/provider identity mismatch");
  const fields = list(v.fields, "fields").map((raw) => {
    const f = object(raw, "field");
    only(
      f,
      [
        "key",
        "label",
        "valueKind",
        "operators",
        "sortable",
        "groupable",
        "choices",
        "choiceSource",
      ],
      "field",
    );
    const supported = p.fields.find((x) => x.key === f.key);
    if (!supported)
      throw new TypeError(`Provider does not expose field: ${String(f.key)}`);
    if (
      f.valueKind !== supported.valueKind ||
      typeof f.sortable !== "boolean" ||
      typeof f.groupable !== "boolean" ||
      (f.sortable && !supported.sortable) ||
      (f.groupable && !supported.groupable)
    )
      throw new TypeError(`Unsupported field capabilities: ${supported.key}`);
    const operators = list(f.operators, "operators", 20).map((x) => {
      if (!supported.operators.includes(x as ListFilterOperator))
        throw new TypeError(
          `Unsupported operator ${String(x)} for ${supported.key}`,
        );
      return x as ListFilterOperator;
    });
    unique(operators, "operator");
    if (f.choiceSource !== supported.choiceSource)
      throw new TypeError(`Invalid choice provider for ${supported.key}`);
    const choices =
      f.choices === undefined
        ? supported.choices
        : list(f.choices, "choices", 100).map((raw) => {
            const c = object(raw, "choice");
            only(c, ["value", "label"], "choice");
            if (!supported.choices?.some((x) => x.value === c.value))
              throw new TypeError(`Unsupported choice for ${supported.key}`);
            return {
              value: c.value as string | number | boolean,
              label: text(c.label, "choice label"),
            };
          });
    if (supported.choices?.length && !choices?.length)
      throw new TypeError(`Choices required for ${supported.key}`);
    if (choices)
      unique(
        choices.map((c) => JSON.stringify(c.value)),
        "choice",
      );
    return {
      key: supported.key,
      label: text(f.label, "field label"),
      valueKind: supported.valueKind,
      operators,
      sortable: f.sortable,
      groupable: f.groupable,
      ...(choices ? { choices } : {}),
      ...(supported.choiceSource
        ? { choiceSource: supported.choiceSource }
        : {}),
    };
  });
  unique(
    fields.map((f) => f.key),
    "field",
  );
  const strings = (raw: unknown, name: string, allowed: readonly string[]) => {
    const values = list(raw, name).map((x) => text(x, name));
    unique(values, name);
    for (const value of values)
      if (!allowed.includes(value))
        throw new TypeError(`Unsupported ${name}: ${value}`);
    return values;
  };
  const searchFields = strings(v.searchFields, "search field", p.searchFields);
  for (const key of searchFields)
    if (!fields.some((f) => f.key === key))
      throw new TypeError(`Search field is not exposed: ${key}`);
  const quickFields = strings(
    v.quickFields,
    "quick field",
    fields.filter((f) => f.operators.length).map((f) => f.key),
  );
  const targetPlanes = strings(v.targetPlanes, "target plane", [
    "neon",
    "mesh",
    "studio",
  ]) as CollectionPlane[];
  if (!targetPlanes.length)
    throw new TypeError("At least one target plane required");
  const rendererKey = text(v.rendererKey, "renderer");
  if (!p.rendererKeys.includes(rendererKey))
    throw new TypeError("Unsupported row renderer");
  const surfaces = strings(v.surfaces, "surface", ["page", "drawer"]) as (
    "page" | "drawer"
  )[];
  if (!surfaces.length) throw new TypeError("At least one surface required");
  const views = list(v.views, "views", 20).map((raw) => {
    const s = object(raw, "view");
    only(s, ["key", "label", "state"], "view");
    return {
      key: code(s.key, "view key"),
      label: text(s.label, "view label"),
      state: parseCollectionState(s.state, fields),
    };
  });
  unique(
    views.map((v) => v.key),
    "view key",
  );
  if (
    !Number.isInteger(v.maxPageSize) ||
    Number(v.maxPageSize) < 1 ||
    Number(v.maxPageSize) > p.maxPageSize
  )
    throw new TypeError("Unsupported page size");
  return {
    schema: COLLECTION_SCHEMA,
    collectionKey,
    title: text(v.title, "title"),
    description: text(v.description, "description", 1000),
    providerKey: p.key,
    providerVersion: 1,
    viewVersion: 1,
    targetPlanes,
    rendererKey,
    searchFields,
    fields,
    quickFields,
    defaultState: parseCollectionState(v.defaultState, fields),
    views,
    surfaces,
    actionKeys: strings(v.actionKeys, "action", p.actionKeys),
    maxPageSize: Number(v.maxPageSize),
  };
}
export function activityCollectionExample(
  kind: "notifications" | "inbox",
): CollectionConfiguration {
  const provider = COLLECTION_PROVIDERS[kind === "notifications" ? 0 : 1]!;
  const state: CollectionState = {
    query: "",
    filters:
      kind === "inbox"
        ? [
            {
              field: "status",
              operator: "in",
              value: ["open", "claimed", "in_progress", "blocked"],
            },
          ]
        : [],
    sort: [
      {
        field: kind === "notifications" ? "createdAt" : "dueAt",
        direction: kind === "notifications" ? "desc" : "asc",
      },
    ],
    group: kind === "notifications" ? "createdAt" : "due",
    density: "comfortable",
  };
  return parseCollectionConfiguration({
    schema: COLLECTION_SCHEMA,
    collectionKey: `activity.${kind}`,
    title: kind === "notifications" ? "Notifications" : "Inbox",
    description: "Updates and work that need your attention",
    providerKey: provider.key,
    providerVersion: 1,
    viewVersion: 1,
    targetPlanes: ["neon", "mesh", "studio"],
    rendererKey: provider.rendererKeys[0],
    fields: provider.fields,
    searchFields: provider.searchFields,
    quickFields:
      kind === "notifications"
        ? ["read", "type", "entity"]
        : ["status", "priority", "assignment"],
    defaultState: state,
    views: [
      {
        key: "all",
        label: kind === "notifications" ? "All activity" : "All eligible work",
        state,
      },
      ...(kind === "notifications"
        ? [
            {
              key: "unread",
              label: "Unread",
              state: {
                ...state,
                filters: [{ field: "read", operator: "eq", value: "unread" }],
              },
            },
          ]
        : [
            {
              key: "my_work",
              label: "My open work",
              state: {
                ...state,
                filters: [
                  ...state.filters,
                  { field: "assignment", operator: "eq", value: "me" },
                ],
              },
            },
          ]),
    ],
    surfaces: ["page", "drawer"],
    actionKeys: provider.actionKeys,
    maxPageSize: 100,
  });
}
/** Entity-specific storage and columns stay with the existing Entity List runtime. */
export function adaptEntityCollection(
  descriptor: EntityListDescriptorV1,
): CollectionConfiguration {
  const fields = descriptor.fields.map((f) => ({
    key: f.key,
    label: f.label,
    valueKind: f.valueKind,
    operators: f.filterOperators,
    sortable: f.sortable,
    groupable: f.groupable,
    ...(f.filterOptions ? { choices: f.filterOptions } : {}),
  }));
  const provider: CollectionProvider = {
    key: "platform.entity-records.v1",
    version: 1,
    rendererKeys: ["entity.list.v1"],
    actionKeys: descriptor.actions.map((a) => a.key),
    fields,
    searchFields: fields
      .filter((f) => ["text", "string"].includes(f.valueKind))
      .map((f) => f.key),
    maxPageSize: Math.max(...descriptor.limits.allowedPageSizes),
  };
  const {
    query = "",
    filters,
    sort,
    groups,
    density,
  } = descriptor.surface.defaultState;
  // Collections group by one field: the list's first grouping level.
  const group = groups?.[0];
  return parseCollectionConfiguration(
    {
      schema: COLLECTION_SCHEMA,
      collectionKey: `entity.${descriptor.entity.code}`,
      title: descriptor.surface.title,
      description:
        descriptor.surface.description ??
        `Browse ${descriptor.entity.pluralLabel}`,
      providerKey: provider.key,
      providerVersion: 1,
      viewVersion: 1,
      targetPlanes: [descriptor.plane],
      rendererKey: "entity.list.v1",
      fields,
      searchFields: provider.searchFields,
      quickFields: descriptor.surface.filterPresentation.quickFields.map(
        (f) => f.field,
      ),
      defaultState: { query, filters, sort, group, density },
      views: [],
      surfaces: ["page"],
      actionKeys: provider.actionKeys,
      maxPageSize: provider.maxPageSize,
    },
    [provider],
  );
}
export function collectionPreview(configuration: CollectionConfiguration) {
  return {
    configuration,
    synthetic: true,
    sent: false,
    actionsExecuted: false,
    rows: [
      {
        id: "synthetic-1",
        title: "Example activity",
        recordLabel: "Example authorized record",
        summary: "Synthetic preview only",
        status: "open",
        read: "unread",
        priority: "normal",
      },
    ],
  };
}
