/** Immutable resource coordinates. Installed verification, revocation and local
 * activation belong to the publication/authorization owners, not to this DTO. */
export interface EntityResourcePinV1 {
  readonly owner: string;
  readonly namespace: string;
  readonly key: string;
  readonly version: number;
  readonly hash: string;
}
export interface EntitySourceIdentityV1 {
  readonly entityId: string;
  readonly releaseId: string;
  readonly contractHash: string;
  readonly tenantId: string | null;
}
export type EntityPermissionRequirementV1 =
  | { readonly state: "none" }
  | {
      readonly state: "defined";
      readonly plane: "studio" | "neon" | "mesh";
      readonly code: string;
      readonly kind: string;
      readonly catalogue: EntityResourcePinV1;
    };
export type EntityReadUseV1 =
  "read" | "search" | "filter" | "sort" | "group" | "export" | "condition";
export interface EntitySecurityManifestV1 {
  readonly schema: "entity.effective-security-manifest/1";
  readonly entityCode: string;
  readonly source: EntitySourceIdentityV1;
  readonly plane: "studio" | "neon" | "mesh";
  /** v1 deliberately supports the existing tenant-record reader only. */
  readonly scope: {
    readonly contract: "tenant.record.v1";
    readonly tenantId: string;
  };
  readonly operations: readonly {
    readonly identityId: string;
    readonly semanticHash: string;
    readonly key: string;
    readonly target: "collection" | "existing";
    readonly requirement: EntityPermissionRequirementV1;
  }[];
  readonly fields: readonly {
    readonly identityId: string;
    readonly semanticHash: string;
    readonly key: string;
    readonly readOperationId: string;
    readonly representation: "plain" | "masked" | "omitted";
    readonly mask: EntityResourcePinV1 | null;
    readonly queryUses: readonly Exclude<EntityReadUseV1, "read">[];
  }[];
  /** Existing controls that the bounded adapter cannot compose block use.
   * This is never a way to discard controls from the source manifest. */
  readonly unsupportedControls: readonly string[];
}
export interface EntityStorageAuthorityV1 {
  readonly schema: "entity.storage-authority/1";
  readonly source: EntitySourceIdentityV1;
  readonly plane: "studio" | "neon" | "mesh";
  readonly tenantId: string;
  readonly storage: {
    readonly schema: string;
    readonly object: string;
    readonly provider: EntityResourcePinV1;
  };
  readonly owners: readonly {
    readonly source: EntitySourceIdentityV1;
    readonly security: EntityResourcePinV1;
    readonly readOperationId: string;
    /** Every output field maps to its contributing stable owner identity.
     * An owner without selected fields still constrains record admission. */
    readonly fields: readonly {
      readonly fieldIdentityId: string;
      readonly ownerFieldIdentityId: string;
    }[];
  }[];
}
/** Pin in compiled metadata, not a caller-selected authority. Readers without
 * this contract continue through their existing version-specific admission. */
export interface EntityLiveReadContractV1 {
  readonly schema: "entity.live-read/1";
  readonly source: EntitySourceIdentityV1;
  readonly security: EntityResourcePinV1;
  readonly storageAuthority: EntityResourcePinV1;
}
export type EntityLiveReadDiagnostic =
  "blocked_dependency" | "rebind_required" | "denied";
export type EntityEffectiveReadResultV1 =
  | { readonly state: EntityLiveReadDiagnostic; readonly code: string }
  | {
      readonly state: "resolved";
      readonly generation: string;
      readonly dependencies: readonly EntityResourcePinV1[];
      readonly fields: readonly {
        readonly key: string;
        readonly identityId: string;
        readonly representation: "plain" | "masked";
        readonly mask: EntityResourcePinV1 | null;
      }[];
    };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
