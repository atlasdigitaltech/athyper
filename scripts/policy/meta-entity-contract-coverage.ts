import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY,
  MetaEntityContractV2Schema,
  type MetaEntityContractOwner,
  type MetaEntityContractPropertyDefinition,
} from "../../packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v2";

export const META_ENTITY_COVERAGE_ARTIFACT =
  "config/governance/meta-entity-contract-v2-coverage.json";

type CoverageOwner = MetaEntityContractOwner | "contract";
type PropertySource = "schema_registry" | "schema_only" | "registry_only" | "v2_1_planned";
type PropertyClassification =
  | "authored"
  | "derived"
  | "server_managed"
  | "reference"
  | "deprecated"
  | "planned";

interface JsonSchemaNode {
  path: string;
  type: string;
  required: boolean;
  nullable: boolean;
  enumValues: readonly unknown[];
}

interface PlannedProperty {
  path: string;
  owner: CoverageOwner;
  type: string;
  nullable: boolean;
  required: boolean;
  classification: PropertyClassification;
  scope: string;
  persistenceTables: readonly string[];
  notes: string;
}

export interface MetaEntityCoverageProperty {
  path: string;
  registryPath: string | null;
  owner: CoverageOwner;
  source: PropertySource;
  schema: {
    type: string;
    required: boolean;
    nullable: boolean;
    enumValues: readonly unknown[];
  };
  scope: string;
  classification: PropertyClassification;
  studio: {
    control: string;
    disposition: "editable" | "read_only" | "not_applicable" | "planned";
  };
  api: {
    read: string;
    write: string | null;
  };
  persistence: {
    mode: "versioned_projection" | "stable_projection" | "json_only" | "none" | "planned";
    tables: readonly string[];
  };
  compiler: string;
  consumers: {
    admin: string;
    neon: string;
    mesh: string;
  };
  authorization: string;
  driftRule: string;
  tests: {
    unit: string;
    postgres: string;
    browser: string;
  };
  classificationStatus: "classified";
  wiringStatus: "complete" | "blocked";
  notes: string | null;
}

export interface MetaEntityCoverageArtifact {
  schemaVersion: 1;
  contract: {
    currentSchemaVersion: "2.0";
    targetSchemaVersion: "2.1";
    sourceSchema: string;
    sourceRegistry: string;
    expectedRegistryEntries: number;
  };
  ownershipRules: readonly string[];
  tableCoverage: readonly {
    table: string;
    role:
      | "shared_reference"
      | "stable_identity"
      | "contract_workflow"
      | "publication_authority"
      | "versioned_projection"
      | "governed_projection"
      | "runtime_only";
    contractOwner: CoverageOwner | null;
    scope: string;
    targetBehavior: string;
    status: "classified";
  }[];
  relatedInputCoverage: readonly {
    tables: readonly string[];
    classification:
      | "immutable_reference"
      | "tenant_overlay"
      | "runtime_only"
      | "contract_projection";
    targetBehavior: string;
    status: "classified";
  }[];
  properties: readonly MetaEntityCoverageProperty[];
  summary: {
    registryEntries: number;
    schemaNodes: number;
    totalCoverageRows: number;
    classificationCompleteRows: number;
    wiringCompleteRows: number;
    wiringBlockedRows: number;
    schemaOnlyRows: number;
    registryOnlyRows: number;
    plannedV21Rows: number;
  };
}

export interface MetaEntityGeneratedPropertyCase {
  propertyPath: string;
  caseIds: string[];
  expectedTables: readonly string[];
  expectedConsumers: MetaEntityCoverageProperty["consumers"];
}

/**
 * M7 executable test matrix. Test runners may shard these cases, but they may
 * not omit the state/variant cases implied by the property schema.
 */
export function buildGeneratedPropertyTestCases(
  artifact = buildMetaEntityCoverageArtifact(),
): MetaEntityGeneratedPropertyCase[] {
  return artifact.properties.map((property) => {
    const cases = new Set<string>(["non_default"]);
    for (const value of property.schema.enumValues) cases.add(`enum:${String(value)}`);
    if (property.schema.nullable) cases.add("null");
    cases.add(property.schema.required ? "absent_rejected" : "absent");
    cases.add("present");
    if (property.schema.type.includes("array")) {
      cases.add("array:empty");
      cases.add("array:single");
      cases.add("array:multiple");
    }
    return {
      propertyPath: property.path,
      caseIds: [...cases].sort(),
      expectedTables: property.persistence.tables,
      expectedConsumers: property.consumers,
    };
  });
}

