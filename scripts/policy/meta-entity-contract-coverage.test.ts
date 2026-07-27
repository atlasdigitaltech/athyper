import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetaEntityCoverageArtifact,
  buildGeneratedPropertyTestCases,
  serializeMetaEntityCoverageArtifact,
  validateMetaEntityCoverageArtifact,
} from "./meta-entity-contract-coverage";
import {
  upgradeMetaEntityContractV20ToV21Envelope,
} from "../../packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-versioning";

function v20Contract() {
  return {
    contract_version: 2,
    catalog: {
      id: "entity-1",
      tenant_id: null,
      module_id: "control",
      entity_code: "sample_entity",
      slug: "sample-entity",
      entity_class: "MASTER",
      ownership_model: "system",
      label_singular: "Sample",
      label_plural: "Samples",
      plane_eligibility: ["admin", "neon"],
      status: "DRAFT",
      is_active: true,
    },
    version_contract: {
      id: "contract-1",
      tenant_id: null,
      entity_version_id: "version-1",
      runtime_enabled: false,
      api_exposure: "CATALOG_ONLY",
      backing_type: "table",
      table_schema: "control",
      table_name: "sample_entity",
      primary_key: "id",
      tenant_column: null,
      read_capability: "none",
      write_capability: "none",
      create_mode: "FORM_ONLY",
      draft_ttl_hours: null,
      governance_level: "full",
      security_tier: "config",
      mutability: "controlled",
      source_kind: "explicit",
      contract_hash: null,
      identity_config: {
        primary_key_field: "id",
        business_key_fields: [],
        natural_key_fields: [],
        display_identity: { title_field: "name", subtitle_field: null },
        parent: null,
        identity_via: null,
        list_entity_code: null,
        duplicate_check: { enabled: false, fields: [], scope: "tenant" },
        replacement: null,
      },
      search_config: {
        enabled: false,
        mode: "server",
        fields: [],
        minimum_query_length: 2,
        operator: "contains",
      },
      data_policy: {
        classification: "internal",
        retention: { days: null, legal_hold_eligible: false },
        deletion: { anonymize: false },
        pii_fields: [],
      },
      concurrency_config: {
        strategy: "none",
        rollout: "observe",
        row_version_field: null,
        lock_required: false,
      },
      storage_config: {
        discriminator: null,
        partition: null,
        external_source: null,
        indexes: [],
      },
    },
    fields: [
      {
        id: "field-1",
        tenant_id: null,
        entity_version_id: "version-1",
        name: "id",
        column_name: "id",
        label: "Id",
        data_type: "uuid",
        cardinality: "one",
        origin: "system",
        is_required: true,
        is_unique: true,
        unique_scope: "global",
        is_read_only: true,
        is_deprecated: false,
        is_computed: false,
        is_write_once: false,
        runtime_enabled: true,
        is_filterable: true,
        is_sortable: true,
        is_groupable: false,
        is_aggregatable: false,
        semantic_roles: [],
        type_config: { kind: "scalar" },
      },
      {
        id: "field-2",
        tenant_id: null,
        entity_version_id: "version-1",
        name: "name",
        column_name: "name",
        label: "Name",
        data_type: "string",
        cardinality: "one",
        origin: "business",
        is_required: false,
        is_unique: false,
        unique_scope: null,
        is_read_only: false,
        is_deprecated: false,
        is_computed: false,
        is_write_once: false,
        runtime_enabled: true,
        is_filterable: true,
        is_sortable: true,
        is_groupable: false,
        is_aggregatable: false,
        semantic_roles: [],
        type_config: { kind: "scalar" },
      },
    ],
    relations: [],
    surfaces: [],
    operations: [],
    lifecycle: null,
    numbering: {
      id: "numbering-1",
      entity_id: "entity-1",
      number_field: "id",
      company_code_id: null,
      prefix: "",
      prefix_configurable: true,
      separator: "-",
      segments: [],
      reset_strategy: "never",
      uniqueness_scope: "global",
      max_length: null,
      allowed_chars: "any",
      metadata: {},
      status: "active",
    },
    policy: {
      access_mode: "default_deny",
      company_scope_mode: "none",
      audit_mode: "enabled",
      retention_policy: {},
      default_filters: {},
    },
    flows: [],
  };
}

