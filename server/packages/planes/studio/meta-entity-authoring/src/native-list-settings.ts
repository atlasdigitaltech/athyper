import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateNormalizedCoreRow,
  type NormalizedCoreRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type { NativeConversionResource } from "./native-graph-conversion.js";

export const optionalListLimits = [
  "maxFilters",
  "maxFilterDepth",
  "maxPageSize",
] as const;
export type OptionalListLimit = (typeof optionalListLimits)[number];
export interface LegacyListSettings {
  readonly supportedModes: readonly ("table" | "compact")[];
  readonly limits: {
    readonly defaultPageSize: number;
    readonly allowedPageSizes: readonly number[];
    readonly maxSortLevels: number;
    readonly countMode: "exact" | "estimated" | "none";
    readonly maxFilters?: number;
    readonly maxFilterDepth?: number;
    readonly maxPageSize?: number;
  };
}
/** Evidence is resolved by installed host/provider composition, not by authors.
 * Installation of this resource must be recorded in the graph conversion proof. */
export interface NativeListSettingsContext {
  readonly surfaceId: string;
  readonly provider: NativeConversionResource;
  readonly modes: readonly ("table" | "compact")[];
  readonly countModes: readonly ("exact" | "estimated" | "none")[];
  readonly maximumPageSize: number;
  readonly maximumPageSizeChoices: number;
  readonly maximumSortLevels: number;
  readonly maximumFilters: number;
  readonly maximumFilterDepth: number;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
const integer = (maximum = 2147483647) => ({
  type: "integer" as const,
  minimum: 1,
  maximum,
});
function provider(
  c: NativeListSettingsContext,
  surface: NormalizedCoreRow<"surface">,
) {
  validateNormalizedCoreRow("surface", surface);
  validateConversionJsonData(c, "/provider");
  validateFoundationNode(
    {
      type: "object",
      properties: {
        surfaceId: referenceUuid,
        provider: {
          type: "object",
          properties: {
            owner: { type: "string", minLength: 1, maxLength: 200 },
            key: { type: "string", minLength: 1, maxLength: 200 },
            version: integer(),
            hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
        },
        modes: {
          type: "array",
          minItems: 1,
          items: { anyOf: [{ const: "table" }, { const: "compact" }] },
        },
        countModes: {
          type: "array",
          minItems: 1,
          items: {
            anyOf: [
              { const: "exact" },
              { const: "estimated" },
              { const: "none" },
            ],
          },
        },
        maximumPageSize: integer(),
        maximumPageSizeChoices: integer(1000),
        maximumSortLevels: integer(32),
        maximumFilters: integer(1000),
        maximumFilterDepth: integer(32),
      },
    },
    c,
    "/provider",
  );
  if (
    surface.id !== c.surfaceId ||
    surface.surfaceKind !== "list" ||
    new Set(c.modes).size !== c.modes.length ||
    new Set(c.countModes).size !== c.countModes.length
  )
    fail("NATIVE_LIST_SETTINGS_PROVIDER_INVALID", "/provider");
}
function settings(source: LegacyListSettings, c: NativeListSettingsContext) {
  validateConversionJsonData(source, "/settings");
  validateFoundationNode(
    {
      type: "object",
      properties: {
        supportedModes: {
          type: "array",
          minItems: 1,
          items: { anyOf: [{ const: "table" }, { const: "compact" }] },
        },
        limits: {
          type: "object",
          properties: {
            defaultPageSize: integer(),
            allowedPageSizes: { type: "array", minItems: 1, items: integer() },
            maxSortLevels: integer(32),
            countMode: {
              anyOf: [
                { const: "exact" },
                { const: "estimated" },
                { const: "none" },
              ],
            },
            maxFilters: integer(1000),
            maxFilterDepth: integer(32),
            maxPageSize: integer(),
          },
          required: [
            "defaultPageSize",
            "allowedPageSizes",
            "maxSortLevels",
            "countMode",
          ],
        },
      },
    },
    source,
    "/settings",
  );
  const s = source.limits;
  if (
    new Set(source.supportedModes).size !== source.supportedModes.length ||
    source.supportedModes.some((m) => !c.modes.includes(m)) ||
    !c.countModes.includes(s.countMode) ||
    s.allowedPageSizes.length > c.maximumPageSizeChoices ||
    new Set(s.allowedPageSizes).size !== s.allowedPageSizes.length ||
    !s.allowedPageSizes.includes(s.defaultPageSize) ||
    s.allowedPageSizes.some(
      (n) => n > c.maximumPageSize || n > (s.maxPageSize ?? c.maximumPageSize),
    ) ||
    s.maxSortLevels > c.maximumSortLevels ||
    (s.maxPageSize !== undefined && s.maxPageSize > c.maximumPageSize) ||
    (s.maxFilters !== undefined && s.maxFilters > c.maximumFilters) ||
    (s.maxFilterDepth !== undefined && s.maxFilterDepth > c.maximumFilterDepth)
  )
    fail("NATIVE_LIST_SETTINGS_CAPABILITY_DENIED", "/settings");
}
export function compileNativeListSettings(
  surface: NormalizedCoreRow<"surface">,
  c: NativeListSettingsContext,
  /** Source presence only, never source values. Runtime compilation may select
   * all available typed limits; migration inverses preserve exact absence. */
  selectedOptionalLimits: readonly OptionalListLimit[] = optionalListLimits.filter(
    (k) => surface[k] !== null,
  ),
): LegacyListSettings {
  provider(c, surface);
  if (
    new Set(selectedOptionalLimits).size !== selectedOptionalLimits.length ||
    selectedOptionalLimits.some((k) => !optionalListLimits.includes(k))
  )
    fail("NATIVE_LIST_SETTINGS_PROJECTION_INVALID", "/projection");
  if (
    surface.supportedModes === null ||
    surface.defaultPageSize === null ||
    surface.allowedPageSizes === null ||
    surface.maxSortLevels === null ||
    surface.countMode === null
  )
    return fail("NATIVE_LIST_SETTINGS_INCOMPLETE", "/surface");
  if (
    (surface.maxPageSize !== null &&
      (surface.maxPageSize > c.maximumPageSize ||
        surface.allowedPageSizes.some((n) => n > surface.maxPageSize!))) ||
    (surface.maxFilters !== null && surface.maxFilters > c.maximumFilters) ||
    (surface.maxFilterDepth !== null &&
      surface.maxFilterDepth > c.maximumFilterDepth)
  )
    fail("NATIVE_LIST_SETTINGS_CAPABILITY_DENIED", "/surface/limits");
  const result: LegacyListSettings = {
    supportedModes: [...surface.supportedModes],
    limits: {
      defaultPageSize: surface.defaultPageSize,
      allowedPageSizes: [...surface.allowedPageSizes],
      maxSortLevels: surface.maxSortLevels,
      countMode: surface.countMode,
      ...Object.fromEntries(
        selectedOptionalLimits.map((k) => {
          if (surface[k] === null)
            return fail("NATIVE_LIST_SETTINGS_INCOMPLETE", "/surface/" + k);
          return [k, surface[k]];
        }),
      ),
    },
  };
  settings(result, c);
  return result;
}
export function convertLegacyListSettings(
  source: LegacyListSettings,
  surface: NormalizedCoreRow<"surface">,
  c: NativeListSettingsContext,
  sourceHash: string,
): NormalizedCoreRow<"surface"> {
  provider(c, surface);
  settings(source, c);
  if (sha256(source) !== sourceHash)
    fail("NATIVE_LIST_SETTINGS_SOURCE_HASH_MISMATCH", "/settings");
  const result: NormalizedCoreRow<"surface"> = {
    ...structuredClone(surface),
    supportedModes: [...source.supportedModes],
    defaultPageSize: source.limits.defaultPageSize,
    allowedPageSizes: [...source.limits.allowedPageSizes],
    maxSortLevels: source.limits.maxSortLevels,
    countMode: source.limits.countMode,
    ...Object.fromEntries(
      optionalListLimits
        .filter((k) => Object.hasOwn(source.limits, k))
        .map((k) => [k, source.limits[k]]),
    ),
  };
  if (
    result.allowedPageSizes!.some(
      (n) => n > (result.maxPageSize ?? c.maximumPageSize),
    )
  )
    fail(
      "NATIVE_LIST_SETTINGS_CAPABILITY_DENIED",
      "/settings/allowedPageSizes",
    );
  const shape = optionalListLimits.filter((k) =>
    Object.hasOwn(source.limits, k),
  );
  if (
    canonicalJson(compileNativeListSettings(result, c, shape)) !==
    canonicalJson(source)
  )
    fail("NATIVE_LIST_SETTINGS_NOT_LOSSLESS", "/settings");
  return result;
}
