import { z } from "zod";
import {
  MetaEntityContractV2Schema,
  MetaEntityNumberingSchema,
} from "./meta-entity-contract-v2";

export const META_ENTITY_CONTRACT_V20_SCHEMA_VERSION = "2.0" as const;
export const META_ENTITY_CONTRACT_V21_SCHEMA_VERSION = "2.1" as const;

const PlaneSchema = z.enum(["neon", "admin", "mesh"]);

const MetaEntityOperationV21ExtensionSchema = z.object({
  operation_code: z.string().min(1),
  plane_filter: z.array(PlaneSchema).nullable(),
  action_rules: z.array(z.record(z.string(), z.unknown())),
}).strict();

const MetaEntityLifecycleStateMaskV21Schema = z.object({
  state_code: z.string().min(1),
  plane: z.enum(["all", "neon", "admin", "mesh"]),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
  can_transition_to: z.array(z.string().min(1)),
}).strict();

const MetaEntityFlowV21ExtensionSchema = z.object({
  flow_code: z.string().min(1),
  legacy_create_graph: z.array(z.string().min(1)),
  steps: z.array(z.record(z.string(), z.unknown())),
  sections: z.array(z.record(z.string(), z.unknown())),
  fields: z.array(z.record(z.string(), z.unknown())),
}).strict();

/**
 * The M0 migration envelope is deliberately not the runtime v2.1 contract.
 * It preserves every v2.0 value, materializes lossless extensions, and lists
 * values that must be hydrated before the future v2.1 artifact can publish.
 */
export const MetaEntityContractV21MigrationEnvelopeSchema = z.object({
  contract_schema_version: z.literal(META_ENTITY_CONTRACT_V21_SCHEMA_VERSION),
  source_schema_version: z.literal(META_ENTITY_CONTRACT_V20_SCHEMA_VERSION),
  base_contract: MetaEntityContractV2Schema,
  extensions: z.object({
    version_contract: z.object({
      catalog_enabled: z.boolean().nullable(),
      key_strategy: z.string().min(1).nullable(),
    }).strict(),
    numbering_configurations: z.array(MetaEntityNumberingSchema),
    operation_extensions: z.array(MetaEntityOperationV21ExtensionSchema),
    lifecycle_state_masks: z.array(MetaEntityLifecycleStateMaskV21Schema),
    flow_details: z.array(MetaEntityFlowV21ExtensionSchema),
  }).strict(),
  hydration_required: z.array(z.string().min(1)),
  publishable: z.boolean(),
}).strict();

export type MetaEntityContractV21MigrationEnvelope = z.infer<
  typeof MetaEntityContractV21MigrationEnvelopeSchema
>;

export function upgradeMetaEntityContractV20ToV21Envelope(
  input: unknown,
): MetaEntityContractV21MigrationEnvelope {
  const contract = MetaEntityContractV2Schema.parse(input);
  const hydrationRequired = new Set<string>([
    "version_contract.catalog_enabled",
    "version_contract.key_strategy",
  ]);

  const operationExtensions = [...contract.operations]
    .sort((left, right) => left.operation_code.localeCompare(right.operation_code))
    .map((operation) => {
      hydrationRequired.add(`operations.${operation.operation_code}.plane_filter`);
      hydrationRequired.add(`operations.${operation.operation_code}.action_rules`);
      return {
        operation_code: operation.operation_code,
        plane_filter: null,
        action_rules: [],
      };
    });

  const lifecycleStateMasks = contract.lifecycle
    ? Object.entries(contract.lifecycle.states)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stateCode, state]) => ({
        state_code: stateCode,
        plane: "all" as const,
        can_edit: state.is_editable,
        can_delete: state.is_deletable,
        can_transition_to: [...(contract.lifecycle?.allowed_transitions[stateCode] ?? [])].sort(),
      }))
    : [];

  if (contract.lifecycle) {
    hydrationRequired.add("lifecycle.definition_reference");
    hydrationRequired.add("lifecycle.transition_details");
  }

  const flowDetails = [...contract.flows]
    .sort((left, right) => left.flow_code.localeCompare(right.flow_code))
    .map((flow) => {
      hydrationRequired.add(`flows.${flow.flow_code}.steps`);
      hydrationRequired.add(`flows.${flow.flow_code}.sections`);
      hydrationRequired.add(`flows.${flow.flow_code}.fields`);
      return {
        flow_code: flow.flow_code,
        legacy_create_graph: [...flow.create_graph],
        steps: [],
        sections: [],
        fields: [],
      };
    });

  const hydration = [...hydrationRequired].sort();
  return MetaEntityContractV21MigrationEnvelopeSchema.parse({
    contract_schema_version: META_ENTITY_CONTRACT_V21_SCHEMA_VERSION,
    source_schema_version: META_ENTITY_CONTRACT_V20_SCHEMA_VERSION,
    base_contract: contract,
    extensions: {
      version_contract: {
        catalog_enabled: null,
        key_strategy: null,
      },
      numbering_configurations: contract.numbering ? [contract.numbering] : [],
      operation_extensions: operationExtensions,
      lifecycle_state_masks: lifecycleStateMasks,
      flow_details: flowDetails,
    },
    hydration_required: hydration,
    publishable: hydration.length === 0,
  });
}
