import {
  FoundationContractError,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  type MetaEntityGraph,
  type NativeMetaEntityGraph,
  type NormalizedCoreRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type {
  NativeConversionAdapters,
  NativeConversionResource,
} from "./native-graph-conversion.js";

import {
  compileNativeListSettings,
  convertLegacyListSettings,
  optionalListLimits,
  type LegacyListSettings,
  type NativeListSettingsContext,
} from "./native-list-settings.js";
import {
  compileNativeSurfaceIdentity,
  convertLegacySurfaceIdentity,
  type LegacySurfaceIdentity,
  type NativeSurfaceIdentityContext,
} from "./native-surface-identity.js";
type Family = "surfaces" | "surfaceSections" | "surfaceFieldBindings";
type Source<K extends Family> = NonNullable<MetaEntityGraph[K]>;
type Target<K extends Family> = NativeMetaEntityGraph[K];
/** Initialization comes from admitted typed presentation/catalogue metadata.
 * It is not an HTTP request payload or a substitute for host admission. */
type Mappings<K extends Family> = Readonly<
  Record<
    string,
    {
      readonly sourceHash: string;
      readonly initialization: Target<K>[number];
    }
  >
>;
export interface LegacyNativeLayoutAdapterInput {
  readonly surfaces: Source<"surfaces">;
  readonly surfaceSections: Source<"surfaceSections">;
  readonly surfaceFieldBindings: Source<"surfaceFieldBindings">;
  readonly mappings: { readonly [K in Family]: Mappings<K> };
  readonly resources: { readonly [K in Family]: NativeConversionResource };
  /** Only selected list settings are supported; all other nested paths reject.
   * Each independently admitted provider is bound as an adapter dependency. */
  readonly surfaceIdentities?: Readonly<
    Record<string, NativeSurfaceIdentityContext>
  >;
  readonly listSettings?: Readonly<Record<string, NativeListSettingsContext>>;
  /** Explicit source-label deduplication against admitted typed field labels.
   * A NULL override may reconstruct only this independently resolved field label. */
  readonly fieldLabels?: {
    readonly resource: NativeConversionResource;
    readonly fields: readonly NormalizedCoreRow<"field">[];
  };
  readonly positionConvention: "zero-based" | "one-based";
  /** Explicit migration of sparse sibling positions to dense native ordinals.
   * The source convention remains mandatory; duplicate source slots reject.
   * Historical export uses the captured slot inventory, never captured row values. */
  readonly positionMapping?: "boundary" | "dense-siblings";
  /** Resolve a label from independently admitted owned-label metadata. */
  labelText(labelId: string): string;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
const direct = {
  surfaces: ["surfaceKey", "surfaceKind", "layoutKind", "isDefault"],
  surfaceSections: [
    "entitySurfaceId",
    "sectionKey",
    "parentSectionId",
    "sectionKind",
    "columnCount",
    "collapsible",
    "collapsedByDefault",
  ],
  surfaceFieldBindings: [
    "entitySurfaceId",
    "entitySurfaceSectionId",
    "entityFieldId",
    "bindingKey",
    "columnSpan",
  ],
} as const;
const labels = {
  surfaces: { title: "labelId", description: "descriptionLabelId" },
  surfaceSections: { title: "labelId" },
  surfaceFieldBindings: {
    labelOverride: "labelOverrideId",
    helpText: "helpLabelId",
    placeholder: "placeholderLabelId",
  },
} as const;
const kinds = {
  surfaces: "surface",
  surfaceSections: "section",
  surfaceFieldBindings: "binding",
} as const;
/** Closed scalar legacy subset. Nested presentation/security blobs reject by
 * path rather than being dropped, replayed or stored in another property bag. */
export function createLegacyNativeLayoutAdapters(
  input: LegacyNativeLayoutAdapterInput,
): Pick<NativeConversionAdapters, Family> {
  if (!["zero-based", "one-based"].includes(input.positionConvention))
    fail("NATIVE_LAYOUT_POSITION_SOURCE_REQUIRED", "/positionConvention");
  if (
    input.positionMapping !== undefined &&
    !["boundary", "dense-siblings"].includes(input.positionMapping)
  )
    fail("NATIVE_LAYOUT_POSITION_SOURCE_REQUIRED", "/positionMapping");
  const dense = input.positionMapping === "dense-siblings";
  const fieldLabels = input.fieldLabels && {
    resource: structuredClone(input.fieldLabels.resource),
    fields: structuredClone(input.fieldLabels.fields),
  };
  if (fieldLabels) {
    if (
      new Set(fieldLabels.fields.map((f) => f.id)).size !==
      fieldLabels.fields.length
    )
      fail("NATIVE_LAYOUT_MAPPING_INVENTORY_INVALID", "/fieldLabels");
    for (const field of fieldLabels.fields)
      validateNormalizedCoreRow("field", field);
  }
  const surfaceIdentities = structuredClone(input.surfaceIdentities ?? {});
  const identitySourceIds = input.surfaces
    .filter(
      (s) =>
        s.layoutConfig &&
        ("identityField" in s.layoutConfig ||
          "recordPresentation" in s.layoutConfig),
    )
    .map((s) => s.id);
  if (
    input.surfaceIdentities &&
    Object.keys(surfaceIdentities).sort().join() !==
      identitySourceIds.sort().join()
  )
    fail("NATIVE_LAYOUT_MAPPING_INVENTORY_INVALID", "/surfaceIdentities");
  const listSettings = structuredClone(input.listSettings ?? {});
  if (
    Object.keys(listSettings).sort().join() !==
    input.surfaces
      .filter(
        (s) =>
          s.layoutConfig &&
          input.listSettings &&
          ("supportedModes" in s.layoutConfig || "limits" in s.layoutConfig),
      )
      .map((s) => s.id)
      .sort()
      .join()
  )
    fail("NATIVE_LAYOUT_MAPPING_INVENTORY_INVALID", "/listSettings");
  const shift = input.positionConvention === "zero-based" ? 1 : 0;
  function make<K extends Family>(family: K): NativeConversionAdapters[K] {
    validateConversionJsonData(input[family], "/" + family);
    validateConversionJsonData(input.mappings[family], "/mappings/" + family);
    const source = structuredClone(input[family]);
    const mappings = structuredClone(input.mappings[family]);
    const shapes = new Map(source.map((row) => [row.id, Object.keys(row)]));
    if (
      source.some((row) => !row.id) ||
      shapes.size !== source.length ||
      Object.keys(mappings).sort().join() !==
        source
          .map((row) => row.id)
          .sort()
          .join()
    )
      fail("NATIVE_LAYOUT_MAPPING_INVENTORY_INVALID", "/" + family);
    // Scope slots by exact surface, parent and independently admitted binding kind. Array order is not presentation order.
    const sibling = (row: Readonly<Record<string, unknown>>) =>
      canonicalJson([
        row.entitySurfaceId,
        family === "surfaceSections"
          ? (row.parentSectionId ?? null)
          : (row.entitySurfaceSectionId ?? null),
        ...(family === "surfaceFieldBindings"
          ? [
              row.bindingKind ??
                (
                  mappings[String(row.id)]?.initialization as {
                    bindingKind?: string;
                  }
                )?.bindingKind,
            ]
          : []),
      ]);
    const slots = new Map<string, number[]>();
    const sourceGroups = new Map<string, string>();
    if (dense && family !== "surfaces") {
      for (const value of source) {
        const row = value as unknown as Readonly<Record<string, unknown>>;
        const position = row.position;
        if (
          !Number.isSafeInteger(position) ||
          (position as number) < (shift ? 0 : 1) ||
          (position as number) > 32767
        )
          fail(
            "NATIVE_LAYOUT_POSITION_INVALID",
            `/${family}/${String(row.id)}/position`,
          );
        const group = sibling(row),
          groupSlots = slots.get(group) ?? [];
        if (groupSlots.includes(position as number))
          fail(
            "NATIVE_LAYOUT_POSITION_AMBIGUOUS",
            `/${family}/${String(row.id)}/position`,
          );
        groupSlots.push(position as number);
        slots.set(group, groupSlots);
        sourceGroups.set(String(row.id), group);
      }
      for (const groupSlots of slots.values()) groupSlots.sort((a, b) => a - b);
    }
    const densePosition = (
      row: Readonly<Record<string, unknown>>,
      reverse: boolean,
    ) => {
      const group = sibling(row),
        groupSlots = slots.get(group);
      if (group !== sourceGroups.get(String(row.id)) || !groupSlots)
        return fail(
          "NATIVE_LAYOUT_POSITION_SCOPE_CHANGED",
          `/${family}/${String(row.id)}`,
        );
      const position = row.position as number;
      const converted = reverse
        ? groupSlots[position - 1]
        : groupSlots.indexOf(position) + 1;
      if (converted === undefined || (!reverse && converted === 0))
        return fail(
          "NATIVE_LAYOUT_POSITION_INVALID",
          `/${family}/${String(row.id)}/position`,
        );
      return converted;
    };
    const validateRoster = (rows: readonly unknown[], reverse: boolean) => {
      if (!dense || family === "surfaces") return;
      const ids = rows.map((v) => (v as { id: string }).id);
      if (
        new Set(ids).size !== ids.length ||
        ids.slice().sort().join() !== [...shapes.keys()].sort().join()
      )
        fail("NATIVE_LAYOUT_MAPPING_INVENTORY_INVALID", "/" + family);
      const used = new Set<string>();
      for (const value of rows) {
        const row = value as Readonly<Record<string, unknown>>;
        densePosition(row, reverse);
        const key = canonicalJson([sibling(row), row.position]);
        if (used.has(key))
          fail("NATIVE_LAYOUT_POSITION_AMBIGUOUS", "/" + family);
        used.add(key);
      }
    };
    const listShapes = new Map(
      source.map((row) => [
        row.id,
        family === "surfaces" &&
        (row as Source<"surfaces">[number]).layoutConfig
          ? optionalListLimits.filter((k) =>
              Object.hasOwn(
                ((row as Source<"surfaces">[number]).layoutConfig!
                  .limits as object) ?? {},
                k,
              ),
            )
          : [],
      ]),
    );
    const identityShapes = new Map(
      source.map((row) => {
        const config = (row as Source<"surfaces">[number]).layoutConfig;
        const record = config?.recordPresentation as
          Record<string, unknown> | undefined;
        return [
          row.id,
          {
            root: Object.keys(config ?? {}).filter((k) =>
              ["identityField", "iconKey"].includes(k),
            ),
            record: record ? Object.keys(record) : null,
          },
        ];
      }),
    );
    const allowed = new Set<string>([
      "id",
      ...(family === "surfaces" &&
      (input.listSettings || input.surfaceIdentities)
        ? ["layoutConfig"]
        : []),
      ...(family === "surfaceFieldBindings" ? ["displayConfig"] : []),
      ...direct[family],
      ...Object.keys(labels[family]),
      ...(family === "surfaces" ? [] : ["position"]),
      ...(family === "surfaceSections" ? [] : ["status"]),
    ]);
    const validate = (row: unknown) => {
      if (family === "surfaces") validateNormalizedCoreRow("surface", row);
      else
        validateNormalizedLayoutRow(
          kinds[family] as "section" | "binding",
          row,
        );
    };
    const label = (
      row: Readonly<Record<string, unknown>>,
      column: string,
      path: string,
    ) => {
      let id = row[column];
      if (column === "labelOverrideId" && id === null && fieldLabels) {
        const field = fieldLabels.fields.find(
          (f) => f.id === row.entityFieldId,
        );
        id = field?.labelId;
      }
      if (typeof id !== "string")
        return fail("NATIVE_LAYOUT_LABEL_EVIDENCE_REQUIRED", path);
      const text = input.labelText(id);
      if (typeof text !== "string" || !text.trim())
        return fail("NATIVE_LAYOUT_LABEL_EVIDENCE_REQUIRED", path);
      return text;
    };
    const normalize = (
      legacy: Readonly<Record<string, unknown>>,
      mapping: Mappings<K>[string],
    ) => {
      for (const key of Object.keys(legacy))
        if (!allowed.has(key))
          fail(
            "NATIVE_LAYOUT_LEGACY_PATH_UNSUPPORTED",
            `/${family}/${String(legacy.id)}/${key}`,
          );
      if (legacy.status !== undefined && legacy.status !== "active")
        fail("NATIVE_LAYOUT_LEGACY_STATUS_UNSUPPORTED", `/${family}/status`);
      const initialized = mapping.initialization as unknown as Readonly<
        Record<string, unknown>
      >;
      if (legacy.id !== initialized.id)
        fail("NATIVE_LAYOUT_IDENTITY_MISMATCH", "/" + family);
      validate(initialized);
      const row: Record<string, unknown> = structuredClone(initialized);
      for (const key of direct[family])
        if (Object.hasOwn(legacy, key)) row[key] = legacy[key];
      for (const [property, column] of Object.entries(labels[family])) {
        if (
          Object.hasOwn(legacy, property) &&
          legacy[property] !== label(row, column, `/${family}/${property}`)
        )
          fail("NATIVE_LAYOUT_LABEL_SOURCE_MISMATCH", `/${family}/${property}`);
      }
      if (family !== "surfaces") {
        const position = legacy.position;
        if (
          !Number.isSafeInteger(position) ||
          (position as number) < (shift ? 0 : 1) ||
          (position as number) > 32767 - (dense ? 0 : shift)
        )
          fail("NATIVE_LAYOUT_POSITION_INVALID", `/${family}/position`);
        row.position = dense
          ? densePosition(legacy, false)
          : (position as number) + shift;
      }
      if (family === "surfaces" && Object.hasOwn(legacy, "layoutConfig")) {
        const config = legacy.layoutConfig as Record<string, unknown>;
        if (
          !config ||
          typeof config !== "object" ||
          Array.isArray(config) ||
          Object.keys(config).some(
            (k) =>
              ![
                "supportedModes",
                "limits",
                "identityField",
                "iconKey",
                "recordPresentation",
              ].includes(k),
          )
        )
          fail(
            "NATIVE_LAYOUT_LEGACY_PATH_UNSUPPORTED",
            "/surfaces/layoutConfig",
          );
        if ("supportedModes" in config || "limits" in config) {
          const c = listSettings[String(legacy.id)];
          if (!c)
            return fail(
              "NATIVE_LAYOUT_LIST_PROVIDER_REQUIRED",
              "/surfaces/layoutConfig",
            );
          const settings = {
            supportedModes: config.supportedModes,
            limits: config.limits,
          } as LegacyListSettings;
          Object.assign(
            row,
            convertLegacyListSettings(
              settings,
              row as unknown as NormalizedCoreRow<"surface">,
              c,
              sha256(settings),
            ),
          );
        }
        if (
          "identityField" in config ||
          "iconKey" in config ||
          "recordPresentation" in config
        ) {
          const c = surfaceIdentities[String(legacy.id)];
          if (!c)
            return fail(
              "NATIVE_LAYOUT_IDENTITY_RESOURCE_REQUIRED",
              "/surfaces/layoutConfig",
            );
          const presentation: Record<string, unknown> = {};
          for (const key of ["identityField", "iconKey"])
            if (Object.hasOwn(config, key)) presentation[key] = config[key];
          if ("recordPresentation" in config) {
            const record = config.recordPresentation as Record<string, unknown>;
            if (
              !record ||
              typeof record !== "object" ||
              Array.isArray(record) ||
              record.schemaVersion !== 1 ||
              Object.keys(record).some(
                (k) =>
                  ![
                    "schemaVersion",
                    "titleField",
                    "codeField",
                    "iconKey",
                    "actions",
                  ].includes(k),
              )
            )
              return fail(
                "NATIVE_LAYOUT_LEGACY_PATH_UNSUPPORTED",
                "/surfaces/layoutConfig/recordPresentation",
              );
            if (
              Object.hasOwn(record, "actions") &&
              (!Array.isArray(record.actions) || record.actions.length !== 0)
            )
              fail(
                "NATIVE_LAYOUT_LEGACY_PATH_UNSUPPORTED",
                "/surfaces/layoutConfig/recordPresentation/actions",
              );
            for (const key of ["titleField", "codeField", "iconKey"])
              if (Object.hasOwn(record, key)) {
                if (
                  Object.hasOwn(presentation, key) &&
                  canonicalJson(presentation[key]) !==
                    canonicalJson(record[key])
                )
                  fail(
                    "NATIVE_LAYOUT_CORRELATED_PRESENTATION_CONFLICT",
                    "/surfaces/layoutConfig/" + key,
                  );
                presentation[key] = record[key];
              }
          }
          Object.assign(
            row,
            convertLegacySurfaceIdentity(
              presentation as LegacySurfaceIdentity,
              row as unknown as NormalizedCoreRow<"surface">,
              c,
              sha256(presentation),
            ),
          );
        }
        if (!Object.keys(config).length)
          fail(
            "NATIVE_LAYOUT_LEGACY_PATH_UNSUPPORTED",
            "/surfaces/layoutConfig",
          );
      }
      if (
        family === "surfaceFieldBindings" &&
        Object.hasOwn(legacy, "displayConfig")
      ) {
        const display = legacy.displayConfig as Record<string, unknown>;
        if (
          !display ||
          typeof display !== "object" ||
          Array.isArray(display) ||
          Object.keys(display).join() !== "defaultWidth"
        )
          fail(
            "NATIVE_LAYOUT_LEGACY_PATH_UNSUPPORTED",
            "/surfaceFieldBindings/displayConfig",
          );
        if (
          !Number.isSafeInteger(display.defaultWidth) ||
          (display.defaultWidth as number) < 48 ||
          (display.defaultWidth as number) > 1200
        )
          fail(
            "NATIVE_LAYOUT_WIDTH_RUNTIME_UNSUPPORTED",
            "/surfaceFieldBindings/displayConfig/defaultWidth",
          );
        row.width = display.defaultWidth;
      }
      validate(row);
      return row;
    };
    for (const row of source) {
      const mapping = mappings[row.id!];
      if (!mapping || sha256(row) !== mapping.sourceHash)
        return fail("NATIVE_LAYOUT_SOURCE_HASH_MISMATCH", "/" + family);
      normalize(row as unknown as Readonly<Record<string, unknown>>, mapping);
    }
    return {
      resource: structuredClone(input.resources[family]),
      ...((family === "surfaces" &&
        (input.listSettings || input.surfaceIdentities)) ||
      (family === "surfaceFieldBindings" && fieldLabels)
        ? {
            dependencies: [
              ...new Map(
                [
                  ...(family === "surfaces"
                    ? Object.values(listSettings).map((c) => c.provider)
                    : []),
                  ...(family === "surfaces"
                    ? Object.values(surfaceIdentities).map((c) => c.resource)
                    : []),
                  ...(family === "surfaceFieldBindings" && fieldLabels
                    ? [fieldLabels.resource]
                    : []),
                ].map((r) => [canonicalJson(r), structuredClone(r)]),
              ).values(),
            ],
          }
        : {}),
      forward: (rows: Source<K>) => {
        validateRoster(rows, false);
        return rows.map((row) => {
          validateConversionJsonData(row, "/" + family);
          const mapping = mappings[row.id ?? ""];
          if (!mapping || sha256(row) !== mapping.sourceHash)
            return fail("NATIVE_LAYOUT_SOURCE_HASH_MISMATCH", "/" + family);
          return normalize(
            row as unknown as Readonly<Record<string, unknown>>,
            mapping,
          );
        }) as unknown as Target<K>;
      },
      reverse: (rows: Target<K>) => {
        validateRoster(rows, true);
        return rows.map((target) => {
          validateConversionJsonData(target, "/" + family);
          validate(target);
          const keys = shapes.get(target.id),
            mapping = mappings[target.id];
          if (!keys || !mapping)
            return fail("NATIVE_LAYOUT_IDENTITY_MISMATCH", "/" + family);
          const row = target as unknown as Readonly<Record<string, unknown>>;
          const values: Record<string, unknown> = { ...row, status: "active" };
          for (const [property, column] of Object.entries(labels[family]))
            if (keys.includes(property))
              values[property] = label(row, column, `/${family}/${property}`);
          if (family === "surfaces" && keys.includes("layoutConfig")) {
            const settings = listSettings[target.id],
              identity = surfaceIdentities[target.id];
            const shape = identityShapes.get(target.id)!;
            const config: Record<string, unknown> = {};
            if (settings)
              Object.assign(
                config,
                compileNativeListSettings(
                  target as NormalizedCoreRow<"surface">,
                  settings,
                  listShapes.get(target.id)!,
                ),
              );
            if (identity) {
              const properties = [
                ...new Set([
                  ...shape.root,
                  ...(shape.record ?? []).filter(
                    (k) => !["schemaVersion", "actions"].includes(k),
                  ),
                ]),
              ] as (keyof LegacySurfaceIdentity)[];
              const presentation = compileNativeSurfaceIdentity(
                target as NormalizedCoreRow<"surface">,
                identity,
                properties,
              );
              for (const key of shape.root)
                config[key] = presentation[key as keyof LegacySurfaceIdentity];
              if (shape.record)
                config.recordPresentation = Object.fromEntries(
                  shape.record.map((k) => [
                    k,
                    k === "schemaVersion"
                      ? 1
                      : k === "actions"
                        ? []
                        : presentation[k as keyof LegacySurfaceIdentity],
                  ]),
                );
            }
            values.layoutConfig = config;
          }
          if (
            family === "surfaceFieldBindings" &&
            keys.includes("displayConfig")
          )
            values.displayConfig = { defaultWidth: row.width };
          if (family !== "surfaces")
            values.position = dense
              ? densePosition(row, true)
              : (row.position as number) - shift;
          const legacy = Object.fromEntries(
            keys.map((key) => [key, values[key]]),
          );
          if (
            canonicalJson(normalize(legacy, mapping)) !== canonicalJson(target)
          )
            fail("NATIVE_LAYOUT_REVERSE_NOT_REPRESENTABLE", "/" + family);
          return legacy;
        }) as unknown as Source<K>;
      },
    } as NativeConversionAdapters[K];
  }
  return {
    surfaces: make("surfaces"),
    surfaceSections: make("surfaceSections"),
    surfaceFieldBindings: make("surfaceFieldBindings"),
  };
}
