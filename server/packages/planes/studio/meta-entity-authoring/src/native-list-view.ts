import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateReferenceMember,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  type ReferenceMember,
  type NormalizedCoreContext,
  type NormalizedCoreRow,
  type NormalizedLayoutContext,
  type NormalizedLayoutRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
export interface LegacyDefaultListView {
  readonly defaultState: {
    readonly sort: readonly {
      readonly field: string;
      readonly direction: "asc" | "desc";
    }[];
    readonly density: "comfortable" | "compact" | "spacious";
    readonly mode: "table";
  };
  readonly visibleFields: readonly string[];
}
export interface NativeDefaultListView {
  readonly view: ReferenceMember<"surfaceView">;
  readonly fields: readonly ReferenceMember<"surfaceViewField">[];
}
/** Independently admitted scoped resources; never an author-supplied grant. */
export interface NativeListViewContext {
  readonly entityId: string;
  readonly tenantId: string | null;
  readonly surface: NormalizedCoreRow<"surface">;
  readonly bindings: readonly NormalizedLayoutRow<"binding">[];
  readonly fields: readonly NormalizedCoreRow<"field">[];
  readonly identities: NormalizedCoreContext["identities"];
  readonly presentation: NormalizedLayoutContext["fieldPresentation"];
  readonly maximumFields: number;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function index(c: NativeListViewContext) {
  validateFoundationNode(referenceUuid, c.entityId, "/entityId");
  if (c.tenantId !== null)
    validateFoundationNode(referenceUuid, c.tenantId, "/tenantId");
  validateNormalizedCoreRow("surface", c.surface);
  if (
    c.surface.surfaceKind !== "list" ||
    !Number.isSafeInteger(c.maximumFields) ||
    c.maximumFields < 1 ||
    c.bindings.length > c.maximumFields
  )
    fail("NATIVE_VIEW_CONTEXT_INVALID", "/context");
  const byKey = new Map<
    string,
    {
      binding: NormalizedLayoutRow<"binding">;
      field: NormalizedCoreRow<"field">;
      policy: NativeListViewContext["presentation"][number];
    }
  >();
  for (const binding of c.bindings) {
    validateNormalizedLayoutRow("binding", binding);
    if (
      binding.entitySurfaceId !== c.surface.id ||
      binding.overlayId !== null ||
      binding.bindingKind !== "field"
    )
      fail("NATIVE_VIEW_BINDING_SCOPE_INVALID", "/bindings");
    const matchingFields = c.fields.filter(
      (f) => f.id === binding.entityFieldId,
    );
    if (matchingFields.length !== 1)
      return fail("NATIVE_VIEW_FIELD_MAPPING_INVALID", "/bindings");
    const field = matchingFields[0]!;
    validateNormalizedCoreRow("field", field);
    const identities = c.identities.filter(
      (i) =>
        i.id === field.fieldIdentityId &&
        i.entityId === c.entityId &&
        i.tenantId === c.tenantId &&
        i.parentIdentityId === null,
    );
    const policies = c.presentation.filter((p) => p.fieldId === field.id);
    if (
      identities.length !== 1 ||
      policies.length !== 1 ||
      byKey.has(identities[0]!.fieldKey) ||
      [...byKey.values()].some((r) => r.binding.id === binding.id)
    )
      return fail("NATIVE_VIEW_FIELD_MAPPING_INVALID", "/bindings");
    byKey.set(identities[0]!.fieldKey, {
      binding,
      field,
      policy: policies[0]!,
    });
  }
  return byKey;
}
function member<K extends "surfaceView" | "surfaceViewField">(
  kind: K,
  row: ReferenceMember<K>,
) {
  validateConversionJsonData(row, "/" + kind);
  if (!row || typeof row !== "object" || Array.isArray(row))
    return fail("NATIVE_VIEW_INPUT_INVALID", "/" + kind);
  validateFoundationNode(referenceUuid, row.id, "/" + kind + "/id");
  const { id: _, ...properties } = row;
  validateReferenceMember(kind, properties);
}
/** One release-compiler component; no whole-release or storage authority. */
export function compileNativeDefaultListView(
  input: NativeDefaultListView,
  c: NativeListViewContext,
): LegacyDefaultListView {
  validateConversionJsonData(input, "/viewProjection");
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join() !== "fields,view" ||
    !Array.isArray(input.fields)
  )
    return fail("NATIVE_VIEW_INPUT_INVALID", "/viewProjection");
  const mappings = index(c);
  member("surfaceView", input.view);
  if (
    input.view.entitySurfaceId !== c.surface.id ||
    input.view.viewKind !== "default" ||
    input.view.labelId !== null ||
    input.view.queryText !== null ||
    input.view.position !== 1
  )
    fail("NATIVE_VIEW_VARIANT_UNSUPPORTED", "/view");
  if (input.fields.length > c.maximumFields)
    fail("NATIVE_VIEW_LIMIT", "/fields");
  const visible: { key: string; position: number }[] = [],
    sort: { field: string; direction: "asc" | "desc"; position: number }[] = [];
  const ids = new Set<string>([input.view.id]),
    bindings = new Set<string>();
  for (const row of input.fields) {
    member("surfaceViewField", row);
    const entries = [...mappings.entries()].filter(
      ([, m]) => m.binding.id === row.fieldBindingId,
    );
    if (
      entries.length !== 1 ||
      row.viewId !== input.view.id ||
      ids.has(row.id) ||
      bindings.has(row.fieldBindingId)
    )
      return fail("NATIVE_VIEW_MEMBER_SCOPE_INVALID", "/fields");
    ids.add(row.id);
    bindings.add(row.fieldBindingId);
    const [key, mapped] = entries[0]!;
    if (
      row.grouped ||
      row.widthOverride !== null ||
      (row.visiblePosition === null && row.sortPosition === null) ||
      (row.sortPosition === null) !== (row.sortDirection === null)
    )
      fail("NATIVE_VIEW_VARIANT_UNSUPPORTED", "/fields");
    if (row.visiblePosition !== null) {
      if (mapped.field.dataType === "uuid")
        fail("NATIVE_VIEW_UUID_PRESENTATION_FORBIDDEN", "/fields");
      if (!["plain", "masked"].includes(mapped.policy.display))
        fail("NATIVE_VIEW_DISPLAY_DENIED", "/fields");
      visible.push({ key, position: row.visiblePosition });
    }
    if (row.sortPosition !== null) {
      if (
        !mapped.policy.queryUses.includes("sort") ||
        mapped.policy.display === "omitted"
      )
        fail("NATIVE_VIEW_SORT_DENIED", "/fields");
      sort.push({
        field: key,
        direction: row.sortDirection!,
        position: row.sortPosition,
      });
    }
  }
  const dense = <T extends { position: number }>(rows: T[], path: string) => {
    rows.sort((a, b) => a.position - b.position);
    if (rows.some((r, i) => r.position !== i + 1))
      fail("NATIVE_VIEW_ORDER_INVALID", path);
  };
  dense(visible, "/visibleFields");
  dense(sort, "/defaultState/sort");
  return {
    defaultState: {
      sort: sort.map(({ field, direction }) => ({ field, direction })),
      density: input.view.density,
      mode: input.view.mode,
    },
    visibleFields: visible.map((r) => r.key),
  };
}
/** Selected source paths only. Other layoutConfig declarations require separate
 * mappings; no whole blob is consumed or implicitly preserved here. */
