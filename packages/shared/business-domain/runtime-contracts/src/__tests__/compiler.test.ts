import { describe, expect, it } from "vitest";

import {
  MetaEntityFieldGroupSchema,
  MetaEntityRuntimeDescriptorSchema,
  MetaEntitySurfaceSchema,
  compileMetaEntityRuntimeDescriptor,
  isLineItemRelation,
  resolveRenderer,
  type CompiledMetaEntityInput,
  type EntityRelationInput,
} from "../index";

const BASE_FIELDS: CompiledMetaEntityInput["fields"] = [
  {
    id: "field-id",
    name: "id",
    column_name: "id",
    label: "ID",
    data_type: "uuid",
    is_required: true,
    is_filterable: true,
    sort_order: 0,
  },
  {
    id: "field-status",
    name: "status",
    column_name: "status",
    label: "Status",
    data_type: "enum",
    enum_domain_code: "document_status",
    is_filterable: true,
    is_sortable: true,
    sort_order: 10,
  },
];

const DOCUMENT_PLAN = {
  source: "compiled_v6" as const,
  schemaVersion: "document-edit-runtime/v6.0" as const,
  planVersion: "entity-test-v1",
  planHash: "plan-test-v1",
  archetype: "document_with_items" as const,
  nodes: [
    { key: "header", kind: "core" as const, versionSource: "document" as const },
    { key: "items", kind: "collection" as const, versionSource: "node" as const },
  ],
  invalidationActions: [{
    source: { type: "operation" as const, key: "*" },
    targets: [{ node: "header", action: "patch" as const }],
  }],
};

describe("field defaults projection", () => {
  it("forwards control.entity_field.defaults JSONB onto MetaEntityField.defaults", () => {
    const entity: CompiledMetaEntityInput = {
      entity_id: "entity-pi",
      version_id: "version-pi",
      version_no: 1,
      version_hash: "h1",
      entity_code: "purchase_invoice",
      slug: "purchase-invoice",
      entity_name: "Purchase Invoice",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_invoice",
      document_runtime_plan: DOCUMENT_PLAN,
      backing_type: "table",
      fields: [
        ...BASE_FIELDS,
        {
          id: "field-remitto",
          name: "remitto_address_id",
          column_name: "remitto_address_id",
          label: "Remit-To Address",
          data_type: "reference",
          sort_order: 50,
          defaults: {
            on_source_change: [
              {
                sources: ["supplier_id"],
                action:  "clear",
                layers:  ["client_on_change", "server_on_save"],
                message: "Cleared because supplier changed",
              },
            ],
          },
        },
      ],
    };
    const descriptor = compileMetaEntityRuntimeDescriptor(entity);
    const field = descriptor.fields.find((f) => f.name === "remitto_address_id");
    expect(field).toBeDefined();
    expect(field!.defaults).toBeDefined();
    expect(field!.defaults).toEqual({
      on_source_change: [
        {
          sources: ["supplier_id"],
          action:  "clear",
          layers:  ["client_on_change", "server_on_save"],
          message: "Cleared because supplier changed",
        },
      ],
    });
  });

  it("omits defaults when the source field has none (does not invent the key)", () => {
    const entity: CompiledMetaEntityInput = {
      entity_id: "e",
      version_id: "v",
      version_no: 1,
      version_hash: "h",
      entity_code: "x",
      slug: "x",
      entity_name: "X",
      entity_class: "MASTER",
      table_schema: "s",
      table_name: "t",
      backing_type: "table",
      fields: BASE_FIELDS,
    };
    const descriptor = compileMetaEntityRuntimeDescriptor(entity);
    for (const f of descriptor.fields) expect(f.defaults).toBeUndefined();
  });
});

