/** First executable F0 sub-slice; deployment/host authority is a separate gate. */
export type ContractNode =
  | {
      readonly type: "string";
      readonly pattern?: string;
      readonly minLength?: number;
      readonly maxLength?: number;
    }
  | {
      readonly type: "integer";
      readonly minimum: number;
      readonly maximum: number;
    }
  | { readonly type: "boolean" }
  | { readonly type: "null" }
  | { readonly const: string }
  | { readonly anyOf: readonly ContractNode[] }
  | {
      readonly type: "array";
      readonly items: ContractNode;
      readonly minItems?: number;
    }
  | {
      readonly type: "object";
      readonly properties: Readonly<Record<string, ContractNode>>;
      readonly required?: readonly string[];
    };
export type ContractValue<N extends ContractNode> = N extends {
  readonly const: infer C;
}
  ? C
  : N extends { readonly anyOf: infer A extends readonly ContractNode[] }
    ? ContractValue<A[number]>
    : N extends { readonly type: "boolean" }
      ? boolean
      : N extends { readonly type: "string" }
        ? string
        : N extends { readonly type: "integer" }
          ? number
          : N extends { readonly type: "null" }
            ? null
            : N extends {
                  readonly type: "array";
                  readonly items: infer I extends ContractNode;
                }
              ? readonly ContractValue<I>[]
              : N extends {
                    readonly type: "object";
                    readonly properties: infer P extends Readonly<
                      Record<string, ContractNode>
                    >;
                  }
                ? { readonly [K in keyof P]: ContractValue<P[K]> }
                : never;

const uuid = {
  type: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
} as const;
const text = {
  type: "string",
  minLength: 1,
  maxLength: 500,
  pattern: "\\S",
} as const;
// Locale vocabulary is supplied by the owning host, never inferred from browser locale.
const locale = { type: "string", minLength: 1 } as const;
const nil = { type: "null" } as const;
const label = {
  id: uuid,
  labelKey: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
  defaultText: text,
  sourceKind: { const: "owned" },
  sharedLabelKey: nil,
  sharedResourceKey: nil,
  sharedResourceVersion: nil,
  sharedResourceHash: nil,
} as const satisfies Record<string, ContractNode>;
const translation = {
  id: uuid,
  labelId: uuid,
  localeCode: locale,
  text,
} as const;

export const ownedLabelsContract = {
  type: "object",
  properties: {
    contract: { const: "entity.authoring-owned-labels/1" },
    entityId: uuid,
    changeSetId: uuid,
    tenantId: { anyOf: [uuid, nil] },
    defaultLocale: locale,
    requiredLocales: { type: "array", items: locale, minItems: 1 },
    labels: { type: "array", items: { type: "object", properties: label } },
    translations: {
      type: "array",
      items: { type: "object", properties: translation },
    },
  },
} as const satisfies ContractNode;
export type OwnedLabelGraph = ContractValue<typeof ownedLabelsContract>;

export const ownedLabelMappings = {
  labels: {
    table: "metadata.entity_label",
    columns: {
      id: "id",
      labelKey: "label_key",
      defaultText: "default_text",
      sourceKind: "source_kind",
      sharedLabelKey: "shared_label_key",
      sharedResourceKey: "shared_resource_key",
      sharedResourceVersion: "shared_resource_version",
      sharedResourceHash: "shared_resource_hash",
    },
  },
  translations: {
    table: "metadata.entity_label_translation",
    columns: {
      id: "id",
      labelId: "label_id",
      localeCode: "locale_code",
      text: "text",
    },
  },
} as const;

