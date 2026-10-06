import {
  FoundationContractError,
  type MetaEntityField,
  type MetaEntityRuntimeProfile,
  type NormalizedCoreContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import {
  normalizeLegacyReadField,
  validateConversionJsonData,
} from "./normalized-core-codec.js";
import {
  normalizeLegacyRuntime,
  type LegacyNativeRuntimeMapping,
} from "./legacy-native-runtime.js";
import type {
  NativeConversionAdapters,
  NativeConversionResource,
} from "./native-graph-conversion.js";
type FieldMapping = Parameters<typeof normalizeLegacyReadField>[2];
export interface LegacyNativeCoreAdapterInput {
  readonly fields: readonly MetaEntityField[];
  readonly runtimeProfiles: readonly MetaEntityRuntimeProfile[];
  readonly fieldMappings: Readonly<Record<string, FieldMapping>>;
  readonly runtimeMappings: Readonly<
    Record<string, LegacyNativeRuntimeMapping>
  >;
  readonly context: NormalizedCoreContext;
  readonly resources: {
    readonly fields: NativeConversionResource;
    readonly runtimeProfiles: NativeConversionResource;
  };
  /** Canonical relation serialization resolved from independently admitted
   * structural metadata; original keyReference blobs are never replayed. */
  readonly relationReference?: (relationId: string) => unknown;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
const configColumns = {
  domain_code: "domainCode",
  min_length: "minLength",
  max_length: "maxLength",
  pattern: "pattern",
  minimum: "minimum",
  maximum: "maximum",
  precision: "precision",
  scale: "scale",
} as const;
/** Production implementation of the two scalar conversion families. Source-shape
 * masks preserve absence, while every value is reconstructed from normalized
 * rows/independent metadata. The factory grants no installed-adapter authority. */
export function createLegacyNativeCoreAdapters(
  input: LegacyNativeCoreAdapterInput,
): Pick<NativeConversionAdapters, "fields" | "runtimeProfiles"> {
  validateConversionJsonData(input.fields, "/fields");
  validateConversionJsonData(input.runtimeProfiles, "/runtimeProfiles");
  validateConversionJsonData(input.fieldMappings, "/fieldMappings");
  validateConversionJsonData(input.runtimeMappings, "/runtimeMappings");
  const fields = structuredClone(input.fields),
    runtimes = structuredClone(input.runtimeProfiles);
  const fieldMappings = structuredClone(input.fieldMappings),
    runtimeMappings = structuredClone(input.runtimeMappings);
  const shapes = <T extends { readonly id?: string }>(
    rows: readonly T[],
    mappings: Readonly<Record<string, unknown>>,
    path: string,
  ) => {
    if (
      rows.some((r) => !r.id) ||
      new Set(rows.map((r) => r.id)).size !== rows.length ||
      Object.keys(mappings).sort().join() !==
        rows
          .map((r) => r.id)
          .sort()
          .join()
    )
      fail("NATIVE_CORE_MAPPING_INVENTORY_INVALID", path);
    return new Map(rows.map((r) => [r.id!, Object.keys(r)]));
  };
  const fieldShapes = shapes(fields, fieldMappings, "/fields"),
    runtimeShapes = shapes(runtimes, runtimeMappings, "/runtimeProfiles");
  const normalizedFields = fields.map((f) =>
    normalizeLegacyReadField(f, input.context, fieldMappings[f.id!]!),
  );
  const configShapes = new Map(
    fields.map((f) => [f.id!, Object.keys(f.typeConfig)]),
  );
  for (const r of runtimes)
    normalizeLegacyRuntime(
      r,
      normalizedFields,
      input.context,
      runtimeMappings[r.id!]!,
    );
  const fieldKey = (identityId: string) => {
    const matching = input.context.identities.filter(
      (i) =>
        i.id === identityId &&
        i.entityId === input.context.entityId &&
        i.tenantId === input.context.tenantId,
    );
    if (matching.length !== 1)
      return fail("NATIVE_CORE_REVERSE_IDENTITY_REQUIRED", "/fieldIdentityId");
    return matching[0]!.fieldKey;
  };
  const runtimeFieldKey = (id: unknown) => {
    const row = normalizedFields.find((f) => f.id === id);
    if (!row)
      return fail("NATIVE_CORE_REVERSE_IDENTITY_REQUIRED", "/runtimeFieldId");
    return fieldKey(row.fieldIdentityId);
  };
  const project = (
    keys: readonly string[],
    values: Readonly<Record<string, unknown>>,
  ) => Object.fromEntries(keys.map((k) => [k, values[k]]));
  return {
    fields: {
      resource: structuredClone(input.resources.fields),
      forward: (rows) =>
        rows.map((f) => {
          const mapping = fieldMappings[f.id ?? ""];
          if (!mapping)
            return fail("NATIVE_CORE_MAPPING_INVENTORY_INVALID", "/fields");
          return normalizeLegacyReadField(f, input.context, mapping);
        }),
      reverse: (rows) =>
        rows.map((row) => {
          const keys = fieldShapes.get(row.id),
            cfgKeys = configShapes.get(row.id),
            mapping = fieldMappings[row.id];
          if (!keys || !cfgKeys || !mapping)
            return fail("NATIVE_CORE_REVERSE_IDENTITY_REQUIRED", "/fields");
          const config: Record<string, unknown> = { kind: row.dataType };
          for (const k of cfgKeys) {
            if (k === "kind") continue;
            if (k === "keyReference") {
              if (!row.relationId || !input.relationReference)
                return fail(
                  "NATIVE_CORE_RELATION_INVERSE_REQUIRED",
                  "/typeConfig/keyReference",
                );
              const reference = input.relationReference(row.relationId);
              validateConversionJsonData(reference, "/typeConfig/keyReference");
              config[k] = reference;
            } else
              config[k] = Reflect.get(
                row,
                configColumns[k as keyof typeof configColumns],
              );
          }
          const source = project(keys, {
            id: row.id,
            fieldKey: fieldKey(row.fieldIdentityId),
            description: row.description,
            dataType: row.dataType,
            typeConfig: config,
            cardinality: row.nullable ? "zero_or_one" : "one",
            valueOrigin: row.valueOrigin,
            writeMode: row.writeMode,
            storagePath: row.storagePath,
            dataClassification: row.dataClassification,
            retentionPolicyCode: row.retentionPolicyCode,
            status: "active",
          }) as unknown as MetaEntityField;
          const rebuilt = normalizeLegacyReadField(source, input.context, {
            ...mapping,
            sourceHash: sha256(source),
          });
          if (canonicalJson(rebuilt) !== canonicalJson(row))
            fail("NATIVE_CORE_REVERSE_NOT_REPRESENTABLE", "/fields/" + row.id);
          return source;
        }),
    },
    runtimeProfiles: {
      resource: structuredClone(input.resources.runtimeProfiles),
      forward: (rows) =>
        rows.map((r) => {
          const mapping = runtimeMappings[r.id ?? ""];
          if (!mapping)
            return fail(
              "NATIVE_CORE_MAPPING_INVENTORY_INVALID",
              "/runtimeProfiles",
            );
          return normalizeLegacyRuntime(
            r,
            normalizedFields,
            input.context,
            mapping,
          );
        }),
      reverse: (rows) =>
        rows.map((row) => {
          const keys = runtimeShapes.get(row.id),
            mapping = runtimeMappings[row.id];
          if (!keys || !mapping)
            return fail(
              "NATIVE_CORE_REVERSE_IDENTITY_REQUIRED",
              "/runtimeProfiles",
            );
          const source = project(keys, {
            id: row.id,
            profileKey: row.profileKey,
            backingKind: row.backingKind,
            storagePlane: row.storagePlane,
            storageSchema: row.storageSchema,
            storageObject: row.storageObject,
            apiExposure: row.apiExposure,
            readMode: row.readMode,
            writeMode: row.writeMode,
            readHandlerKey: row.readHandlerKey,
            writeHandlerKey: row.writeHandlerKey,
            createMode: row.createMode,
            concurrencyMode: row.concurrencyMode,
            recordVersionFieldKey:
              row.recordVersionFieldId === null
                ? null
                : runtimeFieldKey(row.recordVersionFieldId),
            tenantFieldKey:
              row.tenantFieldId === null
                ? null
                : runtimeFieldKey(row.tenantFieldId),
            softDeleteFieldKey:
              row.softDeleteFieldId === null
                ? null
                : runtimeFieldKey(row.softDeleteFieldId),
            draftTtlHours: row.draftTtlHours,
          }) as unknown as MetaEntityRuntimeProfile;
          const rebuilt = normalizeLegacyRuntime(
            source,
            normalizedFields,
            input.context,
            { ...mapping, sourceHash: sha256(source) },
          );
          if (canonicalJson(rebuilt) !== canonicalJson(row))
            fail(
              "NATIVE_CORE_REVERSE_NOT_REPRESENTABLE",
              "/runtimeProfiles/" + row.id,
            );
          return source;
        }),
    },
  };
}
