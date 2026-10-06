import {
  FoundationContractError,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  type MetaEntityGraph,
  type NativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type {
  NativeConversionAdapters,
  NativeConversionResource,
} from "./native-graph-conversion.js";

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
  readonly positionConvention: "zero-based" | "one-based";
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
    const allowed = new Set<string>([
      "id",
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
      const id = row[column];
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
          (position as number) > 32767 - shift
        )
          fail("NATIVE_LAYOUT_POSITION_INVALID", `/${family}/position`);
        row.position = (position as number) + shift;
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
      forward: (rows: Source<K>) =>
        rows.map((row) => {
          validateConversionJsonData(row, "/" + family);
          const mapping = mappings[row.id ?? ""];
          if (!mapping || sha256(row) !== mapping.sourceHash)
            return fail("NATIVE_LAYOUT_SOURCE_HASH_MISMATCH", "/" + family);
          return normalize(
            row as unknown as Readonly<Record<string, unknown>>,
            mapping,
          );
        }) as unknown as Target<K>,
      reverse: (rows: Target<K>) =>
        rows.map((target) => {
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
          if (family !== "surfaces")
            values.position = (row.position as number) - shift;
          const legacy = Object.fromEntries(
            keys.map((key) => [key, values[key]]),
          );
          if (
            canonicalJson(normalize(legacy, mapping)) !== canonicalJson(target)
          )
            fail("NATIVE_LAYOUT_REVERSE_NOT_REPRESENTABLE", "/" + family);
          return legacy;
        }) as unknown as Source<K>,
    } as NativeConversionAdapters[K];
  }
  return {
    surfaces: make("surfaces"),
    surfaceSections: make("surfaceSections"),
    surfaceFieldBindings: make("surfaceFieldBindings"),
  };
}
