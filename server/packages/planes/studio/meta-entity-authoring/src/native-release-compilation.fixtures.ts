import {
  emptyReferenceMembers,
  type ExpandedNativeMetaEntityGraph,
  type NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { coreFixtureId as id } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  layoutFixture,
  layoutFixtureContext,
  layoutFixtureRow,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import { convertLegacyAuthorization } from "./native-authorization.js";
import { convertLegacyDefaultListView } from "./native-list-view.js";
import { sha256 } from "./deterministic.js";
/** Complete synthetic native reference graph. No installed host, storage or
 * human review is attested by the independently supplied fixture contexts. */
export function nativeReleaseFixture() {
  const layoutContext = layoutFixtureContext(),
    core = layoutContext.core;
  const resource = {
    owner: "synthetic-tests",
    key: "reader",
    version: 1,
    hash: "b".repeat(64),
  };
  const operations: NativeOperationRow[] = ["list", "read"].map(
    (operationKey, i) => ({
      id: id(200 + i),
      operationKey,
      operationKind: "read",
      labelId: id(90 + i),
      description: null,
      auditEventCode: "fixture." + operationKey,
      executionMode: "synchronous",
      idempotencyMode: "none",
      inputSurfaceId: null,
      resultSurfaceId: null,
      authorizationTarget: i === 0 ? "collection" : "existing",
      authorizationEffect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
      replacementOperationId: null,
      handlerKey: "entity.record." + operationKey + ".v1",
      handlerVersion: 1,
      preflightKey: null,
      preflightVersion: null,
      extensionFieldMode: "none",
      exportFormats: null,
      exportMaxRecords: null,
    }),
  );
  const authContext: NativeReleaseCompilationContext["authorization"] = {
    entityCode: "synthetic_reference",
    changeSetId: id(100),
    plane: "studio",
    maximumMembers: 100,
    fields: layoutContext.coreContext.identities.map((row, i) => ({
      id: core.field[i]!.id,
      key: row.fieldKey,
    })),
    permissions: operations.map((o) => ({
      operationId: o.id,
      plane: "studio",
      state: "none",
      permissionCode: null,
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
        resource,
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
      resource,
    })),
    preflights: [],
  };
  const profile = {
    schemaVersion: 1,
    entityCode: "synthetic_reference",
    planeKey: "studio",
    ownership: "tenant.record.v1",
    directory: { operation: "list", population: "tenant" },
    recordReadOperation: "read",
    operations: operations.map((o) => ({
      key: o.operationKey,
      scope: "tenant.record.v1",
      target: o.authorizationTarget,
      effect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
    })),
    fieldPolicies: [
      {
        key: "readable",
        fields: ["id", "code", "name"],
        readOperation: "read",
        representation: "plain",
        writeOperations: [],
        queryUses: ["sort", "filter"],
      },
    ],
    surfaces: [],
    relationships: [],
  };
  const runtime = {
    schemaVersion: 1,
    runtimeVersion: "entity-authorization.v1",
    bindings: operations.map((o) => ({
      operation: o.operationKey,
      handler: o.handlerKey,
      resolver: "tenant.record.v1",
    })),
  };
  const authorization = convertLegacyAuthorization(
    profile,
    runtime,
    authContext,
    operations,
    {
      profileId: id(300),
      fieldIds: { id: id(301), code: id(302), name: id(303) },
    },
    sha256({ profile, runtime }),
  );
  const layout = layoutFixture();
  const listBindings = [core.field[1]!, core.field[2]!].map((f, i) =>
    layoutFixtureRow("binding", id(62 + i), {
      entitySurfaceId: id(40),
      entityFieldId: f.id,
      bindingKey: "column_" + i,
      bindingKind: "field",
      position: i + 1,
      componentDisplayId: id(80),
      columnSpan: 1,
      meaningfulForForm: false,
    }),
  );
  const presentation = layoutContext.fieldPresentation.map((p) => ({
    ...p,
    queryUses: ["sort", "filter"],
  }));
  const viewSource = {
    defaultState: {
      sort: [{ field: "code", direction: "asc" as const }],
      density: "comfortable" as const,
      mode: "table" as const,
    },
    visibleFields: ["code", "name"],
  };
  const view = convertLegacyDefaultListView(
    viewSource,
    {
      entityId: id(100),
      tenantId: null,
      surface: core.surface[0]!,
      bindings: listBindings,
      fields: core.field,
      identities: layoutContext.coreContext.identities,
      presentation,
      maximumFields: 100,
    },
    {
      sourceHash: sha256(viewSource),
      viewId: id(350),
      viewKey: "default",
      fieldMemberIds: { code: id(351), name: id(352) },
    },
  );
  const references = emptyReferenceMembers();
  Reflect.set(references.members, "target", [
    {
      id: id(399),
      targetPlane: "studio",
      requirement: "required",
      position: 1,
    },
  ]);
  Reflect.set(
    references.members,
    "authorizationProfile",
    authorization.graph.profiles,
  );
  Reflect.set(references.members, "fieldAccess", authorization.graph.fields);
  Reflect.set(references.members, "surfaceView", [view.view]);
  Reflect.set(references.members, "surfaceViewField", view.fields);
  Reflect.set(references.members, "navigationGroup", [
    {
      id: id(70),
      entitySurfaceId: id(41),
      groupKey: "main",
      labelId: id(32),
      iconKey: null,
      sectionDisplay: "continuous",
      position: 1,
    },
  ]);
  const labelIds = [
    ...new Set([...layoutContext.coreContext.labels, id(90), id(91)]),
  ];
  const graph: ExpandedNativeMetaEntityGraph = {
    contractSchema: "athyper.meta-entity-contract/2.5",
    entity: { entityCode: "synthetic_reference", entityLabelId: id(34) },
    authoringSource: {
      entityId: id(100),
      tenantId: null,
      sourceKind: "product",
      authoringSchemaHash: "a".repeat(64),
    },
    fields: core.field,
    operations,
    runtimeProfiles: core.runtime,
    surfaces: core.surface,
    surfaceSections: layout.section,
    surfaceFieldBindings: [...layout.binding, ...listBindings],
    operationScopeBindings: operations.map((o) => ({
      entityOperationId: o.id,
      bindingKey: o.operationKey + "_scope",
      targetPlane: "studio",
      decisionMode:
        o.authorizationTarget === "collection"
          ? "collection"
          : "entity_resource",
      scopeKind: "tenant",
      coordinateSource: "tenant_context",
      missingValueBehavior: "deny",
    })),
    referenceMembers: references,
    ownedLabels: {
      contract: "entity.authoring-owned-labels/1",
      entityId: id(100),
      changeSetId: id(100),
      tenantId: null,
      defaultLocale: "en",
      requiredLocales: ["en"],
      labels: labelIds.map((labelId, i) => ({
        id: labelId,
        labelKey: "fixture.label_" + i,
        defaultText: "Label " + i,
        sourceKind: "owned",
        sharedLabelKey: null,
        sharedResourceKey: null,
        sharedResourceVersion: null,
        sharedResourceHash: null,
      })),
      translations: [],
    },
    ai: { profile: [], field: [], binding: [], reference: [], term: [] },
  };
  const c: NativeReleaseCompilationContext = {
    graphHash: sha256(graph),
    authoringSchemaHash: "a".repeat(64),
    core: layoutContext.coreContext,
    layout: { ...layoutContext, fieldPresentation: presentation },
    structural: { fieldIds: core.field.map((f) => f.id), targets: [] },
    authorization: authContext,
    ai: null,
    identityResource: resource,
    listProviders: [
      {
        surfaceId: id(40),
        provider: resource,
        modes: ["table"],
        countModes: ["exact"],
        maximumPageSize: 50,
        maximumPageSizeChoices: 3,
        maximumSortLevels: 3,
        maximumFilters: 20,
        maximumFilterDepth: 3,
      },
    ],
    domains: [],
    relationLabels: [],
    components: [{ id: id(80), runtimeKey: "text" }],
  };
  const controls = operations.map((o) => ({
    ...o,
    requiresMfa: o.operationKey === "read",
  }));
  const run = () =>
    compileNativeRelease(graph, { ...c, graphHash: sha256(graph) }, controls);
  return { graph, c, controls, run };
}
