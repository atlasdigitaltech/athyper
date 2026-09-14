/** Browser-supplied coordinates are requests, never authorization. No record values or drafts. */
export interface AtlasWorkContextV1 {
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
  readonly networkAccountId?: string;
}
interface Common {
  readonly schemaVersion: 1;
  readonly entityCode: string;
  readonly generationId: string;
  readonly locale: string;
  readonly workContext?: AtlasWorkContextV1;
}
export type AtlasBusinessContextV1 = Common &
  (
    | {
        readonly kind: "manage";
        readonly filters: readonly {
          readonly field: string;
          readonly operator:
            | "eq"
            | "ne"
            | "in"
            | "contains"
            | "starts_with"
            | "gt"
            | "gte"
            | "lt"
            | "lte"
            | "between"
            | "is_null"
            | "is_not_null"
            | "relative";
          readonly value?: unknown;
        }[];
        readonly search?: string;
        readonly fields?: readonly string[];
        readonly group?: string;
        readonly sort: readonly {
          readonly field: string;
          readonly direction: "asc" | "desc";
          readonly nulls?: "first" | "last";
        }[];
        readonly selectedIds: readonly string[];
        readonly visibleIds: readonly string[];
        readonly analysisTarget: "selection" | "visible_page" | "filtered_set";
        readonly pageSize: number;
        readonly pageIndex: number;
        readonly cursor?: string;
        readonly standardViewKey?: string;
        readonly directory?: {
          readonly operatingOrganizationIds?: readonly string[];
          readonly companyCodeIds?: readonly string[];
          readonly partnerRole?: "supplier" | "customer";
          readonly eligibleOperation?: "order" | "invoice" | "payment";
        };
      }
    | {
        readonly kind: "record";
        readonly recordId: string;
        readonly section?: string;
        readonly roleLens?: string;
        readonly caseId?: string;
        readonly savedRevision?: string;
        readonly dirty: boolean;
        readonly asOf?: string;
      }
  );
const text = { type: "string", minLength: 1, maxLength: 200 } as const;
const uuid = {
  ...text,
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
};
const ids = { type: "array", maxItems: 100, uniqueItems: true, items: uuid };
const object = (
  properties: Record<string, ContextJsonSchema>,
  required: string[] = [],
) => ({ type: "object", additionalProperties: false, properties, required });
const common = {
  schemaVersion: { const: 1 },
  entityCode: text,
  generationId: uuid,
  locale: text,
  workContext: object({
    operatingOrganizationId: uuid,
    companyCodeId: uuid,
    legalEntityId: uuid,
    networkAccountId: uuid,
  }),
};
const required = [
  "schemaVersion",
  "entityCode",
  "generationId",
  "locale",
  "kind",
];
export const atlasBusinessContextSchema = {
  oneOf: [
    object(
      {
        ...common,
        kind: { const: "manage" },
        filters: {
          type: "array",
          maxItems: 50,
          items: object(
            {
              field: text,
              operator: {
                enum: [
                  "eq",
                  "ne",
                  "in",
                  "contains",
                  "starts_with",
                  "gt",
                  "gte",
                  "lt",
                  "lte",
                  "between",
                  "is_null",
                  "is_not_null",
                  "relative",
                ],
              },
              value: {},
            },
            ["field", "operator"],
          ),
        },
        search: { type: "string", maxLength: 500 },
        fields: {
          type: "array",
          maxItems: 100,
          uniqueItems: true,
          items: text,
        },
        group: text,
        sort: {
          type: "array",
          maxItems: 10,
          items: object(
            {
              field: text,
              direction: { enum: ["asc", "desc"] },
              nulls: { enum: ["first", "last"] },
            },
            ["field", "direction"],
          ),
        },
        selectedIds: ids,
        visibleIds: ids,
        analysisTarget: { enum: ["selection", "visible_page", "filtered_set"] },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        pageIndex: { type: "integer", minimum: 0, maximum: 1000000 },
        cursor: { ...text, maxLength: 4096 },
        standardViewKey: text,
        directory: object({
          operatingOrganizationIds: ids,
          companyCodeIds: ids,
          partnerRole: { enum: ["supplier", "customer"] },
          eligibleOperation: { enum: ["order", "invoice", "payment"] },
        }),
      },
      [
        ...required,
        "filters",
        "sort",
        "selectedIds",
        "visibleIds",
        "analysisTarget",
        "pageSize",
        "pageIndex",
      ],
    ),
    object(
      {
        ...common,
        kind: { const: "record" },
        recordId: uuid,
        section: text,
        roleLens: text,
        caseId: uuid,
        savedRevision: text,
        dirty: { type: "boolean" },
        asOf: {
          ...text,
          pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$",
        },
      },
      [...required, "recordId", "dirty"],
    ),
  ],
};

/** Same strict schema at HTTP and service boundaries; bounded JSON clone removes mutable aliases. */
export function parseAtlasBusinessContext(
  value: unknown,
): AtlasBusinessContextV1 {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 24000)
    throw new TypeError("Invalid Atlas business context.");
  const copy: unknown = JSON.parse(serialized);
  if (!valid(copy, atlasBusinessContextSchema))
    throw new TypeError("Invalid Atlas business context.");
  const result = copy as AtlasBusinessContextV1;
  if (
    result.kind === "manage" &&
    result.analysisTarget === "selection" &&
    !result.selectedIds.length
  )
    throw new TypeError("Atlas selection is empty.");
  if (
    result.kind === "record" &&
    result.asOf &&
    (!Number.isFinite(Date.parse(result.asOf)) ||
      new Date(result.asOf).toISOString().slice(0, 19) !==
        result.asOf.slice(0, 19))
  )
    throw new TypeError("Invalid historical instant.");
  return freeze(result);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
interface ContextJsonSchema {
  readonly oneOf?: readonly ContextJsonSchema[];
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly type?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly items?: ContextJsonSchema;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, ContextJsonSchema>>;
}
function valid(value: unknown, schema: ContextJsonSchema): boolean {
  if (schema.oneOf)
    return schema.oneOf.filter((s) => valid(value, s)).length === 1;
  if ("const" in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "string")
    return (
      typeof value === "string" &&
      value.length >= (schema.minLength ?? 0) &&
      value.length <= (schema.maxLength ?? Infinity) &&
      (!schema.pattern || new RegExp(schema.pattern).test(value))
    );
  if (schema.type === "integer")
    return (
      Number.isSafeInteger(value) &&
      Number(value) >= (schema.minimum ?? -Infinity) &&
      Number(value) <= (schema.maximum ?? Infinity)
    );
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      value.length <= (schema.maxItems ?? Infinity) &&
      (!schema.uniqueItems || new Set(value).size === value.length) &&
      value.every((v) => valid(v, schema.items ?? {}))
    );
  if (schema.type === "object")
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (schema.required ?? []).every((k: string) => Object.hasOwn(value, k)) &&
      Object.entries(value).every(
        ([k, v]) =>
          Object.hasOwn(schema.properties ?? {}, k) &&
          valid(v, schema.properties![k]!),
      )
    );
  return true;
}