const TABLE_COVERAGE: MetaEntityCoverageArtifact["tableCoverage"] = [
  {
    table: "entity_class_profile",
    role: "shared_reference",
    contractOwner: "catalog",
    scope: "platform",
    targetBehavior: "Read-only Studio selector; compiler records the resolved profile and provenance.",
    status: "classified",
  },
  {
    table: "entity",
    role: "stable_identity",
    contractOwner: "catalog",
    scope: "platform_or_tenant",
    targetBehavior: "Stable entity identity and discovery compatibility projection; not runtime-authoritative for behavior.",
    status: "classified",
  },
  {
    table: "entity_version",
    role: "contract_workflow",
    contractOwner: "contract",
    scope: "platform_or_tenant",
    targetBehavior: "Canonical immutable Contract document, schema version, hash, lineage, lock and workflow envelope.",
    status: "classified",
  },
  {
    table: "entity_publish_state",
    role: "publication_authority",
    contractOwner: "contract",
    scope: "platform_or_tenant",
    targetBehavior: "Sole draft/published pointer and catalog/execution readiness authority.",
    status: "classified",
  },
  ...[
    ["entity_version_contract", "version_contract"],
    ["entity_field", "fields"],
    ["entity_relation", "relations"],
    ["entity_surface", "surfaces"],
    ["entity_field_surface", "surfaces"],
    ["entity_operation", "operations"],
    ["entity_policy", "policy"],
  ].map(([table, contractOwner]) => ({
    table,
    role: "versioned_projection" as const,
    contractOwner: contractOwner as MetaEntityContractOwner,
    scope: "platform_or_tenant",
    targetBehavior: "Deterministic version-scoped projection of the canonical Contract; no independent editing.",
    status: "classified" as const,
  })),
  ...[
    ["entity_action_rule", "operations"],
    ["entity_lifecycle", "lifecycle"],
    ["entity_lifecycle_state_mask", "lifecycle"],
    ["entity_numbering_config", "numbering"],
    ["entity_flow", "flows"],
    ["entity_flow_step", "flows"],
    ["entity_flow_section", "flows"],
    ["entity_flow_field", "flows"],
  ].map(([table, contractOwner]) => ({
    table,
    role: "governed_projection" as const,
    contractOwner: contractOwner as MetaEntityContractOwner,
    scope: "platform_or_tenant",
    targetBehavior: "Expand Contract v2.1 and add version/tenant ownership before enabling canonical publication.",
    status: "classified" as const,
  })),
  {
    table: "entity_numbering_counter",
    role: "runtime_only",
    contractOwner: null,
    scope: "tenant_runtime",
    targetBehavior: "Mutable numbering state; never clone, import, reset or deactivate during metadata publication.",
    status: "classified",
  },
];

const RELATED_INPUT_COVERAGE: MetaEntityCoverageArtifact["relatedInputCoverage"] = [
  {
    tables: [
      "lifecycle",
      "lifecycle_state",
      "lifecycle_transition",
      "lifecycle_transition_gate",
      "lifecycle_transition_hook",
      "lifecycle_timer_policy",
      "hook_action_registry",
    ],
    classification: "immutable_reference",
    targetBehavior: "Publish immutable lifecycle definitions addressed by stable code, version and hash; entity_version binds to the reference.",
    status: "classified",
  },
  {
    tables: ["field_security_policy", "overlay", "overlay_change"],
    classification: "tenant_overlay",
    targetBehavior: "Separately versioned tenant delta applied after the immutable platform Contract; never rewrites the platform artifact.",
    status: "classified",
  },
  {
    tables: ["policy_definition", "policy_rule", "policy_rule_version"],
    classification: "immutable_reference",
    targetBehavior: "Referenced policy definitions with explicit version/hash provenance in the entity Contract.",
    status: "classified",
  },
  {
    tables: ["lifecycle_transition_execution", "intake_idempotency", "record_edit_lock"],
    classification: "runtime_only",
    targetBehavior: "Operational state excluded from Contract authoring, cloning and publication.",
    status: "classified",
  },
  {
    tables: ["lifecycle_hook_override"],
    classification: "tenant_overlay",
    targetBehavior: "Tenant-scoped override governed independently from the platform lifecycle definition.",
    status: "classified",
  },
];

