import { createHash } from "node:crypto";
import type {
  AtlasJsonObjectSchemaV1,
  AtlasJsonSchemaV1,
  AtlasJsonValue,
  AtlasToolManifestV1,
  AtlasSha256Hex,
  AtlasToolValidationIssue,
  AtlasToolValidationResult,
} from "./atlas-tool.types.js";
import { ATLAS_TOOL_MANIFEST_SCHEMA_VERSION } from "./atlas-tool.types.js";

const TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;
const VERSION_RE =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const CODE_RE = /^[a-z][a-z0-9_.:-]{2,127}$/;
const FEATURE_RE = /^[a-z][a-z0-9_.-]{2,127}$/;
const PROPERTY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_SCHEMA_DEPTH = 12;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 20_000;
const MAX_VALIDATION_ISSUES = 24;

export class AtlasToolManifestValidationError extends Error {
  override readonly name = "AtlasToolManifestValidationError";

  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

class AtlasJsonValueError extends Error {
  constructor(readonly path: string) {
    super(path);
  }
}

/**
 * Validates every field and rejects unknown manifest/schema keywords. The
 * returned object is deeply frozen so registration cannot drift after review.
 */
export function validateAtlasToolManifestV1(
  value: unknown,
): AtlasToolManifestV1 {
  const manifest = record(value, "$");
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "name",
      "version",
      "displayName",
      "description",
      "access",
      "risk",
      "actionCode",
      "featureKey",
      "allowedPlanes",
      "requiredPermissions",
      "timeoutMs",
      "maxResultBytes",
      "idempotency",
      "confirmation",
      "stepUp",
      "dualControl",
      "implementation",
      "audit",
      "evidence",
      "dataAccess",
      "inputSchema",
      "resultSchema",
      "source",
    ],
    "$",
  );
  literal(
    manifest.schemaVersion,
    ATLAS_TOOL_MANIFEST_SCHEMA_VERSION,
    "$.schemaVersion",
  );
  text(manifest.name, "$.name", 64, TOOL_NAME_RE);
  text(manifest.version, "$.version", 32, VERSION_RE);
  text(manifest.displayName, "$.displayName", 100);
  text(manifest.description, "$.description", 1_000);
  literal(manifest.access, "read_only", "$.access");
  oneOf(manifest.risk, ["low", "medium", "high"], "$.risk");
  text(manifest.actionCode, "$.actionCode", 128, CODE_RE);
  text(manifest.featureKey, "$.featureKey", 128, FEATURE_RE);

  const planes = stringArray(
    manifest.allowedPlanes,
    "$.allowedPlanes",
    1,
    3,
  );
  for (const plane of planes) {
    oneOf(plane, ["neon", "mesh", "admin"], "$.allowedPlanes");
  }
  unique(planes, "$.allowedPlanes");

  const requiredPermissions = stringArray(
    manifest.requiredPermissions,
    "$.requiredPermissions",
    1,
    32,
  );
  for (const permission of requiredPermissions) {
    text(permission, "$.requiredPermissions", 128, CODE_RE);
  }
  unique(requiredPermissions, "$.requiredPermissions");

  integer(manifest.timeoutMs, "$.timeoutMs", 10, 30_000);
  integer(manifest.maxResultBytes, "$.maxResultBytes", 128, 1_048_576);
  validateIdempotency(manifest.idempotency, "$.idempotency");
  validateConfirmation(manifest.confirmation, "$.confirmation");
  validateStepUp(manifest.stepUp, "$.stepUp");
  validateDualControl(manifest.dualControl, "$.dualControl");
  validateImplementation(manifest.implementation, "$.implementation");
  validateAudit(manifest.audit, "$.audit");
  validateDataAccess(
    manifest.dataAccess,
    new Set(requiredPermissions),
    "$.dataAccess",
  );
  validateEvidence(manifest.evidence, manifest.dataAccess, "$.evidence");
  validateSchemaDefinition(manifest.inputSchema, "$.inputSchema", 0);
  if (record(manifest.inputSchema, "$.inputSchema").type !== "object") {
    invalid("$.inputSchema", "the input schema must have type object");
  }
  validateStrictProviderInputSchema(
    manifest.inputSchema as AtlasJsonSchemaV1,
    "$.inputSchema",
  );
  validateSchemaDefinition(manifest.resultSchema, "$.resultSchema", 0);
  validateCodeSource(manifest.source, "$.source");

  return deepFreeze(value) as AtlasToolManifestV1;
}

