import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateReferenceMember,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  type MetaEntityGraph,
  type ReferenceMember,
  type NormalizedCoreContext,
  type NormalizedCoreRow,
  type NormalizedLayoutContext,
  type NormalizedLayoutRow,
} from "@athyper/server-contract-meta-entity-authoring";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
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

export interface LegacyNativeListViewAdapterInput {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly dependencies: readonly NativeConversionResource[];
  readonly mappings: Readonly<
    Record<
      string,
      {
        readonly context: NativeListViewContext;
        readonly viewId: string;
        readonly viewKey: string;
        readonly fieldMemberIds: Readonly<Record<string, string>>;
      }
    >
  >;
}
/** Account for defaultState and explicit list-binding defaultVisible together.
 * Other display paths remain untouched for their own adapters. The inverse reads
 * current typed views, never a backup of legacy visibility or sort values. */
export function createHistoricalNativeListViewAdapter(
  input: LegacyNativeListViewAdapterInput,
): NativeNestedConversionAdapter {
  validateConversionJsonData(input.source, "/source");
  if (sha256(input.source) !== input.sourceHash)
    fail("NATIVE_VIEW_SOURCE_HASH_MISMATCH", "/source");
  const sourceHash = input.sourceHash;
  const mappings = structuredClone(input.mappings);
  const enrolled = (input.source.surfaces ?? []).filter(
    (s) => s.layoutConfig && Object.hasOwn(s.layoutConfig, "defaultState"),
  );
  if (
    !enrolled.length ||
    enrolled.some((s) => !s.id || s.surfaceKind !== "list") ||
    new Set(enrolled.map((s) => s.id)).size !== enrolled.length ||
    Object.keys(mappings).sort().join() !==
      enrolled
        .map((s) => s.id)
        .sort()
        .join()
  )
    fail("NATIVE_VIEW_ID_INVENTORY_INVALID", "/mappings");
  const mappedIds = new Set(
    Object.values(mappings).flatMap((m) => [
      m.viewId,
      ...Object.values(m.fieldMemberIds),
    ]),
  );
  if (
    mappedIds.size !==
    Object.values(mappings).reduce(
      (n, m) => n + 1 + Object.keys(m.fieldMemberIds).length,
      0,
    )
  )
    fail("NATIVE_VIEW_ID_INVENTORY_INVALID", "/mappings");
  const originals = input.source.referenceMembers;
  if (!originals)
    return fail("NATIVE_VIEW_REFERENCE_MEMBERS_REQUIRED", "/source");
  // Conversion additions cannot overwrite prior authoring members.
  if (
    Object.values(originals.members).some((rows) =>
      rows.some((r) => mappedIds.has(r.id)),
    )
  )
    fail("NATIVE_VIEW_ID_INVENTORY_INVALID", "/mappings");
  if (
    originals.members.surfaceView.some(
      (v) =>
        v.viewKind === "default" && Object.hasOwn(mappings, v.entitySurfaceId),
    )
  )
    fail(
      "NATIVE_VIEW_CORRELATED_SOURCE_CONFLICT",
      "/source/referenceMembers/surfaceView",
    );
  const bindingShapes = new Map<
    string,
    { surfaceId: string; keys: string[] }
  >();
  const forward = (graph: MetaEntityGraph) => {
    validateConversionJsonData(graph, "/source");
    if (sha256(graph) !== sourceHash)
      fail("NATIVE_VIEW_SOURCE_HASH_MISMATCH", "/source");
    const result = structuredClone(graph);
    if (!result.referenceMembers)
      return fail("NATIVE_VIEW_REFERENCE_MEMBERS_REQUIRED", "/source");
    for (const surface of result.surfaces ?? []) {
      const m = mappings[surface.id ?? ""];
      if (!m) continue;
      if (
        m.context.surface.id !== surface.id ||
        m.context.surface.surfaceKind !== "list"
      )
        fail("NATIVE_VIEW_BINDING_SCOPE_INVALID", "/mappings");
      const bindings = (result.surfaceFieldBindings ?? [])
        .filter((b) => b.entitySurfaceId === surface.id)
        .sort((a, b) => a.position - b.position);
      if (
        bindings.length !== m.context.bindings.length ||
        new Set(bindings.map((b) => b.id)).size !== bindings.length ||
        new Set(bindings.map((b) => b.position)).size !== bindings.length
      )
        fail("NATIVE_VIEW_BINDING_SCOPE_INVALID", "/bindings");
      const visibleFields: string[] = [];
      for (const b of bindings) {
        const matches = m.context.bindings.filter(
          (n) => n.id === b.id && n.entityFieldId === b.entityFieldId,
        );
        const fields = m.context.fields.filter((f) => f.id === b.entityFieldId);
        if (
          !b.id ||
          matches.length !== 1 ||
          fields.length !== 1 ||
          !Number.isSafeInteger(b.position) ||
          b.position < 0
        )
          fail("NATIVE_VIEW_BINDING_SCOPE_INVALID", "/bindings");
        const identities = m.context.identities.filter(
          (i) => i.id === fields[0]!.fieldIdentityId,
        );
        const display = b.displayConfig;
        if (
          identities.length !== 1 ||
          !display ||
          !Object.hasOwn(display, "defaultVisible") ||
          typeof display.defaultVisible !== "boolean"
        )
          fail(
            "NATIVE_VIEW_EXPLICIT_VISIBILITY_REQUIRED",
            "/bindings/displayConfig/defaultVisible",
          );
        if (display!.defaultVisible)
          visibleFields.push(identities[0]!.fieldKey);
        bindingShapes.set(b.id!, {
          surfaceId: surface.id!,
          keys: Object.keys(display!),
        });
        const rest = { ...display };
        delete rest.defaultVisible;
        (b as { displayConfig?: object }).displayConfig = rest;
        if (!Object.keys(rest).length)
          delete (b as { displayConfig?: object }).displayConfig;
      }
      const selected = {
        defaultState: surface.layoutConfig!.defaultState,
        visibleFields,
      } as LegacyDefaultListView;
      const converted = convertLegacyDefaultListView(selected, m.context, {
        ...m,
        sourceHash: sha256(selected),
      });
      const members = result.referenceMembers.members;
      (members as { surfaceView: unknown }).surfaceView = [
        ...members.surfaceView,
        converted.view,
      ];
      (members as { surfaceViewField: unknown }).surfaceViewField = [
        ...members.surfaceViewField,
        ...converted.fields,
      ];
      const config = { ...surface.layoutConfig! };
      delete config.defaultState;
      (surface as { layoutConfig?: object }).layoutConfig = config;
      if (!Object.keys(config).length)
        delete (surface as { layoutConfig?: object }).layoutConfig;
    }
    return result;
  };
  const preparedHash = sha256(forward(input.source));
  return {
    resource: structuredClone(input.resource),
    dependencies: structuredClone(input.dependencies),
    forward,
    reverse(prepared, target) {
      if (sha256(prepared) !== preparedHash)
        fail("NATIVE_VIEW_SOURCE_HASH_MISMATCH", "/prepared");
      if (!target.referenceMembers)
        return fail("NATIVE_VIEW_REFERENCE_MEMBERS_REQUIRED", "/target");
      const result = structuredClone(prepared);
      for (const [id, m] of Object.entries(mappings)) {
        const surface = result.surfaces?.find((s) => s.id === id);
        const native = target.surfaces.filter((s) => s.id === id);
        const views = target.referenceMembers.members.surfaceView.filter(
          (v) => v.id === m.viewId,
        );
        const fieldIds = new Set(Object.values(m.fieldMemberIds));
        const fields = target.referenceMembers.members.surfaceViewField.filter(
          (f) => fieldIds.has(f.id),
        );
        if (
          target.referenceMembers.members.surfaceViewField.some(
            (f) => f.viewId === m.viewId && !fieldIds.has(f.id),
          )
        )
          fail("NATIVE_VIEW_ID_INVENTORY_INVALID", "/target/fields");
        if (
          !surface ||
          native.length !== 1 ||
          views.length !== 1 ||
          fields.length !== fieldIds.size
        )
          return fail("NATIVE_VIEW_ID_INVENTORY_INVALID", "/target");
        const projection = compileNativeDefaultListView(
          { view: views[0]!, fields },
          {
            ...m.context,
            surface: native[0]!,
            fields: target.fields,
            bindings: target.surfaceFieldBindings.filter(
              (b) => b.entitySurfaceId === id,
            ),
          },
        );
        (surface as { layoutConfig?: object }).layoutConfig = {
          ...surface.layoutConfig,
          defaultState: projection.defaultState,
        };
        const visibleOrder = (result.surfaceFieldBindings ?? [])
          .filter((b) => b.entitySurfaceId === id)
          .sort((a, b) => a.position - b.position)
          .map(
            (b) =>
              m.context.identities.find(
                (i) =>
                  i.id ===
                  target.fields.find((f) => f.id === b.entityFieldId)
                    ?.fieldIdentityId,
              )?.fieldKey,
          )
          .filter(
            (key): key is string =>
              key !== undefined && projection.visibleFields.includes(key),
          );
        if (
          canonicalJson(visibleOrder) !==
          canonicalJson(projection.visibleFields)
        )
          fail(
            "NATIVE_VIEW_REVERSE_NOT_REPRESENTABLE",
            "/target/visibleFields",
          );
        for (const b of result.surfaceFieldBindings ?? []) {
          const shape = bindingShapes.get(b.id ?? "");
          if (!shape || shape.surfaceId !== id) continue;
          const field = target.fields.find((f) => f.id === b.entityFieldId);
          const identity = m.context.identities.find(
            (i) => i.id === field?.fieldIdentityId,
          );
          if (!identity)
            return fail("NATIVE_VIEW_FIELD_MAPPING_INVALID", "/target");
          const values = {
            ...b.displayConfig,
            defaultVisible: projection.visibleFields.includes(
              identity.fieldKey,
            ),
          };
          (b as { displayConfig?: object }).displayConfig = Object.fromEntries(
            shape.keys.map((k) => [k, values[k as keyof typeof values]]),
          );
        }
      }
      const members = result.referenceMembers!.members;
      (members as { surfaceView: unknown }).surfaceView =
        members.surfaceView.filter((v) => !mappedIds.has(v.id));
      (members as { surfaceViewField: unknown }).surfaceViewField =
        members.surfaceViewField.filter((v) => !mappedIds.has(v.id));
      return result;
    },
  };
}