const PLANNED_V21_PROPERTIES: readonly PlannedProperty[] = [
  {
    path: "version_contract.catalog_enabled",
    owner: "version_contract",
    type: "boolean",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_version_contract"],
    notes: "DB-owned execution property absent from Contract v2.0.",
  },
  {
    path: "version_contract.key_strategy",
    owner: "version_contract",
    type: "string",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_version_contract"],
    notes: "DB-owned execution property absent from Contract v2.0.",
  },
  {
    path: "operations.plane_filter",
    owner: "operations",
    type: "array",
    nullable: true,
    required: false,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_operation"],
    notes: "Required for explicit Admin, Neon and Mesh operation projection.",
  },
  {
    path: "operations.action_rules",
    owner: "operations",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_action_rule"],
    notes: "Version action/capability rules with the operation owner.",
  },
  {
    path: "lifecycle.definition_reference",
    owner: "lifecycle",
    type: "object",
    nullable: true,
    required: false,
    classification: "reference",
    scope: "platform",
    persistenceTables: ["entity_lifecycle"],
    notes: "Stable lifecycle definition code, version and hash.",
  },
  {
    path: "lifecycle.transition_details",
    owner: "lifecycle",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform",
    persistenceTables: ["lifecycle_transition"],
    notes: "Explicit operation, conditions, gates and hook references.",
  },
  {
    path: "lifecycle.state_masks",
    owner: "lifecycle",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_lifecycle_state_mask"],
    notes: "Per-state and per-plane edit/delete/transition capabilities.",
  },
  {
    path: "numbering.configurations",
    owner: "numbering",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_numbering_config"],
    notes: "Replaces the lossy v2.0 singleton numbering object.",
  },
  {
    path: "flows.steps",
    owner: "flows",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_flow_step"],
    notes: "Complete versioned flow step graph.",
  },
  {
    path: "flows.sections",
    owner: "flows",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_flow_section"],
    notes: "Versioned section layout and conditions.",
  },
  {
    path: "flows.fields",
    owner: "flows",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_flow_field"],
    notes: "Versioned field bindings with same-version integrity.",
  },
  {
    path: "policy.field_security",
    owner: "policy",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "tenant_overlay",
    persistenceTables: ["field_security_policy"],
    notes: "Separately versioned tenant field-security overlay.",
  },
  {
    path: "policy.field_scope_eval_order",
    owner: "policy",
    type: "array",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_policy"],
    notes: "Runtime-consumed DB property absent from Contract v2.0.",
  },
  {
    path: "policy.extended_scope",
    owner: "policy",
    type: "object",
    nullable: false,
    required: true,
    classification: "planned",
    scope: "platform_or_tenant",
    persistenceTables: ["entity_policy"],
    notes: "Runtime-consumed DB property absent from Contract v2.0.",
  },
];

const OWNER_TABLES: Readonly<Record<CoverageOwner, readonly string[]>> = {
  contract: ["entity_version", "entity_publish_state"],
  catalog: ["entity"],
  version_contract: ["entity_version_contract"],
  fields: ["entity_field"],
  relations: ["entity_relation"],
  surfaces: ["entity_surface", "entity_field_surface"],
  operations: ["entity_operation"],
  lifecycle: ["entity_lifecycle"],
  numbering: ["entity_numbering_config"],
  policy: ["entity_policy"],
  flows: ["entity_flow"],
};

const SERVER_MANAGED_PATHS = /(?:^contract_version$|\.id$|\.tenant_id$|\.entity_version_id$|\.entity_id$|\.contract_hash$|status_changed_(?:at|by)$)/;
const REFERENCE_PATHS = /(?:module_id|permission_code|renderer_key|handler|definition_reference|target_entity_code)/;

function canonicalRegistryPath(entry: MetaEntityContractPropertyDefinition): string {
  if (
    entry.owner === "version_contract"
    && /^(?:identity_config|search_config|data_policy|concurrency_config|storage_config)\./.test(entry.path)
  ) {
    return `version_contract.${entry.path}`;
  }
  return entry.path;
}

