import {
  FoundationContractError,
  validateNativeOperation,
  validateReferenceMember,
  validateFoundationNode,
  referenceUuid,
  type NativeOperationRow,
  type ReferenceMember,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
  type EntityAuthorizationProfileV1,
  type EntityAuthorizationRuntimeV1,
} from "@athyper/server-contract-metadata";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type { NativeConversionResource } from "./native-graph-conversion.js";
export interface NativeAuthorizationGraph {
  readonly profiles: readonly ReferenceMember<"authorizationProfile">[];
  readonly fields: readonly ReferenceMember<"fieldAccess">[];
  readonly operations: readonly NativeOperationRow[];
}
/** Installed composition resolves these rosters. None is an author-supplied
 * authorization grant or an attestation of a human review/deployment. */
export interface NativeAuthorizationContext {
  readonly entityCode: string;
  readonly changeSetId: string;
  readonly plane: "studio" | "neon" | "mesh";
  readonly maximumMembers: number;
  readonly fields: readonly { id: string; key: string }[];
  readonly permissions: readonly {
    operationId: string;
    plane: "studio" | "neon" | "mesh";
    state: "none" | "defined";
    permissionCode: string | null;
  }[];
  readonly scopes: readonly {
    operationId: string;
    plane: "studio" | "neon" | "mesh";
    resolverKey: string;
    resolverVersion: number;
  }[];
  readonly resolvers: readonly {
    key: string;
    version: number;
    runtimeKey: string;
    resource: NativeConversionResource;
  }[];
  readonly handlers: readonly {
    key: string;
    version: number;
    runtimeKey: string;
    requiresPreflight: boolean;
    targets: readonly string[];
    effects: readonly string[];
    operationKinds: readonly string[];
    resource: NativeConversionResource;
  }[];
  readonly preflights: readonly {
    key: string;
    version: number;
    runtimeKey: string;
    resource: NativeConversionResource;
  }[];
}
/** Source shape is a migration-inverse projection only. Normal compilation
 * emits one policy per field; original group keys/order are not security inputs. */