test("classifies all 20 entity tables and every current registry property", () => {
  const artifact = buildMetaEntityCoverageArtifact();
  assert.equal(artifact.tableCoverage.length, 20);
  assert.equal(new Set(artifact.tableCoverage.map((entry) => entry.table)).size, 20);
  assert.equal(artifact.summary.registryEntries, 193);
  assert.equal(
    artifact.summary.classificationCompleteRows,
    artifact.summary.totalCoverageRows,
  );
  assert.deepEqual(validateMetaEntityCoverageArtifact(artifact), []);
  assert.ok(artifact.properties.some((entry) => entry.path === "contract_version"));
  assert.ok(artifact.properties.some((entry) => entry.path === "catalog.module_id"));
  assert.ok(artifact.properties.some((entry) => entry.path === "operations.plane_filter"));
});

test("coverage generation is deterministic", () => {
  assert.equal(
    serializeMetaEntityCoverageArtifact(buildMetaEntityCoverageArtifact()),
    serializeMetaEntityCoverageArtifact(buildMetaEntityCoverageArtifact()),
  );
});

test("generated M7 property cases cover values, states, arrays, tables and consumers", () => {
  const artifact = buildMetaEntityCoverageArtifact();
  const generated = buildGeneratedPropertyTestCases(artifact);
  assert.equal(generated.length, artifact.properties.length);
  for (const [index, property] of artifact.properties.entries()) {
    const cases = generated[index]!;
    assert.equal(cases.propertyPath, property.path);
    assert.ok(cases.caseIds.includes("non_default"));
    assert.ok(cases.caseIds.includes("present"));
    assert.ok(cases.caseIds.includes(property.schema.required ? "absent_rejected" : "absent"));
    if (property.schema.nullable) assert.ok(cases.caseIds.includes("null"));
    for (const value of property.schema.enumValues) {
      assert.ok(cases.caseIds.includes(`enum:${String(value)}`));
    }
    if (property.schema.type.includes("array")) {
      assert.ok(cases.caseIds.includes("array:empty"));
      assert.ok(cases.caseIds.includes("array:single"));
      assert.ok(cases.caseIds.includes("array:multiple"));
    }
    assert.deepEqual(cases.expectedTables, property.persistence.tables);
    assert.deepEqual(cases.expectedConsumers, property.consumers);
  }
});

test("v2.0 upgrade envelope is deterministic and never drops singleton numbering", () => {
  const input = v20Contract();
  const first = upgradeMetaEntityContractV20ToV21Envelope(input);
  const second = upgradeMetaEntityContractV20ToV21Envelope(input);
  assert.deepEqual(first, second);
  assert.equal(first.contract_schema_version, "2.1");
  assert.equal(first.publishable, false);
  assert.equal(first.extensions.numbering_configurations.length, 1);
  assert.deepEqual(first.extensions.numbering_configurations[0], first.base_contract.numbering);
  assert.ok(first.hydration_required.includes("version_contract.catalog_enabled"));
  assert.ok(first.hydration_required.includes("version_contract.key_strategy"));
});

test("v2.0 upgrade envelope derives masks and preserves operation and flow identity", () => {
  const input = {
    ...v20Contract(),
    operations: [{
      id: "operation-1",
      tenant_id: null,
      entity_version_id: "version-1",
      operation_code: "create",
      permission_code: "sample_create",
      surface: "list",
      placement: "primary",
      handler_type: "api",
      handler_target: "/sample",
      execution_target: null,
      record_required: false,
      label: "Create",
      icon: null,
      intent: "neutral",
      confirmation: { required: false, code: null },
      reason_required: false,
      selection_config: null,
      sort_order: 10,
      enabled: true,
    }],
    lifecycle: {
      status_field: "id",
      states: {
        open: {
          label: "Open",
          is_initial: true,
          is_terminal: false,
          is_editable: true,
          is_deletable: false,
          is_reversible: false,
        },
        closed: {
          label: "Closed",
          is_initial: false,
          is_terminal: true,
          is_editable: false,
          is_deletable: false,
          is_reversible: true,
        },
      },
      allowed_transitions: { open: ["closed"], closed: [] },
      command_handler: null,
    },
    flows: [{
      flow_code: "create",
      entry_operation: "create",
      create_graph: ["create"],
    }],
  };

  const upgraded = upgradeMetaEntityContractV20ToV21Envelope(input);
  assert.deepEqual(
    upgraded.extensions.lifecycle_state_masks.map((mask) => mask.state_code),
    ["closed", "open"],
  );
  assert.deepEqual(
    upgraded.extensions.lifecycle_state_masks.find((mask) => mask.state_code === "open")
      ?.can_transition_to,
    ["closed"],
  );
  assert.deepEqual(upgraded.extensions.operation_extensions, [{
    operation_code: "create",
    plane_filter: null,
    action_rules: [],
  }]);
  assert.deepEqual(upgraded.extensions.flow_details, [{
    flow_code: "create",
    legacy_create_graph: ["create"],
    steps: [],
    sections: [],
    fields: [],
  }]);
});
