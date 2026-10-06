import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  emptyReferenceMembers,
  type MetaEntityGraph,
  type NativeOperationRow,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { EntityAiDescriptorV1 } from "@athyper/server-contract-metadata";
import { coreFixtureRow } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import { createLegacyNativeResourcesAdapter } from "./legacy-native-resources-adapter.js";
import type { NativeAuthorizationContext } from "./native-authorization.js";
import type { NativeAiContext, NativeAiIdentities } from "./native-ai.js";
import { sha256 } from "./deterministic.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const resource = (key: string) => ({
  owner: "synthetic-tests",
  key,
  version: 1,
  hash: "a".repeat(64),
});
function fixture(name = "country") {
  const document = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../metadata/entities/common/reference/" +
          name +
          "/definition.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const legacy = compileSharedReferenceProduct(
    parseSharedReferenceProduct(document),
    "studio",
  ).graph;
  const config = legacy.surfaces!.find(
    (s) => s.layoutConfig?.authorization,
  )!.layoutConfig!;
  const policy = config.authorization as {
    operations: { key: string; target: "collection" | "existing" }[];
  };
  const operations: NativeOperationRow[] = legacy.operations.map((o, i) => ({
    id: o.id!,
    operationKey: o.operationKey,
    operationKind: "read",
    labelId: id(100 + i),
    description: null,
    auditEventCode: o.auditEventCode,
    executionMode: "synchronous",
    idempotencyMode: "none",
    inputSurfaceId: null,
    resultSurfaceId: null,
    authorizationTarget: policy.operations.find(
      (p) => p.key === o.operationKey,
    )!.target,
    authorizationEffect: "read",
    requiresParentRead: false,
    requiresPreflight: false,
    replacementOperationId: null,
    handlerKey: (
      config.authorizationRuntime as {
        bindings: { operation: string; handler: string }[];
      }
    ).bindings.find((b) => b.operation === o.operationKey)!.handler,
    handlerVersion: 1,
    preflightKey: null,
    preflightVersion: null,
    extensionFieldMode: "none",
    exportFormats: null,
    exportMaxRecords: null,
  }));
  const source: MetaEntityGraph = {
    ...legacy,
    contractSchema: "athyper.meta-entity-contract/2.3",
    referenceMembers: emptyReferenceMembers(),
    fieldIdentities: [],
    ownedLabels: {
      contract: "entity.authoring-owned-labels/1",
      entityId: id(1),
      tenantId: null,
      changeSetId: id(2),
      defaultLocale: "en",
      requiredLocales: ["en"],
      labels: operations.map((o, i) => ({
        id: o.labelId,
        labelKey: "operation." + o.operationKey,
        defaultText: legacy.operations[i]!.label,
        sourceKind: "owned",
        sharedLabelKey: null,
        sharedResourceKey: null,
        sharedResourceVersion: null,
        sharedResourceHash: null,
      })),
      translations: [],
    },
  };
  const c: NativeAuthorizationContext = {
    entityCode: source.entity.entityCode,
    changeSetId: id(2),
    plane: "studio",
    maximumMembers: 200,
    fields: source.fields.map((f) => ({ id: f.id!, key: f.fieldKey })),
    permissions: source.operationPermissions!.map((p) => ({
      operationId: p.entityOperationId,
      plane: p.targetPlane,
      state: "defined",
      permissionCode: p.permissionCode,
    })),
    scopes: operations.map((o) => ({
      operationId: o.id,
      plane: "studio",
      resolverKey: "tenant.record.v1",
      resolverVersion: 1,
    })),
    resolvers: [
      {
        key: "tenant.record.v1",
        version: 1,
        runtimeKey: "tenant.record.v1",
        resource: resource("resolver"),
      },
    ],
    handlers: operations.map((o) => ({
      key: o.handlerKey!,
      version: 1,
      runtimeKey: o.handlerKey!,
      requiresPreflight: false,
      targets: [o.authorizationTarget],
      effects: ["read"],
      operationKinds: ["read"],
      resource: resource(o.handlerKey!),
    })),
    preflights: [],
  };
  const s = document.definition.ai as EntityAiDescriptorV1;
  const bindings = [
    ...s.insightProviders.map((b) => ({
      ...b,
      kind: "insight_provider" as const,
    })),
    ...s.actions.map((b) => ({ ...b, kind: "action" as const })),
    ...s.presentationProfiles.map((b) => ({
      ...b,
      kind: "presentation_profile" as const,
    })),
  ];
  const aiContext: NativeAiContext = {
    reference: {
      entityCode: source.entity.entityCode,
      planeKey: "studio",
      fields: source.fields.map((f) => ({
        key: f.fieldKey,
        searchable: s.searchFieldKeys.includes(f.fieldKey),
        reference: s.relationshipKeys.includes(f.fieldKey),
      })),
      operationKeys: operations.map((o) => o.operationKey),
    },
    maximumMembers: 200,
    fields: c.fields.map((f) => ({
      ...f,
      representation: "plain",
      uuid: source.fields.find((s) => s.id === f.id)!.dataType === "uuid",
    })),
    operations: operations.map((o) => ({ id: o.id, key: o.operationKey })),
    searchProfile: {
      id: source.searchProfiles![0]!.id!,
      fields: s.searchFieldKeys.map(
        (key) => c.fields.find((f) => f.key === key)!.id,
      ),
    },
    relationships: s.relationshipKeys.map((key, i) => ({
      key,
      relationId: id(300 + i),
      sourceFieldId: c.fields.find((f) => f.key === key)!.id,
    })),
    resources: bindings.map((b) => ({
      ...resource(b.id),
      key: b.id,
      version: b.version,
      kind: b.kind,
    })),
  };
  const aiIds: NativeAiIdentities = {
    profile: id(400),
    fields: Object.fromEntries(
      s.summaryFieldKeys.map((key, i) => [key, id(500 + i)]),
    ),
    references: Object.fromEntries(
      s.relationshipKeys.map((key, i) => [key, id(600 + i)]),
    ),
    bindings: Object.fromEntries(
      bindings.map((b, i) => [b.kind + ":" + b.id, id(700 + i)]),
    ),
  };
  const input = {
    source,
    sourceHash: sha256(source),
    resource: resource("resource-conversion"),
    dependencies: [...c.resolvers, ...c.handlers]
      .map((r) => r.resource)
      .concat(aiContext.resources.map(({ kind: _, ...r }) => r)),
    operations,
    authorization: {
      context: c,
      profileId: id(800),
      fieldIds: Object.fromEntries(
        c.fields.map((f, i) => [f.key, id(900 + i)]),
      ),
    },
    operationFieldIds: Object.fromEntries(
      source.operations.map((o, i) => [
        o.id!,
        Object.fromEntries(
          o.fieldKeys!.map((key, j) => [key, id(1000 + i * 100 + j)]),
        ),
      ]),
    ),
    ai: { context: aiContext, identities: aiIds },
  };
  const adapter = createLegacyNativeResourcesAdapter(input),
    stage = adapter.forward(source);
  // Component projection fixture: full core/layout/relationship persistence is
  // deliberately not represented by this test or claimed as qualification.
  const target = {
    ...stage.prepared,
    contractSchema: "athyper.meta-entity-contract/2.5",
    operations: stage.operations,
    ai: stage.ai,
    fields: source.fields.map((f, i) =>
      coreFixtureRow("field", f.id!, { fieldIdentityId: id(2000 + i) }),
    ),
    runtimeProfiles: [],
    surfaces: [],
    surfaceSections: [],
    surfaceFieldBindings: [],
    authoringSource: {
      entityId: id(1),
      tenantId: null,
      sourceKind: "product",
      authoringSchemaHash: "a".repeat(64),
    },
  } as ExpandedNativeMetaEntityGraph;
  return { source, input, adapter, stage, target };
}
it.each(["country", "state_region"])(
  "accounts for %s's selected operations, authorization and AI through one production adapter",
  (name) => {
    const f = fixture(name);
    expect(f.stage.operations.map((o) => o.id)).toEqual(
      f.source.operations.map((o) => o.id),
    );
    expect(f.stage.prepared.operations).toEqual(f.source.operations);
    expect(
      f.stage.prepared.referenceMembers!.members.operationField,
    ).toHaveLength(f.source.fields.length * f.source.operations.length);
    expect(f.stage.prepared.referenceMembers!.members.fieldAccess).toHaveLength(
      f.source.fields.length,
    );
    expect(
      f.stage.prepared.surfaces!.every(
        (s) =>
          !s.layoutConfig?.ai &&
          !s.layoutConfig?.authorization &&
          !s.layoutConfig?.authorizationRuntime,
      ),
    ).toBe(true);
    expect(f.adapter.reverse(f.stage.prepared, f.target)).toEqual(f.source);
    expect(
      f.adapter
        .reverse(f.stage.prepared, {
          ...f.target,
          ai: {
            ...f.target.ai,
            profile: f.target.ai.profile.map((p) => ({
              ...p,
              description: "Edited native description",
            })),
          },
        })
        .surfaces!.find((s) => s.layoutConfig?.ai)!.layoutConfig!.ai,
    ).toMatchObject({ description: "Edited native description" });
    Reflect.set(f.input.operations[0]!, "auditEventCode", "caller mutation");
    expect(f.adapter.forward(f.source)).toEqual(f.stage);
  },
);
it("rejects unsupported operation paths, incomplete identities and missing installed resource dependencies", () => {
  const f = fixture();
  const bad = {
    ...f.source,
    operations: f.source.operations.map((o) => ({
      ...o,
      confirmationSurfaceKey: "unmapped",
    })),
  };
  expect(() =>
    createLegacyNativeResourcesAdapter({
      ...f.input,
      source: bad,
      sourceHash: sha256(bad),
    }),
  ).toThrow("NATIVE_OPERATION_LEGACY_PATH_UNSUPPORTED");
  expect(() =>
    createLegacyNativeResourcesAdapter({ ...f.input, operationFieldIds: {} }),
  ).toThrow("NATIVE_EXPANDED_IDENTITY_INVALID");
  expect(() =>
    createLegacyNativeResourcesAdapter({ ...f.input, dependencies: [] }),
  ).toThrow("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED");
  expect(() =>
    f.adapter.forward({
      ...f.source,
      entity: { ...f.source.entity, entityCode: "different" },
    }),
  ).toThrow("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH");
});
it("rejects missing field enrollment, wrong AI source coordinates and denied AI fields", () => {
  const f = fixture();
  expect(() =>
    f.adapter.reverse(f.stage.prepared, {
      ...f.target,
      referenceMembers: {
        ...f.target.referenceMembers!,
        members: { ...f.target.referenceMembers!.members, operationField: [] },
      },
    }),
  ).toThrow("NATIVE_EXPANDED_IDENTITY_INVALID");
  expect(() =>
    createLegacyNativeResourcesAdapter({
      ...f.input,
      ai: {
        ...f.input.ai,
        context: {
          ...f.input.ai.context,
          fields: f.input.ai.context.fields.map((r) => ({
            ...r,
            id: id(9999),
          })),
        },
      },
    }),
  ).toThrow("NATIVE_EXPANDED_SOURCE_INVALID");
  expect(() =>
    createLegacyNativeResourcesAdapter({
      ...f.input,
      ai: {
        ...f.input.ai,
        context: {
          ...f.input.ai.context,
          fields: f.input.ai.context.fields.map((r) => ({
            ...r,
            representation: "masked" as const,
          })),
        },
      },
    }),
  ).toThrow("NATIVE_AI_FIELD_DENIED");
});

