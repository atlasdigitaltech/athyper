import {
  FoundationContractError,
  validateNativeOperation,
  validateReferenceMember,
  type MetaEntityGraph,
  type NativeOperationRow,
  type ReferenceMember,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import {
  compileNativeAi,
  convertLegacyAi,
  type NativeAiContext,
  type NativeAiIdentities,
} from "./native-ai.js";
import {
  compileNativeAuthorization,
  convertLegacyAuthorization,
  type NativeAuthorizationContext,
} from "./native-authorization.js";
import type { NativeConversionResource } from "./native-graph-conversion.js";
import type { NativeSupplementalConversionAdapter } from "./native-expanded-conversion.js";
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
/** Installed migration implementation. Operations are independently admitted
 * projections of existing identities, not an initializer for new SQL controls.
 * Selected legacy read operations only; other properties reject by path. */
export function createLegacyNativeResourcesAdapter(input: {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly dependencies: readonly NativeConversionResource[];
  readonly operations: readonly NativeOperationRow[];
  readonly authorization: {
    readonly context: NativeAuthorizationContext;
    readonly profileId: string;
    readonly fieldIds: Readonly<Record<string, string>>;
  };
  readonly operationFieldIds: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
  readonly ai: {
    readonly context: NativeAiContext;
    readonly identities: NativeAiIdentities;
  } | null;
}): NativeSupplementalConversionAdapter {
  input = structuredClone(input);
  validateConversionJsonData(input.source, "/source");
  if (sha256(input.source) !== input.sourceHash)
    fail("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH", "/source");
  const source = structuredClone(input.source),
    operations = structuredClone(input.operations);
  const changeSetId = source.ownedLabels?.changeSetId;
  if (
    !source.referenceMembers ||
    !source.ownedLabels ||
    !changeSetId ||
    input.authorization.context.changeSetId !== changeSetId ||
    input.authorization.context.entityCode !== source.entity.entityCode
  )
    fail("NATIVE_EXPANDED_SOURCE_INVALID", "/source");
  const fields = source.fields.map((f) => ({ id: f.id, key: f.fieldKey }));
  if (
    fields.some((f) => !f.id) ||
    new Set(fields.map((f) => f.key)).size !== fields.length ||
    canonicalJson(fields.slice().sort((a, b) => a.key.localeCompare(b.key))) !==
      canonicalJson(
        input.authorization.context.fields
          .slice()
          .sort((a, b) => a.key.localeCompare(b.key)),
      )
  )
    fail("NATIVE_EXPANDED_SOURCE_INVALID", "/authorization/fields");
  const labels = source.ownedLabels!.labels;
  const originalOperations = source.operations;
  if (
    new Set(operations.map((o) => o.id)).size !== operations.length ||
    operations.length !== originalOperations.length ||
    Object.keys(input.operationFieldIds).sort().join() !==
      originalOperations
        .map((o) => o.id)
        .sort()
        .join()
  )
    fail("NATIVE_EXPANDED_IDENTITY_INVALID", "/operations");
  const enrollments: ReferenceMember<"operationField">[] = [];
  for (const legacy of originalOperations) {
    const native = operations.find((o) => o.id === legacy.id);
    if (!native) fail("NATIVE_EXPANDED_IDENTITY_INVALID", "/operations");
    validateNativeOperation(native!, true);
    for (const key of Object.keys(legacy))
      if (
        ![
          "id",
          "operationKey",
          "operationKind",
          "label",
          "description",
          "auditEventCode",
          "executionMode",
          "idempotencyMode",
          "handlerKey",
          "fieldKeys",
          "status",
        ].includes(key)
      )
        fail(
          "NATIVE_OPERATION_LEGACY_PATH_UNSUPPORTED",
          "/operations/" + legacy.id + "/" + key,
        );
    const label = labels.find((l) => l.id === native!.labelId);
    if (
      !label ||
      label.sourceKind !== "owned" ||
      label.defaultText !== legacy.label ||
      legacy.operationKind !== "read" ||
      (legacy.status !== undefined && legacy.status !== "active") ||
      native!.operationKey !== legacy.operationKey ||
      native!.operationKind !== legacy.operationKind ||
      native!.auditEventCode !== legacy.auditEventCode ||
      native!.executionMode !== "synchronous" ||
      native!.idempotencyMode !== "none" ||
      native!.inputSurfaceId !== null ||
      native!.resultSurfaceId !== null ||
      native!.replacementOperationId !== null ||
      native!.extensionFieldMode !== "none" ||
      (legacy.description === undefined && native!.description !== null) ||
      (legacy.description !== undefined &&
        native!.description !== legacy.description) ||
      (legacy.executionMode !== undefined &&
        native!.executionMode !== legacy.executionMode) ||
      (legacy.idempotencyMode !== undefined &&
        native!.idempotencyMode !== legacy.idempotencyMode) ||
      (legacy.handlerKey !== undefined &&
        native!.handlerKey !== legacy.handlerKey)
    )
      fail(
        "NATIVE_OPERATION_LEGACY_MAPPING_CONFLICT",
        "/operations/" + legacy.id,
      );
    const keys = legacy.fieldKeys;
    if (
      !Array.isArray(keys) ||
      new Set(keys).size !== keys.length ||
      Object.keys(input.operationFieldIds[legacy.id!]!).sort().join() !==
        keys.slice().sort().join()
    )
      fail("NATIVE_EXPANDED_IDENTITY_INVALID", "/operationFields");
    for (const [i, key] of keys!.entries()) {
      const field = fields.find((f) => f.key === key);
      if (!field?.id)
        fail("NATIVE_EXPANDED_SOURCE_INVALID", "/operationFields/" + key);
      const row = {
        id: input.operationFieldIds[legacy.id!]![key]!,
        entityOperationId: native!.id,
        entityFieldId: field!.id!,
        position: i + 1,
        operationChangeSetId: changeSetId!,
      };
      const { id: _, ...payload } = row;
      validateReferenceMember("operationField", payload);
      enrollments.push(row);
    }
  }
  // Undefined entity permission is valid only when the declared applicable
  // source has no permission row. A resolver projection cannot override it.
  for (const operation of operations) {
    const declared = (source.operationPermissions ?? []).filter(
      (p) =>
        p.entityOperationId === operation.id &&
        p.targetPlane === input.authorization.context.plane &&
        p.status !== "deprecated",
    );
    const admitted = input.authorization.context.permissions.filter(
      (p) =>
        p.operationId === operation.id &&
        p.plane === input.authorization.context.plane,
    );
    if (
      declared.length > 1 ||
      admitted.length !== 1 ||
      (declared.length === 0
        ? admitted[0]!.state !== "none" || admitted[0]!.permissionCode !== null
        : admitted[0]!.state !== "defined" ||
          admitted[0]!.permissionCode !== declared[0]!.permissionCode)
    )
      fail(
        "NATIVE_AUTHORIZATION_PERMISSION_INVALID",
        "/authorization/permissions",
      );
  }
  const authorizationSurfaces = (source.surfaces ?? []).filter(
    (s) =>
      s.layoutConfig &&
      (Object.hasOwn(s.layoutConfig, "authorization") ||
        Object.hasOwn(s.layoutConfig, "authorizationRuntime")),
  );
  if (authorizationSurfaces.length !== 1)
    fail("NATIVE_AUTHORIZATION_PROFILE_REQUIRED", "/surfaces");
  const authSurface = authorizationSurfaces[0]!,
    config = authSurface.layoutConfig!;
  const authorization = convertLegacyAuthorization(
    config.authorization,
    config.authorizationRuntime,
    input.authorization.context,
    operations,
    {
      profileId: input.authorization.profileId,
      fieldIds: input.authorization.fieldIds,
    },
    sha256({
      profile: config.authorization,
      runtime: config.authorizationRuntime,
    }),
  );
  const aiSurfaces = (source.surfaces ?? []).filter(
    (s) => s.layoutConfig && Object.hasOwn(s.layoutConfig, "ai"),
  );
  if (
    aiSurfaces.length > 1 ||
    (aiSurfaces.length === 1) !== (input.ai !== null)
  )
    fail("NATIVE_AI_PROFILE_MISSING", "/surfaces/ai");
  const aiSurface = aiSurfaces[0];
  if (
    input.ai &&
    (input.ai.context.fields.some(
      (f) => !fields.some((s) => s.id === f.id && s.key === f.key),
    ) ||
      canonicalJson(
        input.ai.context.operations
          .map((o) => ({ id: o.id, key: o.key }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ) !==
        canonicalJson(
          operations
            .map((o) => ({ id: o.id, key: o.operationKey }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        ))
  )
    fail("NATIVE_EXPANDED_SOURCE_INVALID", "/ai/context");
  const ai = input.ai
    ? convertLegacyAi(
        aiSurface!.layoutConfig!.ai,
        input.ai.context,
        input.ai.identities,
        sha256(aiSurface!.layoutConfig!.ai),
      )
    : { profile: [], field: [], binding: [], reference: [], term: [] };
  const requiredResources = [
    ...input.authorization.context.resolvers,
    ...input.authorization.context.handlers,
    ...input.authorization.context.preflights,
  ].map((r) => r.resource);
  if (input.ai)
    requiredResources.push(
      ...input.ai.context.resources.map(({ kind: _, ...r }) => r),
    );
  for (const r of requiredResources)
    if (!input.dependencies.some((d) => canonicalJson(d) === canonicalJson(r)))
      fail("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED", "/dependencies");
  const prepared = structuredClone(source);
  const append = (
    kind: "operationField" | "authorizationProfile" | "fieldAccess",
    rows: readonly { id: string }[],
  ) => {
    const current = Reflect.get(
      prepared.referenceMembers!.members,
      kind,
    ) as readonly { id: string }[];
    for (const row of rows) {
      const same = current.find((r) => r.id === row.id);
      if (same && canonicalJson(same) !== canonicalJson(row))
        fail("NATIVE_EXPANDED_RETAINED_CHANGED", "/referenceMembers/" + kind);
    }
    Reflect.set(prepared.referenceMembers!.members, kind, [
      ...current,
      ...rows.filter((r) => !current.some((old) => old.id === r.id)),
    ]);
  };
  append("operationField", enrollments);
  append("authorizationProfile", authorization.graph.profiles);
  append("fieldAccess", authorization.graph.fields);
  for (const surface of prepared.surfaces ?? []) {
    if (surface.id !== authSurface.id && surface.id !== aiSurface?.id) continue;
    const config = { ...surface.layoutConfig };
    if (surface.id === authSurface.id) {
      delete config.authorization;
      delete config.authorizationRuntime;
    }
    if (surface.id === aiSurface?.id) delete config.ai;
    Reflect.set(surface, "layoutConfig", config);
  }
  const preparedHash = sha256(prepared);
  return {
    resource: structuredClone(input.resource),
    dependencies: structuredClone(input.dependencies),
    contextHash: sha256({
      sourceHash: input.sourceHash,
      operations,
      authorization: input.authorization,
      operationFieldIds: input.operationFieldIds,
      ai: input.ai,
    }),
    forward(graph) {
      if (sha256(graph) !== input.sourceHash)
        fail("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH", "/source");
      return {
        prepared: structuredClone(prepared),
        operations: structuredClone(operations),
        ai: structuredClone(ai),
      };
    },
    reverse(graph, target) {
      // The enclosing proof reconstructs this exact intermediary through the
      // core/nested inverses. Resource values come from the current typed target;
      // an independently altered intermediary is not an admitted source.
      validateConversionJsonData(graph, "/prepared");
      if (sha256(graph) !== preparedHash)
        fail("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH", "/prepared");
      const result = structuredClone(graph);
      const auth = compileNativeAuthorization(
        {
          operations: target.operations,
          profiles: target.referenceMembers!.members.authorizationProfile,
          fields: target.referenceMembers!.members.fieldAccess,
        },
        input.authorization.context,
        authorization.shape,
      );
      const surface = result.surfaces!.find((s) => s.id === authSurface.id)!;
      Reflect.set(surface, "layoutConfig", {
        ...surface.layoutConfig,
        authorization: auth.profile,
        authorizationRuntime: auth.runtime,
      });
      if (input.ai) {
        const s = result.surfaces!.find((s) => s.id === aiSurface!.id)!;
        Reflect.set(s, "layoutConfig", {
          ...s.layoutConfig,
          ai: compileNativeAi(target.ai, input.ai.context),
        });
      } else if (Object.values(target.ai).some((rows) => rows.length))
        fail("NATIVE_AI_SOURCE_INVALID", "/target/ai");
      Reflect.set(
        result,
        "operations",
        originalOperations.map((old) => {
          const op = target.operations.find((o) => o.id === old.id);
          if (!op)
            return fail(
              "NATIVE_EXPANDED_IDENTITY_INVALID",
              "/target/operations",
            );
          validateNativeOperation(op, true);
          const label = target.ownedLabels!.labels.find(
            (l) => l.id === op.labelId,
          );
          if (!label || label.sourceKind !== "owned")
            fail(
              "NATIVE_OPERATION_LEGACY_MAPPING_CONFLICT",
              "/target/operations/label",
            );
          const rows = target
            .referenceMembers!.members.operationField.filter(
              (r) => r.entityOperationId === op.id,
            )
            .slice()
            .sort((a, b) => a.position - b.position);
          if (
            rows.length !== old.fieldKeys!.length ||
            rows.some(
              (r, i) =>
                r.operationChangeSetId !== changeSetId || r.position !== i + 1,
            )
          )
            fail("NATIVE_EXPANDED_IDENTITY_INVALID", "/target/operationFields");
          const values = {
            ...old,
            operationKey: op.operationKey,
            operationKind: op.operationKind,
            auditEventCode: op.auditEventCode,
            label: label!.defaultText,
            fieldKeys: rows.map(
              (r) =>
                fields.find((f) => f.id === r.entityFieldId)?.key ??
                fail(
                  "NATIVE_EXPANDED_IDENTITY_INVALID",
                  "/target/operationFields",
                ),
            ),
          };
          for (const key of [
            "description",
            "executionMode",
            "idempotencyMode",
            "handlerKey",
          ] as const)
            if (Object.hasOwn(old, key)) Reflect.set(values, key, op[key]);
          return values;
        }),
      );
      // Remove only the rows introduced by this adapter, not pre-existing members.
      for (const kind of [
        "operationField",
        "authorizationProfile",
        "fieldAccess",
      ] as const) {
        const original = source.referenceMembers!.members[kind];
        const ids = new Set(original.map((r) => r.id));
        Reflect.set(
          result.referenceMembers!.members,
          kind,
          target.referenceMembers!.members[kind].filter((r) => ids.has(r.id)),
        );
      }
      return result;
    },
  };
}
