/**
 * EntityEditAdapter — Tier 2 contract for the generic meta-edit runtime.
 *
 * Adapters register once at app startup. GenericMetaEditPage looks up
 * the adapter for the current entity and delegates data fetching,
 * header building, validation, and save to it.
 *
 * Slot escalation order (use the cheapest slot that works):
 *   1. fieldRenderers   — swap one field's input
 *   2. sectionRenderers — swap a logical grouping of fields
 *   3. validatePatch    — add cross-field or async validation
 *   4. beforeSubmit     — transform the patch before it is sent
 *   5. renderForm       — LAST RESORT; requires arch approval (see ADR)
 */

import type { ReactNode } from "react";
import type { EntityEditState, EntityEditSaveResult } from "../types";
import type { EntityHeaderModel } from "../../header/types";

// ── Field contract ────────────────────────────────────────────────────────────

/**
 * Describes one editable field from the adapter's perspective.
 *
 * The framework uses this to:
 *   - Decide which fields are shown in GenericMetaEditForm
 *   - Map logical field names to PATCH payload keys via apiField
 *   - Gate editability per status via editableInStatus
 */
export interface EntityEditableField {
  /** Logical field name — matches the record data key and the form state key. */
  name: string;
  label: string;
  /** One-line hint shown below the input. */
  hint?: string;
  /** true = editable; false/absent = display-only in the form */
  editable?: boolean;
  /**
   * PATCH payload key when different from the logical field name.
   * Default: same as name. Set when the API uses a different key (e.g. DB column name).
   * UI must not know DB column names — use this only for API key differences.
   */
  apiField?: string;
  /** When set, field is editable only in the listed status codes. */
  editableInStatus?: string[];
  /** Editing this field forces the record into this status (e.g. "draft"). */
  editingForcesStatus?: string;
  /**
   * Render hint for GenericMetaEditForm's fallback renderer.
   * Adapters providing a fieldRenderer slot can omit this.
   */
  inputType?: "text" | "textarea" | "date" | "number" | "email";
  /** Max length for text/textarea inputs. */
  maxLength?: number;
  /** Placeholder text. */
  placeholder?: string;
  required?: boolean;
}

// ── Edit policy ───────────────────────────────────────────────────────────────

export interface EntityEditPolicy {
  /** Record must be in one of these status codes for the edit page to be active. */
  editableStatuses: string[];
  /**
   * Status transitions forced when the record is opened for edit.
   * Key: current status. Value: status to force. Used for "draft on open" patterns.
   */
  forceStatusOnEdit?: Record<string, string>;
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  /** Keyed by logical field name. Shown inline below the field. */
  fieldErrors?: Record<string, string>;
  /** Surfaced as a global banner above the form. */
  globalError?: string;
}

// ── Slot renderer types ───────────────────────────────────────────────────────

export type FieldRenderer = (props: {
  field: EntityEditableField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}) => ReactNode;

export type SectionRenderer = (props: {
  record: Record<string, unknown>;
  patch: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  disabled?: boolean;
}) => ReactNode;

// ── Adapter context ───────────────────────────────────────────────────────────

export interface EntityEditAdapterContext {
  entityCode: string;
  /** Canonical business key from the URL [id] segment. */
  recordId: string;
  /**
   * UUID of the record as returned by fetchRecord().id.
   * Present in save/buildHeaderModel contexts; absent in fetchRecord context.
   */
  recordUuid?: string;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface EntityEditAdapter<
  TRecord extends Record<string, unknown> = Record<string, unknown>,
  TPatch  extends Record<string, unknown> = Record<string, unknown>,
> {
  entityCode: string;

  /**
   * Fetch the record to populate the edit form.
   * Typical implementation: GET /api/relay/api/records/:entityCode/:recordId
   */
  fetchRecord: (ctx: EntityEditAdapterContext) => Promise<{
    id:     string;
    data:   TRecord;
    status?: string;
  }>;

  /**
   * Build the EntityHeaderModel for the edit surface. Called reactively on
   * every render so it can reflect editState.isDirty / editState.isSaving
   * in the Save action's appearance.
   */
  buildHeaderModel: (ctx: EntityEditAdapterContext & {
    data:      TRecord;
    editState: EntityEditState;
  }) => EntityHeaderModel;

  /**
   * Persist the changes. The framework calls this from useEntityEditState.save()
   * after beforeSubmit and validatePatch have run. Receives the full context
   * including both the original record and the mapped patch.
   */
  save: (ctx: EntityEditAdapterContext & {
    record: TRecord;
    patch:  TPatch;
  }) => Promise<EntityEditSaveResult>;

  /**
   * Per-field render overrides.
   * Key: logical field name. Value: custom renderer.
   * Use for pickers, rich text, or any non-trivial input.
   */
  fieldRenderers?: Partial<Record<string, FieldRenderer>>;

  /**
   * Per-section render overrides.
   * Key: arbitrary section id. Value: custom section renderer.
   * Use when an entire logical group needs non-standard layout.
   */
  sectionRenderers?: Partial<Record<string, SectionRenderer>>;

  /**
   * Transforms the patch before validation and save.
   * Can add derived fields, coerce types, or strip client-only state.
   * Return the (possibly mutated) patch.
   */
  beforeSubmit?: (patch: TPatch) => TPatch | Promise<TPatch>;

  /**
   * Synchronous or async validation. Runs after beforeSubmit, before save.
   * Return { valid: false, fieldErrors, globalError } to block the submission.
   */
  validatePatch?: (
    patch: TPatch,
    record: TRecord,
  ) => ValidationResult | Promise<ValidationResult>;

  /**
   * Last-resort full-form override. When present, GenericMetaEditForm is
   * bypassed entirely. Requires architectural approval — see ADR.
   * Prefer fieldRenderers/sectionRenderers/validatePatch/beforeSubmit first.
   */
  renderForm?: React.ComponentType<{
    record:      TRecord;
    editState:   EntityEditState;
    updateField: (field: string, value: unknown) => void;
  }>;

  /** Fields available in GenericMetaEditForm, in render order. */
  editableFields?: EntityEditableField[];

  /** Statuses that allow editing. GenericMetaEditPage enforces this. */
  editPolicy?: EntityEditPolicy;
}
