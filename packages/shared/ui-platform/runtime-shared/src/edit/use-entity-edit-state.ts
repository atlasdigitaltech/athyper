"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EntityEditableField,
  EntityEditSaveResult,
  EntityEditState,
  ValidationResult,
} from "./types";

export interface EntityEditStateResult extends EntityEditState {
  patch: Record<string, unknown>;
  updateField: (field: string, value: unknown) => void;
  fieldErrors: Record<string, string>;
  globalError: string | null;
}

export interface UseEntityEditStateOptions<
  TRecord extends Record<string, unknown>,
  TPatch extends Record<string, unknown>,
> {
  entityCode: string;
  recordId: string;
  record: TRecord;
  fields: EntityEditableField[];
  currentStatus?: string;
  save: (patch: TPatch) => Promise<EntityEditSaveResult>;
  beforeSubmit?: (patch: TPatch) => TPatch | Promise<TPatch>;
  validatePatch?: (patch: TPatch, record: TRecord) => ValidationResult | Promise<ValidationResult>;
}

export function useEntityEditState<
  TRecord extends Record<string, unknown> = Record<string, unknown>,
  TPatch extends Record<string, unknown> = Record<string, unknown>,
>(opts: UseEntityEditStateOptions<TRecord, TPatch>): EntityEditStateResult {
  const { record, fields, save, beforeSubmit, validatePatch } = opts;
  const saveRef = useRef(save);
  const beforeSubmitRef = useRef(beforeSubmit);
  const validatePatchRef = useRef(validatePatch);
  saveRef.current = save;
  beforeSubmitRef.current = beforeSubmit;
  validatePatchRef.current = validatePatch;

  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>();
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = Object.keys(patch).length > 0;
  const dirtyFields = useMemo(() => Object.keys(patch), [patch]);

  useEffect(() => {
    return () => {
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    };
  }, []);

  const clearSavedAcknowledgement = useCallback(() => {
    if (justSavedTimer.current) {
      clearTimeout(justSavedTimer.current);
      justSavedTimer.current = null;
    }
    setJustSaved(false);
  }, []);

  const updateField = useCallback((fieldName: string, value: unknown) => {
    clearSavedAcknowledgement();
    const original = record[fieldName];
    const sameAsOriginal =
      value === original
      || (value != null && original != null && String(value) === String(original));

    setPatch((current) => {
      if (sameAsOriginal) {
        const next = { ...current };
        delete next[fieldName];
        return next;
      }
      return { ...current, [fieldName]: value };
    });

    if (fieldErrors[fieldName]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[fieldName];
        return next;
      });
    }
  }, [clearSavedAcknowledgement, fieldErrors, record]);

  const saveState = useCallback(async (): Promise<EntityEditSaveResult> => {
    setIsSaving(true);
    setFieldErrors({});
    setGlobalError(null);

    try {
      let apiPatch = buildApiPatch(patch, fields) as TPatch;
      if (beforeSubmitRef.current) {
        apiPatch = await beforeSubmitRef.current(apiPatch);
      }

      if (validatePatchRef.current) {
        const validation = await validatePatchRef.current(apiPatch, record);
        if (!validation.valid) {
          if (validation.fieldErrors) setFieldErrors(validation.fieldErrors);
          if (validation.globalError) setGlobalError(validation.globalError);
          clearSavedAcknowledgement();
          setIsSaving(false);
          return {
            ok: false,
            fieldErrors: validation.fieldErrors,
            globalError: validation.globalError,
          };
        }
      }

      const result = await saveRef.current(apiPatch);
      if (result.ok) {
        setPatch({});
        setLastSavedAt(new Date().toISOString());
        setJustSaved(true);
        if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
        justSavedTimer.current = setTimeout(() => {
          setJustSaved(false);
          justSavedTimer.current = null;
        }, 2500);
      } else {
        clearSavedAcknowledgement();
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        setGlobalError(result.conflict?.message ?? result.globalError ?? "Save failed. Please try again.");
      }
      return result;
    } catch (error) {
      clearSavedAcknowledgement();
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setGlobalError(message);
      return { ok: false, globalError: message };
    } finally {
      setIsSaving(false);
    }
  }, [clearSavedAcknowledgement, fields, patch, record]);

  const discard = useCallback(() => {
    clearSavedAcknowledgement();
    setPatch({});
    setFieldErrors({});
    setGlobalError(null);
  }, [clearSavedAcknowledgement]);

  return {
    isDirty,
    dirtyFields,
    isSaving,
    lastSavedAt,
    justSaved,
    save: saveState,
    discard,
    patch,
    updateField,
    fieldErrors,
    globalError,
  };
}

function buildApiPatch(
  patch: Record<string, unknown>,
  fields: EntityEditableField[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [logicalName, value] of Object.entries(patch)) {
    const field = fields.find((item) => item.name === logicalName);
    result[field?.apiField ?? logicalName] = value;
  }
  return result;
}