function ownerForPath(path: string): CoverageOwner {
  const root = path.split(".")[0];
  if (root === "contract_version") return "contract";
  if (
    root === "catalog"
    || root === "version_contract"
    || root === "fields"
    || root === "relations"
    || root === "surfaces"
    || root === "operations"
    || root === "lifecycle"
    || root === "numbering"
    || root === "policy"
    || root === "flows"
  ) {
    return root;
  }
  return "contract";
}

function typeNames(schema: Record<string, unknown>): string[] {
  const value = schema.type;
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (schema.properties) return ["object"];
  if (schema.items) return ["array"];
  if (schema.const !== undefined) return [typeof schema.const];
  return ["unknown"];
}

function collectSchemaNodes(): Map<string, JsonSchemaNode> {
  const root = z.toJSONSchema(MetaEntityContractV2Schema) as Record<string, unknown>;
  const nodes = new Map<string, JsonSchemaNode>();

  const addNode = (
    path: string,
    schema: Record<string, unknown>,
    required: boolean,
    inheritedNullable = false,
  ) => {
    if (!path) return;
    const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
    const nullable = inheritedNullable || typeNames(schema).includes("null");
    const next: JsonSchemaNode = {
      path,
      type: typeNames(schema).filter((type) => type !== "null").sort().join("|") || "unknown",
      required,
      nullable,
      enumValues,
    };
    const current = nodes.get(path);
    if (!current) {
      nodes.set(path, next);
      return;
    }
    nodes.set(path, {
      path,
      type: [...new Set(`${current.type}|${next.type}`.split("|"))].sort().join("|"),
      required: current.required && next.required,
      nullable: current.nullable || next.nullable,
      enumValues: [...new Set([...current.enumValues, ...next.enumValues])],
    });
  };

  const visit = (
    schema: Record<string, unknown>,
    path: string,
    required: boolean,
    inheritedNullable = false,
    unionChild = false,
  ) => {
    const alternatives = [
      ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
      ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
    ].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    const nullable = inheritedNullable || alternatives.some((alternative) => typeNames(alternative).includes("null"));

    addNode(path, schema, unionChild ? false : required, nullable);

    if (alternatives.length > 0) {
      for (const alternative of alternatives) {
        if (typeNames(alternative).includes("null")) continue;
        visit(alternative, path, required, nullable, alternatives.length > 1);
      }
      return;
    }

    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      visit(schema.items as Record<string, unknown>, path, required, nullable, unionChild);
    }

    if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
      const requiredKeys = new Set(
        Array.isArray(schema.required)
          ? schema.required.filter((item): item is string => typeof item === "string")
          : [],
      );
      for (const [key, child] of Object.entries(schema.properties as Record<string, unknown>)) {
        if (!child || typeof child !== "object" || Array.isArray(child)) continue;
        visit(
          child as Record<string, unknown>,
          path ? `${path}.${key}` : key,
          requiredKeys.has(key),
          false,
          unionChild,
        );
      }
    }
  };

  visit(root, "", true);
  return nodes;
}

function classificationFor(
  path: string,
  entry: MetaEntityContractPropertyDefinition | undefined,
): PropertyClassification {
  if (entry?.deprecation === "deleted") return "deprecated";
  if (entry?.deprecation === "derived_only") return "derived";
  if (SERVER_MANAGED_PATHS.test(path)) return "server_managed";
  if (REFERENCE_PATHS.test(path)) return "reference";
  return "authored";
}

function scopeFor(path: string, owner: CoverageOwner): string {
  if (path.includes("tenant_id")) return "platform_or_tenant";
  if (owner === "policy") return "platform_and_tenant_overlay";
  if (owner === "contract") return "platform_or_tenant";
  return "platform_or_tenant";
}

function projectionTables(path: string, owner: CoverageOwner): readonly string[] {
  if (path.startsWith("surfaces.fields")) return ["entity_field_surface"];
  if (path.startsWith("operations.action_rules")) return ["entity_action_rule"];
  if (path.startsWith("lifecycle.state_masks")) return ["entity_lifecycle_state_mask"];
  if (path.startsWith("flows.steps")) return ["entity_flow_step"];
  if (path.startsWith("flows.sections")) return ["entity_flow_section"];
  if (path.startsWith("flows.fields")) return ["entity_flow_field"];
  return OWNER_TABLES[owner];
}

