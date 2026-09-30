import type {
  AuthoringPlane,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  buildSharedReferenceGraph,
  type SharedReferenceDefinition,
} from "./graph-builder.js";
import { compileGraph } from "../deterministic.js";
import {
  parseEntityDetailNavigation,
  parseEntityRecordPresentation,
  parseEntityRuntimeLocalizedText,
  isCanonicalEntityCode,
  isObjectRecord,
  isBoundedNonBlankText,
} from "@athyper/contract-platform-entity-runtime";
import { parseProductLocalization } from "./product-localization.js";

export interface SharedReferenceProduct {
  readonly schema: "athyper.shared-reference-product/1";
  readonly moduleCode: string;
  readonly planes: readonly AuthoringPlane[];
  readonly definition: SharedReferenceDefinition;
}
function object(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!isObjectRecord(value)) throw Error("REFERENCE_PRODUCT_OBJECT_REQUIRED");
  const row = value as Record<string, unknown>;
  if (
    required.some((key) => !Object.hasOwn(row, key)) ||
    Object.keys(row).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    throw Error("REFERENCE_PRODUCT_KEYS_INVALID");
  return row;
}
function text(value: unknown, identifier = false): string {
  if (
    !isBoundedNonBlankText(value, 256) ||
    (identifier && !/^[a-z][a-z0-9_]{0,62}$/.test(value))
  )
    throw Error("REFERENCE_PRODUCT_TEXT_INVALID");
  return value;
}
function list(value: unknown): unknown[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 200 ||
    Array.from(value).some((v) => v === undefined)
  )
    throw Error("REFERENCE_PRODUCT_LIST_INVALID");
  return value;
}
function label(
  value: unknown,
  reference?: unknown,
  localize?: ReturnType<typeof parseProductLocalization>["localize"],
) {
  if (typeof value !== "string" && reference !== undefined)
    throw Error("REFERENCE_PRODUCT_LABEL_CONFLICT");
  const localizedLabel =
    reference !== undefined
      ? parseEntityRuntimeLocalizedText(reference)
      : typeof value === "string"
        ? undefined
        : parseEntityRuntimeLocalizedText(value);
  const fallback =
    typeof value === "string" ? text(value) : localizedLabel!.defaultText;
  if (localizedLabel && localizedLabel.defaultText !== fallback)
    throw Error("REFERENCE_PRODUCT_LABEL_FALLBACK_MISMATCH");
  return {
    label: fallback,
    ...(localizedLabel
      ? { localizedLabel: localize ? localize(localizedLabel) : localizedLabel }
      : {}),
  };
}
function keys(value: unknown): string[] {
  const result = list(value).map((v) => text(v, true));
  if (new Set(result).size !== result.length)
    throw Error("REFERENCE_PRODUCT_DUPLICATE_KEY");
  return result;
}

/** Reference-product metadata parsing/qualification, reused across entities.
 * No files, database writes or activation authority. */
