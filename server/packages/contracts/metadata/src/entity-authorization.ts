/** Versioned policy references. Metadata never contains executable policy code. */
export const entityScopeResolvers = Object.freeze({
  "tenant.record.v1": [],
  "organization.record.v1": ["operatingOrganizationId"],
  "company.record.v1": ["companyCodeId"],
  "organization-company.record.v1": [
    "operatingOrganizationId",
    "companyCodeId",
  ],
  "workspace.record.v1": ["workspaceId"],
  "network.relationship.v1": ["networkRelationshipId"],
} as const);
export type EntityScopeResolverKey = keyof typeof entityScopeResolvers;
export type EntityScopeCoordinate =
  (typeof entityScopeResolvers)[EntityScopeResolverKey][number];
export type EntityAuthorizationPlane = "studio" | "neon" | "mesh";
export interface EntityAuthorizationOperationV1 {
  readonly key: string;
  readonly permissionCode: string;
  readonly scope: EntityScopeResolverKey;
  readonly target: "existing" | "proposed" | "collection";
  readonly effect: "read" | "write" | "reveal";
  readonly discoveryOperation?: string;
  readonly requiresParentRead: boolean;
  readonly requiresPreflight: boolean;
}
export interface EntityFieldPolicyV1 {
  readonly key: string;
  readonly fields: readonly string[];
  readonly readOperation: string;
  readonly representation: "plain" | "masked";
  readonly revealOperation?: string;
  readonly writeOperations: readonly string[];
  readonly queryUses: readonly (
    "search" | "filter" | "sort" | "group" | "export"
  )[];
}
export interface EntityAuthorizationProfileV1 {
  readonly schemaVersion: 1;
  readonly entityCode: string;
  readonly planeKey: EntityAuthorizationPlane;
  readonly ownership: EntityScopeResolverKey;
  readonly directory: {
    readonly operation: string;
    readonly population: "tenant" | "ownership";
  };
  readonly recordReadOperation: string;
  readonly operations: readonly EntityAuthorizationOperationV1[];
  /** Explicitly unavailable operations; never eligible for compatibility fallback. */
  readonly deferredOperations?: readonly string[];
  readonly fieldPolicies: readonly EntityFieldPolicyV1[];
  readonly surfaces: readonly {
    readonly key: string;
    readonly level: "application" | "workspace" | "tab" | "section";
    readonly operation: string;
  }[];
  readonly relationships: readonly {
    readonly key: string;
    readonly targetEntity: string;
    readonly ownership: "inherited" | "independent";
    readonly readOperation: string;
  }[];
}
export interface EntityAuthorizationReferences {
  readonly entityCode: string;
  readonly planeKey?: string;
  readonly fields: readonly string[];
  readonly operations: Readonly<
    Record<string, { readonly permissionCode: string }>
  >;
}

const identifier = /^[a-z][a-z0-9_.-]{0,159}$/;
function object(
  raw: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  )
    throw new TypeError("Invalid authorization object");
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new TypeError("Unknown authorization property");
  return value;
}
function name(value: unknown): string {
  if (typeof value !== "string" || !identifier.test(value))
    throw new TypeError("Invalid authorization reference");
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new TypeError("Unsupported authorization value");
  return value as T;
}
function list<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || value.length > 512)
    throw new TypeError("Invalid authorization array");
  return Object.freeze(value.map(parse));
}
function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length)
    throw new TypeError("Duplicate authorization reference");
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new TypeError("Authorization boolean required");
  return value;
}
function resolver(value: unknown): EntityScopeResolverKey {
  return choice(
    value,
    Object.keys(entityScopeResolvers) as EntityScopeResolverKey[],
  );
}

