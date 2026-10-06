import {
  type ContractNode,
  type ContractValue,
  contractJsonSchema,
  validateFoundationNode,
  FoundationContractError,
} from "./foundation-contract.js";

export const referenceUuid = {
  type: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
} as const;
const text = {
  type: "string",
  minLength: 1,
  maxLength: 4000,
  pattern: "\\S",
} as const;
const key = { type: "string", pattern: "^[a-z][a-z0-9_.:-]{0,126}$" } as const;
const position = { type: "integer", minimum: 1, maximum: 2147483647 } as const;
const boolean = { type: "boolean" } as const;
const nil = { type: "null" } as const;
const numeric = {
  type: "string",
  pattern: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$",
} as const;
const date = {
  type: "string",
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
} as const;
const datetime = {
  type: "string",
  pattern:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$",
} as const;
const enumeration = <const V extends readonly string[]>(...values: V) =>
  ({ anyOf: values.map((value) => ({ const: value })) }) as {
    readonly anyOf: readonly { readonly const: V[number] }[];
  };
const plane = enumeration("studio", "neon", "mesh");
const optional = <const N extends ContractNode>(node: N) =>
  ({ anyOf: [node, nil] }) as const;
const array = <const N extends ContractNode>(items: N) =>
  ({ type: "array", items }) as const;
interface Column<N extends ContractNode = ContractNode> {
  readonly column: string;
  readonly node: N;
  readonly sqlType: string;
  readonly nullable: boolean;
  readonly reference?: string;
  readonly immutable?: boolean;
}
const column = <const N extends ContractNode>(
  name: string,
  node: N,
  sqlType: string,
  nullable = false,
  reference?: string,
  immutable = false,
) =>
  ({
    column: name,
    node,
    sqlType,
    nullable,
    ...(reference ? { reference } : {}),
    immutable,
  }) as Column<N>;
type NullableNode<N extends ContractNode, B extends boolean> = B extends true
  ? { readonly anyOf: readonly [N, typeof nil] }
  : N;
const maybe = <const N extends ContractNode, const B extends boolean>(
  node: N,
  nullable: B,
): NullableNode<N, B> =>
  (nullable ? optional(node) : node) as NullableNode<N, B>;
const ref = <const B extends boolean = false>(
  name: string,
  table: string,
  nullable: B = false as B,
) => ({
  ...column(
    name,
    maybe(referenceUuid, nullable),
    "uuid",
    nullable,
    table,
    true,
  ),
  reference: table,
});
const label = <const B extends boolean = false>(
  name = "label_id",
  nullable: B = false as B,
) => ref(name, "entity_label", nullable);
const integer = <const B extends boolean = false>(
  name: string,
  nullable: B = false as B,
) => column(name, maybe(position, nullable), "integer", nullable);
const str = <const B extends boolean = false>(
  name: string,
  nullable: B = false as B,
) => column(name, maybe(text, nullable), "text", nullable);
const enumColumn = <
  const V extends readonly string[],
  const B extends boolean = false,
>(
  name: string,
  values: V,
  nullable: B = false as B,
) => column(name, maybe(enumeration(...values), nullable), "text", nullable);
const define = <const C extends Readonly<Record<string, Column>>>(
  table: string,
  columns: C,
  unique: readonly (readonly string[])[],
  checks: readonly string[] = [],
  ordered?: { readonly column: string; readonly scope: readonly string[] },
) => ({ table, columns, unique, checks, ...(ordered ? { ordered } : {}) });

/** Exact selected reference members. Stable identities are service-owned and use
 * their own catalogue lifecycle; they are not editable draft-member commands. */
