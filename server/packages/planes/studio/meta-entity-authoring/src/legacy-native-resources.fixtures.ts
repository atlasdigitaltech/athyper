/** Actual reference definitions with synthetic resource authority; never deployment evidence. */
import { readFileSync } from "node:fs";
import {
  emptyReferenceMembers,
  normalizedCoreMembers,
  type MetaEntityGraph,
  type NativeOperationRow,
  type NormalizedCoreRow,
  type AuthoringPlane,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { EntityAiDescriptorV1 } from "@athyper/server-contract-metadata";
const coreFixtureRow = (
  _kind: "field",
  id: string,
  values: object,
): NormalizedCoreRow<"field"> =>
  ({
    id,
    ...Object.fromEntries(
      Object.keys(normalizedCoreMembers.field.columns).map((key) => [
        key,
        null,
      ]),
    ),
    ...values,
  }) as NormalizedCoreRow<"field">;
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
export function resourceConversionFixture(
  name = "country",
  plane: AuthoringPlane = "studio",
) {
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
    plane,
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
    plane,
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
      plane,
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