function persistenceMode(
  owner: CoverageOwner,
  classification: PropertyClassification,
): MetaEntityCoverageProperty["persistence"]["mode"] {
  if (classification === "deprecated") return "none";
  if (owner === "contract") return "json_only";
  if (owner === "catalog") return "stable_projection";
  if (classification === "planned") return "planned";
  return "versioned_projection";
}

function makeCoverageRow(args: {
  path: string;
  registryPath: string | null;
  owner: CoverageOwner;
  source: PropertySource;
  schemaNode?: JsonSchemaNode;
  registryEntry?: MetaEntityContractPropertyDefinition;
  planned?: PlannedProperty;
}): MetaEntityCoverageProperty {
  const classification = args.planned?.classification
    ?? classificationFor(args.path, args.registryEntry);
  const editable = classification === "authored" || classification === "reference";
  const blocked = args.source === "schema_only" || args.source === "v2_1_planned";
  const tables = args.planned?.persistenceTables ?? projectionTables(args.path, args.owner);
  const schema = args.schemaNode
    ? {
      type: args.schemaNode.type,
      required: args.schemaNode.required,
      nullable: args.schemaNode.nullable,
      enumValues: args.schemaNode.enumValues,
    }
    : {
      type: args.planned?.type ?? "legacy_or_derived",
      required: args.planned?.required ?? Boolean(args.registryEntry?.required),
      nullable: args.planned?.nullable ?? !args.registryEntry?.required,
      enumValues: [],
    };

  return {
    path: args.path,
    registryPath: args.registryPath,
    owner: args.owner,
    source: args.source,
    schema,
    scope: args.planned?.scope ?? scopeFor(args.path, args.owner),
    classification,
    studio: {
      control: args.registryEntry?.ui_consumer
        ?? (blocked ? `Studio ${args.owner} control required` : `Studio ${args.owner}`),
      disposition: blocked
        ? "planned"
        : classification === "deprecated"
          ? "not_applicable"
          : editable
            ? "editable"
            : "read_only",
    },
    api: {
      read: classification === "deprecated" ? "not_applicable" : "contract.get",
      write: blocked || !editable ? null : `contract.patch.${args.owner}`,
    },
    persistence: {
      mode: persistenceMode(args.owner, classification),
      tables,
    },
    compiler: args.registryEntry?.runtime_consumer
      ?? (blocked ? "mapping required before v2.1 publication" : "canonical Contract envelope"),
    consumers: {
      admin: classification === "deprecated"
        ? "not_applicable"
        : blocked
          ? "planned"
          : editable
            ? "authoring"
            : "read_only",
      neon: args.registryEntry?.runtime_consumer && args.registryEntry.runtime_consumer !== "none"
        ? args.registryEntry.runtime_consumer
        : blocked
          ? "classification required"
          : "not_applicable",
      mesh: args.registryEntry?.runtime_consumer && args.registryEntry.runtime_consumer !== "none"
        ? `${args.registryEntry.runtime_consumer}; plane admission required`
        : blocked
          ? "classification required"
          : "not_applicable",
    },
    authorization: args.registryEntry?.authorization
      ?? (blocked ? "authorization rule required" : "server authorization"),
    driftRule: classification === "deprecated"
      ? "must remain absent from authored Contract"
      : blocked
        ? "must be mapped before v2.1 publication"
        : `canonical JSON must match ${tables.join(" + ") || "declared non-relational ownership"}`,
    tests: {
      unit: `meta-entity:${args.path}:unit`,
      postgres: `meta-entity:${args.path}:postgres`,
      browser: `meta-entity:${args.path}:browser`,
    },
    classificationStatus: "classified",
    wiringStatus: blocked ? "blocked" : "complete",
    notes: args.planned?.notes ?? null,
  };
}

