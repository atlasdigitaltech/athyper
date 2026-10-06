import {
  FoundationContractError,
  normalizedCoreMembers,
  parseNormalizedCoreGraph,
  validateNormalizedCoreRow,
  type NormalizedCoreContext,
  type NormalizedCoreGraph,
  type NormalizedCoreRow,
  type NormalizedCoreKind,
  type MetaEntityField,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
export interface NormalizedCoreCodecContext extends NormalizedCoreContext {
  readonly changeSetId: string;
  readonly revision: number;
  readonly authoringSchemaHash: string;
  readonly maximumBytes: number;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
/** Conversion accepts JSON data only; hashing must not hide getters, undefined,
 * dates, sparse arrays or properties ignored by serialization. */
export function validateConversionJsonData(
  value: unknown,
  path: string,
  depth = 0,
): void {
  if (depth > 32) fail("NORMALIZED_CORE_LEGACY_INPUT_INVALID", path);
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object")
    return fail("NORMALIZED_CORE_LEGACY_INPUT_INVALID", path);
  if (
    !Array.isArray(value) &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail("NORMALIZED_CORE_LEGACY_INPUT_INVALID", path);
  const properties = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some((k) => typeof k === "symbol"))
    fail("NORMALIZED_CORE_LEGACY_INPUT_INVALID", path);
  if (
    Array.isArray(value) &&
    (Object.getPrototypeOf(value) !== Array.prototype ||
      Object.keys(value).length !== value.length ||
      value.length > 4096 ||
      Object.keys(value).some((key, index) => key !== String(index)))
  )
    fail("NORMALIZED_CORE_LEGACY_INPUT_INVALID", path);
  for (const [key, property] of Object.entries(properties)) {
    if (Array.isArray(value) && key === "length") continue;
    if (!("value" in property) || !property.enumerable)
      fail("NORMALIZED_CORE_LEGACY_INPUT_INVALID", path + "/" + key);
    validateConversionJsonData(property.value, path + "/" + key, depth + 1);
  }
}
function closed(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return fail("NORMALIZED_CORE_PACKAGE_INVALID", path);
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    fail("NORMALIZED_CORE_PACKAGE_INVALID", path);
  return value as Record<string, unknown>;
}
function validContext(c: NormalizedCoreCodecContext) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      c.changeSetId,
    ) ||
    !Number.isSafeInteger(c.revision) ||
    c.revision < 0 ||
    !/^[0-9a-f]{64}$/.test(c.authoringSchemaHash) ||
    !Number.isSafeInteger(c.maximumBytes) ||
    c.maximumBytes < 1
  )
    fail("NORMALIZED_CORE_CODEC_CONTEXT_INVALID", "/context");
}
function source(c: NormalizedCoreCodecContext) {
  return {
    entityId: c.entityId,
    tenantId: c.tenantId,
    changeSetId: c.changeSetId,
    revision: c.revision,
  };
}
/** Validators are registered host implementations. Fingerprints contain their
 * immutable contract pin, never a serialized function or client-supplied grant. */