export const referenceMembers = {
  target: define(
    "entity_target",
    {
      targetPlane: enumColumn("target_plane", ["studio", "neon", "mesh"]),
      requirement: enumColumn("requirement", [
        "required",
        "recommended",
        "optional",
      ]),
      position: integer("position"),
    },
    [["target_plane"], ["position"]],
    [],
    { column: "position", scope: [] },
  ),
  fieldChoice: define(
    "entity_field_choice",
    {
      entityFieldId: ref("entity_field_id", "entity_field"),
      valueText: str("value_text"),
      labelId: label(),
      tone: enumColumn(
        "tone",
        ["neutral", "success", "warning", "danger"],
        true,
      ),
      position: integer("position"),
    },
    [
      ["entity_field_id", "value_text"],
      ["entity_field_id", "position"],
    ],
    [],
    { column: "position", scope: ["entity_field_id"] },
  ),
  navigationGroup: define(
    "entity_surface_navigation_group",
    {
      entitySurfaceId: ref("entity_surface_id", "entity_surface"),
      groupKey: column("group_key", key, "text", false, undefined, true),
      labelId: label("label_id", true),
      iconKey: column("icon_key", optional(key), "text", true),
      sectionDisplay: enumColumn(
        "section_display",
        ["continuous", "selected"],
        true,
      ),
      position: integer("position"),
    },
    [
      ["entity_surface_id", "group_key"],
      ["entity_surface_id", "position"],
    ],
    [],
    { column: "position", scope: ["entity_surface_id"] },
  ),
  surfaceView: define(
    "entity_surface_view",
    {
      entitySurfaceId: ref("entity_surface_id", "entity_surface"),
      viewKey: column("view_key", key, "text", false, undefined, true),
      viewKind: enumColumn("view_kind", ["default", "published"]),
      labelId: label("label_id", true),
      queryText: column(
        "query_text",
        optional({ type: "string", maxLength: 500 }),
        "text",
        true,
      ),
      density: enumColumn("density", ["comfortable", "compact", "spacious"]),
      mode: enumColumn("mode", ["table"]),
      position: integer("position"),
    },
    [
      ["entity_surface_id", "view_key"],
      ["entity_surface_id", "position"],
    ],
    [],
    { column: "position", scope: ["entity_surface_id"] },
  ),
  surfaceViewField: define(
    "entity_surface_view_field",
    {
      viewId: ref("view_id", "entity_surface_view"),
      fieldBindingId: ref("field_binding_id", "entity_surface_field_binding"),
      visiblePosition: integer("visible_position", true),
      sortPosition: integer("sort_position", true),
      sortDirection: enumColumn("sort_direction", ["asc", "desc"], true),
      grouped: column("grouped", boolean, "boolean"),
      widthOverride: integer("width_override", true),
    },
    [
      ["view_id", "field_binding_id"],
      ["view_id", "visible_position"],
      ["view_id", "sort_position"],
    ],
    [
      "(sort_position IS NULL)=(sort_direction IS NULL)",
      "visible_position IS NOT NULL OR sort_position IS NOT NULL OR grouped",
    ],
  ),
  accessPermission: define(
    "entity_access_permission",
    {
      entitySurfaceId: ref("entity_surface_id", "entity_surface", true),
      capabilityBindingId: column("capability_binding_id", nil, "uuid", true),
      targetPlane: enumColumn("target_plane", ["studio", "neon", "mesh"]),
      permissionCode: column(
        "permission_code",
        {
          type: "string",
          pattern: "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){1,7}$",
        },
        "text",
      ),
      permissionKind: enumColumn("permission_kind", [
        "entity_operation",
        "capability",
      ]),
    },
    [["entity_surface_id", "target_plane"]],
    ["entity_surface_id IS NOT NULL", "capability_binding_id IS NULL"],
  ),
  operationField: define(
    "entity_operation_field",
    {
      entityOperationId: ref("entity_operation_id", "entity_operation"),
      entityFieldId: ref("entity_field_id", "entity_field"),
      position: integer("position"),
      operationChangeSetId: column(
        "operation_change_set_id",
        referenceUuid,
        "uuid",
        false,
        undefined,
        true,
      ),
    },
    [
      ["entity_operation_id", "entity_field_id"],
      ["entity_operation_id", "position"],
    ],
    ["operation_change_set_id=change_set_id"],
    { column: "position", scope: ["entity_operation_id"] },
  ),
  authorizationProfile: define(
    "entity_authorization_profile",
    {
      targetPlane: enumColumn("target_plane", ["studio", "neon", "mesh"]),
      ownershipResolverKey: column("ownership_resolver_key", key, "text"),
      ownershipResolverVersion: integer("ownership_resolver_version"),
      recordReadOperationId: ref(
        "record_read_operation_id",
        "entity_operation",
      ),
      directoryOperationId: ref("directory_operation_id", "entity_operation"),
      directoryPopulation: enumColumn("directory_population", ["tenant"]),
      ownerFieldId: ref("owner_field_id", "entity_field", true),
      createdByFieldId: ref("created_by_field_id", "entity_field", true),
      updatedByFieldId: ref("updated_by_field_id", "entity_field", true),
      administerPermissionCode: column(
        "administer_permission_code",
        optional({
          type: "string",
          pattern: "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){1,7}$",
        }),
        "text",
        true,
      ),
      administerPermissionKind: enumColumn(
        "administer_permission_kind",
        ["entity_operation", "capability"],
        true,
      ),
    },
    [["target_plane"]],
    [
      "(administer_permission_code IS NULL)=(administer_permission_kind IS NULL)",
    ],
  ),
  fieldAccess: define(
    "entity_field_access",
    {
      entityFieldId: ref("entity_field_id", "entity_field"),
      targetPlane: enumColumn("target_plane", ["studio", "neon", "mesh"]),
      readOperationId: ref("read_operation_id", "entity_operation", true),
      representation: enumColumn("representation", [
        "plain",
        "masked",
        "omitted",
      ]),
      queryUses: column(
        "query_uses",
        array(enumeration("search", "filter", "sort", "group", "condition")),
        "text[]",
      ),
      readOperationChangeSetId: column(
        "read_operation_change_set_id",
        optional(referenceUuid),
        "uuid",
        true,
      ),
    },
    [["entity_field_id", "target_plane"]],
    [
      "(representation='omitted' AND read_operation_id IS NULL AND read_operation_change_set_id IS NULL AND cardinality(query_uses)=0) OR (representation IN ('plain','masked') AND read_operation_id IS NOT NULL AND read_operation_change_set_id=change_set_id)",
    ],
  ),
  predicate: define(
    "entity_predicate",
    {
      predicateKey: column(
        "predicate_key",
        key,
        "text",
        false,
        undefined,
        true,
      ),
      parentPredicateId: ref("parent_predicate_id", "entity_predicate", true),
      nodeKind: enumColumn("node_kind", ["condition", "group"]),
      conjunction: enumColumn("conjunction", ["all", "any"], true),
      purpose: enumColumn("purpose", [
        "list_filter",
        "record_lock",
        "visibility",
        "editability",
      ]),
      viewId: ref("view_id", "entity_surface_view", true),
      authorizationProfileId: ref(
        "authorization_profile_id",
        "entity_authorization_profile",
        true,
      ),
      fieldBindingId: ref(
        "field_binding_id",
        "entity_surface_field_binding",
        true,
      ),
      entityFieldId: ref("entity_field_id", "entity_field", true),
      operator: enumColumn(
        "operator",
        [
          "eq",
          "ne",
          "gt",
          "gte",
          "lt",
          "lte",
          "in",
          "not_in",
          "is_null",
          "is_not_null",
        ],
        true,
      ),
      valueKind: enumColumn(
        "value_kind",
        [
          "text",
          "numeric",
          "boolean",
          "date",
          "datetime",
          "uuid",
          "text_set",
          "numeric_set",
          "uuid_set",
          "date_set",
          "datetime_set",
          "context",
          "none",
        ],
        true,
      ),
      valueText: str("value_text", true),
      valueNumeric: column("value_numeric", optional(numeric), "numeric", true),
      valueBoolean: column("value_boolean", optional(boolean), "boolean", true),
      valueDate: column("value_date", optional(date), "date", true),
      valueDatetime: column(
        "value_datetime",
        optional(datetime),
        "timestamptz",
        true,
      ),
      valueUuid: column("value_uuid", optional(referenceUuid), "uuid", true),
      valueTextSet: column(
        "value_text_set",
        optional(array(text)),
        "text[]",
        true,
      ),
      position: integer("position"),
      surfaceOperationId: ref(
        "surface_operation_id",
        "entity_surface_operation",
        true,
      ),
      surfaceSectionId: ref(
        "surface_section_id",
        "entity_surface_section",
        true,
      ),
      navigationGroupId: ref(
        "navigation_group_id",
        "entity_surface_navigation_group",
        true,
      ),
      valueNumericSet: column(
        "value_numeric_set",
        optional(array(numeric)),
        "numeric[]",
        true,
      ),
      valueUuidSet: column(
        "value_uuid_set",
        optional(array(referenceUuid)),
        "uuid[]",
        true,
      ),
      valueDateSet: column(
        "value_date_set",
        optional(array(date)),
        "date[]",
        true,
      ),
      valueDatetimeSet: column(
        "value_datetime_set",
        optional(array(datetime)),
        "timestamptz[]",
        true,
      ),
      contextKey: column("context_key", optional(key), "text", true),
      contextVersion: integer("context_version", true),
    },
    [
      ["predicate_key"],
      [
        "purpose",
        "parent_predicate_id",
        "view_id",
        "authorization_profile_id",
        "field_binding_id",
        "surface_operation_id",
        "surface_section_id",
        "navigation_group_id",
        "position",
      ],
    ],
    [
      "(parent_predicate_id IS NULL AND num_nonnulls(view_id,authorization_profile_id,field_binding_id,surface_operation_id,surface_section_id,navigation_group_id)=1) OR (parent_predicate_id IS NOT NULL AND num_nonnulls(view_id,authorization_profile_id,field_binding_id,surface_operation_id,surface_section_id,navigation_group_id)=0)",
    ],
    {
      column: "position",
      scope: [
        "purpose",
        "parent_predicate_id",
        "view_id",
        "authorization_profile_id",
        "field_binding_id",
        "surface_operation_id",
        "surface_section_id",
        "navigation_group_id",
      ],
    },
  ),
} as const;
export type ReferenceMemberKind = keyof typeof referenceMembers;
export type ReferenceMember<K extends ReferenceMemberKind> = {
  readonly id: string;
} & {
  readonly [P in keyof (typeof referenceMembers)[K]["columns"]]: ContractValue<
    (typeof referenceMembers)[K]["columns"][P] extends Column<infer N>
      ? N
      : never
  >;
};
export type ReferenceMemberGraph = {
  readonly contract: "entity.authoring-reference-members/1";
  readonly members: {
    readonly [K in ReferenceMemberKind]: readonly ReferenceMember<K>[];
  };
};
export function memberSchema(
  kind: ReferenceMemberKind,
  patch = false,
): ContractNode {
  const properties = Object.fromEntries(
    Object.entries(referenceMembers[kind].columns).map(([name, c]) => [
      name,
      c.node,
    ]),
  );
  return { type: "object", properties, ...(patch ? { required: [] } : {}) };
}
export function referenceMemberSchema(): object {
  return {
    type: "object",
    additionalProperties: false,
    required: ["contract", "members"],
    properties: {
      contract: { const: "entity.authoring-reference-members/1" },
      members: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(referenceMembers),
        properties: Object.fromEntries(
          Object.keys(referenceMembers).map((k) => [
            k,
            {
              type: "array",
              items: {
                ...(contractJsonSchema(
                  memberSchema(k as ReferenceMemberKind),
                ) as object),
                properties: {
                  id: referenceUuid,
                  ...Object.fromEntries(
                    Object.entries(
                      referenceMembers[k as ReferenceMemberKind].columns,
                    ).map(([p, c]) => [p, contractJsonSchema(c.node)]),
                  ),
                },
                required: [
                  "id",
                  ...Object.keys(
                    referenceMembers[k as ReferenceMemberKind].columns,
                  ),
                ],
              },
            },
          ]),
        ),
      },
    },
  };
}
export function validateReferenceMember(
  kind: ReferenceMemberKind,
  row: unknown,
  patch = false,
): void {
  validateFoundationNode(memberSchema(kind, patch), row, `/members/${kind}`);
}
export function emptyReferenceMembers(): ReferenceMemberGraph {
  return {
    contract: "entity.authoring-reference-members/1",
    members: Object.fromEntries(
      Object.keys(referenceMembers).map((k) => [k, []]),
    ) as unknown as ReferenceMemberGraph["members"],
  };
}
export function referenceFailure(code: string, path: string): never {
  throw new FoundationContractError(code, path);
}

