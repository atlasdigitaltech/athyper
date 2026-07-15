import { describe, expect, it } from "vitest";

import type { EntityCapabilityManifest } from "../../entity-capability-manifest.js";
import type { ExecutionCompiledEntitySource } from "../compiler.js";
import {
  compileExecutionDescriptor,
  executionDescriptorHash,
} from "../compiler.js";
import { hydrateExecutionDescriptor, serializeExecutionDescriptor } from "../contract.js";
import { ExecutionDescriptorActivationError } from "../validation.js";

const HANDLERS = {
  mutationHandlers: ["DocumentWorkspaceAggregateHandler", "ChildMutationHandler"],
  writeFacades: ["ReportingWriteFacade"],
  lifecycleHandlers: ["DocumentLifecycleHandler"],
  attachmentProviders: ["S3AttachmentProvider"],
  collectionHandlers: ["LineCollectionHandler"],
  domainHooks: ["FinancePostingHook"],
} as const;

function field(name: string, options: Partial<ExecutionCompiledEntitySource["fields"][number]> = {}) {
  return {
    id: `field-${name}`,
    name,
    column_name: name,
    label: name,
    description: null,
    data_type: "text",
    ui_type: null,
    format: null,
    unit: null,
    cardinality: "one",
    origin: name === "name" ? "user" : "system",
    is_required: ["id", "tenant_id", "name"].includes(name),
    is_readonly: name !== "name",
    is_unique: name === "id",
    unique_scope: null,
    is_searchable: name === "name",
    is_filterable: true,
    is_sortable: true,
    is_groupable: false,
    is_aggregatable: false,
    is_pii: false,
    is_computed: false,
    is_write_once: false,
    is_primary_amount: false,
    is_primary_currency: false,
    default_value: null,
    validation_rules: null,
    enum_domain_code: null,
    reference_config: null,
    money_config: null,
    json_config: null,
    sort_order: 0,
    group_key: null,
    ui_hint: null,
    visibility: null,
    editability: null,
    lookup_config: null,
    filter_config: null,
    defaults: null,
    i18n_key: null,
    ...options,
  };
}

function capability(overrides: Partial<EntityCapabilityManifest> = {}): EntityCapabilityManifest {
  const fields = ["id", "tenant_id", "row_version", "created_at", "name"].map((name) => ({
    name,
    columnName: name,
    dataType: "text",
    origin: name === "name" ? "user" : "system",
    writable: { create: name === "name", update: name === "name" },
    required: { create: name === "name", update: false },
    computed: false,
    readOnly: name !== "name",
    systemManaged: name !== "name",
    systemOrigin: name !== "name",
    writeOnce: false,
    statusLimited: false,
    editableInStatuses: [],
  }));
  return {
    entityCode: "supplier",
    renderer: "master",
    mutation: {
      create: { enabled: true, kind: "generic", permissionCode: "supplier.create" },
      update: { enabled: true, kind: "generic", permissionCode: "supplier.update" },
      delete: { enabled: false, kind: "disabled", disabledReason: "lifecycle_only" },
    },
    deletionMode: "retire",
    deletionPolicy: { legalHoldEligible: false, referenceCheck: true },
    collections: [],
    handlers: {},
    write: { entityVersionId: "version-1", fields },
    ...overrides,
  };
}

function entity(overrides: Partial<ExecutionCompiledEntitySource> = {}): ExecutionCompiledEntitySource {
  return {
    entity_id: "entity-1",
    entity_code: "supplier",
    slug: "supplier",
    entity_name: "Supplier",
    entity_class: "MASTER",
    create_mode: "FORM_ONLY",
    numbering_strategy: "manual",
    table_schema: "master",
    table_name: "supplier",
    backing_type: "table",
    concurrency_policy: { strategy: "version", row_version_field: "row_version", rollout: "enforced" },
    version_id: "version-1",
    version_no: 1,
    version_hash: "version-hash",
    fields: [field("id"), field("tenant_id"), field("row_version"), field("created_at"), field("name")],
    field_groups: [],
    relations: [],
    display_config: { default_sort_field: "name", default_sort_order: "asc" },
    identity_config: { primary_key: "id", tenant_column: "tenant_id", natural_key_fields: ["name"] },
    search_config: {},
    data_policy: { classification: "internal" },
    feature_flags: {},
    governance_level: "controlled",
    security_tier: "internal",
    mutability: "mutable",
    class_profile: null,
    compiled_at: "2026-07-14T00:00:00.000Z",
    compiled_hash: "source-hash",
    capability_manifest: capability(),
    ...overrides,
  };
}