/**
 * Atlas v1 advertises the same input contract to every tool-capable provider.
 * OpenAI strict function calling requires every object property to appear in
 * `required`; enforcing that portable subset at registration prevents a tool
 * from working with one provider while being rejected by another.
 */
function validateStrictProviderInputSchema(
  schema: AtlasJsonSchemaV1,
  path: string,
): void {
  if (schema.type === "array") {
    validateStrictProviderInputSchema(schema.items, `${path}.items`);
    return;
  }
  if (schema.type !== "object") return;
  const propertyNames = Object.keys(schema.properties);
  const required = new Set(schema.required);
  if (
    required.size !== propertyNames.length
    || propertyNames.some((name) => !required.has(name))
  ) {
    invalid(
      `${path}.required`,
      "provider-portable strict schemas must require every declared property",
    );
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    validateStrictProviderInputSchema(property, `${path}.properties.${name}`);
  }
}

export function validateAtlasJsonSchemaValue(
  schema: AtlasJsonSchemaV1,
  input: unknown,
): AtlasToolValidationResult {
  let normalized: AtlasJsonValue;
  try {
    normalized = normalizeAtlasJson(input);
  } catch (error) {
    const path = error instanceof AtlasJsonValueError ? error.path : "$";
    return Object.freeze({
      ok: false,
      issues: Object.freeze([{
        path,
        keyword: "json_type" as const,
      }]),
    });
  }

  const issues: AtlasToolValidationIssue[] = [];
  validateValue(schema, normalized, "$", issues);
  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues),
    });
  }
  return Object.freeze({ ok: true, value: normalized });
}

export function normalizeAtlasJson(value: unknown): AtlasJsonValue {
  const state = { nodes: 0 };
  return normalize(value, "$", 0, state, new Set<object>());
}

export function canonicalAtlasJson(value: AtlasJsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AtlasJsonValueError("$");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalAtlasJson).join(",")}]`;
  }
  const object = value as Readonly<Record<string, AtlasJsonValue>>;
  const fields = Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalAtlasJson(object[key]!)}`);
  return `{${fields.join(",")}}`;
}

export function hashAtlasJson(
  value: AtlasJsonValue,
): AtlasSha256Hex {
  return createHash("sha256")
    .update(canonicalAtlasJson(value), "utf8")
    .digest("hex");
}

export function atlasJsonByteLength(value: AtlasJsonValue): number {
  return Buffer.byteLength(canonicalAtlasJson(value), "utf8");
}

function validateDataAccess(
  value: unknown,
  requiredPermissions: ReadonlySet<string>,
  path: string,
): void {
  const access = record(value, path);
  const mode = access.mode;
  if (mode === "none") {
    exactKeys(access, ["mode"], path);
    return;
  }
  if (mode !== "atlas_gateway") {
    invalid(`${path}.mode`, "must be none or atlas_gateway");
  }
  exactKeys(
    access,
    ["mode", "permissionCodes", "sourceKinds", "maxReads"],
    path,
  );
  const permissions = stringArray(
    access.permissionCodes,
    `${path}.permissionCodes`,
    1,
    16,
  );
  unique(permissions, `${path}.permissionCodes`);
  for (const permission of permissions) {
    text(permission, `${path}.permissionCodes`, 128, CODE_RE);
    if (!requiredPermissions.has(permission)) {
      invalid(
        `${path}.permissionCodes`,
        "gateway permissions must also be required tool permissions",
      );
    }
  }
  const sourceKinds = stringArray(
    access.sourceKinds,
    `${path}.sourceKinds`,
    1,
    3,
  );
  unique(sourceKinds, `${path}.sourceKinds`);
  for (const sourceKind of sourceKinds) {
    oneOf(
      sourceKind,
      ["record", "attachment", "content"],
      `${path}.sourceKinds`,
    );
  }
  integer(access.maxReads, `${path}.maxReads`, 1, 20);
}

function validateIdempotency(value: unknown, path: string): void {
  const policy = record(value, path);
  if (policy.mode === "none") {
    exactKeys(policy, ["mode"], path);
    return;
  }
  if (policy.mode !== "required") {
    invalid(`${path}.mode`, "must be none or required");
  }
  exactKeys(policy, ["mode", "key", "conflict"], path);
  literal(policy.key, "run_id+tool_call_id", `${path}.key`);
  literal(policy.conflict, "same_input_hash_only", `${path}.conflict`);
}