it("rejects a permission resolver that contradicts the declared operation permission", () => {
  const f = fixture();
  const source = {
    ...f.source,
    operationPermissions: f.source.operationPermissions!.map((p) => ({
      ...p,
      permissionCode: "fixture.other.view",
    })),
  };
  expect(() =>
    createLegacyNativeResourcesAdapter({
      ...f.input,
      source,
      sourceHash: sha256(source),
    }),
  ).toThrow("NATIVE_AUTHORIZATION_PERMISSION_INVALID");
});
it("preserves valid explicit permission absence without deriving a grant or permission code", () => {
  const f = fixture(),
    source = structuredClone(f.source);
  Reflect.set(source, "operationPermissions", []);
  const surface = source.surfaces!.find((s) => s.layoutConfig?.authorization)!;
  const profile = structuredClone(surface.layoutConfig!.authorization) as {
    operations: Record<string, unknown>[];
  };
  for (const op of profile.operations) delete op.permissionCode;
  Reflect.set(surface, "layoutConfig", {
    ...surface.layoutConfig,
    authorization: profile,
  });
  const input = {
    ...f.input,
    source,
    sourceHash: sha256(source),
    authorization: {
      ...f.input.authorization,
      context: {
        ...f.input.authorization.context,
        permissions: f.input.operations.map((op) => ({
          operationId: op.id,
          plane: "studio" as const,
          state: "none" as const,
          permissionCode: null,
        })),
      },
    },
  };
  const a = createLegacyNativeResourcesAdapter(input),
    stage = a.forward(source);
  const target = {
    ...f.target,
    ...stage.prepared,
    contractSchema: "athyper.meta-entity-contract/2.5" as const,
    fields: f.target.fields,
    runtimeProfiles: f.target.runtimeProfiles,
    surfaces: f.target.surfaces,
    surfaceSections: f.target.surfaceSections,
    surfaceFieldBindings: f.target.surfaceFieldBindings,
    operations: stage.operations,
    ai: stage.ai,
  };
  expect(a.reverse(stage.prepared, target)).toEqual(source);
});
it.each(["country", "state_region"])(
  "enrolls %s canonical relations and AI reference IDs together, without dangling synthetic relationships",
  async (name) => {
    const { createLegacyNativeReferenceRelationsAdapter } =
      await import("./native-reference-relations.js");
    const { validateNativeSupplementalReferences } =
      await import("./native-supplemental-storage.js");
    const f = fixture(name),
      source = f.stage.prepared;
    const derivations = f.input.ai.context.relationships.map((r, i) => {
      const field = source.fields.find((f) => f.id === r.sourceFieldId)!;
      const reference = field.typeConfig.keyReference as {
        targetEntity: string;
        labelField: string;
        fields: { source: string; target: string }[];
      };
      const targetId = id(5000 + i),
        targetEntityId = id(6000 + i);
      return {
        sourceFieldId: field.id!,
        sourceHash: sha256(reference),
        labelFieldKey: reference.labelField,
        resource: resource("synthetic-target-key"),
        targetKey: {
          entityId: targetEntityId,
          entityCode: reference.targetEntity,
          keyKey: "business_code",
          fieldKeys: reference.fields.map((m) => m.target),
        },
        relation: {
          id: r.relationId,
          relationKey: r.key,
          relationKind: "many_to_one",
          resolutionKind: "logical",
          ownershipMode: "reference",
          mutationMode: "read_only",
          onDelete: "restrict",
          onUpdate: "restrict",
          status: "active" as const,
        },
        target: {
          id: targetId,
          entityRelationId: r.relationId,
          relationTargetKey: "default",
          targetEntityId,
          targetEntityCode: reference.targetEntity,
          targetKeyKey: "business_code",
          isDefault: true,
        },
        fields: reference.fields.map((m, j) => ({
          id: id(7000 + i * 100 + j),
          entityRelationTargetId: targetId,
          sourceFieldId: source.fields.find((f) => f.fieldKey === m.source)!
            .id!,
          targetFieldKey: m.target,
          position: j + 1,
        })),
      };
    });
    const relations = createLegacyNativeReferenceRelationsAdapter({
      source,
      sourceHash: sha256(source),
      resource: resource("relations-adapter"),
      derivations,
    });
    const prepared = relations.forward(source);
    const target = {
      ...f.target,
      relations: prepared.relations,
      relationTargets: prepared.relationTargets,
      relationFields: prepared.relationFields,
    };
    expect(() =>
      validateNativeSupplementalReferences(target, 200),
    ).not.toThrow();
    const { ai: _ai, ...coreTarget } = target;
    expect(
      relations.reverse(prepared, {
        ...coreTarget,
        contractSchema: "athyper.meta-entity-contract/2.4",
        operations: source.operations,
      }),
    ).toEqual(source);
    expect(f.adapter.reverse(source, target)).toEqual(f.source);
    if (derivations.length) {
      expect(() =>
        validateNativeSupplementalReferences({ ...target, relations: [] }, 200),
      ).toThrow("NATIVE_SNAPSHOT_REFERENCE_INVALID");
    }
  },
);
