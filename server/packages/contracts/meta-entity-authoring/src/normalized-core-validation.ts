import { referenceUuid } from "./reference-member-contract.js";
import { validateFoundationNode } from "./foundation-contract.js";
import {
  normalizedCoreFailure as fail,
  normalizedCoreRowNode,
  type NormalizedCoreGraph,
  type NormalizedCoreRow,
  type NormalizedCoreKind,
} from "./normalized-core-contract.js";

export interface NormalizedCoreContext {
  readonly entityId: string;
  readonly tenantId: string | null;
  readonly phase: "draft" | "qualification";
  readonly maxMembers: number;
  readonly identities: readonly {
    readonly id: string;
    readonly entityId: string;
    readonly tenantId: string | null;
    readonly fieldKey: string;
    readonly parentIdentityId: string | null;
  }[];
  readonly labels: readonly string[];
  readonly searchProfiles: readonly string[];
  readonly relationIds: readonly string[];
  readonly keyIds: readonly string[];
  readonly classificationCodes: readonly string[];
  readonly domains: readonly string[];
  readonly currencyCodes?: readonly string[];
  readonly contracts: readonly {
    readonly kind:
      | "computation"
      | "validation"
      | "schema"
      | "default"
      | "read_handler"
      | "write_handler"
      | "reference";
    readonly key: string;
    readonly version: number;
    readonly hash: string;
    readonly parameterCount: number;
  }[];
  readonly components: readonly {
    readonly id: string;
    readonly level: "surface";
    readonly surfaceKinds: readonly string[];
    readonly modes: readonly string[];
  }[];
  /** Independently resolved catalogue facts; not authorization/storage-owner proof. */
  readonly catalogues: readonly {
    readonly hash: string;
    readonly plane: string;
    readonly schema: string;
    readonly object: string;
    readonly columns: readonly {
      readonly path: string;
      readonly storageType: string;
      readonly nullable: boolean;
      readonly supportedDataTypes: readonly string[];
      readonly cardinalities: readonly ("one" | "many")[];
    }[];
  }[];
  readonly pattern?: {
    readonly key: string;
    readonly version: number;
    readonly hash: string;
    readonly validate: (pattern: string) => boolean;
  };
}
const pair = (a: unknown, b: unknown, path: string) => {
  if ((a === null) !== (b === null)) fail("NORMALIZED_CORE_PAIR_INVALID", path);
};
const nonnull = (value: unknown) => value !== null && value !== undefined;
function decimalCompare(a: string, b: string): number {
  const split = (v: string) => {
    const [whole, fraction = ""] = v.split(".");
    return {
      negative: v.startsWith("-"),
      digits: BigInt(whole!.replace("-", "") + fraction),
      scale: fraction.length,
    };
  };
  const x = split(a),
    y = split(b),
    scale = Math.max(x.scale, y.scale);
  const left =
      (x.negative ? -1n : 1n) * x.digits * 10n ** BigInt(scale - x.scale),
    right = (y.negative ? -1n : 1n) * y.digits * 10n ** BigInt(scale - y.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}
function calendar(value: string, path: string) {
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!)
    fail("NORMALIZED_CORE_TEMPORAL_INVALID", path);
}
function instant(value: string, path: string) {
  calendar(value, path);
  if (
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    fail("NORMALIZED_CORE_TEMPORAL_INVALID", path);
}
function temporalCompare(a: string, b: string): number {
  const norm = (v: string) =>
    v.replace(
      /(?:\.([0-9]+))?Z$/,
      (_, s: string | undefined) => "." + (s ?? "").padEnd(6, "0") + "Z",
    );
  return norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0;
}
export function parseNormalizedCoreGraph(
  input: unknown,
  context: NormalizedCoreContext,
): NormalizedCoreGraph {
  validateFoundationNode(
    {
      type: "object",
      properties: {
        field: { type: "array", items: normalizedCoreRowNode("field") },
        runtime: { type: "array", items: normalizedCoreRowNode("runtime") },
        surface: { type: "array", items: normalizedCoreRowNode("surface") },
      },
    },
    input,
    "",
  );
  validateFoundationNode(referenceUuid, context.entityId, "/context/entityId");
  if (context.tenantId !== null)
    validateFoundationNode(
      referenceUuid,
      context.tenantId,
      "/context/tenantId",
    );
  if (
    !["draft", "qualification"].includes(context.phase) ||
    !Number.isSafeInteger(context.maxMembers) ||
    context.maxMembers < 1
  )
    fail("NORMALIZED_CORE_CONTEXT_INVALID", "/context");
  // Trusted resource resolution is still required by the host. Reject malformed
  // pins here rather than treating their mere presence as component evidence.
  const pin = (key: string, version: number, hash: string) => {
    if (
      !/^[a-z][a-z0-9_.:-]{0,126}$/.test(key) ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      !/^[0-9a-f]{64}$/.test(hash)
    )
      fail("NORMALIZED_CORE_CONTEXT_INVALID", "/context/contracts");
  };
  for (const resource of context.contracts) {
    pin(resource.key, resource.version, resource.hash);
    if (
      !Number.isSafeInteger(resource.parameterCount) ||
      resource.parameterCount < 0
    )
      fail("NORMALIZED_CORE_CONTEXT_INVALID", "/context/contracts");
  }
  if (context.pattern) {
    pin(context.pattern.key, context.pattern.version, context.pattern.hash);
    if (typeof context.pattern.validate !== "function")
      fail("NORMALIZED_CORE_CONTEXT_INVALID", "/context/pattern");
  }
  const graph = input as NormalizedCoreGraph;
  if (
    graph.field.length + graph.runtime.length + graph.surface.length >
    context.maxMembers
  )
    fail("NORMALIZED_CORE_LIMIT", "");
  const ids = new Set<string>(),
    fieldIds = new Set(graph.field.map((f) => f.id));
  for (const family of ["field", "runtime", "surface"] as const)
    for (const row of graph[family]) {
      if (ids.has(row.id))
        fail("NORMALIZED_CORE_IDENTITY_CONFLICT", `/${family}`);
      ids.add(row.id);
    }
  if (graph.runtime.length > 1)
    fail("NORMALIZED_CORE_RUNTIME_CONFLICT", "/runtime");
  const foreign = (
    id: string | null,
    allowed: readonly string[] | Set<string>,
    path: string,
  ) => {
    if (
      id !== null &&
      !(allowed instanceof Set ? allowed.has(id) : allowed.includes(id))
    )
      fail("NORMALIZED_CORE_FOREIGN_REFERENCE", path);
  };
  const require = (value: unknown, path: string) => {
    if (context.phase === "qualification" && !nonnull(value))
      fail("NORMALIZED_CORE_INCOMPLETE", path);
  };
  const contract = (
    kind: NormalizedCoreContext["contracts"][number]["kind"],
    key: string | null,
    version: number | null,
    hash: string | null,
    path: string,
  ) => {
    pair(key, version === null ? hash : version, path);
    if (key === null) return;
    const matches = context.contracts.filter(
      (c) =>
        c.kind === kind &&
        c.key === key &&
        (version === null || c.version === version) &&
        (hash === null || c.hash === hash) &&
        c.parameterCount === 0,
    );
    if (matches.length !== 1)
      fail("NORMALIZED_CORE_RESOURCE_UNAVAILABLE", path);
  };
  const identities = new Map(context.identities.map((i) => [i.id, i]));
  if (identities.size !== context.identities.length)
    fail("NORMALIZED_CORE_CONTEXT_INVALID", "/context/identities");
  const enrolledIdentities = new Set<string>();
  for (const [index, f] of graph.field.entries()) {
    const path = `/field/${index}`;
    const identity = identities.get(f.fieldIdentityId);
    if (
      !identity ||
      identity.entityId !== context.entityId ||
      identity.tenantId !== context.tenantId ||
      enrolledIdentities.has(identity.id)
    )
      return fail("NORMALIZED_CORE_FIELD_IDENTITY_INVALID", path);
    enrolledIdentities.add(identity.id);
    const parent =
      identity.parentIdentityId === null
        ? null
        : graph.field.find(
            (p) => p.fieldIdentityId === identity.parentIdentityId,
          )?.id;
    if (f.parentFieldId !== parent)
      fail("NORMALIZED_CORE_PARENT_IDENTITY_INVALID", path);
    foreign(f.labelId, context.labels, path + "/labelId");
    foreign(f.relationId, context.relationIds, path + "/relationId");
    foreign(f.currencyFieldId, fieldIds, path + "/currencyFieldId");
    foreign(f.replacementFieldId, fieldIds, path + "/replacementFieldId");
    if (f.replacementFieldId === f.id)
      fail("NORMALIZED_CORE_REPLACEMENT_INVALID", path);
    if (!context.classificationCodes.includes(f.dataClassification))
      fail("NORMALIZED_CORE_CLASSIFICATION_UNAVAILABLE", path);
    if (f.domainCode !== null && !context.domains.includes(f.domainCode))
      fail("NORMALIZED_CORE_DOMAIN_UNAVAILABLE", path);
    if (f.valueOrigin !== "stored" && f.writeMode !== "read_only")
      fail("NORMALIZED_CORE_WRITE_ORIGIN_INVALID", path);
    if (
      ["computed", "runtime"].includes(f.valueOrigin) &&
      (f.storageKind !== null ||
        f.storagePath !== null ||
        f.storageType !== null)
    )
      fail("NORMALIZED_CORE_STORAGE_KIND_INVALID", path);
    if (["stored", "projected"].includes(f.valueOrigin)) {
      require(f.storageKind, path + "/storageKind");
      require(f.storagePath, path + "/storagePath");
      require(f.storageType, path + "/storageType");
    }
    const families = {
      text: ["minLength", "maxLength", "pattern"],
      numeric: ["minimum", "maximum"],
      decimal: ["precision", "scale"],
      date: ["minimumDate", "maximumDate"],
      datetime: ["minimumDatetime", "maximumDatetime"],
    } as const;
    const allowed = new Set<string>();
    if (["string", "text"].includes(f.dataType))
      families.text.forEach((k) => allowed.add(k));
    if (["integer", "bigint", "decimal", "money"].includes(f.dataType))
      families.numeric.forEach((k) => allowed.add(k));
    if (["decimal", "money"].includes(f.dataType))
      families.decimal.forEach((k) => allowed.add(k));
    if (f.dataType === "date") families.date.forEach((k) => allowed.add(k));
    if (f.dataType === "datetime")
      families.datetime.forEach((k) => allowed.add(k));
    for (const k of Object.values(families).flat())
      if (f[k] !== null && !allowed.has(k))
        fail("NORMALIZED_CORE_TYPE_OPTION_INVALID", path + "/" + k);
    if (
      f.minLength !== null &&
      f.maxLength !== null &&
      f.minLength > f.maxLength
    )
      fail("NORMALIZED_CORE_RANGE_INVALID", path);
    if (
      f.minimum !== null &&
      f.maximum !== null &&
      decimalCompare(f.minimum, f.maximum) > 0
    )
      fail("NORMALIZED_CORE_RANGE_INVALID", path);
    if (
      ["integer", "bigint"].includes(f.dataType) &&
      [f.minimum, f.maximum, f.defaultNumeric].some(
        (v) => v !== null && v.includes(".") && /[^0]/.test(v.split(".")[1]!),
      )
    )
      fail("NORMALIZED_CORE_INTEGRAL_VALUE_REQUIRED", path);
    if (f.scale !== null && f.precision !== null && f.scale > f.precision)
      fail("NORMALIZED_CORE_SCALE_INVALID", path);
    for (const value of [f.minimumDate, f.maximumDate, f.defaultDate])
      if (value !== null) calendar(value, path);
    for (const value of [
      f.minimumDatetime,
      f.maximumDatetime,
      f.defaultDatetime,
    ])
      if (value !== null) instant(value, path);
    if (
      f.minimumDate !== null &&
      f.maximumDate !== null &&
      f.minimumDate > f.maximumDate
    )
      fail("NORMALIZED_CORE_RANGE_INVALID", path);
    if (
      f.minimumDatetime !== null &&
      f.maximumDatetime !== null &&
      temporalCompare(f.minimumDatetime, f.maximumDatetime) > 0
    )
      fail("NORMALIZED_CORE_RANGE_INVALID", path);
    if (!["date", "datetime"].includes(f.dataType) && f.temporalKind !== null)
      fail("NORMALIZED_CORE_TYPE_OPTION_INVALID", path + "/temporalKind");
    if (
      f.temporalKind !== null &&
      f.temporalKind !== (f.dataType === "date" ? "date" : "instant")
    )
      fail("NORMALIZED_CORE_TEMPORAL_INVALID", path);
    if (["date", "datetime"].includes(f.dataType))
      require(f.temporalKind, path + "/temporalKind");
    if (f.currencyCode !== null && f.currencyFieldId !== null)
      fail("NORMALIZED_CORE_CURRENCY_CONFLICT", path);
    if (
      f.dataType !== "money" &&
      (f.currencyCode !== null || f.currencyFieldId !== null)
    )
      fail("NORMALIZED_CORE_TYPE_OPTION_INVALID", path + "/currency");
    if (f.currencyFieldId !== null) {
      const currencyField = graph.field.find(
        (row) => row.id === f.currencyFieldId,
      )!;
      if (
        currencyField.id === f.id ||
        !["string", "enum"].includes(currencyField.dataType) ||
        currencyField.cardinality !== "one"
      )
        fail("NORMALIZED_CORE_CURRENCY_FIELD_INVALID", path);
    }
    if (
      f.currencyCode !== null &&
      context.phase === "qualification" &&
      !context.currencyCodes?.includes(f.currencyCode)
    )
      fail("NORMALIZED_CORE_CURRENCY_RESOURCE_UNAVAILABLE", path);
    if (f.dataType === "money")
      require(f.currencyCode ?? f.currencyFieldId, path + "/currency");
    if (
      (f.jsonSchemaKey === null && f.jsonSchemaHash !== null) ||
      (f.jsonSchemaKey !== null && f.jsonSchemaHash === null)
    )
      fail("NORMALIZED_CORE_PAIR_INVALID", path + "/jsonSchema");
    if (f.cardinality === "many" || f.dataType === "json")
      require(f.jsonSchemaKey, path + "/jsonSchemaKey");
    if (f.jsonSchemaKey !== null)
      contract(
        "schema",
        f.jsonSchemaKey,
        null,
        f.jsonSchemaHash,
        path + "/jsonSchema",
      );
    contract(
      "computation",
      f.computedContractKey,
      f.computedContractVersion,
      null,
      path + "/computation",
    );
    contract(
      "validation",
      f.validationContractKey,
      f.validationContractVersion,
      null,
      path + "/validation",
    );
    if (f.valueOrigin === "computed")
      require(f.computedContractKey, path + "/computedContractKey");
    else if (f.computedContractKey !== null)
      fail("NORMALIZED_CORE_COMPUTATION_ORIGIN_INVALID", path);
    pair(
      f.defaultContextKey,
      f.defaultContextVersion,
      path + "/defaultContext",
    );
    const literals = [
      "defaultText",
      "defaultNumeric",
      "defaultBoolean",
      "defaultDate",
      "defaultDatetime",
      "defaultUuid",
    ] as const;
    const populated = literals.filter((k) => f[k] !== null);
    if (populated.length > 1) fail("NORMALIZED_CORE_DEFAULT_CONFLICT", path);
    if (f.defaultKind === "literal") {
      const expected = ["string", "text", "enum"].includes(f.dataType)
        ? "defaultText"
        : ["integer", "bigint", "decimal", "money"].includes(f.dataType)
          ? "defaultNumeric"
          : f.dataType === "boolean"
            ? "defaultBoolean"
            : f.dataType === "date"
              ? "defaultDate"
              : f.dataType === "datetime"
                ? "defaultDatetime"
                : f.dataType === "uuid"
                  ? "defaultUuid"
                  : null;
      if (populated.length && populated[0] !== expected)
        fail("NORMALIZED_CORE_DEFAULT_TYPE_INVALID", path);
      require(populated[0], path + "/default");
      if (f.defaultUuid !== null)
        fail(
          "NORMALIZED_CORE_UUID_LITERAL_CONTRACT_UNAVAILABLE",
          path + "/defaultUuid",
        );
    } else if (populated.length)
      fail("NORMALIZED_CORE_DEFAULT_TYPE_INVALID", path);
    if (f.defaultKind === "literal_null" && !f.nullable)
      fail("NORMALIZED_CORE_NULL_DEFAULT_INVALID", path);
    if (f.defaultKind === "context") {
      require(f.defaultContextKey, path + "/defaultContextKey");
      contract(
        "default",
        f.defaultContextKey,
        f.defaultContextVersion,
        null,
        path + "/defaultContext",
      );
    } else if (f.defaultContextKey !== null)
      fail("NORMALIZED_CORE_DEFAULT_TYPE_INVALID", path);
    if (
      f.defaultKind !== "none" &&
      (f.valueOrigin !== "stored" || f.writeMode === "read_only")
    )
      fail("NORMALIZED_CORE_DEFAULT_ORIGIN_INVALID", path);
    if (f.keyGeneration !== "none" && f.dataType !== "uuid")
      fail("NORMALIZED_CORE_KEY_GENERATION_INVALID", path);
    if (
      f.pattern !== null &&
      context.phase === "qualification" &&
      (!context.pattern || !context.pattern.validate(f.pattern))
    )
      fail("NORMALIZED_CORE_PATTERN_CONTRACT_UNAVAILABLE", path + "/pattern");
  }
  for (const f of graph.field) {
    const visited = new Set<string>();
    let current: NormalizedCoreRow<"field"> | undefined = f;
    while (current) {
      if (visited.has(current.id))
        fail("NORMALIZED_CORE_PARENT_CYCLE", "/field");
      visited.add(current.id);
      current = graph.field.find((p) => p.id === current!.parentFieldId);
    }
  }
  for (const r of graph.runtime) {
    for (const id of [
      r.idFieldId,
      r.tenantFieldId,
      r.recordVersionFieldId,
      r.softDeleteFieldId,
    ])
      foreign(id, fieldIds, "/runtime/field");
    const sql = ["table", "view", "materialized_view"].includes(r.backingKind);
    if (sql) {
      require(r.storagePlane, "/runtime/storagePlane");
      require(r.storageSchema, "/runtime/storageSchema");
      require(r.storageObject, "/runtime/storageObject");
      require(r.storageCatalogueHash, "/runtime/storageCatalogueHash");
    } else if (
      r.storageSchema !== null ||
      r.storageObject !== null ||
      r.storageCatalogueHash !== null
    )
      fail("NORMALIZED_CORE_STORAGE_KIND_INVALID", "/runtime");
    if (r.backingKind === "external")
      require(r.storagePlane, "/runtime/storagePlane");
    if (r.backingKind === "virtual" && r.storagePlane !== null)
      fail("NORMALIZED_CORE_STORAGE_KIND_INVALID", "/runtime");
    if (
      (r.readMode === "generic" && !sql) ||
      (r.writeMode === "generic" && r.backingKind !== "table") ||
      (r.apiExposure !== "api" &&
        (r.readMode !== "none" || r.writeMode !== "none")) ||
      (r.writeMode === "none" && r.createMode !== "form_only") ||
      (r.writeMode === "append_only") !== (r.concurrencyMode === "append_only")
    )
      fail("NORMALIZED_CORE_RUNTIME_MODE_INVALID", "/runtime");
    pair(r.readHandlerKey, r.readHandlerVersion, "/runtime/readHandler");
    pair(r.writeHandlerKey, r.writeHandlerVersion, "/runtime/writeHandler");
    pair(
      r.referenceCapabilityKey,
      r.referenceCapabilityVersion,
      "/runtime/referenceCapability",
    );
    if (r.readMode === "facade")
      require(r.readHandlerKey, "/runtime/readHandlerKey");
    else if (r.readHandlerKey !== null)
      fail("NORMALIZED_CORE_RUNTIME_MODE_INVALID", "/runtime/readHandlerKey");
    if (r.writeMode === "facade")
      require(r.writeHandlerKey, "/runtime/writeHandlerKey");
    else if (r.writeHandlerKey !== null)
      fail("NORMALIZED_CORE_RUNTIME_MODE_INVALID", "/runtime/writeHandlerKey");
    contract(
      "read_handler",
      r.readHandlerKey,
      r.readHandlerVersion,
      null,
      "/runtime/readHandler",
    );
    contract(
      "write_handler",
      r.writeHandlerKey,
      r.writeHandlerVersion,
      null,
      "/runtime/writeHandler",
    );
    contract(
      "reference",
      r.referenceCapabilityKey,
      r.referenceCapabilityVersion,
      null,
      "/runtime/referenceCapability",
    );
    if (r.createMode === "early_draft")
      require(r.draftTtlHours, "/runtime/draftTtlHours");
    else if (r.draftTtlHours !== null)
      fail("NORMALIZED_CORE_RUNTIME_MODE_INVALID", "/runtime/draftTtlHours");
    if (r.concurrencyMode === "optimistic")
      require(r.recordVersionFieldId, "/runtime/recordVersionFieldId");
    if (context.phase === "qualification" && sql) {
      const cats = context.catalogues.filter(
        (c) =>
          c.hash === r.storageCatalogueHash &&
          c.plane === r.storagePlane &&
          c.schema === r.storageSchema &&
          c.object === r.storageObject,
      );
      if (cats.length !== 1)
        fail("NORMALIZED_CORE_CATALOGUE_UNAVAILABLE", "/runtime");
      for (const f of graph.field.filter((f) => f.storageKind === "column")) {
        const cols = cats[0]!.columns.filter((c) => c.path === f.storagePath);
        if (
          cols.length !== 1 ||
          cols[0]!.storageType !== f.storageType ||
          cols[0]!.nullable !== f.nullable ||
          !cols[0]!.supportedDataTypes.includes(f.dataType) ||
          !cols[0]!.cardinalities.includes(f.cardinality)
        )
          fail("NORMALIZED_CORE_STORAGE_FACT_MISMATCH", "/field");
      }
    }
  }
  const surfaceKeys = new Set<string>(),
    defaults = new Set<string>();
  for (const s of graph.surface) {
    if (
      surfaceKeys.has(s.surfaceKey) ||
      (s.isDefault && defaults.has(s.surfaceKind))
    )
      fail("NORMALIZED_CORE_SURFACE_CONFLICT", "/surface");
    surfaceKeys.add(s.surfaceKey);
    if (s.isDefault) defaults.add(s.surfaceKind);
    for (const id of [
      s.labelId,
      s.descriptionLabelId,
      s.emptyTitleLabelId,
      s.emptyDescriptionLabelId,
    ])
      foreign(id, context.labels, "/surface/label");
    for (const id of [s.identityFieldId, s.titleFieldId, s.codeFieldId])
      foreign(id, fieldIds, "/surface/field");
    foreign(
      s.searchProfileId,
      context.searchProfiles,
      "/surface/searchProfileId",
    );
    foreign(s.referenceKeyId, context.keyIds, "/surface/referenceKeyId");
    const collection =
      s.surfaceKind === "list" ||
      (s.surfaceKind === "embedded" && s.embeddedMode === "collection");
    const sectioned =
      ["detail", "form"].includes(s.surfaceKind) ||
      (s.surfaceKind === "embedded" && s.embeddedMode === "sectioned");
    if (s.surfaceKind === "embedded")
      require(s.embeddedMode, "/surface/embeddedMode");
    else if (s.embeddedMode !== null)
      fail(
        "NORMALIZED_CORE_SURFACE_APPLICABILITY_INVALID",
        "/surface/embeddedMode",
      );
    for (const k of [
      "identityFieldId",
      "searchProfileId",
      "supportedModes",
      "defaultPageSize",
      "allowedPageSizes",
      "maxSortLevels",
      "countMode",
      "maxFilters",
      "maxFilterDepth",
      "maxPageSize",
      "emptyTitleLabelId",
      "emptyDescriptionLabelId",
    ] as const)
      if (!collection && s[k] !== null)
        fail("NORMALIZED_CORE_SURFACE_APPLICABILITY_INVALID", "/surface/" + k);
    if (collection) {
      for (const k of [
        "identityFieldId",
        "supportedModes",
        "defaultPageSize",
        "allowedPageSizes",
        "maxSortLevels",
        "countMode",
        "maxFilters",
        "maxFilterDepth",
        "maxPageSize",
      ] as const)
        require(s[k], "/surface/" + k);
    }
    if (!sectioned && s.columnCount !== null)
      fail(
        "NORMALIZED_CORE_SURFACE_APPLICABILITY_INVALID",
        "/surface/columnCount",
      );
    if (sectioned) require(s.columnCount, "/surface/columnCount");
    if (
      s.surfaceKind !== "detail" &&
      (s.codeFieldId !== null || s.showGroupBand !== null)
    )
      fail("NORMALIZED_CORE_SURFACE_APPLICABILITY_INVALID", "/surface/detail");
    if (s.surfaceKind === "detail")
      require(s.showGroupBand, "/surface/showGroupBand");
    if (
      !["detail", "lookup"].includes(s.surfaceKind) &&
      s.titleFieldId !== null
    )
      fail(
        "NORMALIZED_CORE_SURFACE_APPLICABILITY_INVALID",
        "/surface/titleFieldId",
      );
    if (["detail", "lookup"].includes(s.surfaceKind))
      require(s.titleFieldId, "/surface/titleFieldId");
    if (s.surfaceKind === "lookup") {
      if (
        s.componentContractId !== null ||
        s.layoutKind !== "stack" ||
        s.extensionPointKey !== null
      )
        fail("NORMALIZED_CORE_LOOKUP_LAYOUT_INVALID", "/surface");
      require(s.referenceKeyId, "/surface/referenceKeyId");
      require(s.referenceFormat, "/surface/referenceFormat");
    } else {
      if (s.referenceKeyId !== null || s.referenceFormat !== null)
        fail(
          "NORMALIZED_CORE_SURFACE_APPLICABILITY_INVALID",
          "/surface/reference",
        );
      require(s.componentContractId, "/surface/componentContractId");
    }
    require(s.labelId, "/surface/labelId");
    if (s.componentContractId !== null) {
      const components = context.components.filter(
        (c) =>
          c.id === s.componentContractId &&
          c.level === "surface" &&
          c.surfaceKinds.includes(s.surfaceKind),
      );
      if (
        components.length !== 1 ||
        s.supportedModes?.some((mode) => !components[0]!.modes.includes(mode))
      )
        fail(
          "NORMALIZED_CORE_COMPONENT_UNAVAILABLE",
          "/surface/componentContractId",
        );
    }
    for (const id of [s.identityFieldId, s.titleFieldId, s.codeFieldId])
      if (
        id !== null &&
        graph.field.find((f) => f.id === id)?.dataType === "uuid"
      )
        fail("NORMALIZED_CORE_UUID_PRESENTATION_FORBIDDEN", "/surface");
    for (const id of [s.identityFieldId, s.titleFieldId, s.codeFieldId])
      if (id !== null)
        require(graph.field.find((f) => f.id === id)!
          .labelId, "/surface/readableFieldLabel");
    if (
      s.allowedPageSizes !== null &&
      (s.allowedPageSizes.length === 0 ||
        new Set(s.allowedPageSizes).size !== s.allowedPageSizes.length ||
        (s.maxPageSize !== null &&
          s.allowedPageSizes.some((n) => n > s.maxPageSize!)) ||
        (s.defaultPageSize !== null &&
          !s.allowedPageSizes.includes(s.defaultPageSize)))
    )
      fail("NORMALIZED_CORE_PAGE_SIZE_INVALID", "/surface");
    if (
      s.supportedModes !== null &&
      (s.supportedModes.length === 0 ||
        new Set(s.supportedModes).size !== s.supportedModes.length)
    )
      fail("NORMALIZED_CORE_MODES_INVALID", "/surface");
    if (s.surfaceKind === "detail" && s.extensionPointKey !== null)
      fail(
        "NORMALIZED_CORE_SURFACE_APPLICABILITY_INVALID",
        "/surface/extensionPointKey",
      );
  }
  return structuredClone(graph);
}
