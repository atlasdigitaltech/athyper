import {
  FoundationContractError,
  normalizedCoreMembers,
  validateNormalizedCoreRow,
  type MetaEntityRuntimeProfile,
  type NormalizedCoreContext,
  type NormalizedCoreGraph,
  type NormalizedCoreRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
export interface LegacyNativeRuntimeMapping {
  readonly sourceHash: string;
  /** Independently established technical identity, never the first field. */
  readonly idFieldKey: string;
  readonly storageCatalogueHash: string | null;
  readonly readHandlerVersion: number | null;
  readonly writeHandlerVersion: number | null;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
/** Explicit source-format conversion. This does not authorize storage, initialize
 * protected operations or qualify a release. Complete graph validation follows. */
export function normalizeLegacyRuntime(
  input: MetaEntityRuntimeProfile,
  fields: NormalizedCoreGraph["field"],
  context: NormalizedCoreContext,
  mapping: LegacyNativeRuntimeMapping,
): NormalizedCoreRow<"runtime"> {
  validateConversionJsonData(input, "/runtime");
  validateConversionJsonData(mapping, "/runtimeMapping");
  if (sha256(input) !== mapping.sourceHash)
    fail("NATIVE_RUNTIME_SOURCE_HASH_MISMATCH", "/runtime");
  const allowed = [
    "id",
    "profileKey",
    "backingKind",
    "storagePlane",
    "storageSchema",
    "storageObject",
    "apiExposure",
    "readMode",
    "writeMode",
    "readHandlerKey",
    "writeHandlerKey",
    "createMode",
    "concurrencyMode",
    "recordVersionFieldKey",
    "tenantFieldKey",
    "softDeleteFieldKey",
    "draftTtlHours",
  ];
  for (const key of Object.keys(input))
    if (!allowed.includes(key))
      fail("NATIVE_RUNTIME_LEGACY_PATH_UNSUPPORTED", "/runtime/" + key);
  const mappingKeys = [
    "sourceHash",
    "idFieldKey",
    "storageCatalogueHash",
    "readHandlerVersion",
    "writeHandlerVersion",
  ];
  if (Object.keys(mapping).sort().join() !== mappingKeys.sort().join())
    fail("NATIVE_RUNTIME_MAPPING_INVALID", "/runtimeMapping");
  for (const required of [
    "id",
    "profileKey",
    "createMode",
    "concurrencyMode",
  ] as const)
    if (!Object.hasOwn(input, required))
      fail("NATIVE_RUNTIME_EXPLICIT_SOURCE_REQUIRED", "/runtime/" + required);
  const field = (key: string | undefined, required = false): string | null => {
    if (key === undefined && !required) return null;
    if (typeof key !== "string" || !key)
      return fail("NATIVE_RUNTIME_FIELD_MAPPING_REQUIRED", "/runtime/field");
    const ids = context.identities.filter(
      (i) =>
        i.fieldKey === key &&
        i.entityId === context.entityId &&
        i.tenantId === context.tenantId &&
        i.parentIdentityId === null,
    );
    const matches = fields.filter((f) =>
      ids.some((i) => i.id === f.fieldIdentityId),
    );
    if (ids.length !== 1 || matches.length !== 1)
      return fail("NATIVE_RUNTIME_FIELD_MAPPING_REQUIRED", "/runtime/" + key);
    return matches[0]!.id;
  };
  if (
    (input.readHandlerKey === undefined) !==
      (mapping.readHandlerVersion === null) ||
    (input.writeHandlerKey === undefined) !==
      (mapping.writeHandlerVersion === null)
  )
    fail("NATIVE_RUNTIME_HANDLER_VERSION_REQUIRED", "/runtimeMapping");
  const row = {
    id: input.id,
    ...Object.fromEntries(
      Object.keys(normalizedCoreMembers.runtime.columns).map((p) => [p, null]),
    ),
    profileKey: input.profileKey,
    backingKind: input.backingKind,
    storagePlane: input.storagePlane ?? null,
    storageSchema: input.storageSchema ?? null,
    storageObject: input.storageObject ?? null,
    storageCatalogueHash: mapping.storageCatalogueHash,
    readMode: input.readMode,
    writeMode: input.writeMode,
    apiExposure: input.apiExposure,
    createMode: input.createMode,
    draftTtlHours: input.draftTtlHours ?? null,
    concurrencyMode: input.concurrencyMode,
    idFieldId: field(mapping.idFieldKey, true),
    tenantFieldId: field(input.tenantFieldKey),
    recordVersionFieldId: field(input.recordVersionFieldKey),
    softDeleteFieldId: field(input.softDeleteFieldKey),
    readHandlerKey: input.readHandlerKey ?? null,
    readHandlerVersion: mapping.readHandlerVersion,
    writeHandlerKey: input.writeHandlerKey ?? null,
    writeHandlerVersion: mapping.writeHandlerVersion,
    referenceCapabilityKey: null,
    referenceCapabilityVersion: null,
  };
  validateNormalizedCoreRow("runtime", row);
  return row as NormalizedCoreRow<"runtime">;
}