function contextHash(c: NormalizedCoreCodecContext) {
  const {
    changeSetId: _,
    revision: __,
    authoringSchemaHash: ___,
    maximumBytes: ____,
    pattern,
    ...rest
  } = c;
  return sha256({
    ...rest,
    pattern: pattern
      ? { key: pattern.key, version: pattern.version, hash: pattern.hash }
      : null,
  });
}
export function encodeNormalizedCore(
  graph: NormalizedCoreGraph,
  c: NormalizedCoreCodecContext,
): string {
  validContext(c);
  const checked = parseNormalizedCoreGraph(graph, c);
  const packet = canonicalJson({
    schema: "entity.authoring-normalized-core-package/1",
    source: source(c),
    authoringSchemaHash: c.authoringSchemaHash,
    contextHash: contextHash(c),
    graphHash: sha256(checked),
    graph: checked,
  });
  if (Buffer.byteLength(packet, "utf8") > c.maximumBytes)
    fail("NORMALIZED_CORE_PACKAGE_LIMIT", "");
  return packet;
}
export function decodeNormalizedCore(
  packet: string,
  c: NormalizedCoreCodecContext,
): NormalizedCoreGraph {
  validContext(c);
  if (
    typeof packet !== "string" ||
    Buffer.byteLength(packet, "utf8") > c.maximumBytes
  )
    fail("NORMALIZED_CORE_PACKAGE_LIMIT", "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(packet);
  } catch {
    return fail("NORMALIZED_CORE_PACKAGE_JSON_INVALID", "");
  }
  const p = closed(
    parsed,
    [
      "schema",
      "source",
      "authoringSchemaHash",
      "contextHash",
      "graphHash",
      "graph",
    ],
    "",
  );
  if (p.schema !== "entity.authoring-normalized-core-package/1")
    fail("NORMALIZED_CORE_PACKAGE_VERSION_UNSUPPORTED", "/schema");
  closed(
    p.source,
    ["entityId", "tenantId", "changeSetId", "revision"],
    "/source",
  );
  if (canonicalJson(p.source) !== canonicalJson(source(c)))
    fail("NORMALIZED_CORE_PACKAGE_SOURCE_MISMATCH", "/source");
  if (
    p.authoringSchemaHash !== c.authoringSchemaHash ||
    p.contextHash !== contextHash(c)
  )
    fail("NORMALIZED_CORE_PACKAGE_EVIDENCE_MISMATCH", "/contextHash");
  if (p.graphHash !== sha256(p.graph))
    fail("NORMALIZED_CORE_PACKAGE_HASH_MISMATCH", "/graphHash");
  return parseNormalizedCoreGraph(p.graph, c);
}
/** Explicit legacy stored/read-only field adapter. Source content and identity
 * mappings are supplied by the qualified conversion caller, not by a package.
 * No default, validation/computation blob or unrepresented property is dropped. */
