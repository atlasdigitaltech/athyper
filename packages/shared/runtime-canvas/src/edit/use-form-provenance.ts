/**
 * Per-field provenance tracking for the edit form.
 *
 *   unset       — initial load, value null
 *   loaded      — initial load, value present from DB
 *   user_input  — user typed/selected in this session
 *   derived     — a rederive rule set the value in this session
 *
 * Used by `mode: "if_empty_or_derived"` rederive rules and by
 * `when.target_was_user_overridden` predicates.
 *
 * Spec: docs/specs/entity_field_defaults.md §4
 */

import { useCallback, useRef, useState } from "react";
import type { FieldProvenance } from "@athyper/cascade";

export type { FieldProvenance };

export interface UseFormProvenanceResult {
  provenance: Record<string, FieldProvenance>;
  markUserInput: (field: string) => void;
  markDerived:   (field: string) => void;
  markCleared:   (field: string) => void;
  reset:         (loaded: Record<string, unknown>) => void;
}

function initialProvenance(loaded: Record<string, unknown>): Record<string, FieldProvenance> {
  const out: Record<string, FieldProvenance> = {};
  for (const [k, v] of Object.entries(loaded)) {
    out[k] = isBlank(v) ? "unset" : "loaded";
  }
  return out;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export function useFormProvenance(loaded: Record<string, unknown>): UseFormProvenanceResult {
  const [provenance, setProvenance] = useState<Record<string, FieldProvenance>>(() => initialProvenance(loaded));
  // Cache the initial loaded set so reset() can rebuild from the same baseline
  // without callers having to thread it through again.
  const loadedRef = useRef(loaded);

  const markUserInput = useCallback((field: string) => {
    setProvenance((curr) => ({ ...curr, [field]: "user_input" }));
  }, []);

  const markDerived = useCallback((field: string) => {
    setProvenance((curr) => ({ ...curr, [field]: "derived" }));
  }, []);

  const markCleared = useCallback((field: string) => {
    setProvenance((curr) => ({ ...curr, [field]: "unset" }));
  }, []);

  const reset = useCallback((nextLoaded: Record<string, unknown>) => {
    loadedRef.current = nextLoaded;
    setProvenance(initialProvenance(nextLoaded));
  }, []);

  return { provenance, markUserInput, markDerived, markCleared, reset };
}
