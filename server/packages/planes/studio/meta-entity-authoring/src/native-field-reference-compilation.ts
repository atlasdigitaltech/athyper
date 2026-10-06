import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  type MetaEntityFieldReferenceBinding,
} from "@athyper/server-contract-meta-entity-authoring";
import { validateConversionJsonData } from "./normalized-core-codec.js";

/** Existing typed reference rows are preserved, not recreated from a field key.
 * The target code must match a reference already lowered from an independently
 * admitted relation/target-key resource. Lookup/resolver and deprecated variants
 * need their own compiler adapters. This grants no target-read/write authority. */
export function compileNativeFieldReferenceBindings(
  input: readonly MetaEntityFieldReferenceBinding[],
  references: readonly { fieldId: string; targetEntityCode: string }[],
): readonly MetaEntityFieldReferenceBinding[] {
  validateConversionJsonData(input, "/fieldReferenceBindings");
  const key = { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" } as const;
  const nullableKey = { anyOf: [key, { type: "null" }] } as const;
  const ids = new Set<string>(),
    fields = new Set<string>(),
    keys = new Set<string>();
  for (const row of input) {
    validateFoundationNode(
      {
        type: "object",
        properties: {
          id: referenceUuid,
          entityFieldId: referenceUuid,
          bindingKey: key,
          referenceKind: { const: "entity_relation" },
          targetEntityCode: key,
          lookupDomain: nullableKey,
          resolverKey: nullableKey,
          requireActive: { type: "boolean" },
          status: { const: "active" },
        },
        required: [
          "id",
          "entityFieldId",
          "bindingKey",
          "referenceKind",
          "targetEntityCode",
        ],
      },
      row,
      "/fieldReferenceBindings/" + row.id,
    );
    if (
      ids.has(row.id!) ||
      fields.has(row.entityFieldId) ||
      keys.has(row.bindingKey) ||
      row.lookupDomain != null ||
      row.resolverKey != null ||
      references.filter(
        (reference) =>
          reference.fieldId === row.entityFieldId &&
          reference.targetEntityCode === row.targetEntityCode,
      ).length !== 1
    )
      throw new FoundationContractError(
        "NATIVE_REFERENCE_BINDING_MISMATCH",
        "/fieldReferenceBindings/" + row.id,
      );
    ids.add(row.id!);
    fields.add(row.entityFieldId);
    keys.add(row.bindingKey);
  }
  return structuredClone(input);
}