function validateConfirmation(value: unknown, path: string): void {
  const policy = record(value, path);
  if (policy.mode === "none") {
    exactKeys(policy, ["mode"], path);
    return;
  }
  if (policy.mode !== "human") {
    invalid(`${path}.mode`, "must be none or human");
  }
  exactKeys(policy, ["mode", "timing"], path);
  literal(policy.timing, "before_execution", `${path}.timing`);
}

function validateStepUp(value: unknown, path: string): void {
  const policy = record(value, path);
  if (policy.mode === "none") {
    exactKeys(policy, ["mode"], path);
    return;
  }
  if (policy.mode !== "required") {
    invalid(`${path}.mode`, "must be none or required");
  }
  exactKeys(policy, ["mode", "assuranceLevel"], path);
  text(policy.assuranceLevel, `${path}.assuranceLevel`, 64, CODE_RE);
}

function validateDualControl(value: unknown, path: string): void {
  const policy = record(value, path);
  if (policy.mode === "none") {
    exactKeys(policy, ["mode"], path);
    return;
  }
  if (policy.mode !== "required") {
    invalid(`${path}.mode`, "must be none or required");
  }
  exactKeys(policy, ["mode", "approvals"], path);
  literal(policy.approvals, 2, `${path}.approvals`);
}

function validateImplementation(value: unknown, path: string): void {
  const implementation = record(value, path);
  exactKeys(implementation, ["kind", "binding"], path);
  literal(implementation.kind, "code", `${path}.kind`);
  text(implementation.binding, `${path}.binding`, 128, CODE_RE);
}

function validateAudit(value: unknown, path: string): void {
  const audit = record(value, path);
  exactKeys(
    audit,
    ["lifecycle", "arguments", "results", "contentStorage"],
    path,
  );
  literal(
    audit.lifecycle,
    "proposed_executing_terminal",
    `${path}.lifecycle`,
  );
  literal(audit.arguments, "sha256", `${path}.arguments`);
  literal(audit.results, "sha256", `${path}.results`);
  literal(audit.contentStorage, "forbidden", `${path}.contentStorage`);
}

function validateEvidence(
  value: unknown,
  dataAccessValue: unknown,
  path: string,
): void {
  const evidence = record(value, path);
  exactKeys(
    evidence,
    ["mode", "requireVersion", "requireChecksumForCode"],
    path,
  );
  oneOf(
    evidence.mode,
    ["code_source", "code_and_atlas_gateway"],
    `${path}.mode`,
  );
  literal(evidence.requireVersion, true, `${path}.requireVersion`);
  literal(
    evidence.requireChecksumForCode,
    true,
    `${path}.requireChecksumForCode`,
  );
  const dataAccess = record(dataAccessValue, "$.dataAccess");
  if (
    (dataAccess.mode === "none" && evidence.mode !== "code_source")
    || (
      dataAccess.mode === "atlas_gateway"
      && evidence.mode !== "code_and_atlas_gateway"
    )
  ) {
    invalid(path, "evidence mode must match the declared data access");
  }
}

function validateCodeSource(value: unknown, path: string): void {
  const source = record(value, path);
  exactKeys(
    source,
    ["kind", "sourceId", "sourceVersionId", "sourceChecksum"],
    path,
  );
  literal(source.kind, "code", `${path}.kind`);
  text(source.sourceId, `${path}.sourceId`, 160, CODE_RE);
  text(source.sourceVersionId, `${path}.sourceVersionId`, 64, VERSION_RE);
  text(source.sourceChecksum, `${path}.sourceChecksum`, 71, SHA256_RE);
}

