import { expect, it } from "vitest";
import { createLegacyNativeResourcesAdapter } from "./legacy-native-resources-adapter.js";
import { sha256 } from "./deterministic.js";
import { resourceConversionFixture as fixture } from "./legacy-native-resources.fixtures.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const resource = (key: string) => ({
  owner: "synthetic-tests",
  key,
  version: 1,
  hash: "a".repeat(64),
});
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