describe("ExecutionDescriptorV1 compiler", () => {
  it.each([
    ["master", entity()],
    ["document", entity({
      entity_code: "purchase_invoice",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_invoice",
      fields: [...entity().fields, field("status")],
      capability_manifest: capability({
        entityCode: "purchase_invoice",
        renderer: "document",
        mutation: {
          create: { enabled: true, kind: "workspace", permissionCode: "invoice.create" },
          update: { enabled: true, kind: "workspace", permissionCode: "invoice.update" },
          delete: { enabled: true, kind: "lifecycle", permissionCode: "invoice.cancel" },
          aggregate: { enabled: true, kind: "workspace", handler: "DocumentWorkspaceAggregateHandler" },
        },
        deletionMode: "lifecycle_only",
        lifecycle: {
          enabled: true,
          statusField: "status",
          editableStatuses: ["draft"],
          states: { draft: { isEditable: true, isCommitted: false, isTerminal: false, isDeletable: true, isReversible: false } },
        },
        handlers: { mutationHandler: "DocumentWorkspaceAggregateHandler", lifecycleHandler: "DocumentLifecycleHandler" },
      }),
    })],
    ["child", entity({
      entity_code: "purchase_invoice_line",
      entity_class: "CHILD",
      table_schema: "document",
      table_name: "purchase_invoice_line",
      fields: [...entity().fields, field("purchase_invoice_id")],
      relations: [{ name: "parent", relation_kind: "belongs_to", target_entity: "purchase_invoice", fk_field: "purchase_invoice_id" }],
    })],
    ["ledger", entity({
      entity_code: "journal_entry",
      entity_class: "LEDGER",
      table_schema: "ledger",
      table_name: "journal_entry",
      mutability: "immutable",
      capability_manifest: capability({
        entityCode: "journal_entry", renderer: "ledger", deletionMode: "prohibited",
        mutation: {
          create: { enabled: false, kind: "disabled", disabledReason: "entity_read_only" },
          update: { enabled: false, kind: "disabled", disabledReason: "entity_read_only" },
          delete: { enabled: false, kind: "disabled", disabledReason: "entity_read_only" },
        },
      }),
    })],
    ["view", entity({
      entity_code: "supplier_reporting",
      table_schema: "reporting",
      table_name: "supplier_reporting",
      backing_type: "view",
      capability_manifest: capability({ handlers: { writeFacade: "ReportingWriteFacade" } }),
    })],
    ["tenant overlay", entity()],
  ] as const)("shadow-compiles representative %s entity", (kind, source) => {
    const result = compileExecutionDescriptor({
      compiledEntity: source,
      handlerRegistry: HANDLERS,
      ...(kind === "tenant overlay" ? {
        tenantOverlay: {
          tenantId: "tenant-1",
          compiledHash: "overlay-hash",
          policy: { accessMode: "default_deny", auditMode: "full" },
          fieldOverrides: { name: { searchable: false } },
        },
      } : {}),
    });
    expect(result.serialized.storage.table).toBe(source.table_name);
    expect(Object.fromEntries(result.serialized.fields.map((item) => [item.name, item.column]))).toEqual(
      Object.fromEntries(source.fields.map((item) => [item.name, item.column_name])),
    );
    for (const decision of source.capability_manifest.write.fields) {
      expect(result.descriptor.fields.get(decision.name)).toMatchObject({
        createWritable: decision.writable.create,
        updateWritable: decision.writable.update,
      });
    }
    expect(result.serialized.fields.map((item) => item.name)).toEqual([...result.serialized.fields.map((item) => item.name)].sort());
    expect(result.serialized.read.defaultSort.at(-1)?.field).toBe("id");
    expect(result.serialized.identity.compiledHash).toMatch(/^[a-f0-9]{64}$/);
    if (kind === "tenant overlay") {
      expect(result.serialized.policy.tenantOverlayHash).toBe("overlay-hash");
      expect(result.descriptor.fields.get("name")?.searchable).toBe(false);
    }
    if (source.capability_manifest.lifecycle) {
      expect(result.serialized.lifecycle).toMatchObject({
        statusField: source.capability_manifest.lifecycle.statusField,
        states: source.capability_manifest.lifecycle.states,
      });
    }
  });

  it("matches current coercion, relation, concurrency, and handler resolution", () => {
    const source = entity({
      fields: [
        ...entity().fields,
        field("tags", { data_type: "text[]", cardinality: "many", origin: "user", is_readonly: false }),
        field("metadata", { data_type: "jsonb", json_config: {}, origin: "user", is_readonly: false }),
        field("parent_id", { data_type: "uuid", origin: "user", is_readonly: false }),
      ],
      relations: [{
        name: "children", relation_kind: "has_many", target_entity: "supplier_child", fk_field: "parent_id",
        ui_behavior: { mutation_owner: "handler", mutation_handler: "LineCollectionHandler" },
      }],
      capability_manifest: capability({
        handlers: { mutationHandler: "ChildMutationHandler", attachmentProvider: "S3AttachmentProvider" },
        collections: [{
          name: "children", targetEntity: "supplier_child", ownership: "foreign_key", foreignKey: "parent_id",
          handler: "LineCollectionHandler", mutationOwner: "handler", versionStrategy: "row_version",
          allowedActions: { create: true, update: true, delete: false, replace: false },
        }],
      }),
    });
    const result = compileExecutionDescriptor({ compiledEntity: source, handlerRegistry: HANDLERS });
    expect(result.serialized.write.arrayFields).toContain("tags");
    expect(result.serialized.write.jsonFields).toContain("metadata");
    expect(result.serialized.write.concurrency).toMatchObject({ strategy: "version", rowVersionField: "row_version" });
    expect(result.serialized.relations[0]).toMatchObject({
      name: "children", foreignKey: "parent_id", handler: "LineCollectionHandler", versionStrategy: "row_version",
    });
    expect(result.serialized.handlers).toMatchObject({
      mutationHandler: "ChildMutationHandler",
      attachmentProvider: "S3AttachmentProvider",
      collectionHandlers: ["LineCollectionHandler"],
    });
  });

  it("produces the same hash across input order, compile time, and hydration", () => {
    const first = entity();
    const second = entity({ fields: [...entity().fields].reverse(), compiled_at: "2030-01-01T00:00:00.000Z", compiled_hash: "another-source-hash" });
    const a = compileExecutionDescriptor({ compiledEntity: first, handlerRegistry: HANDLERS });
    const b = compileExecutionDescriptor({ compiledEntity: second, handlerRegistry: HANDLERS });
    expect(a.serialized.identity.compiledHash).toBe(b.serialized.identity.compiledHash);
    expect(executionDescriptorHash(a.serialized)).toBe(a.serialized.identity.compiledHash);
    expect(serializeExecutionDescriptor(hydrateExecutionDescriptor(a.serialized))).toEqual(a.serialized);
    expect(Object.isFrozen(a.descriptor)).toBe(true);
    expect((a.descriptor.fields as Map<string, unknown>).set).toBeUndefined();
  });

  it("changes the hash for every effective tenant overlay", () => {
    const base = compileExecutionDescriptor({ compiledEntity: entity(), handlerRegistry: HANDLERS });
    const overlaid = compileExecutionDescriptor({
      compiledEntity: entity(), handlerRegistry: HANDLERS,
      tenantOverlay: { tenantId: "tenant-1", compiledHash: "overlay-v2", policy: { companyScopeMode: "restricted" } },
    });
    expect(overlaid.serialized.identity.compiledHash).not.toBe(base.serialized.identity.compiledHash);
  });

  it("hashes every execution-relevant contract area", () => {
    const baseHash = compileExecutionDescriptor({ compiledEntity: entity(), handlerRegistry: HANDLERS }).serialized.identity.compiledHash;
    const variants: ExecutionCompiledEntitySource[] = [
      entity({ table_name: "supplier_v2" }),
      entity({ fields: entity().fields.map((item) => item.name === "name" ? { ...item, is_searchable: false } : item) }),
      entity({ data_policy: { classification: "restricted" } }),
      entity({ create_mode: "DIRECT_CREATE" }),
      entity({
        capability_manifest: capability({ handlers: { attachmentProvider: "S3AttachmentProvider" } }),
      }),
      entity({
        relations: [{ name: "owner", relation_kind: "belongs_to", target_entity: "business_partner", fk_field: "id" }],
      }),
      entity({
        fields: [...entity().fields, field("status")],
        capability_manifest: capability({
          lifecycle: {
            enabled: true, statusField: "status", editableStatuses: ["draft"],
            states: { draft: { isEditable: true, isCommitted: false, isTerminal: false, isDeletable: true, isReversible: false } },
          },
          handlers: { lifecycleHandler: "DocumentLifecycleHandler" },
        }),
      }),
    ];
    const hashes = variants.map((variant) => compileExecutionDescriptor({
      compiledEntity: variant, handlerRegistry: HANDLERS,
    }).serialized.identity.compiledHash);
    expect(hashes.every((hash) => hash !== baseHash)).toBe(true);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("fails activation for missing required bindings and reports optional degradation", () => {
    const required = entity({
      capability_manifest: capability({ handlers: { attachmentProvider: "MissingProvider" } }),
    });
    expect(() => compileExecutionDescriptor({ compiledEntity: required, handlerRegistry: HANDLERS }))
      .toThrow(ExecutionDescriptorActivationError);

    const optional = entity({
      feature_flags: { optional_execution_references: ["MissingProvider"] },
      capability_manifest: capability({ handlers: { attachmentProvider: "MissingProvider" } }),
    });
    const result = compileExecutionDescriptor({ compiledEntity: optional, handlerRegistry: HANDLERS });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "degradation" }));
    expect(result.serialized.policy.degradedFeatures).toHaveLength(1);
  });

  it("rejects missing physical system bindings and principal-specific overlay data", () => {
    expect(() => compileExecutionDescriptor({
      compiledEntity: entity({ fields: entity().fields.filter((item) => item.name !== "tenant_id") }),
      handlerRegistry: HANDLERS,
    })).toThrow(/tenant column/);
    expect(() => compileExecutionDescriptor({
      compiledEntity: entity(), handlerRegistry: HANDLERS,
      tenantOverlay: { tenantId: "tenant-1", compiledHash: "overlay", policy: { dataPolicy: { principalId: "forbidden" } } },
    })).toThrow(/principal-specific key/);
  });
});