function validateSchemaDefinition(
  value: unknown,
  path: string,
  depth: number,
): void {
  if (depth > MAX_SCHEMA_DEPTH) {
    invalid(path, "schema nesting is too deep");
  }
  const schema = record(value, path);
  const type = schema.type;
  if (type === "string") {
    exactKeys(
      schema,
      ["type", "description", "minLength", "maxLength", "enum"],
      path,
      ["type", "maxLength"],
    );
    optionalDescription(schema.description, `${path}.description`);
    integer(schema.maxLength, `${path}.maxLength`, 0, 100_000);
    if (schema.minLength !== undefined) {
      integer(schema.minLength, `${path}.minLength`, 0, schema.maxLength as number);
    }
    if (schema.enum !== undefined) {
      const values = stringArray(schema.enum, `${path}.enum`, 1, 128);
      unique(values, `${path}.enum`);
      for (const entry of values) {
        if ([...entry].length > (schema.maxLength as number)) {
          invalid(`${path}.enum`, "entry exceeds maxLength");
        }
      }
    }
    return;
  }
  if (type === "number" || type === "integer") {
    exactKeys(
      schema,
      ["type", "description", "minimum", "maximum", "enum"],
      path,
      ["type"],
    );
    optionalDescription(schema.description, `${path}.description`);
    if (schema.minimum !== undefined) finite(schema.minimum, `${path}.minimum`);
    if (schema.maximum !== undefined) finite(schema.maximum, `${path}.maximum`);
    if (
      typeof schema.minimum === "number"
      && typeof schema.maximum === "number"
      && schema.minimum > schema.maximum
    ) {
      invalid(path, "minimum cannot exceed maximum");
    }
    if (schema.enum !== undefined) {
      if (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.length > 128) {
        invalid(`${path}.enum`, "must be a non-empty bounded number array");
      }
      for (const entry of schema.enum) {
        finite(entry, `${path}.enum`);
        if (type === "integer" && !Number.isSafeInteger(entry)) {
          invalid(`${path}.enum`, "integer enums require safe integers");
        }
      }
      unique(schema.enum as readonly unknown[], `${path}.enum`);
    }
    return;
  }
  if (type === "boolean" || type === "null") {
    exactKeys(schema, ["type", "description"], path, ["type"]);
    optionalDescription(schema.description, `${path}.description`);
    return;
  }
  if (type === "array") {
    exactKeys(
      schema,
      ["type", "description", "items", "minItems", "maxItems"],
      path,
      ["type", "items", "maxItems"],
    );
    optionalDescription(schema.description, `${path}.description`);
    integer(schema.maxItems, `${path}.maxItems`, 0, 1_000);
    if (schema.minItems !== undefined) {
      integer(schema.minItems, `${path}.minItems`, 0, schema.maxItems as number);
    }
    validateSchemaDefinition(schema.items, `${path}.items`, depth + 1);
    return;
  }
  if (type === "object") {
    exactKeys(
      schema,
      [
        "type",
        "description",
        "properties",
        "required",
        "additionalProperties",
        "maxProperties",
      ],
      path,
      [
        "type",
        "properties",
        "required",
        "additionalProperties",
        "maxProperties",
      ],
    );
    optionalDescription(schema.description, `${path}.description`);
    literal(
      schema.additionalProperties,
      false,
      `${path}.additionalProperties`,
    );
    integer(schema.maxProperties, `${path}.maxProperties`, 0, 64);
    const properties = record(schema.properties, `${path}.properties`);
    const propertyNames = Object.keys(properties);
    if (propertyNames.length > 64) {
      invalid(`${path}.properties`, "too many schema properties");
    }
    for (const key of propertyNames) {
      text(key, `${path}.properties`, 64, PROPERTY_RE);
      if (FORBIDDEN_JSON_KEYS.has(key)) {
        invalid(`${path}.properties.${key}`, "property name is forbidden");
      }
      validateSchemaDefinition(
        properties[key],
        `${path}.properties.${key}`,
        depth + 1,
      );
    }
    const required = stringArray(
      schema.required,
      `${path}.required`,
      0,
      propertyNames.length,
    );
    unique(required, `${path}.required`);
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        invalid(`${path}.required`, "required key is not declared");
      }
    }
    if (required.length > (schema.maxProperties as number)) {
      invalid(path, "maxProperties cannot be lower than required keys");
    }
    return;
  }
  invalid(`${path}.type`, "unsupported JSON Schema type");
}