export interface NativeAuthorizationShape {
  readonly operationIds: readonly string[];
  readonly policies: readonly {
    key: string;
    fieldIds: readonly string[];
    queryUses: readonly string[];
  }[];
  readonly runtimeOperationIds: readonly string[];
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function member<K extends "authorizationProfile" | "fieldAccess">(
  kind: K,
  row: ReferenceMember<K>,
) {
  validateFoundationNode(referenceUuid, row.id, "/" + kind + "/id");
  const { id: _, ...properties } = row;
  validateReferenceMember(kind, properties);
}
function checked(g: NativeAuthorizationGraph, c: NativeAuthorizationContext) {
  validateConversionJsonData(g, "/authorization");
  validateConversionJsonData(c, "/context");
  if (
    !g ||
    Object.keys(g).sort().join() !== "fields,operations,profiles" ||
    !Array.isArray(g.profiles) ||
    !Array.isArray(g.fields) ||
    !Array.isArray(g.operations)
  )
    fail("NATIVE_AUTHORIZATION_INVENTORY_INVALID", "/authorization");
  validateFoundationNode(referenceUuid, c.changeSetId, "/context/changeSetId");
  const ids = [...g.profiles, ...g.fields, ...g.operations].map((r) => r.id);
  if (
    !Number.isSafeInteger(c.maximumMembers) ||
    c.maximumMembers < 1 ||
    ids.length > c.maximumMembers ||
    new Set(ids).size !== ids.length
  )
    fail("NATIVE_AUTHORIZATION_INVENTORY_INVALID", "/authorization");
  if (
    new Set(c.fields.map((f) => f.id)).size !== c.fields.length ||
    new Set(c.fields.map((f) => f.key)).size !== c.fields.length ||
    new Set(g.operations.map((o) => o.operationKey)).size !==
      g.operations.length
  )
    fail("NATIVE_AUTHORIZATION_INVENTORY_INVALID", "/context");
  for (const r of g.profiles) member("authorizationProfile", r);
  for (const r of g.fields) member("fieldAccess", r);
  for (const r of g.operations) validateNativeOperation(r, true);
  const profiles = g.profiles.filter((p) => p.targetPlane === c.plane);
  if (profiles.length !== 1)
    fail("NATIVE_AUTHORIZATION_PROFILE_REQUIRED", "/authorization/profiles");
  const profile = profiles[0]!;
  // These settings need newer runtime contracts; do not erase them during V1 lowering.
  if (
    profile.directoryPopulation !== "tenant" ||
    [
      profile.ownerFieldId,
      profile.createdByFieldId,
      profile.updatedByFieldId,
      profile.administerPermissionCode,
      profile.administerPermissionKind,
    ].some((x) => x !== null)
  )
    fail(
      "NATIVE_AUTHORIZATION_PROFILE_RUNTIME_UNSUPPORTED",
      "/authorization/profiles",
    );
  const fieldRows = g.fields.filter((f) => f.targetPlane === c.plane);
  if (
    fieldRows.length !== c.fields.length ||
    new Set(fieldRows.map((f) => f.entityFieldId)).size !== fieldRows.length ||
    fieldRows.some((f) => !c.fields.some((d) => d.id === f.entityFieldId))
  )
    fail(
      "NATIVE_AUTHORIZATION_FIELD_COVERAGE_INVALID",
      "/authorization/fields",
    );
  for (const f of fieldRows) {
    if (f.representation === "omitted" || f.queryUses.includes("condition"))
      fail(
        "NATIVE_AUTHORIZATION_FIELD_RUNTIME_UNSUPPORTED",
        "/authorization/fields/" + f.id,
      );
    if (
      f.readOperationId === null ||
      f.readOperationChangeSetId !== c.changeSetId ||
      new Set(f.queryUses).size !== f.queryUses.length
    )
      fail(
        "NATIVE_AUTHORIZATION_FIELD_SCOPE_INVALID",
        "/authorization/fields/" + f.id,
      );
  }
  const operation = (id: string) =>
    g.operations.find((o) => o.id === id) ??
    fail(
      "NATIVE_AUTHORIZATION_OPERATION_INVALID",
      "/authorization/operations/" + id,
    );
  const resolver = (key: string, version: number) => {
    const matches = c.resolvers.filter(
      (r) => r.key === key && r.version === version,
    );
    if (matches.length !== 1)
      return fail(
        "NATIVE_AUTHORIZATION_RESOLVER_UNAVAILABLE",
        "/authorization/resolver",
      );
    return matches[0]!;
  };
  for (const resource of [...c.resolvers, ...c.handlers, ...c.preflights]) {
    if (
      !resource.resource.owner ||
      !resource.resource.key ||
      !Number.isSafeInteger(resource.resource.version) ||
      resource.resource.version < 1 ||
      !/^[a-f0-9]{64}$/.test(resource.resource.hash) ||
      !resource.key ||
      !Number.isSafeInteger(resource.version) ||
      resource.version < 1
    )
      fail("NATIVE_AUTHORIZATION_RESOURCE_INVALID", "/context/resources");
  }
  for (const row of c.permissions) {
    if (
      row.plane === c.plane &&
      !g.operations.some((o) => o.id === row.operationId)
    )
      fail("NATIVE_AUTHORIZATION_PERMISSION_INVALID", "/context/permissions");
  }
  for (const row of c.scopes) {
    if (
      row.plane === c.plane &&
      !g.operations.some((o) => o.id === row.operationId)
    )
      fail("NATIVE_AUTHORIZATION_SCOPE_INVALID", "/context/scopes");
  }
  return { profile, fieldRows, operation, resolver };
}
function select<T extends { id: string }>(
  rows: readonly T[],
  ids: readonly string[] | undefined,
  path: string,
): T[] {
  if (!ids) return [...rows].sort((a, b) => a.id.localeCompare(b.id));
  if (ids.length !== rows.length || new Set(ids).size !== ids.length)
    return fail("NATIVE_AUTHORIZATION_PROJECTION_INVALID", path);
  return ids.map(
    (id) =>
      rows.find((r) => r.id === id) ??
      fail("NATIVE_AUTHORIZATION_PROJECTION_INVALID", path),
  );
}
export function compileNativeAuthorization(
  g: NativeAuthorizationGraph,
  c: NativeAuthorizationContext,
  shape?: NativeAuthorizationShape,
): {
  profile: EntityAuthorizationProfileV1;
  runtime: EntityAuthorizationRuntimeV1;
} {
  const { profile: p, fieldRows, operation, resolver } = checked(g, c);
  const operationRows = select(
    g.operations,
    shape?.operationIds,
    "/projection/operations",
  );
  const policies =
    shape?.policies ??
    [...c.fields]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((f) => ({
        key: f.key,
        fieldIds: [f.id],
        queryUses: fieldRows.find((r) => r.entityFieldId === f.id)!.queryUses,
      }));
  const covered = policies.flatMap((p) => [...p.fieldIds]);
  if (
    covered.length !== fieldRows.length ||
    new Set(covered).size !== covered.length ||
    new Set(policies.map((p) => p.key)).size !== policies.length
  )
    fail("NATIVE_AUTHORIZATION_PROJECTION_INVALID", "/projection/policies");
  const policyOperations = operationRows.map((o) => {
    if (
      o.authorizationTarget === "new" ||
      o.authorizationEffect !== "read" ||
      o.operationKind !== "read"
    )
      return fail(
        "NATIVE_AUTHORIZATION_OPERATION_RUNTIME_UNSUPPORTED",
        "/authorization/operations/" + o.id,
      );
    const scope = c.scopes.filter(
        (s) => s.operationId === o.id && s.plane === c.plane,
      ),
      permissions = c.permissions.filter(
        (p) => p.operationId === o.id && p.plane === c.plane,
      );
    if (
      permissions.length !== 1 ||
      (permissions[0]!.state !== "none" &&
        permissions[0]!.state !== "defined") ||
      (permissions[0]!.state === "none"
        ? permissions[0]!.permissionCode !== null
        : typeof permissions[0]!.permissionCode !== "string" ||
          !permissions[0]!.permissionCode)
    )
      fail(
        "NATIVE_AUTHORIZATION_PERMISSION_STATE_UNAVAILABLE",
        "/authorization/operations/" + o.id,
      );
    if (scope.length !== 1)
      fail(
        "NATIVE_AUTHORIZATION_SCOPE_INVALID",
        "/authorization/operations/" + o.id,
      );
    return {
      key: o.operationKey,
      ...(permissions[0]!.state === "defined"
        ? { permissionCode: permissions[0]!.permissionCode! }
        : {}),
      scope: resolver(scope[0]!.resolverKey, scope[0]!.resolverVersion)
        .runtimeKey,
      target: o.authorizationTarget,
      effect: o.authorizationEffect,
      requiresParentRead: o.requiresParentRead,
      requiresPreflight: o.requiresPreflight!,
    };
  });
  const profile = parseEntityAuthorizationProfile(
    {
      schemaVersion: 1,
      entityCode: c.entityCode,
      planeKey: c.plane,
      ownership: resolver(p.ownershipResolverKey, p.ownershipResolverVersion)
        .runtimeKey,
      directory: {
        operation: operation(p.directoryOperationId).operationKey,
        population: p.directoryPopulation,
      },
      recordReadOperation: operation(p.recordReadOperationId).operationKey,
      operations: policyOperations,
      fieldPolicies: policies.map((group) => {
        if (!group.fieldIds.length)
          fail(
            "NATIVE_AUTHORIZATION_PROJECTION_INVALID",
            "/projection/policies",
          );
        const rows = group.fieldIds.map(
          (id) =>
            fieldRows.find((r) => r.entityFieldId === id) ??
            fail(
              "NATIVE_AUTHORIZATION_PROJECTION_INVALID",
              "/projection/policies",
            ),
        );
        const r = rows[0]!;
        if (
          new Set(group.queryUses).size !== group.queryUses.length ||
          canonicalJson([...group.queryUses].sort()) !==
            canonicalJson([...r.queryUses].sort()) ||
          rows.some(
            (row) =>
              row.readOperationId !== r.readOperationId ||
              row.representation !== r.representation ||
              canonicalJson([...row.queryUses].sort()) !==
                canonicalJson([...r.queryUses].sort()),
          )
        )
          fail(
            "NATIVE_AUTHORIZATION_POLICY_NOT_REPRESENTABLE",
            "/projection/policies",
          );
        return {
          key: group.key,
          fields: group.fieldIds.map(
            (id) => c.fields.find((f) => f.id === id)!.key,
          ),
          readOperation: operation(r.readOperationId!).operationKey,
          representation: r.representation,
          writeOperations: [],
          queryUses: [...group.queryUses],
        };
      }),
      surfaces: [],
      relationships: [],
    },
    {
      entityCode: c.entityCode,
      planeKey: c.plane,
      fields: c.fields.map((f) => f.key),
      operations: Object.fromEntries(
        policyOperations.map((o) => [
          o.key,
          o.permissionCode ? { permissionCode: o.permissionCode } : {},
        ]),
      ),
    },
  );
  const bindingRows = select(
    g.operations,
    shape?.runtimeOperationIds,
    "/projection/runtime",
  );
  const runtime = parseEntityAuthorizationRuntime(
    {
      schemaVersion: 1,
      runtimeVersion: "entity-authorization.v1",
      bindings: bindingRows.map((o) => {
        const handlers = c.handlers.filter(
            (h) => h.key === o.handlerKey && h.version === o.handlerVersion,
          ),
          scopes = c.scopes.filter(
            (s) => s.operationId === o.id && s.plane === c.plane,
          );
        if (handlers.length !== 1)
          fail(
            "NATIVE_AUTHORIZATION_HANDLER_UNAVAILABLE",
            "/authorization/operations/" + o.id,
          );
        const h = handlers[0]!;
        if (
          h.requiresPreflight !== o.requiresPreflight ||
          !h.targets.includes(o.authorizationTarget) ||
          !h.effects.includes(o.authorizationEffect) ||
          !h.operationKinds.includes(o.operationKind)
        )
          fail(
            "NATIVE_AUTHORIZATION_HANDLER_MISMATCH",
            "/authorization/operations/" + o.id,
          );
        const preflight = o.requiresPreflight
          ? c.preflights.filter(
              (p) =>
                p.key === o.preflightKey && p.version === o.preflightVersion,
            )
          : [];
        if (o.requiresPreflight && preflight.length !== 1)
          fail(
            "NATIVE_AUTHORIZATION_PREFLIGHT_UNAVAILABLE",
            "/authorization/operations/" + o.id,
          );
        return {
          operation: o.operationKey,
          handler: h.runtimeKey,
          resolver: resolver(scopes[0]!.resolverKey, scopes[0]!.resolverVersion)
            .runtimeKey,
          ...(o.requiresPreflight
            ? { preflight: preflight[0]!.runtimeKey }
            : {}),
        };
      }),
    },
    profile,
  );
  if (runtime.schemaVersion !== 1)
    return fail("NATIVE_AUTHORIZATION_RUNTIME_UNSUPPORTED", "/runtime");
  return { profile, runtime };
}
export function convertLegacyAuthorization(
  profileSource: unknown,
  runtimeSource: unknown,
  c: NativeAuthorizationContext,
  operations: readonly NativeOperationRow[],
  identities: {
    readonly profileId: string;
    readonly fieldIds: Readonly<Record<string, string>>;
  },
  sourceHash: string,
): {
  graph: NativeAuthorizationGraph;
  shape: NativeAuthorizationShape;
  proof: {
    readonly schema: "entity.native-authorization-conversion/1";
    readonly sourceHash: string;
    readonly graphHash: string;
    readonly contextHash: string;
    readonly shapeHash: string;
  };
} {
  if (sha256({ profile: profileSource, runtime: runtimeSource }) !== sourceHash)
    fail("NATIVE_AUTHORIZATION_SOURCE_HASH_MISMATCH", "/authorization");
  const p = parseEntityAuthorizationProfile(profileSource),
    runtime = parseEntityAuthorizationRuntime(runtimeSource, p);
  if (
    runtime.schemaVersion !== 1 ||
    p.surfaces.length ||
    p.relationships.length ||
    p.deferredOperations !== undefined ||
    p.fieldPolicies.some(
      (f) =>
        f.writeOperations.length ||
        f.revealOperation !== undefined ||
        f.queryUses.includes("export"),
    ) ||
    p.operations.some((o) => o.discoveryOperation !== undefined) ||
    p.entityCode !== c.entityCode ||
    p.planeKey !== c.plane
  )
    fail("NATIVE_AUTHORIZATION_LEGACY_PATH_UNSUPPORTED", "/authorization");
  if (p.directory.population !== "tenant")
    fail(
      "NATIVE_AUTHORIZATION_LEGACY_PATH_UNSUPPORTED",
      "/authorization/directory",
    );
  if (
    canonicalJson(Object.keys(identities.fieldIds).sort()) !==
    canonicalJson(c.fields.map((f) => f.key).sort())
  )
    fail(
      "NATIVE_AUTHORIZATION_IDENTITY_INVENTORY_INVALID",
      "/authorization/identities",
    );
  const op = (key: string) =>
    operations.find((o) => o.operationKey === key) ??
    fail(
      "NATIVE_AUTHORIZATION_OPERATION_INVALID",
      "/authorization/operations/" + key,
    );
  const ownership = c.resolvers.filter((r) => r.runtimeKey === p.ownership);
  if (ownership.length !== 1)
    fail(
      "NATIVE_AUTHORIZATION_RESOLVER_UNAVAILABLE",
      "/authorization/ownership",
    );
  const graph: NativeAuthorizationGraph = {
    profiles: [
      {
        id: identities.profileId,
        targetPlane: c.plane,
        ownershipResolverKey: ownership[0]!.key,
        ownershipResolverVersion: ownership[0]!.version,
        recordReadOperationId: op(p.recordReadOperation).id,
        directoryOperationId: op(p.directory.operation).id,
        directoryPopulation: "tenant",
        ownerFieldId: null,
        createdByFieldId: null,
        updatedByFieldId: null,
        administerPermissionCode: null,
        administerPermissionKind: null,
      },
    ],
    operations: structuredClone(operations),
    fields: c.fields.map((f) => {
      const policy = p.fieldPolicies.find((policy) =>
        policy.fields.includes(f.key),
      );
      if (!policy)
        return fail(
          "NATIVE_AUTHORIZATION_FIELD_COVERAGE_INVALID",
          "/authorization/fields/" + f.key,
        );
      return {
        id: identities.fieldIds[f.key]!,
        entityFieldId: f.id,
        targetPlane: c.plane,
        readOperationId: op(policy.readOperation).id,
        representation: policy.representation,
        queryUses: [
          ...policy.queryUses,
        ] as ReferenceMember<"fieldAccess">["queryUses"],
        readOperationChangeSetId: c.changeSetId,
      };
    }),
  };
  const shape: NativeAuthorizationShape = {
    operationIds: p.operations.map((o) => op(o.key).id),
    runtimeOperationIds: runtime.bindings.map((b) => op(b.operation).id),
    policies: p.fieldPolicies.map((policy) => ({
      key: policy.key,
      fieldIds: policy.fields.map(
        (key) =>
          c.fields.find((f) => f.key === key)?.id ??
          fail(
            "NATIVE_AUTHORIZATION_FIELD_COVERAGE_INVALID",
            "/authorization/fields/" + key,
          ),
      ),
      queryUses: [...policy.queryUses],
    })),
  };
  const output = compileNativeAuthorization(graph, c, shape);
  if (
    canonicalJson(output.profile) !== canonicalJson(profileSource) ||
    canonicalJson(output.runtime) !== canonicalJson(runtimeSource)
  )
    fail("NATIVE_AUTHORIZATION_NOT_LOSSLESS", "/authorization");
  return {
    graph,
    shape,
    proof: {
      schema: "entity.native-authorization-conversion/1",
      sourceHash,
      graphHash: sha256(graph),
      contextHash: sha256(c),
      shapeHash: sha256(shape),
    },
  };
}