/** Strict at authoring and runtime boundaries, including complete root-field coverage. */
export function parseEntityAuthorizationProfile(
  raw: unknown,
  references?: EntityAuthorizationReferences,
): EntityAuthorizationProfileV1 {
  const value = object(raw, [
    "schemaVersion",
    "entityCode",
    "planeKey",
    "ownership",
    "directory",
    "recordReadOperation",
    "operations",
    "deferredOperations",
    "fieldPolicies",
    "surfaces",
    "relationships",
  ]);
  if (value.schemaVersion !== 1)
    throw new TypeError("Unsupported entity authorization version");
  const operations = list(value.operations, (raw) => {
    const item = object(raw, [
      "key",
      "permissionCode",
      "scope",
      "target",
      "effect",
      "discoveryOperation",
      "requiresParentRead",
      "requiresPreflight",
    ]);
    return Object.freeze({
      key: name(item.key),
      permissionCode: name(item.permissionCode),
      scope: resolver(item.scope),
      target: choice(item.target, [
        "existing",
        "proposed",
        "collection",
      ] as const),
      effect: choice(item.effect, ["read", "write", "reveal"] as const),
      ...(item.discoveryOperation === undefined
        ? {}
        : { discoveryOperation: name(item.discoveryOperation) }),
      requiresParentRead: flag(item.requiresParentRead),
      requiresPreflight: flag(item.requiresPreflight),
    });
  });
  unique(operations.map((item) => item.key));
  if (!operations.length)
    throw new TypeError("Authorization operations required");
  const operation = (key: string, effect?: string) => {
    const found = operations.find((item) => item.key === key);
    if (!found || (effect && found.effect !== effect))
      throw new TypeError("Unresolved authorization operation or effect");
    return found;
  };
  const directoryValue = object(value.directory, ["operation", "population"]);
  const directory = Object.freeze({
    operation: name(directoryValue.operation),
    population: choice(directoryValue.population, [
      "tenant",
      "ownership",
    ] as const),
  });
  if (operation(directory.operation, "read").target !== "collection")
    throw new TypeError("Directory operation must target collection");
  if (
    directory.population === "tenant" &&
    operation(directory.operation).scope !== "tenant.record.v1"
  )
    throw new TypeError("Tenant directory requires explicit tenant scope");
  const recordReadOperation = name(value.recordReadOperation);
  if (operation(recordReadOperation, "read").target !== "existing")
    throw new TypeError("Record read must target existing resource");
  const ownership = resolver(value.ownership);
  if (operation(recordReadOperation).scope !== ownership)
    throw new TypeError("Record read must use ownership scope");
  for (const item of operations) {
    if (item.discoveryOperation) {
      const discovery = operation(item.discoveryOperation, "read");
      if (
        discovery.discoveryOperation ||
        discovery.requiresParentRead ||
        discovery.requiresPreflight ||
        discovery.scope !== "tenant.record.v1"
      )
        throw new TypeError(
          "Discovery requires a terminal explicit tenant admission operation",
        );
    }
    if (item.key === recordReadOperation && item.requiresParentRead)
      throw new TypeError("Recursive parent admission");
    if (item.target === "collection" && item.effect !== "read")
      throw new TypeError("Mutation requires explicit targets");
  }
  const fieldPolicies = list(value.fieldPolicies, (raw) => {
    const item = object(raw, [
      "key",
      "fields",
      "readOperation",
      "representation",
      "revealOperation",
      "writeOperations",
      "queryUses",
    ]);
    const fields = list(item.fields, name),
      writeOperations = list(item.writeOperations, name);
    if (!fields.length) throw new TypeError("Empty field policy");
    unique(fields);
    unique(writeOperations);
    const readOperation = name(item.readOperation);
    operation(readOperation, "read");
    const representation = choice(item.representation, [
      "plain",
      "masked",
    ] as const);
    const revealOperation =
      item.revealOperation === undefined
        ? undefined
        : name(item.revealOperation);
    if (revealOperation) operation(revealOperation, "reveal");
    for (const key of writeOperations) operation(key, "write");
    const queryUses = list(item.queryUses, (raw) =>
      choice(raw, ["search", "filter", "sort", "group", "export"] as const),
    );
    unique(queryUses);
    if (representation === "masked" && queryUses.length)
      throw new TypeError(
        "Masked raw fields cannot participate in queries; publish a safe projection field",
      );
    return Object.freeze({
      key: name(item.key),
      fields,
      readOperation,
      representation,
      ...(revealOperation ? { revealOperation } : {}),
      writeOperations,
      queryUses,
    });
  });
  unique(fieldPolicies.map((item) => item.key));
  const covered = fieldPolicies.flatMap((item) => [...item.fields]);
  unique(covered);
  const surfaces = list(value.surfaces, (raw) => {
    const item = object(raw, ["key", "level", "operation"]),
      key = name(item.operation);
    operation(key);
    return Object.freeze({
      key: name(item.key),
      level: choice(item.level, [
        "application",
        "workspace",
        "tab",
        "section",
      ] as const),
      operation: key,
    });
  });
  unique(surfaces.map((item) => item.key));
  const relationships = list(value.relationships, (raw) => {
    const item = object(raw, [
        "key",
        "targetEntity",
        "ownership",
        "readOperation",
      ]),
      readOperation = name(item.readOperation);
    operation(readOperation, "read");
    return Object.freeze({
      key: name(item.key),
      targetEntity: name(item.targetEntity),
      ownership: choice(item.ownership, ["inherited", "independent"] as const),
      readOperation,
    });
  });
  unique(relationships.map((item) => item.key));
  const deferredOperations = value.deferredOperations === undefined
    ? undefined
    : list(value.deferredOperations, name);
  if (deferredOperations) {
    unique(deferredOperations);
    if (deferredOperations.some((key) => operations.some((op) => op.key === key)))
      throw new TypeError("Deferred operation has an executable binding");
  }
  const result: EntityAuthorizationProfileV1 = Object.freeze({
    schemaVersion: 1,
    entityCode: name(value.entityCode),
    planeKey: choice(value.planeKey, ["studio", "neon", "mesh"] as const),
    ownership,
    directory,
    recordReadOperation,
    operations,
    ...(deferredOperations ? { deferredOperations } : {}),
    fieldPolicies,
    surfaces,
    relationships,
  });
  if (references) {
    if (
      result.entityCode !== references.entityCode ||
      (references.planeKey && result.planeKey !== references.planeKey)
    )
      throw new TypeError("Authorization coordinate mismatch");
    if (
      references.fields.length !== covered.length ||
      references.fields.some((field) => !covered.includes(field))
    )
      throw new TypeError("Incomplete authorization field coverage");
    for (const item of operations)
      if (
        references.operations[item.key]?.permissionCode !== item.permissionCode
      )
        throw new TypeError("Authorization permission binding mismatch");
    if (
      Object.keys(references.operations).some(
        (key) => !operations.some((item) => item.key === key),
      )
    )
      throw new TypeError("Incomplete authorization operation coverage");
  }
  return result;
}
