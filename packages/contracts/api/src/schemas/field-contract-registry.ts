import { z } from "zod";
import type { ZodType } from "zod";
import {
  EntityDataPolicySchema,
  EntityDisplayConfigSchema,
  EntityFeatureFlagsSchema,
  EntityIdentityConfigSchema,
  EntitySearchConfigSchema,
  FieldCollectionBehaviorSchema,
  FieldConstraintsSchema,
  FieldDatetimeConfigSchema,
  FieldEditabilitySchema,
  FieldEnumConfigSchema,
  FieldFilterConfigSchema,
  FieldJsonConfigSchema,
  FieldLookupConfigSchema,
  FieldLookupProfileSchema,
  FieldMoneyConfigSchema,
  FieldReferenceConfigSchema,
  FieldUiHintSchema,
  FieldValidationRulesSchema,
  FieldVisibilitySchema,
} from "./metadata";
import {
  ENTITY_CONTRACT_DEFINITIONS,
  ENTITY_FIELD_CONTRACT_DEFINITIONS,
  PROPERTY_CONTRACT_DEFINITIONS,
  type ContractScope,
  type PropertyContractDefinition,
} from "./field-contract-registry-core";

export * from "./field-contract-registry-core";

export interface PropertyContractEntry extends PropertyContractDefinition {
  schema: ZodType;
}

const SCHEMAS_BY_PROPERTY: Record<string, ZodType> = {
  display_config: EntityDisplayConfigSchema,
  feature_flags: EntityFeatureFlagsSchema,
  data_policy: EntityDataPolicySchema,
  identity_config: EntityIdentityConfigSchema,
  search_config: EntitySearchConfigSchema,
  reference_config: FieldReferenceConfigSchema,
  money_config: FieldMoneyConfigSchema,
  filter_config: FieldFilterConfigSchema,
  ui_hint: FieldUiHintSchema,
  editability: FieldEditabilitySchema,
  lookup_config: FieldLookupConfigSchema,
  validation_rules: FieldValidationRulesSchema,
  default_value: z.unknown(),
  enum_config: FieldEnumConfigSchema,
  json_config: FieldJsonConfigSchema,
  visibility: FieldVisibilitySchema,
  constraints: FieldConstraintsSchema,
  datetime_config: FieldDatetimeConfigSchema,
  lookup_profile: FieldLookupProfileSchema,
  collection_behavior: FieldCollectionBehaviorSchema,
  compute_expr: z.unknown(),
};

function withSchema(definition: PropertyContractDefinition): PropertyContractEntry {
  const schema = SCHEMAS_BY_PROPERTY[definition.property];
  if (!schema) {
    throw new Error(`Missing contract schema for ${definition.scope}.${definition.property}`);
  }
  return { ...definition, schema };
}

export const ENTITY_CONTRACTS: PropertyContractEntry[] = ENTITY_CONTRACT_DEFINITIONS.map(withSchema);

export const ENTITY_FIELD_CONTRACTS: PropertyContractEntry[] = ENTITY_FIELD_CONTRACT_DEFINITIONS.map(withSchema);

export const PROPERTY_CONTRACTS: PropertyContractEntry[] = PROPERTY_CONTRACT_DEFINITIONS.map(withSchema);

export function contractsForScope(scope: ContractScope): PropertyContractEntry[] {
  return PROPERTY_CONTRACTS.filter((entry) => entry.scope === scope);
}

export function findPropertyContract(
  scope: ContractScope,
  property: string,
): PropertyContractEntry | undefined {
  return PROPERTY_CONTRACTS.find((entry) => entry.scope === scope && entry.property === property);
}

function schemaTopLevelKeys(schema: ZodType): string[] {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function getUnknownTopLevelKeys(entry: PropertyContractEntry, value: unknown): string[] {
  const record = asRecord(value);
  if (!record) return [];

  const allowed = new Set(schemaTopLevelKeys(entry.schema));
  if (allowed.size === 0) return [];
  for (const alias of entry.aliases) allowed.add(alias);
  for (const deprecated of entry.deprecatedKeys) allowed.add(deprecated.key);

  return Object.keys(record).filter((key) => !allowed.has(key));
}

export function validatePropertyContractValue(
  entry: PropertyContractEntry,
  value: unknown,
): { ok: true; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] } {
  const parsed = entry.schema.safeParse(value);
  const warnings: string[] = [];
  const unknownKeys = getUnknownTopLevelKeys(entry, value);

  if (unknownKeys.length > 0) {
    const message = `${entry.property} contains unknown keys: ${unknownKeys.join(", ")}`;
    if (entry.unknownKeyPolicy === "reject") {
      return {
        ok: false,
        errors: [message],
        warnings,
      };
    }
    if (entry.unknownKeyPolicy === "warn") warnings.push(message);
  }

  for (const deprecated of entry.deprecatedKeys) {
    const record = asRecord(value);
    if (record && deprecated.key in record) {
      warnings.push(`${entry.property}.${deprecated.key} is deprecated; migrate to ${deprecated.migratesTo}.`);
    }
  }

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => issue.message),
      warnings,
    };
  }

  return { ok: true, warnings };
}