export const foundationManifest = {
  key: "entity.foundation-owned-labels/1",
  scope: "owned-label-contract-and-scoped-persistence",
  authoringPackage: "@athyper/server-contract-meta-entity-authoring",
  planes: [], // No consuming plane is qualified by this proof.
  supported: [
    "owned-labels",
    "non-default-translations",
    "localization-codec",
    "typed-label-commands",
    "atomic-replay-receipts",
  ],
  deferred: [
    "shared-labels",
    "fields",
    "navigation",
    "operations",
    "permissions",
    "governed-host-writes",
    "host-bootstrap",
    "live-preview",
    "publication",
  ],
  dependencies: [
    "verified-draft-coordinate",
    "host-supplied-supported-locales",
    "explicit-legacy-label-identity-map",
  ],
  accountableRole: "shared-authoring-contract-maintainer",
  namedOwner: null,
  approvedBudgets: null,
  inventoryComplete: false,
  referenceMilestonePassed: false,
} as const;

export class FoundationContractError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
  ) {
    super(`${code}: ${path}`);
    this.name = "FoundationContractError";
  }
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};

/** Closed validation generated by the same nodes as JSON Schema. Never coerce values. */
export function validateFoundationNode(
  node: ContractNode,
  value: unknown,
  path: string,
): void {
  if ("anyOf" in node) {
    for (const variant of node.anyOf) {
      try {
        validateFoundationNode(variant, value, path);
        return;
      } catch (error) {
        if (!(error instanceof FoundationContractError)) throw error;
      }
    }
    return fail("FOUNDATION_VALUE_INVALID", path);
  }
  if ("const" in node) {
    if (value !== node.const) fail("FOUNDATION_UNSUPPORTED_VALUE", path);
    return;
  }
  if (node.type === "boolean") {
    if (typeof value !== "boolean") fail("FOUNDATION_VALUE_INVALID", path);
    return;
  }
  if (node.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < node.minimum ||
      value > node.maximum
    )
      fail("FOUNDATION_VALUE_INVALID", path);
    return;
  }
  if (node.type === "null") {
    if (value !== null) fail("FOUNDATION_VALUE_INVALID", path);
    return;
  }
  if (node.type === "string") {
    if (
      typeof value !== "string" ||
      (node.minLength !== undefined && [...value].length < node.minLength) ||
      (node.maxLength !== undefined && [...value].length > node.maxLength) ||
      (node.pattern && !new RegExp(node.pattern).test(value))
    )
      fail("FOUNDATION_VALUE_INVALID", path);
    return;
  }
  if (node.type === "array") {
    if (!Array.isArray(value)) return fail("FOUNDATION_VALUE_INVALID", path);
    if (node.minItems !== undefined && value.length < node.minItems)
      fail("FOUNDATION_VALUE_INVALID", path);
    // Sparse arrays serialize holes as null, which would silently change the
    // validated authoring graph. Only explicit JSON members are supported.
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index))
        fail("FOUNDATION_VALUE_INVALID", `${path}/${index}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor))
        return fail("FOUNDATION_VALUE_INVALID", `${path}/${index}`);
      validateFoundationNode(node.items, descriptor.value, `${path}/${index}`);
    }
    if (
      Reflect.ownKeys(value).some(
        (key) =>
          key !== "length" &&
          (typeof key !== "string" ||
            !/^(?:0|[1-9][0-9]*)$/.test(key) ||
            Number(key) >= value.length),
      )
    )
      fail("FOUNDATION_UNSUPPORTED_PROPERTY", path);
    return;
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return fail("FOUNDATION_VALUE_INVALID", path);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !Object.hasOwn(node.properties, key))
      fail("FOUNDATION_UNSUPPORTED_PROPERTY", `${path}/${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      fail("FOUNDATION_VALUE_INVALID", `${path}/${String(key)}`);
  }
  for (const [key, child] of Object.entries(node.properties)) {
    if (!Object.hasOwn(value, key)) {
      if (!node.required || node.required.includes(key))
        fail("FOUNDATION_REQUIRED_PROPERTY", `${path}/${key}`);
      continue;
    }
    validateFoundationNode(child, Reflect.get(value, key), `${path}/${key}`);
  }
}
export function contractJsonSchema(node: ContractNode): object {
  if ("anyOf" in node) return { anyOf: node.anyOf.map(contractJsonSchema) };
  if ("const" in node) return { type: "string", const: node.const };
  if (node.type === "object")
    return {
      type: "object",
      additionalProperties: false,
      required: node.required ?? Object.keys(node.properties),
      properties: Object.fromEntries(
        Object.entries(node.properties).map(([key, child]) => [
          key,
          contractJsonSchema(child),
        ]),
      ),
    };
  if (node.type === "array")
    return { ...node, items: contractJsonSchema(node.items) };
  return node;
}
export interface OwnedLabelContext {
  readonly entityId: string;
  readonly changeSetId: string;
  readonly tenantId: string | null;
  readonly supportedLocales: readonly string[];
}
export function parseOwnedLabels(
  value: unknown,
  context: OwnedLabelContext,
): OwnedLabelGraph {
  validateFoundationNode(ownedLabelsContract, value, "");
  const graph = value as OwnedLabelGraph;
  for (const key of ["entityId", "changeSetId", "tenantId"] as const)
    if (graph[key] !== context[key])
      fail("FOUNDATION_OWNERSHIP_MISMATCH", `/${key}`);
  if (
    new Set(graph.requiredLocales).size !== graph.requiredLocales.length ||
    !graph.requiredLocales.includes(graph.defaultLocale)
  )
    fail("FOUNDATION_LOCALES_INVALID", "/requiredLocales");
  for (const code of graph.requiredLocales)
    if (!context.supportedLocales.includes(code))
      fail("FOUNDATION_LOCALE_UNSUPPORTED", `/requiredLocales/${code}`);
  for (const code of graph.requiredLocales) {
    let canonical: string | undefined;
    try {
      canonical = Intl.getCanonicalLocales(code)[0];
    } catch {
      fail("FOUNDATION_LOCALE_INVALID", `/requiredLocales/${code}`);
    }
    if (canonical !== code)
      fail("FOUNDATION_LOCALE_NONCANONICAL", `/requiredLocales/${code}`);
  }
  const ids = new Set<string>(),
    keys = new Set<string>();
  for (const row of graph.labels) {
    if (ids.has(row.id) || keys.has(row.labelKey))
      fail("FOUNDATION_DUPLICATE_LABEL", `/labels/${row.labelKey}`);
    ids.add(row.id);
    keys.add(row.labelKey);
  }
  const translationKeys = new Set<string>();
  for (const row of graph.translations) {
    if (!graph.labels.some((label) => label.id === row.labelId))
      fail("FOUNDATION_REFERENCE_INVALID", `/translations/${row.id}/labelId`);
    if (
      row.localeCode === graph.defaultLocale ||
      !graph.requiredLocales.includes(row.localeCode)
    )
      fail(
        "FOUNDATION_TRANSLATION_LOCALE_INVALID",
        `/translations/${row.id}/localeCode`,
      );
    const key = JSON.stringify([row.labelId, row.localeCode]);
    if (ids.has(row.id) || translationKeys.has(key))
      fail("FOUNDATION_DUPLICATE_TRANSLATION", `/translations/${row.id}`);
    ids.add(row.id);
    translationKeys.add(key);
  }
  return graph;
}
/** Completeness is separate from draft structural validity (INV-006). */
export function assertOwnedLabelsComplete(
  graph: OwnedLabelGraph,
  context: OwnedLabelContext,
): void {
  parseOwnedLabels(graph, context);
  for (const label of graph.labels)
    for (const locale of graph.requiredLocales) {
      if (
        locale !== graph.defaultLocale &&
        !graph.translations.some(
          (t) => t.labelId === label.id && t.localeCode === locale,
        )
      )
        fail(
          "FOUNDATION_TRANSLATION_REQUIRED",
          `/labels/${label.labelKey}/${locale}`,
        );
    }
}