export function buildMetaEntityCoverageArtifact(): MetaEntityCoverageArtifact {
  const schemaNodes = collectSchemaNodes();
  const rows = new Map<string, MetaEntityCoverageProperty>();

  for (const entry of META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY) {
    const path = canonicalRegistryPath(entry);
    const schemaNode = schemaNodes.get(path);
    rows.set(path, makeCoverageRow({
      path,
      registryPath: entry.path,
      owner: entry.owner,
      source: schemaNode ? "schema_registry" : "registry_only",
      schemaNode,
      registryEntry: entry,
    }));
  }

  for (const [path, schemaNode] of schemaNodes) {
    if (rows.has(path)) continue;
    rows.set(path, makeCoverageRow({
      path,
      registryPath: null,
      owner: ownerForPath(path),
      source: "schema_only",
      schemaNode,
    }));
  }

  for (const planned of PLANNED_V21_PROPERTIES) {
    rows.set(planned.path, makeCoverageRow({
      path: planned.path,
      registryPath: null,
      owner: planned.owner,
      source: "v2_1_planned",
      planned,
    }));
  }

  const properties = [...rows.values()].sort((left, right) => left.path.localeCompare(right.path));
  const count = (predicate: (row: MetaEntityCoverageProperty) => boolean) =>
    properties.filter(predicate).length;

  return {
    schemaVersion: 1,
    contract: {
      currentSchemaVersion: "2.0",
      targetSchemaVersion: "2.1",
      sourceSchema: "packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v2.ts",
      sourceRegistry: "META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY",
      expectedRegistryEntries: META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY.length,
    },
    ownershipRules: [
      "Versioned Contract JSON is the sole authoring and release artifact.",
      "SQL migrations manage structure; one deterministic projector manages versioned control-table rows.",
      "Admin is the only metadata authoring plane.",
      "Neon and Mesh consume the same published compiled descriptor.",
      "Runtime-only state is never cloned, imported, reset or deactivated by publication.",
      "Every runtime input is contract-owned, an immutable reference, a tenant overlay or runtime-only state.",
    ],
    tableCoverage: TABLE_COVERAGE,
    relatedInputCoverage: RELATED_INPUT_COVERAGE,
    properties,
    summary: {
      registryEntries: META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY.length,
      schemaNodes: schemaNodes.size,
      totalCoverageRows: properties.length,
      classificationCompleteRows: count((row) => row.classificationStatus === "classified"),
      wiringCompleteRows: count((row) => row.wiringStatus === "complete"),
      wiringBlockedRows: count((row) => row.wiringStatus === "blocked"),
      schemaOnlyRows: count((row) => row.source === "schema_only"),
      registryOnlyRows: count((row) => row.source === "registry_only"),
      plannedV21Rows: count((row) => row.source === "v2_1_planned"),
    },
  };
}

export function validateMetaEntityCoverageArtifact(
  artifact: MetaEntityCoverageArtifact,
): string[] {
  const errors: string[] = [];
  const expectedTables = new Set(TABLE_COVERAGE.map((entry) => entry.table));
  const actualTables = new Set(artifact.tableCoverage.map((entry) => entry.table));
  if (artifact.tableCoverage.length !== 20 || actualTables.size !== 20) {
    errors.push(`Expected 20 unique entity tables, received ${artifact.tableCoverage.length}/${actualTables.size}.`);
  }
  for (const table of expectedTables) {
    if (!actualTables.has(table)) errors.push(`Missing table classification: ${table}.`);
  }

  if (artifact.contract.expectedRegistryEntries !== META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY.length) {
    errors.push("Registry entry count does not match the generated Contract registry.");
  }

  const paths = new Set<string>();
  for (const property of artifact.properties) {
    if (paths.has(property.path)) errors.push(`Duplicate property coverage path: ${property.path}.`);
    paths.add(property.path);
    if (
      !property.owner
      || !property.scope
      || !property.classification
      || property.classificationStatus !== "classified"
    ) {
      errors.push(`Incomplete classification for ${property.path}.`);
    }
    if (!property.tests.unit || !property.tests.postgres || !property.tests.browser) {
      errors.push(`Incomplete test IDs for ${property.path}.`);
    }
  }

  for (const entry of META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY) {
    const path = canonicalRegistryPath(entry);
    if (!paths.has(path)) errors.push(`Registry property is absent from coverage: ${entry.path}.`);
  }
  for (const planned of PLANNED_V21_PROPERTIES) {
    if (!paths.has(planned.path)) errors.push(`Planned v2.1 property is absent from coverage: ${planned.path}.`);
  }

  return errors;
}

export function serializeMetaEntityCoverageArtifact(
  artifact = buildMetaEntityCoverageArtifact(),
): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function readCommittedMetaEntityCoverageArtifact(
  root = process.cwd(),
): MetaEntityCoverageArtifact {
  return JSON.parse(
    readFileSync(resolve(root, META_ENTITY_COVERAGE_ARTIFACT), "utf8"),
  ) as MetaEntityCoverageArtifact;
}
