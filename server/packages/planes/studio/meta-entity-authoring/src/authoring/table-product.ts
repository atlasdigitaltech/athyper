import type {
  AuthoringPlane,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { isCanonicalEntityCode } from "@athyper/contract-platform-entity-runtime";
import { parseProductLocalization } from "./product-localization.js";
import { parseEntityRuntimeLocalizedText } from "@athyper/contract-platform-entity-runtime";
import { compileGraph } from "../deterministic.js";

/** Standard graph authoring for platform-maintained definitions of tenant records.
 * Storage registration, executable handlers and grants require independent qualification. */
export interface TableEntityProduct {
  readonly schema: "athyper.table-entity-product/1";
  readonly moduleCode: string;
  readonly planes: readonly AuthoringPlane[];
  readonly definition: MetaEntityGraph;
}

export function parseTableEntityProduct(value: unknown, localization?: unknown): TableEntityProduct {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("TABLE_PRODUCT_OBJECT_REQUIRED");
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).sort().join() !==
      ["definition", "moduleCode", "planes", "schema"].join() ||
    source.schema !== "athyper.table-entity-product/1" ||
    typeof source.moduleCode !== "string" ||
    !/^[a-z][a-z0-9_]{1,62}$/.test(source.moduleCode) ||
    !Array.isArray(source.planes) ||
    !source.planes.includes("studio") ||
    new Set(source.planes).size !== source.planes.length ||
    source.planes.some((plane) => !["studio", "neon", "mesh"].includes(plane))
  )
    throw Error("TABLE_PRODUCT_INVALID");
  const labels = localization === undefined ? undefined : parseProductLocalization(localization);
  const hydrate = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(hydrate);
    if (!value || typeof value !== "object") return value;
    if ("labelKey" in value && "defaultText" in value) return labels ? labels.localize(parseEntityRuntimeLocalizedText(value)) : value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, hydrate(child)]));
  };
  const graph = hydrate(structuredClone(source.definition)) as MetaEntityGraph;
  if (
    !graph ||
    !isCanonicalEntityCode(graph.entity?.entityCode) ||
    graph.entity.ownershipModel !== "system" ||
    !["business", "configuration"].includes(graph.entity.entityClass ?? "") ||
    graph.runtimeProfiles?.length !== 1
  )
    throw Error("TABLE_PRODUCT_IDENTITY_INVALID");
  const profile = graph.runtimeProfiles[0]!;
  if (
    profile.storagePlane !== "studio" ||
    profile.backingKind !== "table" ||
    profile.apiExposure !== "api" ||
    profile.readMode !== "generic" ||
    !["none", "generic", "facade"].includes(profile.writeMode) ||
    !profile.storageSchema ||
    !profile.storageObject ||
    !profile.tenantFieldKey ||
    !graph.fields.some(
      (field) =>
        field.fieldKey === profile.tenantFieldKey &&
        field.dataType === "uuid" &&
        field.writeMode === "read_only",
    ) ||
    !graph.fields.some(
      (field) =>
        field.fieldKey === "id" &&
        field.dataType === "uuid" &&
        field.writeMode === "read_only",
    )
  )
    throw Error("TABLE_PRODUCT_TENANT_STORAGE_REQUIRED");
  if (
    profile.writeMode !== "none" &&
    (profile.concurrencyMode !== "optimistic" ||
      !profile.recordVersionFieldKey ||
      !graph.fields.some(
        (field) =>
          field.fieldKey === profile.recordVersionFieldKey &&
          field.writeMode === "read_only" &&
          ["integer", "bigint"].includes(field.dataType),
      ))
  )
    throw Error("TABLE_PRODUCT_WRITE_CONCURRENCY_REQUIRED");
  if (
    graph.fields.some(
      (field) =>
        field.dataType === "enum" &&
        !/^[a-z][a-z0-9_.-]{1,126}$/.test(
          String(field.typeConfig?.domain_code ?? ""),
        ),
    )
  )
    throw Error("TABLE_PRODUCT_ENUM_DOMAIN_REQUIRED");
  if (
    graph.operations.some(
      (operation) =>
        operation.operationKind !== "read" && !operation.handlerKey,
    )
  )
    throw Error("TABLE_PRODUCT_OPERATION_HANDLER_REQUIRED");
  if (
    graph.surfaces?.some(
      (surface) =>
        surface.layoutConfig?.systemReferenceProduct !== undefined ||
        surface.layoutConfig?.tableEntityProduct !== undefined,
    )
  )
    throw Error("TABLE_PRODUCT_SOURCE_MARKER_RESERVED");
  const result: TableEntityProduct = {
    schema: "athyper.table-entity-product/1",
    moduleCode: source.moduleCode,
    planes: [...source.planes] as AuthoringPlane[],
    definition: graph,
  };
  for (const plane of result.planes)
    compileGraph(targetTableEntityGraph(graph, plane));
  return result;
}

/** Change explicit plane coordinates only; never infer additional targets. */
export function targetTableEntityGraph(
  source: MetaEntityGraph,
  plane: AuthoringPlane,
): MetaEntityGraph {
  const graph = structuredClone(source);
  return {
    ...graph,
    runtimeProfiles: graph.runtimeProfiles?.map((profile) => ({
      ...profile,
      storagePlane: plane,
    })),
    operationPermissions: graph.operationPermissions?.map((binding) => ({
      ...binding,
      targetPlane: plane,
    })),
    operationScopeBindings: graph.operationScopeBindings?.map((binding) => ({
      ...binding,
      targetPlane: plane,
    })),
    surfaces: graph.surfaces?.map((surface) => {
      const authorization = surface.layoutConfig?.authorization;
      if (authorization === undefined) return surface;
      if (
        !authorization ||
        typeof authorization !== "object" ||
        Array.isArray(authorization) ||
        Reflect.get(authorization, "planeKey") !== "studio"
      )
        throw Error("TABLE_PRODUCT_AUTHORIZATION_SOURCE_INVALID");
      return {
        ...surface,
        layoutConfig: {
          ...surface.layoutConfig,
          authorization: { ...authorization, planeKey: plane },
        },
      };
    }),
  };
}

export function compileTableEntityProduct(
  product: TableEntityProduct,
  plane: AuthoringPlane,
) {
  const validated = parseTableEntityProduct(product);
  if (!validated.planes.includes(plane))
    throw Error("TABLE_PRODUCT_TARGET_EXCLUDED");
  const graph = targetTableEntityGraph(validated.definition, plane);
  return { graph, artifact: compileGraph(graph) };
}
