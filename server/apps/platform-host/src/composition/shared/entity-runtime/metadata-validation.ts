import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface EntityMetadataContextRequirement {
  readonly entityCode: string;
  readonly operationKey: string;
  readonly requiredCoordinates: readonly string[];
}

export interface EntityMetadataReferenceRequirement {
  readonly entityCode: string;
  readonly fieldPath: string;
  readonly referenceDomain: string;
}

/** Generic validation hook contracts. Metadata declares requirements; a trusted
 * composition adapter resolves coordinates and reference-domain membership. */
export function createEntityMetadataHooks(input: {
  readonly contextRequirements?: readonly EntityMetadataContextRequirement[];
  readonly referenceRequirements?: readonly EntityMetadataReferenceRequirement[];
  readonly referenceActive?: (
    context: VerifiedRequestContext,
    domain: string,
    value: string,
  ) => Promise<boolean>;
}) {
  return Object.freeze({
    validateContext(
      context: VerifiedRequestContext,
      entityCode: string,
      operationKey: string,
      coordinates: Readonly<Record<string, unknown>>,
    ): void {
      const requirement = input.contextRequirements?.find(
        (item) =>
          item.entityCode === entityCode && item.operationKey === operationKey,
      );
      if (
        requirement?.requiredCoordinates.some(
          (key) => typeof coordinates[key] !== "string" || !coordinates[key],
        )
      )
        throw new Error("ENTITY_METADATA_CONTEXT_REQUIRED");
      if (!context.tenantId || !context.principalId)
        throw new Error("ENTITY_METADATA_CONTEXT_INVALID");
    },
    async validateReferences(
      context: VerifiedRequestContext,
      entityCode: string,
      values: Readonly<Record<string, unknown>>,
    ): Promise<void> {
      for (const requirement of input.referenceRequirements ?? []) {
        if (requirement.entityCode !== entityCode) continue;
        const value = values[requirement.fieldPath];
        if (value === undefined || value === null) continue;
        if (typeof value !== "string" || !input.referenceActive)
          throw new Error("ENTITY_METADATA_REFERENCE_INVALID");
        if (!(await input.referenceActive(context, requirement.referenceDomain, value)))
          throw new Error("ENTITY_METADATA_REFERENCE_INACTIVE");
      }
    },
  });
}
