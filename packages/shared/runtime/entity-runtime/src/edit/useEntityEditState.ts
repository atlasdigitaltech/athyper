"use client";

/**
 * useEntityEditState — framework-owned generic edit state hook.
 *
 * Owns:
 *   - dirty detection (patch vs original record comparison)
 *   - restore-to-original (discard)
 *   - PATCH payload building (logical name → apiField)
 *   - save lifecycle (beforeSubmit → validatePatch → adapter.save)
 *   - field errors
 *   - global errors
 *   - conflict state (surfaced as globalError for Phase 6.0)
 *
 * Does NOT own: navigation guard (EntityWorkspaceShell), keyboard shortcuts
 * (useEditKeyboardShortcuts), or beforeunload prompt (useBeforeUnload).
 *
 * The returned object extends EntityEditState with patch access and
 * updateField — needed by GenericMetaEditForm but not by the shell.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { EntityEditSaveResult, EntityEditState } from "./types";
import type { EntityEditableField, ValidationResult } from "./adapter/types";

// ── Generic PATCH builder ─────────────────────────────────────────────────────

/**
 * Maps logical field names (form state keys) to API payload keys.
 * Logical name → apiField when set, otherwise logical name.
 * UI must never know DB column names — that mapping lives in apiField.
 */
function buildApiPatch(
  patch:  Record<string, unknown>,
  fields: EntityEditableField[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [logicalName, value] of Object.entries(patch)) {
    const field  = fields.find((f) => f.name === logicalName);
    const apiKey = field?.apiField ?? logicalName;
    result[apiKey] = value;
  }
  return result;
}

// ── Hook return type ──────────────────────────────────────────────────────────

export interface EntityEditStateResult extends EntityEditState {
  /** Current dirty values keyed by logical field name. */
  patch: Record<string, unknown>;
  /** Set or clear a field's value. Clears field from patch when value === original. */
  updateField: (field: string, value: unknown) => void;
  /** Per-field validation errors keyed by logical field name. */
  fieldErrors: Record<string, string>;
  /** Single global error surfaced as a banner above the form. */
  globalError: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseEntityEditStateOptions<
  TRecord extends Record<string, unknown>,
  TPatch  extends Record<string, unknown>,
> {
  entityCode:  string;
  recordId:    string;
  /** The original record data. Dirty detection compares against this. */
  record:      TRecord;
  /** All fields the form may edit. Used for apiField mapping and editableInStatus. */
  fields:      EntityEditableField[];
  /** Current record status — used to filter editableInStatus constraints. */
  currentStatus?: string;
  /**
   * Adapter-provided save function. Receives the API-mapped patch
   * (after beforeSubmit and validatePatch).
   */
  save: (patch: TPatch) => Promise<EntityEditSaveResult>;
  beforeSubmit?:  (patch: TPatch) => TPatch | Promise<TPatch>;
  validatePatch?: (patch: TPatch, record: TRecord) => ValidationResult | Promise<ValidationResult>;
}

export function useEntityEditState<
  TRecord extends Record<string, unknown> = Record<string, unknown>,
  TPatch  extends Record<string, unknown> = Record<string, unknown>,
>(opts: UseEntityEditStateOptions<TRecord, TPatch>): EntityEditStateResult {
  const { record, fields, save, beforeSubmit, validatePatch } = opts;

  // Use a ref for save/beforeSubmit/validatePatch so the hook never needs to
  // be re-created when the adapter callbacks change identity between renders.
  const saveRef          = useRef(save);
  const beforeSubmitRef  = useRef(beforeSubmit);
  const validatePatchRef = useRef(validatePatch);
  saveRef.current          = save;
  beforeSubmitRef.current  = beforeSubmit;
  validatePatchRef.current = validatePatch;

  const [patch, setPatch]           = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSaving, setIsSaving]     = useState(false);

  const isDirty    = Object.keys(patch).length > 0;
  const dirtyFields = useMemo(() => Object.keys(patch), [patch]);

  // ── updateField ─────────────────────────────────────────────────────────────
  const updateField = useCallback(
    (fieldName: string, value: unknown) => {
      const original = record[fieldName];
      // Normalise for comparison: use String() for dates/numbers so "2024-01-01"
      // equals the ISO value returned by the server.
      const sameAsOriginal =
        value === original ||
        (value != null && original != null && String(value) === String(original));

      setPatch((prev) => {
        if (sameAsOriginal) {
          const next = { ...prev };
          delete next[fieldName];
          return next;
        }
        return { ...prev, [fieldName]: value };
      });

      // Clear field error on change
      if (fieldErrors[fieldName]) {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next[fieldName];
          return next;
        });
      }
    },
    [record, fieldErrors],
  );

  // ── save ────────────────────────────────────────────────────────────────────
  const saveState = useCallback(async (): Promise<EntityEditSaveResult> => {
    setIsSaving(true);
    setFieldErrors({});
    setGlobalError(null);

    try {
      // 1. Build API patch (logical name → apiField)
      let apiPatch = buildApiPatch(patch, fields) as TPatch;

      // 2. beforeSubmit transform
      if (beforeSubmitRef.current) {
        apiPatch = await beforeSubmitRef.current(apiPatch);
      }

      // 3. Validate
      if (validatePatchRef.current) {
        const vr = await validatePatchRef.current(apiPatch, record);
        if (!vr.valid) {
          if (vr.fieldErrors) setFieldErrors(vr.fieldErrors);
          if (vr.globalError) setGlobalError(vr.globalError);
          setIsSaving(false);
          return { ok: false, fieldErrors: vr.fieldErrors, globalError: vr.globalError };
        }
      }

      // 4. Save
      const result = await saveRef.current(apiPatch);

      if (result.ok) {
        setPatch({});
      } else {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        const errMsg =
          result.conflict?.message ??
          result.globalError ??
          "Save failed. Please try again.";
        setGlobalError(errMsg);
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setGlobalError(msg);
      return { ok: false, globalError: msg };
    } finally {
      setIsSaving(false);
    }
  }, [patch, fields, record]);

  // ── discard ─────────────────────────────────────────────────────────────────
  const discard = useCallback(() => {
    setPatch({});
    setFieldErrors({});
    setGlobalError(null);
  }, []);

  return {
    // EntityEditState base
    isDirty,
    dirtyFields,
    isSaving,
    save: saveState,
    discard,
    // Extensions
    patch,
    updateField,
    fieldErrors,
    globalError,
  };
}