export function convertLegacyDefaultListView(
  source: LegacyDefaultListView,
  c: NativeListViewContext,
  mapping: {
    readonly sourceHash: string;
    readonly viewId: string;
    readonly viewKey: string;
    readonly fieldMemberIds: Readonly<Record<string, string>>;
  },
): NativeDefaultListView {
  validateConversionJsonData(source, "/source");
  validateConversionJsonData(mapping, "/mapping");
  validateFoundationNode(
    {
      type: "object",
      properties: {
        defaultState: {
          type: "object",
          properties: {
            sort: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string", minLength: 1 },
                  direction: { anyOf: [{ const: "asc" }, { const: "desc" }] },
                },
              },
            },
            density: {
              anyOf: [
                { const: "comfortable" },
                { const: "compact" },
                { const: "spacious" },
              ],
            },
            mode: { const: "table" },
          },
        },
        visibleFields: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    source,
    "/source",
  );
  if (
    source.visibleFields.length > c.maximumFields ||
    source.defaultState.sort.length > c.maximumFields
  )
    fail("NATIVE_VIEW_LIMIT", "/source");
  if (sha256(source) !== mapping.sourceHash)
    fail("NATIVE_VIEW_SOURCE_HASH_MISMATCH", "/source");
  const mappings = index(c),
    keys = [
      ...new Set([
        ...source.visibleFields,
        ...source.defaultState.sort.map((s) => s.field),
      ]),
    ];
  if (
    new Set(source.visibleFields).size !== source.visibleFields.length ||
    new Set(source.defaultState.sort.map((s) => s.field)).size !==
      source.defaultState.sort.length
  )
    fail("NATIVE_VIEW_DUPLICATE_FIELD", "/source");
  if (
    Object.keys(mapping.fieldMemberIds).sort().join() !==
    [...keys].sort().join()
  )
    fail("NATIVE_VIEW_ID_INVENTORY_INVALID", "/mapping");
  const fields: ReferenceMember<"surfaceViewField">[] = keys.map((key) => {
    const mapped = mappings.get(key);
    if (!mapped)
      return fail("NATIVE_VIEW_FIELD_MAPPING_INVALID", "/source/" + key);
    const visible = source.visibleFields.indexOf(key),
      sort = source.defaultState.sort.findIndex((s) => s.field === key);
    return {
      id: mapping.fieldMemberIds[key]!,
      viewId: mapping.viewId,
      fieldBindingId: mapped.binding.id,
      visiblePosition: visible < 0 ? null : visible + 1,
      sortPosition: sort < 0 ? null : sort + 1,
      sortDirection:
        sort < 0 ? null : source.defaultState.sort[sort]!.direction,
      grouped: false,
      widthOverride: null,
    };
  });
  const result: NativeDefaultListView = {
    view: {
      id: mapping.viewId,
      entitySurfaceId: c.surface.id,
      viewKey: mapping.viewKey,
      viewKind: "default",
      labelId: null,
      queryText: null,
      density: source.defaultState.density,
      mode: source.defaultState.mode,
      position: 1,
    },
    fields,
  };
  if (
    canonicalJson(compileNativeDefaultListView(result, c)) !==
    canonicalJson(source)
  )
    fail("NATIVE_VIEW_NOT_LOSSLESS", "/source");
  return result;
}
