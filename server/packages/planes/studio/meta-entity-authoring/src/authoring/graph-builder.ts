import { createHash } from "node:crypto";
import type {
  AuthoringPlane,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  type EntityAiDescriptorV1,
  COMMON_REFERENCE_VIEW_PERMISSION,
} from "@athyper/server-contract-metadata";
import {
  parseEntityDetailNavigation,
  type EntityDetailNavigationV1,
  type EntityRecordSummaryViewV1,
  type EntityRuntimeLocalizedTextV1,
} from "@athyper/contract-platform-entity-runtime";

/** Same catalog code on every plane; permission IDs and grants remain plane-local.
 * Applies only to explicitly published shared reference entities, not schema-wide SQL access.
 */
export { COMMON_REFERENCE_VIEW_PERMISSION };

export interface SharedReferenceDefinition {
  readonly ai?: EntityAiDescriptorV1;
  readonly summaryView?: EntityRecordSummaryViewV1;
  readonly navigation?: EntityDetailNavigationV1;
  /** Declarative keys only. Availability is checked against host-owned callables. */
  readonly runtimeBindings?: readonly {
    operation: string;
    handler: string;
    resolver: string;
  }[];
  /** Separate capability policy; never merged into reference CRUD operations. */
  readonly capabilities?: MetaEntityGraph["capabilities"];
  readonly entityCode: string;
  readonly title: string;
  readonly localizedTitle?: EntityRuntimeLocalizedTextV1;
  readonly entityLabel?: EntityRuntimeLocalizedTextV1;
  readonly storageObject: string;
  readonly codeField: string;
  readonly titleField: string;
  readonly fields: readonly {
    key: string;
    label: string;
    localizedLabel?: EntityRuntimeLocalizedTextV1;
    type: "uuid" | "string" | "boolean" | "datetime" | "integer";
    required?: boolean;
  }[];
  readonly columns: readonly string[];
  readonly searchFields: readonly string[];
  readonly sections: readonly {
    key: string;
    label: string;
    localizedLabel?: EntityRuntimeLocalizedTextV1;
    fields: readonly string[];
  }[];
}

/** Source graph only. Publication must still approve, sign, and activate it.
 * IAM is tenant-context scoped; the shared physical rows have no tenant column.
 * There are deliberately no command handlers, writable fields or write operations.
 */
