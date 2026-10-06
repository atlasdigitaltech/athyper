import {
  referenceMembers,
  emptyReferenceMembers,
  type ReferenceMemberKind,
  type ReferenceAnchors,
  type ReferenceMemberGraph,
  type ContractNode,
} from "@athyper/server-contract-meta-entity-authoring";
export const fixtureId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const referenceFixtureAnchors: ReferenceAnchors = {
  changeSetId: fixtureId(1),
  maxMembers: 200,
  maxPredicateDepth: 16,
  tables: {
    entity_field: [
      { id: fixtureId(2), data_type: "enum" },
      { id: fixtureId(3), data_type: "uuid" },
    ],
    entity_surface: [
      { id: fixtureId(4), surface_kind: "list" },
      { id: fixtureId(5), surface_kind: "detail" },
    ],
    entity_operation: [
      { id: fixtureId(6), operation_kind: "read" },
      { id: fixtureId(7), operation_kind: "update" },
    ],
    entity_surface_field_binding: [
      {
        id: fixtureId(8),
        entity_surface_id: fixtureId(4),
        entity_field_id: fixtureId(2),
      },
      {
        id: fixtureId(9),
        entity_surface_id: fixtureId(4),
        entity_field_id: fixtureId(3),
      },
    ],
    entity_label: [{ id: fixtureId(10) }],
    entity_surface_section: [],
    entity_surface_operation: [],
  },
};
export function referencePayload(
  kind: ReferenceMemberKind,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const defaultValue = (n: ContractNode): unknown =>
    "anyOf" in n
      ? n.anyOf.some((v) => "type" in v && v.type === "null")
        ? null
        : defaultValue(n.anyOf[0]!)
      : "const" in n
        ? n.const
        : n.type === "integer"
          ? 1
          : n.type === "boolean"
            ? false
            : n.type === "array"
              ? []
              : n.type === "null"
                ? null
                : "value";
  return {
    ...Object.fromEntries(
      Object.entries(referenceMembers[kind].columns).map(([p, c]) => [
        p,
        defaultValue(c.node),
      ]),
    ),
    ...values,
  };
}
export function referenceFixture(): ReferenceMemberGraph {
  const g = emptyReferenceMembers();
  const members = { ...g.members } as Record<
    ReferenceMemberKind,
    readonly Record<string, unknown>[]
  >;
  const put = (
    kind: ReferenceMemberKind,
    n: number,
    v: Record<string, unknown>,
  ) => (members[kind] = [{ id: fixtureId(n), ...referencePayload(kind, v) }]);
  put("target", 20, { targetPlane: "studio", requirement: "required" });
  put("fieldChoice", 21, {
    entityFieldId: fixtureId(2),
    labelId: fixtureId(10),
  });
  put("navigationGroup", 22, {
    entitySurfaceId: fixtureId(5),
    groupKey: "details",
  });
  put("surfaceView", 23, {
    entitySurfaceId: fixtureId(4),
    viewKey: "default",
    viewKind: "default",
    density: "comfortable",
    mode: "table",
  });
  put("surfaceViewField", 24, {
    viewId: fixtureId(23),
    fieldBindingId: fixtureId(8),
    visiblePosition: 1,
  });
  put("accessPermission", 25, {
    entitySurfaceId: fixtureId(4),
    targetPlane: "studio",
    permissionCode: "reference.view",
    permissionKind: "entity_operation",
  });
  put("operationField", 26, {
    entityOperationId: fixtureId(7),
    entityFieldId: fixtureId(2),
    operationChangeSetId: fixtureId(1),
  });
  put("authorizationProfile", 27, {
    targetPlane: "studio",
    ownershipResolverKey: "tenant.record.v1",
    recordReadOperationId: fixtureId(6),
    directoryOperationId: fixtureId(6),
    directoryPopulation: "tenant",
  });
  put("fieldAccess", 28, {
    entityFieldId: fixtureId(2),
    targetPlane: "studio",
    readOperationId: fixtureId(6),
    readOperationChangeSetId: fixtureId(1),
    representation: "plain",
    queryUses: ["filter"],
  });
  put("predicate", 29, {
    predicateKey: "list_filter",
    nodeKind: "condition",
    purpose: "list_filter",
    viewId: fixtureId(23),
    entityFieldId: fixtureId(2),
    operator: "eq",
    valueKind: "text",
    valueText: "value",
  });
  return { contract: g.contract, members } as unknown as ReferenceMemberGraph;
}