export const referenceConstraintNames = () =>
  Object.values(referenceMembers).flatMap((d) => [
    ...d.unique.map((_, i) => `metadata.${d.table}_logical_${i}_uq`),
    ...Object.values(d.columns)
      .filter((c) => c.reference)
      .map((c) => `metadata.${d.table}_${c.column}_fk`),
  ]);

export interface ReferenceFieldIdentity {
  readonly createdAt: string;
  readonly createdBy: string;
  readonly id: string;
  readonly entityId: string;
  readonly tenantId: string | null;
  readonly fieldKey: string;
  readonly parentIdentityId: string | null;
  readonly identityStatus: "reserved" | "active" | "retired";
  readonly introducedChangeSetId: string;
  readonly firstReleaseId: string | null;
  readonly retiredAt: string | null;
  readonly retiredBy: string | null;
  readonly retirementReleaseId: string | null;
  readonly replacementIdentityId: string | null;
}

export const referenceIdentityMapping = {
  table: "entity_field_identity",
  serviceOwned: true,
  columns: {
    entityId: "entity_id",
    tenantId: "tenant_id",
    fieldKey: "field_key",
    parentIdentityId: "parent_identity_id",
    identityStatus: "identity_status",
    retiredAt: "retired_at",
    retiredBy: "retired_by",
    retirementReleaseId: "retirement_release_id",
    replacementIdentityId: "replacement_identity_id",
    introducedChangeSetId: "introduced_change_set_id",
    firstReleaseId: "first_release_id",
  },
} as const;

export const referencePredicateOwners = [
  "viewId",
  "authorizationProfileId",
  "fieldBindingId",
  "surfaceOperationId",
  "surfaceSectionId",
  "navigationGroupId",
] as const;

export const referenceIdentityContract = {
  type: "object",
  properties: {
    id: referenceUuid,
    entityId: referenceUuid,
    tenantId: optional(referenceUuid),
    fieldKey: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
    parentIdentityId: optional(referenceUuid),
    identityStatus: enumeration("reserved", "active", "retired"),
    introducedChangeSetId: referenceUuid,
    firstReleaseId: optional(referenceUuid),
    retiredAt: optional(datetime),
    retiredBy: optional(referenceUuid),
    retirementReleaseId: optional(referenceUuid),
    replacementIdentityId: optional(referenceUuid),
    createdAt: datetime,
    createdBy: referenceUuid,
  },
} as const;
export function validateReferenceIdentity(value: unknown): void {
  validateFoundationNode(referenceIdentityContract, value, "/fieldIdentities");
}
