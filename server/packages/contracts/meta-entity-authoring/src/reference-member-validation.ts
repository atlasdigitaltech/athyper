import {
  referenceMembers,
  referencePredicateOwners,
  referenceUuid,
  validateReferenceMember,
  referenceFailure,
  type ReferenceMemberGraph,
  type ReferenceMemberKind,
} from "./reference-member-contract.js";
import { validateFoundationNode } from "./foundation-contract.js";
export interface ReferenceAnchors {
  readonly tables: Readonly<
    Record<string, readonly Readonly<Record<string, unknown>>[]>
  >;
  readonly changeSetId: string;
  readonly maxMembers: number;
  readonly maxPredicateDepth: number;
}
const owners = referencePredicateOwners;
const payloads = {
  text: "valueText",
  numeric: "valueNumeric",
  boolean: "valueBoolean",
  date: "valueDate",
  datetime: "valueDatetime",
  uuid: "valueUuid",
  text_set: "valueTextSet",
  numeric_set: "valueNumericSet",
  uuid_set: "valueUuidSet",
  date_set: "valueDateSet",
  datetime_set: "valueDatetimeSet",
} as const;
export function parseReferenceMembers(
  value: unknown,
  anchors: ReferenceAnchors,
): ReferenceMemberGraph {
  const fail = (code: string, path: string): never =>
    referenceFailure(code, path);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("REFERENCE_GRAPH_INVALID", "");
  const root = value as Record<string, unknown>;
  if (
    Object.keys(root).sort().join(",") !== "contract,members" ||
    root.contract !== "entity.authoring-reference-members/1" ||
    !root.members ||
    typeof root.members !== "object" ||
    Array.isArray(root.members)
  )
    return fail("REFERENCE_GRAPH_INVALID", "");
  const members = root.members as Record<
    string,
    readonly Record<string, unknown>[]
  >;
  if (
    Object.keys(members).sort().join(",") !==
    Object.keys(referenceMembers).sort().join(",")
  )
    return fail("REFERENCE_MEMBER_INVENTORY_INVALID", "/members");
  if (
    !Number.isSafeInteger(anchors.maxMembers) ||
    anchors.maxMembers < 1 ||
    !Number.isSafeInteger(anchors.maxPredicateDepth) ||
    anchors.maxPredicateDepth < 1 ||
    anchors.maxPredicateDepth > 32
  )
    return fail("REFERENCE_BUDGET_REQUIRED", "");
  const tables: Record<string, readonly Record<string, unknown>[]> = {
    ...anchors.tables,
  };
  let count = 0;
  const ids = new Set<string>();
  for (const kind of Object.keys(referenceMembers) as ReferenceMemberKind[]) {
    const rows = members[kind];
    if (!Array.isArray(rows))
      return fail("REFERENCE_MEMBER_ARRAY_REQUIRED", `/members/${kind}`);
    count += rows.length;
    tables[referenceMembers[kind].table] = rows;
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        return fail("REFERENCE_MEMBER_INVALID", kind);
      validateFoundationNode(referenceUuid, row.id, `/members/${kind}/id`);
      if (ids.has(String(row.id)))
        return fail("REFERENCE_MEMBER_IDENTITY_CONFLICT", kind);
      ids.add(String(row.id));
      const { id, ...payload } = row;
      validateReferenceMember(kind, payload);
    }
  }
  if (count > anchors.maxMembers)
    return fail("REFERENCE_GRAPH_LIMIT", "/members");
  for (const kind of Object.keys(referenceMembers) as ReferenceMemberKind[]) {
    const descriptor = referenceMembers[kind];
    for (const row of members[kind]!) {
      for (const [property, c] of Object.entries(descriptor.columns))
        if (
          c.reference &&
          row[property] !== null &&
          !tables[c.reference]?.some((r) => r.id === row[property])
        )
          return fail(
            "REFERENCE_FOREIGN_MEMBER",
            `${kind}/${row.id}/${property}`,
          );
      for (const keys of descriptor.unique) {
        const props = keys.map(
          (column) =>
            Object.entries(descriptor.columns).find(
              ([, c]) => c.column === column,
            )![0],
        );
        if (
          kind === "surfaceViewField" &&
          props.some(
            (p) =>
              (p === "visiblePosition" || p === "sortPosition") &&
              row[p] === null,
          )
        )
          continue;
        if (
          members[kind]!.filter((r) => props.every((p) => r[p] === row[p]))
            .length > 1
        )
          return fail(
            "REFERENCE_MEMBER_COORDINATE_CONFLICT",
            `${kind}/${row.id}`,
          );
      }
    }
  }
  const targets = new Set(members.target!.map((r) => r.targetPlane));
  for (const kind of [
    "fieldAccess",
    "accessPermission",
    "authorizationProfile",
  ] as const)
    for (const row of members[kind]!)
      if (!targets.has(row.targetPlane))
        return fail("REFERENCE_TARGET_UNDECLARED", `${kind}/${row.id}`);
  for (const row of members.fieldAccess!) {
    const uses = row.queryUses as string[];
    if (new Set(uses).size !== uses.length)
      return fail("REFERENCE_QUERY_USES_DUPLICATE", String(row.id));
    if (row.representation === "omitted") {
      if (
        row.readOperationId !== null ||
        row.readOperationChangeSetId !== null ||
        uses.length
      )
        return fail("REFERENCE_OMITTED_DISCLOSURE", String(row.id));
    } else if (
      row.readOperationId === null ||
      row.readOperationChangeSetId !== anchors.changeSetId
    )
      return fail("REFERENCE_OPERATION_SOURCE_INVALID", String(row.id));
  }
  for (const row of members.operationField!)
    if (row.operationChangeSetId !== anchors.changeSetId)
      return fail("REFERENCE_OPERATION_SOURCE_INVALID", String(row.id));
  for (const row of members.surfaceViewField!) {
    if (
      (row.sortPosition === null) !== (row.sortDirection === null) ||
      (row.visiblePosition === null &&
        row.sortPosition === null &&
        !row.grouped)
    )
      return fail("REFERENCE_VIEW_ENROLLMENT_INVALID", String(row.id));
    const view = members.surfaceView!.find((r) => r.id === row.viewId)!;
    const binding = tables.entity_surface_field_binding?.find(
      (r) => r.id === row.fieldBindingId,
    );
    if (binding?.entity_surface_id !== view.entitySurfaceId)
      return fail("REFERENCE_VIEW_SURFACE_MISMATCH", String(row.id));
    const field = tables.entity_field?.find(
      (r) => r.id === binding?.entity_field_id,
    );
    if (row.visiblePosition !== null && field?.data_type === "uuid")
      return fail("REFERENCE_UUID_PRESENTATION_FORBIDDEN", String(row.id));
  }
  for (const row of members.fieldChoice!)
    if (
      tables.entity_field?.find((f) => f.id === row.entityFieldId)
        ?.data_type !== "enum"
    )
      return fail("REFERENCE_CHOICE_FIELD_INVALID", String(row.id));
  for (const row of members.navigationGroup!)
    if (
      tables.entity_surface?.find((s) => s.id === row.entitySurfaceId)
        ?.surface_kind !== "detail"
    )
      return fail("REFERENCE_NAVIGATION_SURFACE_INVALID", String(row.id));
  for (const row of members.surfaceView!)
    if (
      !["list", "embedded"].includes(
        String(
          tables.entity_surface?.find((s) => s.id === row.entitySurfaceId)
            ?.surface_kind,
        ),
      )
    )
      return fail("REFERENCE_VIEW_SURFACE_INVALID", String(row.id));
  for (const row of members.authorizationProfile!)
    if (
      (row.administerPermissionCode === null) !==
      (row.administerPermissionKind === null)
    )
      return fail("REFERENCE_ADMIN_PERMISSION_INVALID", String(row.id));
  for (const row of members.fieldAccess!)
    if (
      row.readOperationId !== null &&
      anchors.tables.entity_operation?.find((o) => o.id === row.readOperationId)
        ?.operation_kind !== "read"
    )
      return fail("REFERENCE_READ_OPERATION_INVALID", String(row.id));
  for (const row of members.authorizationProfile!)
    for (const p of ["recordReadOperationId", "directoryOperationId"])
      if (
        anchors.tables.entity_operation?.find((o) => o.id === row[p])
          ?.operation_kind !== "read"
      )
        return fail("REFERENCE_READ_OPERATION_INVALID", String(row.id));
  for (const row of members.operationField!)
    if (
      anchors.tables.entity_operation?.find(
        (o) => o.id === row.entityOperationId,
      )?.operation_kind === "read"
    )
      return fail("REFERENCE_WRITE_OPERATION_INVALID", String(row.id));
  for (const row of members.predicate!) {
    const path = String(row.id);
    const rootOwners = owners.filter((p) => row[p] !== null);
    if (
      row.parentPredicateId === null &&
      rootOwners.some((p) =>
        members.predicate!.some(
          (other) =>
            other.id !== row.id &&
            other.parentPredicateId === null &&
            other.purpose === row.purpose &&
            other[p] === row[p],
        ),
      )
    )
      return fail("REFERENCE_PREDICATE_ROOT_CONFLICT", path);
    if (
      row.parentPredicateId === null
        ? rootOwners.length !== 1
        : rootOwners.length !== 0
    )
      return fail("REFERENCE_PREDICATE_OWNER_INVALID", path);
    if (
      row.parentPredicateId === null &&
      ((row.purpose === "list_filter" && row.viewId === null) ||
        (row.purpose === "record_lock" &&
          row.authorizationProfileId === null) ||
        (row.purpose === "editability" && row.fieldBindingId === null) ||
        (row.purpose === "visibility" &&
          ![
            "fieldBindingId",
            "surfaceOperationId",
            "surfaceSectionId",
            "navigationGroupId",
          ].includes(rootOwners[0]!)))
    )
      return fail("REFERENCE_PREDICATE_PURPOSE_INVALID", path);
    const populated = Object.values(payloads).filter((p) => row[p] !== null);
    if (row.nodeKind === "group") {
      if (
        row.conjunction === null ||
        row.entityFieldId !== null ||
        row.operator !== null ||
        row.valueKind !== null ||
        populated.length ||
        row.contextKey !== null ||
        row.contextVersion !== null
      )
        return fail("REFERENCE_PREDICATE_GROUP_INVALID", path);
    } else {
      if (
        row.conjunction !== null ||
        row.entityFieldId === null ||
        row.operator === null ||
        row.valueKind === null
      )
        return fail("REFERENCE_PREDICATE_CONDITION_INVALID", path);
      const nullary = ["is_null", "is_not_null"].includes(String(row.operator));
      if (!nullary && row.valueKind !== "context") {
        const type = String(
          anchors.tables.entity_field?.find((f) => f.id === row.entityFieldId)
            ?.data_type,
        );
        const expected = {
          text: "text",
          enum: "text",
          integer: "numeric",
          decimal: "numeric",
          money: "numeric",
          boolean: "boolean",
          date: "date",
          datetime: "datetime",
          uuid: "uuid",
        }[type];
        if (
          !expected ||
          String(row.valueKind).replace(/_set$/, "") !== expected
        )
          return fail("REFERENCE_PREDICATE_TYPE_INVALID", path);
        if (
          ["gt", "gte", "lt", "lte"].includes(String(row.operator)) &&
          !["numeric", "date", "datetime"].includes(expected)
        )
          return fail("REFERENCE_PREDICATE_OPERATOR_INVALID", path);
      }

      if (nullary !== (row.valueKind === "none"))
        return fail("REFERENCE_PREDICATE_OPERATOR_INVALID", path);
      if (row.valueKind === "none") {
        if (
          populated.length ||
          row.contextKey !== null ||
          row.contextVersion !== null
        )
          return fail("REFERENCE_PREDICATE_PAYLOAD_INVALID", path);
      } else if (row.valueKind === "context") {
        if (
          populated.length ||
          row.contextKey === null ||
          row.contextVersion === null
        )
          return fail("REFERENCE_PREDICATE_CONTEXT_INVALID", path);
      } else {
        const payload = payloads[row.valueKind as keyof typeof payloads];
        if (
          populated.length !== 1 ||
          populated[0] !== payload ||
          row.contextKey !== null ||
          row.contextVersion !== null
        )
          return fail("REFERENCE_PREDICATE_PAYLOAD_INVALID", path);
        const set = String(row.valueKind).endsWith("_set");
        if (
          set !== ["in", "not_in"].includes(String(row.operator)) ||
          (set && !(row[payload] as unknown[]).length)
        )
          return fail("REFERENCE_PREDICATE_OPERATOR_INVALID", path);
      }
    }
    let current = row;
    const visited = new Set<string>();
    let depth = 1;
    while (current.parentPredicateId !== null) {
      if (
        visited.has(String(current.id)) ||
        ++depth > anchors.maxPredicateDepth
      )
        return fail("REFERENCE_PREDICATE_CYCLE_DEPTH", path);
      visited.add(String(current.id));
      const parent = members.predicate!.find(
        (p) => p.id === current.parentPredicateId,
      )!;
      if (parent.nodeKind !== "group" || parent.purpose !== row.purpose)
        return fail("REFERENCE_PREDICATE_PARENT_INVALID", path);
      current = parent;
    }
  }
  return value as ReferenceMemberGraph;
}
