import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateNormalizedCoreRow,
  type NormalizedCoreRow,
  type NormalizedCoreContext,
  type NormalizedLayoutContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type { NativeConversionResource } from "./native-graph-conversion.js";

export interface LegacySurfaceIdentity {
  readonly identityField?: string;
  readonly titleField?: string;
  readonly codeField?: string;
  readonly iconKey?: string;
}
export interface NativeSurfaceIdentityContext {
  readonly entityId: string;
  readonly tenantId: string | null;
  readonly resource: NativeConversionResource;
  readonly fields: readonly NormalizedCoreRow<"field">[];
  readonly identities: NormalizedCoreContext["identities"];
  readonly presentation: NormalizedLayoutContext["fieldPresentation"];
  readonly maximumFields: number;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function index(
  surface: NormalizedCoreRow<"surface">,
  c: NativeSurfaceIdentityContext,
) {
  validateNormalizedCoreRow("surface", surface);
  validateFoundationNode(referenceUuid, c.entityId, "/context/entityId");
  if (c.tenantId !== null)
    validateFoundationNode(referenceUuid, c.tenantId, "/context/tenantId");
  if (
    !["list", "detail"].includes(surface.surfaceKind) ||
    !Number.isSafeInteger(c.maximumFields) ||
    c.maximumFields < 1 ||
    c.fields.length > c.maximumFields
  )
    fail("NATIVE_SURFACE_IDENTITY_CONTEXT_INVALID", "/context");
  validateFoundationNode(
    {
      type: "object",
      properties: {
        owner: { type: "string", minLength: 1, maxLength: 200 },
        key: { type: "string", minLength: 1, maxLength: 200 },
        version: { type: "integer", minimum: 1, maximum: 2147483647 },
        hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
    },
    c.resource,
    "/context/resource",
  );
  const byId = new Map<string, string>(),
    byKey = new Map<string, string>();
  for (const field of c.fields) {
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
      byId.has(field.id) ||
      byKey.has(identities[0]!.fieldKey)
    )
      fail("NATIVE_SURFACE_IDENTITY_SCOPE_INVALID", "/context");
    byId.set(field.id, identities[0]!.fieldKey);
    byKey.set(identities[0]!.fieldKey, field.id);
  }
  const readable = (id: string) => {
    const field = c.fields.find((f) => f.id === id);
    if (
      !field ||
      field.dataType === "uuid" ||
      c.presentation.find((p) => p.fieldId === id)!.display !== "plain"
    )
      fail("NATIVE_SURFACE_IDENTITY_READ_DENIED", "/identity");
  };
  return { byId, byKey, readable };
}
export function compileNativeSurfaceIdentity(
  surface: NormalizedCoreRow<"surface">,
  c: NativeSurfaceIdentityContext,
  properties: readonly (keyof LegacySurfaceIdentity)[],
): LegacySurfaceIdentity {
  const mappings = index(surface, c);
  if (
    new Set(properties).size !== properties.length ||
    properties.some(
      (p) =>
        !["identityField", "titleField", "codeField", "iconKey"].includes(p),
    ) ||
    (surface.surfaceKind === "list" &&
      (properties.includes("titleField") ||
        properties.includes("codeField") ||
        !properties.includes("identityField"))) ||
    (surface.surfaceKind === "detail" &&
      (properties.includes("identityField") ||
        !properties.includes("titleField")))
  )
    fail("NATIVE_SURFACE_IDENTITY_VARIANT_INVALID", "/identity");
  const result: Record<string, string> = {};
  const columns = {
    identityField: "identityFieldId",
    titleField: "titleFieldId",
    codeField: "codeFieldId",
  } as const;
  for (const property of properties) {
    if (property === "iconKey") {
      if (surface.iconKey === null)
        return fail("NATIVE_SURFACE_IDENTITY_INCOMPLETE", "/iconKey");
      result.iconKey = surface.iconKey;
    } else {
      const id = surface[columns[property]];
      if (id === null || !mappings.byId.has(id))
        return fail("NATIVE_SURFACE_IDENTITY_INCOMPLETE", "/" + property);
      mappings.readable(id);
      result[property] = mappings.byId.get(id)!;
    }
  }
  return result;
}
export function convertLegacySurfaceIdentity(
  source: LegacySurfaceIdentity,
  surface: NormalizedCoreRow<"surface">,
  c: NativeSurfaceIdentityContext,
  sourceHash: string,
): NormalizedCoreRow<"surface"> {
  validateConversionJsonData(source, "/identity");
  validateFoundationNode(
    {
      type: "object",
      properties: {
        identityField: { type: "string", minLength: 1, maxLength: 127 },
        titleField: { type: "string", minLength: 1, maxLength: 127 },
        codeField: { type: "string", minLength: 1, maxLength: 127 },
        iconKey: { type: "string", pattern: "^[a-z][a-z0-9_.:-]{0,126}$" },
      },
      required: [],
    },
    source,
    "/identity",
  );
  if (sha256(source) !== sourceHash)
    fail("NATIVE_SURFACE_IDENTITY_SOURCE_HASH_MISMATCH", "/identity");
  const mappings = index(surface, c);
  const row = { ...structuredClone(surface) };
  const columns = {
    identityField: "identityFieldId",
    titleField: "titleFieldId",
    codeField: "codeFieldId",
  } as const;
  for (const [property, column] of Object.entries(columns)) {
    if (Object.hasOwn(source, property)) {
      const key = source[property as keyof typeof columns]!;
      const id = mappings.byKey.get(key);
      if (!id)
        return fail("NATIVE_SURFACE_IDENTITY_FIELD_UNKNOWN", "/" + property);
      mappings.readable(id);
      (row as Record<string, unknown>)[column] = id;
    }
  }
  if (source.iconKey !== undefined)
    (row as Record<string, unknown>).iconKey = source.iconKey;
  const shape = Object.keys(source) as (keyof LegacySurfaceIdentity)[];
  if (
    canonicalJson(compileNativeSurfaceIdentity(row, c, shape)) !==
    canonicalJson(source)
  )
    fail("NATIVE_SURFACE_IDENTITY_NOT_LOSSLESS", "/identity");
  return row;
}
