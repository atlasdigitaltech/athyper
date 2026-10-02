import type {
  AuthoringPlane,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { isCanonicalEntityCode } from "@athyper/contract-platform-entity-runtime";
import { parseProductLocalization } from "./product-localization.js";
import { parseEntityRuntimeLocalizedText } from "@athyper/contract-platform-entity-runtime";
import { compileGraph, sha256 } from "../deterministic.js";
import type { EntityAiDescriptorV1 } from "@athyper/server-contract-metadata";

/** Standard graph authoring for platform-maintained definitions of tenant records.
 * Storage registration, executable handlers and grants require independent qualification. */
export interface TableEntityProduct {
  readonly schema: "athyper.table-entity-product/1";
  readonly moduleCode: string;
  readonly planes: readonly AuthoringPlane[];
  readonly definition: MetaEntityGraph & { readonly ai?: EntityAiDescriptorV1 };
}

export function parseTableEntityProduct(
  value: unknown,
  localization?: unknown,
): TableEntityProduct {
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
    source.planes.length === 0 ||
    new Set(source.planes).size !== source.planes.length ||
    source.planes.some((plane) => !["studio", "neon", "mesh"].includes(plane))
  )
    throw Error("TABLE_PRODUCT_INVALID");
  const labels =
    localization === undefined
      ? undefined
      : parseProductLocalization(localization);
  const hydrate = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(hydrate);
    if (!value || typeof value !== "object") return value;
    if ("labelKey" in value && "defaultText" in value)
      return labels
        ? labels.localize(parseEntityRuntimeLocalizedText(value))
        : value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, hydrate(child)]),
    );
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
    !source.planes.includes(profile.storagePlane) ||
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
  source: TableEntityProduct["definition"],
  plane: AuthoringPlane,
): MetaEntityGraph {
  // definition.ai owns product authoring. Surfaces carry only its compiler
  // projection; conflicting independently edited projections fail closed.
  const { ai, ...graph } = structuredClone(source);
  if (ai) {
    const details = graph.surfaces?.filter(surface => surface.surfaceKind === "detail" && surface.status !== "deprecated") ?? [];
    if (details.length !== 1) throw Error("TABLE_PRODUCT_AI_DETAIL_REQUIRED");
    if (graph.surfaces?.some(surface => surface.layoutConfig?.ai !== undefined &&
      (surface.id !== details[0]!.id || sha256(surface.layoutConfig.ai) !== sha256(ai))))
      throw Error("TABLE_PRODUCT_AI_AUTHORITY_CONFLICT");
    graph.surfaces = graph.surfaces!.map(surface => surface.id === details[0]!.id
      ? { ...surface, layoutConfig: { ...surface.layoutConfig, ai } } : surface);
  }
  const sourcePlane = source.runtimeProfiles?.[0]?.storagePlane;
  if (!sourcePlane || !["studio", "neon", "mesh"].includes(sourcePlane))
    throw Error("TABLE_PRODUCT_STORAGE_PLANE_REQUIRED");
  const permission = (code: string) =>
    code.startsWith(`${sourcePlane}.`) ? `${plane}.${code.slice(sourcePlane.length + 1)}` : code;
  return {
    ...graph,
    runtimeProfiles: graph.runtimeProfiles?.map((profile) => ({
      ...profile,
      storagePlane: plane,
    })),
    operationPermissions: graph.operationPermissions?.map((binding) => ({
      ...binding,
      targetPlane: plane,
      permissionCode: permission(binding.permissionCode),
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
        Reflect.get(authorization, "planeKey") !== sourcePlane
      )
        throw Error("TABLE_PRODUCT_AUTHORIZATION_SOURCE_INVALID");
      return {
        ...surface,
        layoutConfig: {
          ...surface.layoutConfig,
          authorization: {
            ...authorization,
            planeKey: plane,
            operations: (
              Reflect.get(authorization, "operations") as {
                permissionCode: string;
              }[]
            ).map((operation) => ({
              ...operation,
              permissionCode: permission(operation.permissionCode),
            })),
          },
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