function validateValue(
  schema: AtlasJsonSchemaV1,
  value: AtlasJsonValue,
  path: string,
  issues: AtlasToolValidationIssue[],
): void {
  if (issues.length >= MAX_VALIDATION_ISSUES) return;
  if (schema.type === "string") {
    if (typeof value !== "string") return issue(issues, path, "type");
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      issue(issues, path, "minLength");
    }
    if (length > schema.maxLength) issue(issues, path, "maxLength");
    if (schema.enum && !schema.enum.includes(value)) {
      issue(issues, path, "enum");
    }
    return;
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number") return issue(issues, path, "type");
    if (schema.type === "integer" && !Number.isSafeInteger(value)) {
      issue(issues, path, "integer");
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      issue(issues, path, "minimum");
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issue(issues, path, "maximum");
    }
    if (schema.enum && !schema.enum.includes(value)) {
      issue(issues, path, "enum");
    }
    return;
  }
  if (schema.type === "boolean") {
    if (typeof value !== "boolean") issue(issues, path, "type");
    return;
  }
  if (schema.type === "null") {
    if (value !== null) issue(issues, path, "type");
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return issue(issues, path, "type");
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issue(issues, path, "minItems");
    }
    if (value.length > schema.maxItems) issue(issues, path, "maxItems");
    value.forEach((entry, index) => {
      validateValue(schema.items, entry, `${path}[${index}]`, issues);
    });
    return;
  }
  if (schema.type !== "object") return issue(issues, path, "type");
  if (!isJsonObject(value)) return issue(issues, path, "type");
  const keys = Object.keys(value);
  if (keys.length > schema.maxProperties) {
    issue(issues, path, "maxProperties");
  }
  for (const key of schema.required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      issue(issues, `${path}.${key}`, "required");
    }
  }
  for (const key of keys) {
    const propertySchema = schema.properties[key];
    if (!propertySchema) {
      issue(issues, `${path}.${key}`, "additionalProperties");
      continue;
    }
    validateValue(propertySchema, value[key]!, `${path}.${key}`, issues);
  }
}

function normalize(
  value: unknown,
  path: string,
  depth: number,
  state: { nodes: number },
  ancestors: Set<object>,
): AtlasJsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    throw new AtlasJsonValueError(path);
  }
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AtlasJsonValueError(path);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") throw new AtlasJsonValueError(path);
  if (ancestors.has(value)) throw new AtlasJsonValueError(path);
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value)
    && prototype !== Object.prototype
    && prototype !== null
  ) {
    throw new AtlasJsonValueError(path);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const output = value.map((entry, index) =>
        normalize(entry, `${path}[${index}]`, depth + 1, state, ancestors)
      );
      return Object.freeze(output);
    }
    const output: Record<string, AtlasJsonValue> = Object.create(null);
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_JSON_KEYS.has(key)) {
        throw new AtlasJsonValueError(`${path}.${key}`);
      }
      output[key] = normalize(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        depth + 1,
        state,
        ancestors,
      );
    }
    return Object.freeze(output);
  } finally {
    ancestors.delete(value);
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

function isJsonObject(
  value: AtlasJsonValue,
): value is Readonly<Record<string, AtlasJsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(
  issues: AtlasToolValidationIssue[],
  path: string,
  keyword: AtlasToolValidationIssue["keyword"],
): void {
  if (issues.length < MAX_VALIDATION_ISSUES) {
    issues.push(Object.freeze({ path, keyword }));
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    invalid(path, "must be a plain object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  required: readonly string[] = allowed,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) invalid(`${path}.${key}`, "unknown field");
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      invalid(`${path}.${key}`, "field is required");
    }
  }
}

function text(
  value: unknown,
  path: string,
  maxLength: number,
  pattern?: RegExp,
): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(value)
    || (pattern && !pattern.test(value))
  ) {
    invalid(path, "must be a bounded canonical string");
  }
}

function optionalDescription(value: unknown, path: string): void {
  if (value !== undefined) text(value, path, 500);
}

function literal<T>(
  value: unknown,
  expected: T,
  path: string,
): asserts value is T {
  if (value !== expected) invalid(path, `must equal ${String(expected)}`);
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
): asserts value is T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    invalid(path, "contains an unsupported value");
  }
}

function integer(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum
  ) {
    invalid(path, `must be an integer from ${minimum} to ${maximum}`);
  }
}

function finite(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(path, "must be a finite number");
  }
}

function stringArray(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): readonly string[] {
  if (
    !Array.isArray(value)
    || value.length < minimum
    || value.length > maximum
    || value.some((entry) => typeof entry !== "string")
  ) {
    invalid(path, "must be a bounded string array");
  }
  return value as string[];
}

function unique(values: readonly unknown[], path: string): void {
  if (new Set(values).size !== values.length) {
    invalid(path, "must not contain duplicates");
  }
}

function invalid(path: string, message: string): never {
  throw new AtlasToolManifestValidationError(path, message);
}