export function parseSharedReferenceProduct(
  value: unknown,
  capabilities?: unknown,
  localization?: unknown,
): SharedReferenceProduct {
  const source = object(value, [
    "schema",
    "moduleCode",
    "planes",
    "definition",
  ]);
  if (source.schema !== "athyper.shared-reference-product/1")
    throw Error("REFERENCE_PRODUCT_SCHEMA_INVALID");
  const planes = keys(source.planes);
  if (planes.some((plane) => !["studio", "neon", "mesh"].includes(plane)))
    throw Error("REFERENCE_PRODUCT_PLANE_INVALID");
  const row = object(
    source.definition,
    [
      "entityCode",
      "title",
      "storageObject",
      "codeField",
      "titleField",
      "fields",
      "columns",
      "searchFields",
      "sections",
    ],
    [
      "runtimeBindings",
      "navigation",
      "summaryView",
      "localizedTitle",
      "entityLabel",
    ],
  );
  if (!isCanonicalEntityCode(row.entityCode))
    throw Error("REFERENCE_PRODUCT_ENTITY_CODE_INVALID");
  const runtimeBindings =
    row.runtimeBindings === undefined
      ? undefined
      : list(row.runtimeBindings).map((value) => {
          const binding = object(value, ["operation", "handler", "resolver"]);
          return {
            operation: text(binding.operation, true),
            handler: text(binding.handler),
            resolver: text(binding.resolver),
          };
        });
  const localize =
    localization === undefined
      ? undefined
      : parseProductLocalization(localization).localize;
  const fields = list(row.fields).map((value) => {
    const field = object(
      value,
      ["key", "label", "type"],
      ["required", "localizedLabel"],
    );
    if (
      !["uuid", "string", "boolean", "datetime", "integer"].includes(
        String(field.type),
      ) ||
      (field.required !== undefined && typeof field.required !== "boolean")
    )
      throw Error("REFERENCE_PRODUCT_FIELD_INVALID");
    return {
      key: text(field.key, true),
      ...label(field.label, field.localizedLabel, localize),
      type: field.type as SharedReferenceDefinition["fields"][number]["type"],
      ...(field.required === undefined
        ? {}
        : { required: field.required as boolean }),
    };
  });
  if (
    new Set(fields.map((f) => f.key)).size !== fields.length ||
    !fields.some((f) => f.key === "id" && f.type === "uuid" && f.required)
  )
    throw Error("REFERENCE_PRODUCT_IDENTITY_INVALID");
  const sections = list(row.sections).map((value) => {
    const section = object(
      value,
      ["key", "label", "fields"],
      ["localizedLabel"],
    );
    return {
      key: text(section.key, true),
      ...label(section.label, section.localizedLabel, localize),
      fields: keys(section.fields),
    };
  });
  if (new Set(sections.map((s) => s.key)).size !== sections.length)
    throw Error("REFERENCE_PRODUCT_DUPLICATE_SECTION");
  if (capabilities !== undefined && !Array.isArray(capabilities))
    throw Error("REFERENCE_PRODUCT_CAPABILITIES_INVALID");
  const title = label(row.title, row.localizedTitle, localize);
  const navigation =
    row.navigation === undefined
      ? undefined
      : parseEntityDetailNavigation(
          row.navigation,
          sections.map((section) => section.key),
        );
  const definition: SharedReferenceDefinition = {
    entityCode: text(row.entityCode, true),
    title: title.label,
    ...(title.localizedLabel ? { localizedTitle: title.localizedLabel } : {}),
    ...(row.entityLabel === undefined
      ? {}
      : {
          entityLabel: localize
            ? localize(parseEntityRuntimeLocalizedText(row.entityLabel))
            : parseEntityRuntimeLocalizedText(row.entityLabel),
        }),
    storageObject: text(row.storageObject, true),
    codeField: text(row.codeField, true),
    titleField: text(row.titleField, true),
    fields,
    columns: keys(row.columns),
    searchFields: keys(row.searchFields),
    sections,
    ...(row.summaryView === undefined
      ? {}
      : {
          summaryView: parseEntityRecordPresentation({
            schemaVersion: 1,
            titleField: row.titleField,
            sections,
            summaryView: row.summaryView,
          }).summaryView,
        }),
    ...(navigation
      ? {
          navigation: {
            ...navigation,
            ...(navigation.tabs
              ? {
                  tabs: navigation.tabs.map((tab) => ({
                    ...tab,
                    ...(tab.localizedLabel && localize
                      ? { localizedLabel: localize(tab.localizedLabel) }
                      : {}),
                  })),
                }
              : {}),
          },
        }
      : {}),
    ...(runtimeBindings ? { runtimeBindings } : {}),
    ...(capabilities === undefined
      ? {}
      : {
          capabilities: structuredClone(
            capabilities,
          ) as MetaEntityGraph["capabilities"],
        }),
  };
  const result: SharedReferenceProduct = {
    schema: "athyper.shared-reference-product/1",
    moduleCode: text(source.moduleCode, true),
    planes: planes as AuthoringPlane[],
    definition,
  };
  // Existing graph/capability validators enforce read-only fields, exact common
  // permissions and owner bindings. Parsing cannot grant a permission or approval.
  for (const plane of result.planes)
    compileGraph(buildSharedReferenceGraph(definition, plane));
  return result;
}

export function compileSharedReferenceProduct(
  product: SharedReferenceProduct,
  plane: AuthoringPlane,
) {
  // Revalidate caller-owned objects; a prior parse is not a mutation-proof capability.
  const { capabilities, ...definition } = product.definition;
  const validated = parseSharedReferenceProduct(
    { ...product, definition },
    capabilities,
  );
  if (!validated.planes.includes(plane))
    throw Error("REFERENCE_PRODUCT_TARGET_EXCLUDED");
  const graph = buildSharedReferenceGraph(validated.definition, plane);
  return { graph, artifact: compileGraph(graph) };
}
