import { describe, expect, it } from "vitest";

import {
  MetaEntityFieldGroupSchema,
  MetaEntityRuntimeDescriptorSchema,
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

describe("compileMetaEntityRuntimeDescriptor", () => {
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
      backing_type: "table",
      fields: BASE_FIELDS,
      display_config: {
        line_entity_code: "purchase_invoice_line",
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
          },
        },
      ],
    });

    expect(descriptor.renderer).toBe("master");
    expect(descriptor.capabilities.hasLineItems).toBe(false);
    expect(descriptor.capabilities.hasChildRecords).toBe(true);
    expect(descriptor.surfaces.some((surface) => surface.kind === "line_items")).toBe(false);
    expect(descriptor.surfaces.some((surface) => surface.kind === "child_records")).toBe(true);
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
});