describe("compileMetaEntityRuntimeDescriptor", () => {
  it("normalizes UI flow selection separately from lifecycle execution", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_id: "entity-pi",
      version_id: "version-pi",
      version_no: 1,
      version_hash: "hash-pi",
      entity_code: "purchase_invoice",
      slug: "purchase-invoice",
      entity_name: "Purchase Invoice",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_invoice",
      document_runtime_plan: DOCUMENT_PLAN,
      backing_type: "table",
      fields: BASE_FIELDS,
    }, {
      operations: [{
        id: "submit-op",
        permission_code: "submit",
        surface: "DETAIL",
        handler_type: "MODAL",
        handler_target: "flow:submit_for_approval",
        execution_target: "lifecycle:submit",
      }],
    });

    expect(descriptor.operations[0]).toMatchObject({
      handlerTarget: "flow:submit_for_approval",
      executionTarget: "lifecycle:submit",
    });
  });

  it("compiles a document entity with line items, workflow, audit, and numbering surfaces", () => {
    const entity: CompiledMetaEntityInput = {
      entity_id: "entity-purchase-invoice",
      version_id: "version-purchase-invoice",
      version_no: 3,
      version_hash: "hash-v3",
      entity_code: "purchase_invoice",
      slug: "purchase-invoice",
      entity_name: "Purchase Invoice",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_invoice",
      document_runtime_plan: DOCUMENT_PLAN,
      backing_type: "table",
      fields: BASE_FIELDS,
      display_config: {
        line_entity_code: "purchase_invoice_line",
        line_ui_variant: "procure",
        document_header: {
          number_field: "document_no",
        },
        lifecycle_stages: [
          { key: "draft", label: "Draft" },
          { key: "approved", label: "Approved" },
        ],
      },
      feature_flags: {
        has_lines: true,
        has_workflow: true,
        is_approvable: true,
        has_accounting_distribution: true,
        has_attachments: true,
        comments_enabled: true,
        event_history: true,
        version_control: true,
        auto_number: true,
        is_importable: true,
        is_bulk_editable: true,
        generic_hard_delete_enabled: true,
      },
      identity_config: {
        numbering: {
          field: "document_no",
          reset_strategy: "fiscal_yearly",
        },
      },
      governance_level: "full",
      security_tier: "tenant_critical",
      mutability: "controlled",
      compiled_at: "2026-05-30T00:00:00.000Z",
      compiled_hash: "compiled-hash",
    };

    const relations: EntityRelationInput[] = [
      {
        id: "rel-lines",
        name: "lines",
        relation_kind: "has_many",
        target_entity: "purchase_invoice_line",
        fk_field: "invoice_id",
        ui_behavior: {
          surface: "lines_tab",
          affects_totals: true,
          required_for_submit: true,
          collection: {
            title: { show_count: true },
            toolbar: {
              search: {
                placeholder: "Search lines...",
                keys: ["description", "line_no"],
              },
              columns: true,
              primary_action: "add_item",
            },
            table: {
              pinned_columns: ["select", "line_no"],
              virtualized: true,
              disable_header_sort: true,
            },
            row: {
              selection: true,
              click_action: "expand",
              expansion_key: "line_components_drawer",
            },
          },
          line: {
            source_adapters: ["manual_invoice_line", "open_po_line"],
            summary_provider: "procure_grid_summary",
            totals: {
              enabled: true,
              mode: "visible_numeric_columns",
            },
          },
        },
      },
    ];

    const descriptor = compileMetaEntityRuntimeDescriptor(entity, {
      relations,
      operations: [
        { id: "op-read", permission_code: "purchase_invoice.read", surface: "BOTH" },
        { id: "op-create", permission_code: "purchase_invoice.create", surface: "LIST" },
        { id: "op-edit", permission_code: "purchase_invoice.edit", surface: "DETAIL" },
        { id: "op-delete", permission_code: "purchase_invoice.delete", surface: "DETAIL" },
      ],
      entityPolicy: {
        access_mode: "default_allow",
        audit_mode: "enabled",
      },
      fieldSecurityPolicies: [{ field_path: "supplier_tax_id" }],
    });

    expect(MetaEntityRuntimeDescriptorSchema.parse(descriptor)).toEqual(descriptor);
    expect(descriptor.renderer).toBe("document");
    expect(descriptor.editRuntime).toMatchObject({
      schemaVersion: "document-edit-runtime/v6.0",
      planHash: DOCUMENT_PLAN.planHash,
    });
    expect(descriptor.capabilities).toMatchObject({
      canCreate: true,
      canEdit: true,
      canDelete: true,
      hasLineItems: true,
      hasChildRecords: false,
      hasWorkflow: true,
      hasAuditTrail: true,
      hasAuditSummary: true,
      hasImport: true,
      hasBulk: true,
    });
    expect(descriptor.numbering).toMatchObject({
      enabled: true,
      numberField: "document_no",
      resetStrategy: "fiscal_yearly",
    });
    expect(descriptor.surfaces.map((surface) => surface.kind)).toEqual([
      "fields",
      "line_items",
      "distributions",
      "workflow",
      "lifecycle",
      "attachments",
      "versions",
      "compare",
      "comments",
      "activity_log",
      "audit_summary",
      "audit_trail",
    ]);
    const lineSurface = descriptor.surfaces.find((surface) => surface.kind === "line_items");
    expect(lineSurface).toMatchObject({
      kind: "line_items",
      collection: {
        title: { showCount: true },
        toolbar: {
          search: {
            placeholder: "Search lines...",
            keys: ["description", "line_no"],
          },
          columns: true,
          primaryAction: "add_item",
        },
        table: {
          pinnedColumns: ["select", "line_no"],
          virtualized: true,
          disableHeaderSort: true,
        },
        row: {
          selection: true,
          clickAction: "expand",
          expansionKey: "line_components_drawer",
        },
      },
      line: {
        variant: "procure",
        sourceAdapters: ["manual_invoice_line", "open_po_line"],
        summaryProvider: "procure_grid_summary",
        totals: {
          enabled: true,
          mode: "visible_numeric_columns",
        },
      },
    });
  });

  it("treats metadata document surfaces and plan hashes as authoritative", () => {
    const entity: CompiledMetaEntityInput = {
      entity_code: "purchase_order",
      entity_name: "Purchase Order",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_order",
      fields: BASE_FIELDS,
      document_runtime_plan: DOCUMENT_PLAN,
      display_config: {
        line_entity_code: "purchase_order_line",
        document_runtime: {
          surfaces: [{
            kind: "document_lines",
            key: "po_lines",
            label: "Items",
            order: 40,
            placement: "main",
            enabled: true,
            config: { relations: { lines: "lines" } },
          }],
        },
      },
      feature_flags: { has_lines: true },
    };
    const options = {
      relations: [{
        name: "lines",
        relation_kind: "has_many",
        target_entity: "purchase_order_line",
        fk_field: "purchase_order_id",
      }],
      relationCapabilities: {
        purchase_order_line: { canCreate: true, canEdit: true, canDelete: false },
      },
    };
    const tenantA = compileMetaEntityRuntimeDescriptor(entity, {
      ...options,
      documentSaveAndTransitionEnabled: true,
    });
    const tenantB = compileMetaEntityRuntimeDescriptor(entity, {
      ...options,
      documentSaveAndTransitionEnabled: false,
    });

    expect(tenantA.surfaces.some((surface) => surface.kind === "line_items")).toBe(false);
    expect(tenantA.surfaces).toContainEqual(expect.objectContaining({
      kind: "document_lines",
      key: "po_lines",
      label: "Items",
    }));
    expect(tenantA.editRuntime?.schemaVersion).toBe("document-edit-runtime/v6.0");
    expect("planHash" in tenantA.editRuntime! ? tenantA.editRuntime.planHash : undefined).toBe(DOCUMENT_PLAN.planHash);
    expect("planHash" in tenantB.editRuntime! ? tenantB.editRuntime.planHash : undefined).toBe(DOCUMENT_PLAN.planHash);
    expect(tenantA.audit.descriptorHash).not.toBe(tenantB.audit.descriptorHash);
    expect(tenantA.editRuntime?.submitPolicy.saveAndTransitionEnabled).toBe(true);
    expect(tenantB.editRuntime?.submitPolicy.saveAndTransitionEnabled).toBe(false);
  });

  it("fails closed when document metadata omits its compiled runtime plan", () => {
    expect(() => compileMetaEntityRuntimeDescriptor({
      entity_code: "purchase_order",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_order",
      fields: BASE_FIELDS,
      display_config: {},
      feature_flags: {},
    })).toThrow("requires metadata document_runtime_plan");
  });

  it("resolves identity header field aliases from name/column_name into runtime descriptor fields", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "purchase_invoice",
      entity_name: "Purchase Invoice",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_invoice",
      document_runtime_plan: DOCUMENT_PLAN,
      fields: [
        { name: "id", label: "ID", data_type: "uuid", column_name: "id", is_required: true, sort_order: 0 },
        { name: "document_no", label: "Document No", data_type: "text", column_name: "document_no", is_required: true, is_filterable: true, sort_order: 10 },
        { name: "name", label: "Name", data_type: "text", column_name: "invoice_name", is_required: false, is_filterable: true, sort_order: 20 },
        { name: "invoice_type", label: "Invoice Type", data_type: "text", column_name: "invoice_type", is_required: false, is_filterable: true, sort_order: 30 },
        { name: "status_code_alias", label: "Status", data_type: "text", column_name: "status_code", is_required: true, is_filterable: true, sort_order: 40 },
      ],
      identity_config: {
        header: {
          primary: { field: "document_no" },
          secondary: { field: "name" },
          classification: { field: "invoice_type" },
          status: { process_state_first: true, field: "status_code" },
        },
      },
      feature_flags: {
        has_lines: true,
        has_workflow: true,
      },
    });

    expect(descriptor.identity).toMatchObject({
      primary: { field: "document_no" },
      secondary: { field: "name" },
      classification: { field: "invoice_type" },
    });
    expect(descriptor.identity?.status).toMatchObject({
      field: "status_code_alias",
    });
    expect(descriptor.identity?.status).toMatchObject(
      descriptor.identity?.status?.process_state_first
        ? { process_state_first: true }
        : { processStateFirst: true },
    );
  });

  it("resolves display header presentation field aliases into runtime descriptor fields", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "purchase_invoice",
      entity_name: "Purchase Invoice",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_invoice",
      document_runtime_plan: DOCUMENT_PLAN,
      fields: [
        { name: "id", label: "ID", data_type: "uuid", column_name: "id", is_required: true, sort_order: 0 },
        { name: "total_amount", label: "Gross Amount", data_type: "decimal", column_name: "total_amount", is_required: true, sort_order: 10 },
        { name: "currency_code", label: "Currency", data_type: "text", column_name: "currency_code", is_required: true, sort_order: 20 },
        { name: "base_currency_code", label: "Base Currency", data_type: "text", column_name: "base_currency_code", is_required: true, sort_order: 30 },
        { name: "exchange_rate", label: "Exchange Rate", data_type: "decimal", column_name: "exchange_rate", is_required: false, sort_order: 40 },
        { name: "outstanding_amount", label: "Outstanding", data_type: "decimal", column_name: "outstanding_amount", is_required: true, sort_order: 50 },
        { name: "supplier_id", label: "Supplier", data_type: "reference", column_name: "supplier_id", is_required: true, sort_order: 60 },
        { name: "supplier_invoice_number", label: "Supplier Invoice No.", data_type: "text", column_name: "supplier_invoice_number", is_required: false, sort_order: 70 },
        { name: "supplier_invoice_date", label: "Supplier Invoice Date", data_type: "date", column_name: "supplier_invoice_date", is_required: false, sort_order: 80 },
        { name: "invoice_date", label: "Invoice Date", data_type: "date", column_name: "document_date", is_required: true, sort_order: 90 },
        { name: "match_type", label: "Match Type", data_type: "enum", column_name: "match_type", is_required: true, sort_order: 100 },
        { name: "match_status", label: "Match Status", data_type: "enum", column_name: "match_status", is_required: true, sort_order: 110 },
      ],
      display_config: {
        header: {
          amount: {
            headline: {
              field: "total_amount",
              currency_field: "currency_code",
              base_amount: {
                currency_field: "base_currency_code",
                exchange_rate_field: "exchange_rate",
              },
            },
            secondary: {
              field: "outstanding_amount",
              currency_field: "currency_code",
            },
          },
          subtitle_rows: [
            { kind: "party", fields: ["supplier_id"] },
            { kind: "external_reference", fields: ["supplier_invoice_number", "supplier_invoice_date"] },
          ],
          facts: [
            { field: "document_date", label: "Invoice Date", value_type: "date" },
          ],
          status_badges: [
            { kind: "match_pair", type_field: "match_type", status_field: "match_status" },
          ],
        },
      },
    });

    expect(descriptor.headerPresentation).toMatchObject({
      amount: {
        headline: {
          field: "total_amount",
          currency_field: "currency_code",
          base_amount: {
            currency_field: "base_currency_code",
            exchange_rate_field: "exchange_rate",
          },
        },
        secondary: {
          field: "outstanding_amount",
          currency_field: "currency_code",
        },
      },
      subtitle_rows: [
        { fields: ["supplier_id"] },
        { fields: ["supplier_invoice_number", "supplier_invoice_date"] },
      ],
      facts: [
        { field: "invoice_date" },
      ],
      status_badges: [
        { type_field: "match_type", status_field: "match_status" },
      ],
    });
  });

  it("separates generic child records from line-item relations", () => {
    const entity: CompiledMetaEntityInput = {
      entity_code: "supplier",
      entity_name: "Supplier",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "supplier",
      fields: BASE_FIELDS,
      feature_flags: {
        has_lines: false,
        has_attachments: false,
      },
      display_config: {},
    };

    const descriptor = compileMetaEntityRuntimeDescriptor(entity, {
      relationCapabilities: {
        supplier_site: { canCreate: true, canEdit: false, canDelete: true },
      },
      relations: [
        {
          id: "rel-sites",
          name: "sites",
          relation_kind: "has_many",
          target_entity: "supplier_site",
          fk_field: "supplier_id",
          ui_behavior: {
            surface: "child_records",
            display_mode: "table",
            collection: {
              toolbar: {
                search_enabled: true,
                show_columns: true,
                primary_action: "create",
              },
              table: {
                visible_columns: ["status", "site_code"],
                pagination_mode: "none",
              },
              row: {
                selectable: false,
                click_action: "edit",
              },
            },
          },
        },
      ],
    });

    expect(descriptor.renderer).toBe("master");
    expect(descriptor.capabilities.hasLineItems).toBe(false);
    expect(descriptor.capabilities.hasChildRecords).toBe(true);
    expect(descriptor.surfaces.some((surface) => surface.kind === "line_items")).toBe(false);
    expect(descriptor.surfaces.some((surface) => surface.kind === "child_records")).toBe(true);
    const childSurface = descriptor.surfaces.find((surface) => surface.kind === "child_records");
    expect(childSurface).toMatchObject({
      kind: "child_records",
      mutationOwner: "direct_crud",
      canCreate: true,
      canEdit: false,
      canDelete: true,
      collection: {
        toolbar: {
          search: true,
          columns: true,
          primaryAction: "create",
        },
        table: {
          visibleColumns: ["status", "site_code"],
          pagination: "none",
        },
        row: {
          selection: false,
          clickAction: "edit",
        },
      },
    });
  });

  it("keeps entities view-only when no write operations are present", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "site",
      entity_name: "Site",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "site",
      fields: BASE_FIELDS,
      display_config: {},
      feature_flags: {},
    }, {
      operations: [],
      entityPolicy: {
        access_mode: "default_allow",
        audit_mode: "enabled",
      },
    });

    expect(descriptor.capabilities.canRead).toBe(true);
    expect(descriptor.capabilities.canCreate).toBe(false);
    expect(descriptor.capabilities.canEdit).toBe(false);
    expect(descriptor.capabilities.canDelete).toBe(false);
  });

  it("keeps ledger entities read-only even when write operations are present", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "general_ledger",
      entity_name: "General Ledger",
      entity_class: "LEDGER",
      table_schema: "ledger",
      table_name: "general_ledger",
      fields: BASE_FIELDS,
      display_config: {
        detail_renderer: "ledger",
      },
      feature_flags: {
        has_attachments: false,
      },
      mutability: "locked",
    }, {
      operations: [
        { permission_code: "general_ledger.edit", surface: "DETAIL" },
        { permission_code: "general_ledger.delete", surface: "DETAIL" },
      ],
      entityPolicy: {
        access_mode: "default_allow",
        audit_mode: "disabled",
      },
    });

    expect(descriptor.renderer).toBe("ledger");
    expect(descriptor.capabilities.isReadOnly).toBe(true);
    expect(descriptor.capabilities.canEdit).toBe(false);
    expect(descriptor.capabilities.canDelete).toBe(false);
    expect(descriptor.capabilities.hasAttachments).toBe(false);
    expect(descriptor.capabilities.hasAuditTrail).toBe(false);
    expect(descriptor.surfaces.map((surface) => surface.kind)).toEqual(["fields"]);
  });

  it("uses the locked line-item rule for hasLineItems", () => {
    const entity: CompiledMetaEntityInput = {
      entity_code: "purchase_order",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_order",
      document_runtime_plan: DOCUMENT_PLAN,
      display_config: {
        line_entity_code: "purchase_order_line",
      },
      feature_flags: {
        has_lines: true,
      },
    };

    const matchingRelation = compileMetaEntityRuntimeDescriptor(entity, {
      relations: [
        {
          name: "items",
          relation_kind: "has_many",
          target_entity: "purchase_order_line",
          fk_field: "purchase_order_id",
        },
      ],
    }).relations[0];

    const nonMatchingRelation = compileMetaEntityRuntimeDescriptor(entity, {
      relations: [
        {
          name: "history",
          relation_kind: "has_many",
          target_entity: "purchase_order_history",
          fk_field: "purchase_order_id",
        },
      ],
    }).relations[0];

    expect(matchingRelation).toBeDefined();
    expect(nonMatchingRelation).toBeDefined();
    expect(isLineItemRelation(entity, matchingRelation!)).toBe(true);
    expect(isLineItemRelation(entity, nonMatchingRelation!)).toBe(false);
  });

  it("resolves renderer with explicit metadata first", () => {
    expect(resolveRenderer({
      entity_code: "audit_event",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "audit_event",
      display_config: {
        detail_renderer: "ledger",
      },
    })).toBe("ledger");

    expect(resolveRenderer({
      entity_code: "supplier_category",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "supplier_category",
      display_config: {
        detail_renderer: "simple",
      },
    })).toBe("simple");
  });

  it("accepts compiled metadata readonly spelling from the API contract", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "warehouse",
      entity_name: "Warehouse",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "warehouse",
      fields: [
        {
          name: "id",
          column_name: "id",
          label: "ID",
          data_type: "uuid",
          is_readonly: true,
          sort_order: 0,
        },
      ],
      display_config: {},
      feature_flags: {},
    });

    expect(descriptor.fields[0]).toMatchObject({
      name: "id",
      isReadOnly: true,
    });
  });

  it("carries permission-backed operation metadata into the runtime contract", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "site",
      entity_name: "Site",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "site",
      fields: BASE_FIELDS,
      display_config: {},
      feature_flags: {},
    }, {
      operations: [
        {
          id: "op-reopen",
          permission_code: "site.reopen",
          surface: "DETAIL",
          placement: "OVERFLOW",
          handler_type: "API",
          action_group: "lifecycle",
          intent: "success",
          requires_confirmation: true,
          requires_reason: true,
          source: "lifecycle_transition",
          permission_decision: "allow",
          lifecycle_transitions: [
            {
              transition_id: "transition-reopen",
              lifecycle_id: "site-lifecycle",
              from_state: "inactive",
              to_state: "active",
              requires_reason: true,
            },
          ],
        },
      ],
    });

    expect(descriptor.operations[0]).toMatchObject({
      permissionCode: "site.reopen",
      actionGroup: "lifecycle",
      intent: "success",
      requiresConfirmation: true,
      requiresReason: true,
      source: "lifecycle_transition",
      permissionDecision: "allow",
      lifecycleTransitions: [
        {
          transitionId: "transition-reopen",
          lifecycleId: "site-lifecycle",
          fromState: "inactive",
          toState: "active",
          requiresReason: true,
        },
      ],
    });
  });

  it("derives operation lifecycle transitions from lifecycle transition operation_code rows", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "purchase_invoice",
      entity_name: "Purchase Invoice",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_invoice",
      document_runtime_plan: DOCUMENT_PLAN,
      fields: BASE_FIELDS,
      display_config: {},
      feature_flags: {},
    }, {
      operations: [
        {
          id: "op-submit",
          permission_code: "purchase_invoice.submit",
          surface: "DETAIL",
          handler_type: "API",
        },
      ],
      lifecycleTransitions: [
        {
          id: "transition-submit",
          lifecycle_id: "invoice-lifecycle",
          operation_code: "purchase_invoice.submit",
          from_state: "draft",
          to_state: "submitted",
          requires_reason: true,
        },
      ],
    });

    expect(descriptor.operations[0]).toMatchObject({
      actionGroup: "lifecycle",
      source: "lifecycle_transition",
      lifecycleTransitions: [
        {
          transitionId: "transition-submit",
          lifecycleId: "invoice-lifecycle",
          fromState: "draft",
          toState: "submitted",
          requiresReason: true,
        },
      ],
    });
  });

  it("emits canonical editor, display, and lookup option source metadata", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "warehouse",
      entity_name: "Warehouse",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "warehouse",
      fields: [
        {
          name: "warehouse_type",
          label: "Warehouse Type",
          data_type: "text",
          is_pii: true,
          enum_domain_code: "master.warehouse_type",
          filter_config: {
            section_key: "profile",
            section_label: "Profile",
            quick_filter: true,
            quick_order: 10,
          },
          ui_hint: {
            display: {
              hide_in: ["list"],
            },
          },
        },
      ],
      display_config: {},
      feature_flags: {},
    });

    expect(descriptor.fields[0]).toMatchObject({
      name: "warehouse_type",
      isPii: true,
      optionSource: {
        kind: "lookup",
        domainCode: "master.warehouse_type",
      },
      editor: {
        control: "combobox",
        optionSource: {
          kind: "lookup",
          domainCode: "master.warehouse_type",
        },
      },
      display: {
        renderer: "lookup_label",
      },
      filterConfig: {
        section_key: "profile",
        section_label: "Profile",
        quick_filter: true,
        quick_order: 10,
      },
      visibility: {
        hide_in: ["list"],
      },
    });
  });

  it("emits code-valued reference metadata without generic *_code guessing", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "site",
      entity_name: "Site",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "site",
      fields: [
        {
          name: "country_code",
          label: "Country",
          data_type: "text",
          reference_config: {
            target_entity: "shared.country",
            value_field: "code",
            label_field: "name",
            code_field: "code",
            scope_mode: "unscoped",
          },
        },
        {
          name: "postal_code",
          label: "Postal Code",
          data_type: "text",
        },
      ],
      display_config: {},
      feature_flags: {},
    });

    expect(descriptor.fields[0]).toMatchObject({
      name: "country_code",
      referenceEntity: "country",
      optionSource: {
        kind: "reference",
        entity: "country",
        valueField: "code",
        labelField: "name",
        codeField: "code",
        scopeMode: "unscoped",
      },
      editor: {
        control: "reference_picker",
      },
      display: {
        renderer: "reference_label",
        format: "label_code",
      },
    });
    expect(descriptor.fields[1]?.optionSource).toBeUndefined();
  });

  it("emits fieldGroups from explicit field_groups metadata with schema defaults applied", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "cost_center",
      entity_name: "Cost Center",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "cost_center",
      fields: [
        { name: "code", label: "Code", data_type: "text", group_key: "identity", sort_order: 0 },
        { name: "name", label: "Name", data_type: "text", group_key: "identity", sort_order: 1 },
        { name: "description", label: "Description", data_type: "text", group_key: "details", sort_order: 2 },
      ],
      field_groups: [
        { key: "identity", label: "Identity", order: 10 },
        { key: "details", label: "Details", order: 20, columns: 1, page_span: "wide" },
      ],
      display_config: {},
      feature_flags: {},
    });

    expect(descriptor.fieldGroups).toHaveLength(2);
    expect(descriptor.fieldGroups[0]).toMatchObject({
      key: "identity",
      label: "Identity",
      order: 10,
      columns: 2,
      pageSpan: "full",
      surface: "all",
      initiallyCollapsed: false,
    });
    expect(descriptor.fieldGroups[1]).toMatchObject({
      key: "details",
      label: "Details",
      order: 20,
      columns: 1,
      pageSpan: "wide",
      surface: "all",
      initiallyCollapsed: false,
    });
    expect(MetaEntityRuntimeDescriptorSchema.parse(descriptor)).toEqual(descriptor);
  });

  it("generates fallback fieldGroups for fields with groupKey but no group definition", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "warehouse",
      entity_name: "Warehouse",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "warehouse",
      fields: [
        { name: "code", label: "Code", data_type: "text", group_key: "orphan_group", sort_order: 0 },
        { name: "name", label: "Name", data_type: "text", sort_order: 1 },
      ],
      field_groups: [],
      display_config: {},
      feature_flags: {},
    });

    expect(descriptor.fieldGroups.length).toBeGreaterThanOrEqual(1);
    const orphan = descriptor.fieldGroups.find((g) => g.key === "orphan_group");
    expect(orphan).toBeDefined();
    expect(orphan?.columns).toBe(2);
    expect(orphan?.pageSpan).toBe("full");
    expect(orphan?.surface).toBe("all");
  });

  it("emits print-only fieldGroups with surface='print' that do not inherit from detail-only groups", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "cost_center",
      entity_name: "Cost Center",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "cost_center",
      fields: [
        { name: "code", label: "Code", data_type: "text", group_key: "identity", sort_order: 0 },
        { name: "internal_notes", label: "Internal Notes", data_type: "text", group_key: "audit_group", sort_order: 1 },
      ],
      field_groups: [
        { key: "identity", label: "Identity", order: 10, surface: "all" },
        { key: "audit_group", label: "Audit", order: 20, surface: "detail" },
        { key: "print_summary", label: "Summary", order: 30, surface: "print" },
      ],
      display_config: {},
      feature_flags: {},
    });

    const groupSurfaces = descriptor.fieldGroups.map((g) => ({ key: g.key, surface: g.surface }));
    expect(groupSurfaces).toContainEqual({ key: "identity", surface: "all" });
    expect(groupSurfaces).toContainEqual({ key: "audit_group", surface: "detail" });
    expect(groupSurfaces).toContainEqual({ key: "print_summary", surface: "print" });
  });

  it("normalizes validation_rules and validationRules aliases into field.validation", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "cost_center",
      entity_name: "Cost Center",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "cost_center",
      fields: [
        {
          name: "code",
          label: "Code",
          data_type: "text",
          validation_rules: { max_length: 20, pattern: "^[A-Z0-9_]+$" },
        },
        {
          name: "name",
          label: "Name",
          data_type: "text",
          validationRules: { min_length: 2, max_length: 100 },
        },
      ],
      display_config: {},
      feature_flags: {},
    });

    expect(descriptor.fields[0]?.validation).toMatchObject({ max_length: 20, pattern: "^[A-Z0-9_]+$" });
    expect(descriptor.fields[1]?.validation).toMatchObject({ min_length: 2, max_length: 100 });
  });

  it("MetaEntityFieldGroupSchema applies defaults for omitted layout fields", () => {
    const result = MetaEntityFieldGroupSchema.parse({
      key: "general",
      label: "General",
      order: 0,
    });
    expect(result.columns).toBe(2);
    expect(result.pageSpan).toBe("full");
    expect(result.surface).toBe("all");
    expect(result.initiallyCollapsed).toBe(false);
  });

  it("promotes legacy validation ref_entity metadata into the canonical reference source", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "site",
      entity_name: "Site",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "site",
      fields: [
        {
          name: "capacity_uom",
          label: "Capacity UOM",
          data_type: "string",
          ui_type: "reference",
          validation: {
            ref_entity: "uom",
            value_field: "code",
            label_field: "name",
            code_field: "code",
            scope_mode: "unscoped",
          },
        },
      ],
      display_config: {},
      feature_flags: {},
    });

    expect(descriptor.fields[0]).toMatchObject({
      name: "capacity_uom",
      referenceConfig: {
        ref_entity: "uom",
      },
      optionSource: {
        kind: "reference",
        entity: "uom",
        valueField: "code",
        labelField: "name",
      },
      editor: {
        control: "reference_picker",
      },
    });
  });

  it("fails fast when no stable entity identity is available", () => {
    expect(() => compileMetaEntityRuntimeDescriptor({
      entity_name: "Broken Entity",
      entity_class: "MASTER",
      table_schema: "master",
      display_config: {},
      feature_flags: {},
    })).toThrow("without entity_code, name, or table_name");
  });

  it("normalizes operation and relation enums from import-friendly tokens", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "site",
      entity_name: "Site",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "site",
      fields: BASE_FIELDS,
      display_config: {},
      feature_flags: {},
    }, {
      operations: [
        {
          permission_code: "site.edit",
          surface: "detail",
          placement: "primary",
          handler_type: "navigate",
          action_group: "workflow-task",
          intent: "Danger",
          source: "lifecycle-transition",
          permission_decision: "not-in-plan",
        },
      ],
      relations: [
        {
          name: "children",
          relation_kind: "Has Many",
          target_entity: "site_child",
        },
      ],
    });

    expect(descriptor.operations[0]).toMatchObject({
      surface: "DETAIL",
      placement: "PRIMARY",
      handlerType: "NAVIGATE",
      actionGroup: "workflow_task",
      intent: "danger",
      source: "lifecycle_transition",
      permissionDecision: "not_in_plan",
    });
    expect(descriptor.relations[0]?.kind).toBe("has_many");
  });

  it("accepts the Phase 2 generic document surface kinds + action_only placement", () => {
    const documentLines = MetaEntitySurfaceSchema.parse({
      kind: "document_lines",
      key: "lines",
      label: "Lines",
      order: 10,
      placement: "main",
      enabled: true,
      config: { relations: { lines: "lines" }, source_doc_type: "PURCHASE_ORDER_LINE" },
    });
    expect(documentLines.kind).toBe("document_lines");

    const documentComponents = MetaEntitySurfaceSchema.parse({
      kind: "document_components",
      key: "components",
      label: "Components",
      order: 20,
      placement: "main",
      enabled: true,
      config: { source_doc_type: "PURCHASE_ORDER_LINE" },
    });
    expect(documentComponents.kind).toBe("document_components");

    const documentSchedules = MetaEntitySurfaceSchema.parse({
      kind: "document_schedules",
      key: "schedules",
      label: "Schedules",
      order: 25,
      placement: "main",
      enabled: true,
      config: { relation: "schedules", source_doc_type: "commitment_line" },
    });
    expect(documentSchedules.kind).toBe("document_schedules");

    const documentAccounting = MetaEntitySurfaceSchema.parse({
      kind: "document_accounting",
      key: "accounting",
      label: "Commitment",
      order: 30,
      placement: "action_only",
      enabled: true,
      config: { mode: "commitment_preview" },
    });
    expect(documentAccounting.placement).toBe("action_only");
    expect(documentAccounting.kind === "document_accounting" && documentAccounting.config.mode).toBe("commitment_preview");

    const documentRows = MetaEntitySurfaceSchema.parse({
      kind: "document_rows",
      key: "applications",
      label: "Applications",
      order: 40,
      placement: "main",
      enabled: true,
      config: { relation: "applications", row_kind: "application" },
    });
    expect(documentRows.kind).toBe("document_rows");

    const documentMatching = MetaEntitySurfaceSchema.parse({
      kind: "document_matching_panel",
      key: "matching",
      label: "Matching",
      order: 50,
      placement: "main",
      enabled: true,
      config: { match_scope: "three_way" },
    });
    expect(documentMatching.kind).toBe("document_matching_panel");
  });

  it("rejects document_accounting with an unknown mode", () => {
    expect(() => MetaEntitySurfaceSchema.parse({
      kind: "document_accounting",
      key: "accounting",
      label: "Accounting",
      order: 10,
      placement: "main",
      enabled: true,
      config: { mode: "made_up_mode" },
    })).toThrow();
  });

  it("suppresses child_records surface when relation has visible_as_tab:false, but keeps relation in descriptor", () => {
    const entity: CompiledMetaEntityInput = {
      entity_code: "purchase_invoice",
      entity_class: "DOCUMENT",
      table_schema: "document",
      table_name: "purchase_invoice",
      document_runtime_plan: DOCUMENT_PLAN,
      fields: BASE_FIELDS,
      display_config: {
        line_entity_code: "purchase_invoice_line",
      },
      feature_flags: { has_lines: true },
    };

    const relations: EntityRelationInput[] = [
      {
        id: "rel-lines",
        name: "lines",
        relation_kind: "has_many",
        target_entity: "purchase_invoice_line",
        fk_field: "purchase_invoice_id",
        ui_behavior: { surface: "lines_tab" },
      },
      {
        id: "rel-pc",
        name: "pricing_components",
        relation_kind: "has_many",
        target_entity: "pricing_component",
        fk_field: "source_doc_id",
        ui_behavior: {
          role: "components",
          visible_as_tab: false,
        },
      },
      {
        id: "rel-ad",
        name: "accounting_distributions",
        relation_kind: "has_many",
        target_entity: "accounting_distribution",
        fk_field: "source_doc_id",
        ui_behavior: { label: "Distributions" },
      },
    ];

    const descriptor = compileMetaEntityRuntimeDescriptor(entity, { relations });

    expect(descriptor.relations.map((r) => r.name)).toContain("pricing_components");
    expect(descriptor.relations.map((r) => r.name)).toContain("accounting_distributions");

    const childRecordKeys = descriptor.surfaces
      .filter((s) => s.kind === "child_records")
      .map((s) => s.key);
    expect(childRecordKeys).not.toContain("pricing_components");
    expect(childRecordKeys).not.toContain("accounting_distributions");
    expect(descriptor.relations.find((relation) => relation.name === "lines")?.mutationOwner).toBe("workspace");
    expect(descriptor.relations.find((relation) => relation.name === "pricing_components")?.mutationOwner).toBe("workspace");
    expect(descriptor.relations.find((relation) => relation.name === "accounting_distributions")?.mutationOwner).toBe("workspace");
  });

  it("rejects workspace child ownership on a classic renderer", () => {
    expect(() => compileMetaEntityRuntimeDescriptor({
      entity_code: "supplier",
      entity_name: "Supplier",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "supplier",
      fields: BASE_FIELDS,
      display_config: {},
      feature_flags: {},
    }, {
      relations: [{
        name: "contacts",
        relation_kind: "has_many",
        target_entity: "supplier_contact",
        fk_field: "supplier_id",
        ui_behavior: { mutation_owner: "workspace" },
      }],
    })).toThrow(/cannot be workspace-owned on renderer "master"/);
  });

  it("disables staged child operations on a classic renderer", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "supplier",
      entity_name: "Supplier",
      entity_class: "MASTER",
      table_schema: "master",
      table_name: "supplier",
      fields: BASE_FIELDS,
      display_config: {},
      feature_flags: {},
    }, {
      operations: [{
        id: "ADD_CONTACT",
        permission_code: "supplier_contact.create",
        surface: "DETAIL",
        placement: "PRIMARY",
        handler_type: "MODAL",
        interaction_surface_kind: "drawer-form",
        interaction_options: {
          contentAdapter: "contact-form",
          addContract: {
            semantics: "single",
            commitMode: "stage_then_parent_save",
            targetRelation: "contacts",
          },
        },
      }],
      relations: [{
        name: "contacts",
        relation_kind: "has_many",
        target_entity: "supplier_contact",
        fk_field: "supplier_id",
      }],
    });

    expect(descriptor.operations[0]).toMatchObject({
      enabled: false,
      disabledReason: "handler_invalid",
    });
  });
});