export function normalizeLegacyReadField(
  input: MetaEntityField,
  c: NormalizedCoreContext,
  mapping: {
    readonly sourceHash: string;
    readonly fieldIdentityId: string;
    readonly labelId: string | null;
    readonly storageType: string;
    readonly requiredInput: boolean;
    /** Independently admitted presentation initialization. A graph conversion
     * must separately account for and correlate its legacy binding declarations. */
    readonly semanticRole?: string;
    readonly keyGeneration: "none" | "provided" | "database_uuidv7";
    readonly relation?: {
      readonly id: string;
      readonly sourceConfigHash: string;
    };
  },
): NormalizedCoreRow<"field"> {
  validateConversionJsonData(input, "/field");
  if (sha256(input) !== mapping.sourceHash)
    fail("NORMALIZED_CORE_LEGACY_SOURCE_HASH_MISMATCH", "/field");
  const allowed = [
    "id",
    "fieldKey",
    "description",
    "dataType",
    "typeConfig",
    "cardinality",
    "valueOrigin",
    "writeMode",
    "storagePath",
    "dataClassification",
    "retentionPolicyCode",
    "status",
  ];
  for (const key of Object.keys(input))
    if (!allowed.includes(key))
      fail("NORMALIZED_CORE_LEGACY_PATH_UNSUPPORTED", "/field/" + key);
  if (
    !input.id ||
    input.valueOrigin !== "stored" ||
    input.writeMode !== "read_only" ||
    (input.status !== undefined && input.status !== "active") ||
    !["one", "zero_or_one"].includes(String(input.cardinality))
  )
    fail("NORMALIZED_CORE_LEGACY_ADAPTER_UNAVAILABLE", "/field");
  const identity = c.identities.find(
    (i) =>
      i.id === mapping.fieldIdentityId &&
      i.fieldKey === input.fieldKey &&
      i.entityId === c.entityId &&
      i.tenantId === c.tenantId,
  );
  if (!identity || identity.parentIdentityId !== null)
    fail("NORMALIZED_CORE_LEGACY_IDENTITY_REQUIRED", "/field/fieldKey");
  const config = input.typeConfig;
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    config.kind !== input.dataType
  )
    fail("NORMALIZED_CORE_LEGACY_TYPE_INVALID", "/field/typeConfig");
  for (const key of Object.keys(config))
    if (
      ![
        "kind",
        "domain_code",
        "min_length",
        "max_length",
        "pattern",
        "minimum",
        "maximum",
        "precision",
        "scale",
        "keyReference",
      ].includes(key)
    )
      fail(
        "NORMALIZED_CORE_LEGACY_PATH_UNSUPPORTED",
        "/field/typeConfig/" + key,
      );
  if (
    config.keyReference !== undefined &&
    (!mapping.relation ||
      !c.relationIds.includes(mapping.relation.id) ||
      mapping.relation.sourceConfigHash !== sha256(config.keyReference))
  )
    fail(
      "NORMALIZED_CORE_LEGACY_RELATION_EVIDENCE_REQUIRED",
      "/field/typeConfig/keyReference",
    );
  if (config.keyReference === undefined && mapping.relation)
    fail(
      "NORMALIZED_CORE_LEGACY_RELATION_EVIDENCE_REQUIRED",
      "/field/relation",
    );
  const row = {
    id: input.id,
    ...Object.fromEntries(
      Object.keys(normalizedCoreMembers.field.columns).map((k) => [k, null]),
    ),
    fieldIdentityId: mapping.fieldIdentityId,
    parentFieldId: null,
    labelId: mapping.labelId,
    description: input.description ?? null,
    dataType: input.dataType,
    storageType: mapping.storageType,
    cardinality: "one",
    valueOrigin: input.valueOrigin,
    storageKind: "column",
    storagePath: input.storagePath ?? null,
    nullable: input.cardinality === "zero_or_one",
    required: mapping.requiredInput,
    writeMode: input.writeMode,
    dataClassification: input.dataClassification,
    retentionPolicyCode: input.retentionPolicyCode ?? null,
    defaultKind: "none",
    keyGeneration: mapping.keyGeneration,
    relationId: mapping.relation?.id ?? null,
    domainCode: config.domain_code ?? null,
    semanticRole: mapping.semanticRole ?? null,
    minLength: config.min_length ?? null,
    maxLength: config.max_length ?? null,
    pattern: config.pattern ?? null,
    precision: config.precision ?? null,
    scale: config.scale ?? null,
  } as Record<string, unknown>;
  for (const key of ["minimum", "maximum"] as const) {
    const value = config[key];
    if (value === undefined) continue;
    if (typeof value !== "string")
      fail(
        "NORMALIZED_CORE_LEGACY_NUMERIC_ENCODING_UNSUPPORTED",
        "/field/typeConfig/" + key,
      );
    row[key] = value;
  }
  if (input.dataType === "date") row.temporalKind = "date";
  if (input.dataType === "datetime") row.temporalKind = "instant";
  validateNormalizedCoreRow("field", row);
  return row as NormalizedCoreRow<"field">;
}
/** Exact scalar SQL mapping. Invocation is not DDL installation or write
 * authority; a storage adapter must separately verify scope, schema and version. */
export function normalizedCoreToStorage<K extends NormalizedCoreKind>(
  kind: K,
  row: NormalizedCoreRow<K>,
): Readonly<Record<string, unknown>> {
  validateNormalizedCoreRow(kind, row);
  return {
    id: row.id,
    ...Object.fromEntries(
      Object.entries(normalizedCoreMembers[kind].columns).map(([p, c]) => [
        c.column,
        Reflect.get(row, p),
      ]),
    ),
  };
}
export function normalizedCoreFromStorage<K extends NormalizedCoreKind>(
  kind: K,
  value: Readonly<Record<string, unknown>>,
): NormalizedCoreRow<K> {
  // Drivers must select numeric/calendar/instant values as exact strings. Date
  // objects and binary64 numerics are not repaired after precision was lost.
  const row = {
    id: value.id,
    ...Object.fromEntries(
      Object.entries(normalizedCoreMembers[kind].columns).map(([p, c]) => {
        if (!Object.hasOwn(value, c.column))
          fail(
            "NORMALIZED_CORE_STORAGE_COLUMN_MISSING",
            "/" + kind + "/" + c.column,
          );
        return [p, value[c.column]];
      }),
    ),
  };
  validateNormalizedCoreRow(kind, row);
  return row as NormalizedCoreRow<K>;
}