export function buildSharedReferenceGraph(
  definition: SharedReferenceDefinition,
  plane: AuthoringPlane,
): MetaEntityGraph {
  const id = (key: string) => {
    const h = createHash("sha256")
      .update(`shared-reference:${definition.entityCode}:${plane}:${key}`)
      .digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  const fieldKeys = definition.fields.map((field) => field.key);
  for (const key of [
    "id",
    definition.codeField,
    definition.titleField,
    ...definition.columns,
    ...definition.searchFields,
    ...definition.sections.flatMap((section) => section.fields),
  ]) {
    if (!fieldKeys.includes(key))
      throw new TypeError(`Unknown shared reference field: ${key}`);
  }
  const permissionCode = COMMON_REFERENCE_VIEW_PERMISSION;
  const localizedLabels =
    definition.localizedTitle ||
    definition.entityLabel ||
    definition.fields.some((field) => field.localizedLabel)
      ? {
          ...(definition.localizedTitle
            ? { title: definition.localizedTitle }
            : {}),
          ...(definition.entityLabel ? { entity: definition.entityLabel } : {}),
          fields: Object.fromEntries(
            definition.fields.flatMap((field) =>
              field.localizedLabel ? [[field.key, field.localizedLabel]] : [],
            ),
          ),
        }
      : undefined;
  return {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: {
      entityCode: definition.entityCode,
      entityClass: "reference",
      ownershipModel: "system",
    },
    ...(definition.capabilities?.length
      ? { capabilities: definition.capabilities }
      : {}),
    runtimeProfiles: [
      {
        id: id("runtime"),
        profileKey: "default",
        backingKind: "table",
        storagePlane: plane,
        storageSchema: "shared",
        storageObject: definition.storageObject,
        apiExposure: "api",
        readMode: "generic",
        writeMode: "none",
        createMode: "form_only",
        concurrencyMode: "none",
      },
    ],
    fields: definition.fields.map((field) => ({
      id: id(`field:${field.key}`),
      fieldKey: field.key,
      dataType: field.type,
      typeConfig: { kind: field.type },
      cardinality: field.required ? "one" : "zero_or_one",
      valueOrigin: "stored",
      writeMode: "read_only",
      storagePath: field.key,
      dataClassification: "public",
      status: "active",
    })),
    keys: [
      {
        id: id("primary"),
        keyKey: "primary",
        keyKind: "primary",
        uniquenessScope: "global",
      },
      {
        id: id("code"),
        keyKey: "code",
        keyKind: "alternate",
        uniquenessScope: "global",
      },
    ],
    keyFields: [
      {
        entityKeyId: id("primary"),
        entityFieldId: id("field:id"),
        position: 1,
      },
      {
        entityKeyId: id("code"),
        entityFieldId: id(`field:${definition.codeField}`),
        position: 1,
      },
    ],
    searchProfiles: [
      {
        id: id("search"),
        searchKey: "default",
        searchKind: "keyword",
        minimumQueryLength: 1,
        isDefault: true,
      },
    ],
    searchFields: definition.searchFields.map((key, position) => ({
      entitySearchProfileId: id("search"),
      entityFieldId: id(`field:${key}`),
      position: position + 1,
      matchMode: "contains",
    })),
    operations: ["list", "read"].map((key) => ({
      id: id(`operation:${key}`),
      operationKey: key,
      operationKind: "read",
      label: key === "list" ? definition.title : "View record",
      fieldKeys,
      auditEventCode: `${definition.entityCode}.${key}`,
    })),
    operationPermissions: ["list", "read"].map((key) => ({
      entityOperationId: id(`operation:${key}`),
      targetPlane: plane,
      permissionCode,
      permissionKind: "capability",
    })),
    operationScopeBindings: ["list", "read"].map((key) => ({
      entityOperationId: id(`operation:${key}`),
      bindingKey: `${key}_tenant`,
      targetPlane: plane,
      decisionMode: key === "list" ? "collection" : "entity_resource",
      scopeKind: "tenant",
      coordinateSource: "tenant_context",
      missingValueBehavior: "deny",
    })),
    surfaces: [
      {
        id: id("list"),
        surfaceKey: "list",
        surfaceKind: "list",
        title: definition.title,
        isDefault: true,
        layoutConfig: {
          referenceCapability: COMMON_REFERENCE_VIEW_PERMISSION,
          ...(localizedLabels ? { localizedLabels } : {}),
          identityField: definition.codeField,
          defaultState: {
            sort: [{ field: definition.titleField, direction: "asc" }],
            density: "comfortable",
            mode: "table",
          },
          supportedModes: ["table", "compact"],
          limits: {
            defaultPageSize: 25,
            allowedPageSizes: [10, 25, 50, 100],
            maxSortLevels: 3,
            countMode: "exact",
          },
          ...(definition.runtimeBindings
            ? {
                authorizationRuntime: {
                  schemaVersion: 1,
                  runtimeVersion: "entity-authorization.v1",
                  bindings: structuredClone(definition.runtimeBindings),
                },
              }
            : {}),
          authorization: {
            schemaVersion: 1,
            entityCode: definition.entityCode,
            planeKey: plane,
            ownership: "tenant.record.v1",
            directory: { operation: "list", population: "tenant" },
            recordReadOperation: "read",
            operations: ["list", "read"].map((key) => ({
              key,
              permissionCode,
              scope: "tenant.record.v1",
              target: key === "list" ? "collection" : "existing",
              effect: "read",
              requiresParentRead: false,
              requiresPreflight: false,
            })),
            fieldPolicies: [
              {
                key: "reference",
                fields: fieldKeys,
                readOperation: "read",
                representation: "plain",
                writeOperations: [],
                queryUses: ["search", "filter", "sort", "group"],
              },
            ],
            surfaces: [],
            relationships: [],
          },
        },
      },
      {
        id: id("detail"),
        surfaceKey: "detail",
        surfaceKind: "detail",
        title: definition.title,
        layoutConfig: {
          ...(definition.ai ? { ai: definition.ai } : {}),
          recordPresentation: {
            schemaVersion: 1,
            ...(localizedLabels ? { localizedLabels } : {}),
            titleField: definition.titleField,
            codeField: definition.codeField,
            sections: definition.sections,
            actions: [],
            ...(definition.summaryView
              ? { summaryView: definition.summaryView }
              : {}),
            ...(definition.navigation
              ? {
                  navigation: parseEntityDetailNavigation(
                    definition.navigation,
                    definition.sections.map((section) => section.key),
                  ),
                }
              : {}),
          },
        },
      },
    ],
    surfaceFieldBindings: ["list", "detail"].flatMap((surface) =>
      definition.fields.map((field, position) => ({
        entitySurfaceId: id(surface),
        entityFieldId: id(`field:${field.key}`),
        bindingKey: `${surface}_${field.key}`,
        position:
          surface === "list" && definition.columns.includes(field.key)
            ? definition.columns.indexOf(field.key)
            : definition.columns.length + position,
        labelOverride: field.label,
        displayConfig: {
          defaultVisible:
            surface === "detail" || definition.columns.includes(field.key),
        },
      })),
    ),
  };
}
