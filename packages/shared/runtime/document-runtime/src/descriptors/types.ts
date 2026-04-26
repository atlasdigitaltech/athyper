/**
 * EntityViewDescriptor — static view-configuration contract for Phase 5.5.
 *
 * Each entity that uses mapDocumentHeaderModel has a descriptor that captures
 * which fields serve which header roles. These descriptors are the evidence
 * base for the Phase 6 generic edit runtime metadata contract.
 *
 * Shape follows the ADR example (camelCase grouped) rather than the flat
 * display_config.document_header snake_case shape. They converge in Phase 6.
 */

export interface EntityFactDescriptor {
  /** Stable identifier — used as React key and later as metadata key. */
  id: string;
  label: string;
  /** Record field name that holds the raw value. */
  field: string;
  /** "xl" = prominent total-style emphasis (amount facts). */
  emphasis?: "xl";
  /** For amount facts — ISO currency code field. */
  currencyField?: string;
  /** For amount facts — net/subtotal breakdown field. */
  subtotalField?: string;
  /** For amount facts — tax breakdown field. */
  taxField?: string;
}

export interface EntityStatusDescriptor {
  /** Matches the StatusDimension.dimension value from the orchestrator. */
  id: string;
  label: string;
  /**
   * Optional field binding. When absent the status value is resolved by the
   * orchestrator from computed logic, not a raw record field.
   */
  field?: string;
}

export interface EntityAuditDescriptor {
  createdAtField?: string;
  createdByField?: string;
  updatedAtField?: string;
  updatedByField?: string;
  statusChangedAtField?: string;
  statusChangedByField?: string;
}

// ── Tier 1 edit configuration ─────────────────────────────────────────────────
// Defined independently of entity-runtime's EntityEditableField to avoid a
// circular package dependency. The shapes are structurally compatible.

export interface EntityEditFieldDescriptor {
  /** Logical field name — matches the record data key. */
  name: string;
  label: string;
  hint?: string;
  editable?: boolean;
  /**
   * PATCH payload key when different from the logical name.
   * UI must not know DB column names — only use for API key differences.
   */
  apiField?: string;
  inputType?: "text" | "textarea" | "date" | "number" | "email";
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  /** Restrict editability to these status codes. */
  editableInStatus?: string[];
}

export interface EntityDescriptorEditConfig {
  /** Ordered list of editable fields for the generic Tier 1 form. */
  fields: EntityEditFieldDescriptor[];
  /** Status codes that allow the record to be opened for edit. */
  editableStatuses?: string[];
}

export interface EntityViewDescriptor {
  entityCode: string;

  identity: {
    /** Chip label shown in the identity bar, e.g. "INVOICE". */
    typeLabel: string;
    /** Field that holds the human-readable document/record number. */
    numberField: string;
    /** Field that holds the primary lifecycle status code. */
    statusField?: string;
    /** Field shown as the secondary title/description under the number. */
    titleField?: string;
    /**
     * Field holding the party FK (supplier_id, customer_id, etc.).
     * When present, the entity runtime resolves the display name async.
     */
    partyIdField?: string;
  };

  /** Key fact rail items rendered below the identity row. */
  facts?: EntityFactDescriptor[];

  /**
   * Supplementary status dimensions (accounting, settlement, matching, etc.).
   * These are rendered in the status strip and exclude the lifecycle dimension.
   */
  statuses?: EntityStatusDescriptor[];

  audit?: EntityAuditDescriptor;

  /**
   * Whether this entity shows a lifecycle progress rail.
   * Defaults true. Set false for master-data entities (supplier, company_code).
   */
  hasLifecycle?: boolean;

  /**
   * Tier 1 edit configuration. When present, the generic meta-edit runtime
   * uses this to build the edit form and save without a custom adapter.
   * Absent on read-only entities.
   */
  edit?: EntityDescriptorEditConfig;
}