const planes = ["studio", "neon", "mesh"] as const;
function invalid(): never {
  throw new TypeError("ENTITY_LIVE_READ_CONTRACT_INVALID");
}
function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return invalid();
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    return invalid();
  return row;
}
function text(value: unknown, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 256 ||
    (pattern && !pattern.test(value))
  )
    return invalid();
  return value;
}
function choice(value: unknown, choices: readonly string[]): string {
  if (typeof value !== "string" || !choices.includes(value)) return invalid();
  return value;
}
function rows(value: unknown, maximum = 512): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return invalid();
  return value;
}
function distinct(values: readonly unknown[]): void {
  if (new Set(values).size !== values.length) invalid();
}
export function validateEntityResourcePinV1(
  value: unknown,
): asserts value is EntityResourcePinV1 {
  const row = object(value, ["owner", "namespace", "key", "version", "hash"]);
  text(row.owner);
  text(row.namespace);
  text(row.key);
  text(row.hash, hash);
  if (!Number.isSafeInteger(row.version) || Number(row.version) < 1) invalid();
}
function source(value: unknown): void {
  const row = object(value, [
    "entityId",
    "releaseId",
    "contractHash",
    "tenantId",
  ]);
  text(row.entityId, uuid);
  text(row.releaseId, uuid);
  text(row.contractHash, hash);
  if (row.tenantId !== null) text(row.tenantId, uuid);
}
function requirement(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Reflect.get(value, "state") === "none") {
    object(value, ["state"]);
    return;
  }
  const row = object(value, ["state", "plane", "code", "kind", "catalogue"]);
  choice(row.state, ["defined"]);
  choice(row.plane, planes);
  text(row.code);
  text(row.kind);
  validateEntityResourcePinV1(row.catalogue);
}
export function validateEntityLiveReadContractV1(
  value: unknown,
): asserts value is EntityLiveReadContractV1 {
  const row = object(value, [
    "schema",
    "source",
    "security",
    "storageAuthority",
  ]);
  choice(row.schema, ["entity.live-read/1"]);
  source(row.source);
  validateEntityResourcePinV1(row.security);
  validateEntityResourcePinV1(row.storageAuthority);
}
export function validateEntitySecurityManifestV1(
  value: unknown,
): asserts value is EntitySecurityManifestV1 {
  const row = object(value, [
    "schema",
    "entityCode",
    "source",
    "plane",
    "scope",
    "operations",
    "fields",
    "unsupportedControls",
  ]);
  choice(row.schema, ["entity.effective-security-manifest/1"]);
  text(row.entityCode);
  source(row.source);
  choice(row.plane, planes);
  const scope = object(row.scope, ["contract", "tenantId"]);
  choice(scope.contract, ["tenant.record.v1"]);
  text(scope.tenantId, uuid);
  const operations = rows(row.operations).map((value) => {
    const operation = object(value, [
      "identityId",
      "semanticHash",
      "key",
      "target",
      "requirement",
    ]);
    text(operation.identityId, uuid);
    text(operation.semanticHash, hash);
    text(operation.key);
    choice(operation.target, ["collection", "existing"]);
    requirement(operation.requirement);
    if (
      Reflect.get(operation.requirement as object, "state") === "defined" &&
      Reflect.get(operation.requirement as object, "plane") !== row.plane
    )
      invalid();
    return operation;
  });
  distinct(operations.map((row) => row.identityId));
  distinct(operations.map((row) => row.key));
  const fields = rows(row.fields).map((value) => {
    const field = object(value, [
      "identityId",
      "semanticHash",
      "key",
      "readOperationId",
      "representation",
      "mask",
      "queryUses",
    ]);
    text(field.identityId, uuid);
    text(field.semanticHash, hash);
    text(field.key);
    text(field.readOperationId, uuid);
    if (!operations.some((row) => row.identityId === field.readOperationId))
      invalid();
    choice(field.representation, ["plain", "masked", "omitted"]);
    if (field.representation === "masked")
      validateEntityResourcePinV1(field.mask);
    else if (field.mask !== null) invalid();
    const uses = rows(field.queryUses, 6).map((value) =>
      choice(value, [
        "search",
        "filter",
        "sort",
        "group",
        "export",
        "condition",
      ]),
    );
    distinct(uses);
    if (field.representation === "omitted" && uses.length) invalid();
    return field;
  });
  distinct(fields.map((row) => row.identityId));
  distinct(fields.map((row) => row.key));
  const controls = rows(row.unsupportedControls, 64).map((value) =>
    text(value),
  );
  distinct(controls);
}
export function validateEntityStorageAuthorityV1(
  value: unknown,
): asserts value is EntityStorageAuthorityV1 {
  const row = object(value, [
    "schema",
    "source",
    "plane",
    "tenantId",
    "storage",
    "owners",
  ]);
  choice(row.schema, ["entity.storage-authority/1"]);
  source(row.source);
  choice(row.plane, planes);
  text(row.tenantId, uuid);
  const storage = object(row.storage, ["schema", "object", "provider"]);
  text(storage.schema);
  text(storage.object);
  validateEntityResourcePinV1(storage.provider);
  const owners = rows(row.owners, 64).map((value) => {
    const owner = object(value, [
      "source",
      "security",
      "readOperationId",
      "fields",
    ]);
    source(owner.source);
    validateEntityResourcePinV1(owner.security);
    text(owner.readOperationId, uuid);
    const fields = rows(owner.fields).map((value) => {
      const mapping = object(value, [
        "fieldIdentityId",
        "ownerFieldIdentityId",
      ]);
      text(mapping.fieldIdentityId, uuid);
      text(mapping.ownerFieldIdentityId, uuid);
      return mapping;
    });
    distinct(fields.map((row) => row.fieldIdentityId));
    return owner;
  });
  if (!owners.length) invalid();
  distinct(owners.map((owner) => JSON.stringify(owner.source)));
}
