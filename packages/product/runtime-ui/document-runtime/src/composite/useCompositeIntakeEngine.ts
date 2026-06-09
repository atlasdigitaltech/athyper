"use client";

/**
 * useCompositeIntakeEngine — state engine for CompositeFlowWizard.
 *
 * Models after useFlowEngine (document-runtime) but extended to manage:
 *   - Flat fields per step (same as useFlowEngine)
 *   - Child-row arrays per repeater section (new)
 *   - Composite payload assembly
 *   - Section completion reporting for CompletionSummaryPanel
 *
 * Generic — zero supplier-specific code.
 * The bundle's section descriptors carry all entity/payload-key metadata.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { evaluateRule, isTruthy } from "../intake/evaluateRule";
import type {
  CompositeFlowBundle,
  CompositeFlowStep,
  FlowSectionDescriptor,
  SectionCompletionReport,
  SupplierIntakePayload,
} from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompositeIntakeState {
  currentStepIndex: number;
  flatFields: Record<string, unknown>;
  childRows: Record<string, Record<string, unknown>[]>;
  errors: Record<string, string>;
  childErrors: Record<string, Record<number, Record<string, string>>>;
}

export interface CompositeIntakeEngineReturn {
  state: CompositeIntakeState;
  currentStep: CompositeFlowStep;
  isLastStep: boolean;
  canAdvance: boolean;
  flowRunId: string;

  setFlatField: (key: string, value: unknown) => void;
  setChildRows: (payloadKey: string, rows: Record<string, unknown>[]) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (index: number) => void;
  validateStep: () => boolean;
  compositePayload: () => SupplierIntakePayload;
  completionReport: () => SectionCompletionReport[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRuleCtx(flatFields: Record<string, unknown>) {
  return { draft: flatFields, ctx: {}, meta: {} };
}

function isSectionVisible(sec: FlowSectionDescriptor, flatFields: Record<string, unknown>): boolean {
  if (!sec.visible_when) return true;
  try {
    return isTruthy(sec.visible_when, buildRuleCtx(flatFields));
  } catch {
    return true;
  }
}

function isSystemManagedChildField(field: { field_name: string; data_type?: string | null }): boolean {
  return field.field_name === "status" || field.data_type === "lifecycle_state";
}

function requesterManagedChildFields(sec: FlowSectionDescriptor) {
  return (sec.child_fields ?? []).filter((field) => !isSystemManagedChildField(field));
}

function countRequiredFields(sec: FlowSectionDescriptor): number {
  if (sec.section_type === "fields") {
    return sec.fields.filter(f => f.mode === "required").length;
  }
  if (sec.section_type === "repeater" || sec.section_type === "singleton") {
    return requesterManagedChildFields(sec).filter(f => f.is_required).length;
  }
  return 0;
}

function countFilledRequiredFields(
  sec: FlowSectionDescriptor,
  flatFields: Record<string, unknown>,
  childRows: Record<string, unknown>[],
): number {
  if (sec.section_type === "fields") {
    return sec.fields
      .filter(f => f.mode === "required")
      .filter(f => {
        const v = flatFields[f.field_name];
        return v !== undefined && v !== null && v !== "";
      }).length;
  }
  if (sec.section_type === "repeater" || sec.section_type === "singleton") {
    if (childRows.length === 0) return 0;
    const requiredNames = requesterManagedChildFields(sec).filter(f => f.is_required).map(f => f.field_name);
    let filled = 0;
    for (const row of childRows) {
      for (const name of requiredNames) {
        const v = row[name];
        if (v !== undefined && v !== null && v !== "") filled++;
      }
    }
    return filled;
  }
  return 0;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function stripSystemManagedRowFields(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  delete out["status"];
  delete out["status_changed_at"];
  delete out["status_changed_by"];
  return out;
}

export function useCompositeIntakeEngine(
  bundle: CompositeFlowBundle,
): CompositeIntakeEngineReturn {
  const sortedSteps = useMemo(
    () => [...bundle.steps].sort((a, b) => a.sort_order - b.sort_order),
    [bundle.steps],
  );

  // Stable flowRunId — persisted to sessionStorage so tab-close/reopen survives
  const flowRunId = useRef<string | null>(null);
  if (flowRunId.current === null) {
    if (typeof window !== "undefined") {
      const key = `composite-intake-flow-run-${bundle.flow_code}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        flowRunId.current = stored;
      } else {
        const id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
        flowRunId.current = id;
      }
    } else {
      flowRunId.current = crypto.randomUUID();
    }
  }
  const stableFlowRunId = flowRunId.current!;

  const [state, setState] = useState<CompositeIntakeState>({
    currentStepIndex: 0,
    flatFields: {},
    childRows: {},
    errors: {},
    childErrors: {},
  });

  // ── Setters ───────────────────────────────────────────────────────────────

  const setFlatField = useCallback((key: string, value: unknown) => {
    setState(prev => ({
      ...prev,
      flatFields: { ...prev.flatFields, [key]: value },
      errors: { ...prev.errors, [key]: "" },
    }));
  }, []);

  const setChildRows = useCallback((payloadKey: string, rows: Record<string, unknown>[]) => {
    setState(prev => ({
      ...prev,
      childRows: { ...prev.childRows, [payloadKey]: rows },
    }));
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────

  const validateStep = useCallback((): boolean => {
    const step = sortedSteps[state.currentStepIndex];
    if (!step) return true;

    const newErrors: Record<string, string> = {};
    let valid = true;

    for (const sec of step.sections) {
      if (!isSectionVisible(sec, state.flatFields)) continue;
      if (sec.section_type === "summary") continue;

      if (sec.section_type === "fields") {
        for (const f of sec.fields) {
          if (f.mode !== "required") continue;
          // Evaluate required_when predicate if present
          if (f.required_when) {
            try {
              const active = isTruthy(f.required_when, buildRuleCtx(state.flatFields));
              if (!active) continue;
            } catch {
              // If evaluation fails, treat as required
            }
          }
          const v = state.flatFields[f.field_name];
          if (v === undefined || v === null || v === "") {
            newErrors[f.field_name] = `${f.field_label} is required.`;
            valid = false;
          }
        }
      }

      if (sec.section_type === "repeater") {
        const rows = state.childRows[sec.payload_key ?? ""] ?? [];
        const min = sec.min_rows ?? 0;
        if (rows.length < min) {
          newErrors[`${sec.section_key}__min`] = `At least ${min} ${sec.label} row${min === 1 ? "" : "s"} required.`;
          valid = false;
        }
        for (const cf of requesterManagedChildFields(sec)) {
          if (!cf.is_required) continue;
          rows.forEach((row, idx) => {
            const v = row[cf.field_name];
            if (v === undefined || v === null || v === "") {
              const errKey = `${sec.section_key}__${idx}__${cf.field_name}`;
              newErrors[errKey] = `${cf.field_label} is required.`;
              valid = false;
            }
          });
        }
        if (sec.payload_key === "certifications") {
          rows.forEach((row, idx) => {
            const hasRegisteredType = hasText(row["certification_type_id"]);
            const hasCustomName = hasText(row["custom_name"]);
            if (!hasRegisteredType && !hasCustomName) {
              newErrors[`${sec.section_key}__${idx}__certification_type_id`] =
                "Select a certification type or enter a custom name.";
              valid = false;
            }
            if (hasRegisteredType && hasCustomName) {
              newErrors[`${sec.section_key}__${idx}__custom_name`] =
                "Use either Certification Type or Custom Name, not both.";
              valid = false;
            }
          });
        }
      }

      if (sec.section_type === "singleton") {
        const rows = state.childRows[sec.payload_key ?? ""] ?? [];
        const row = rows[0] ?? {};
        for (const cf of requesterManagedChildFields(sec)) {
          if (!cf.is_required) continue;
          const v = row[cf.field_name];
          if (v === undefined || v === null || v === "") {
            newErrors[`${sec.section_key}__0__${cf.field_name}`] = `${cf.field_label} is required.`;
            valid = false;
          }
        }
      }
    }

    setState(prev => ({ ...prev, errors: newErrors }));
    return valid;
  }, [state, sortedSteps]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (!validateStep()) return;
    setState(prev => ({
      ...prev,
      currentStepIndex: Math.min(prev.currentStepIndex + 1, sortedSteps.length - 1),
    }));
  }, [validateStep, sortedSteps.length]);

  const goBack = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStepIndex: Math.max(prev.currentStepIndex - 1, 0),
      errors: {},
    }));
  }, []);

  const goToStep = useCallback((index: number) => {
    if (index >= state.currentStepIndex) return; // only allow backward jumps without validation
    setState(prev => ({ ...prev, currentStepIndex: index, errors: {} }));
  }, [state.currentStepIndex]);

  // ── Derived values ────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const currentStep = (sortedSteps[state.currentStepIndex] ?? sortedSteps[0])!;
  const isLastStep = state.currentStepIndex === sortedSteps.length - 1;

  const canAdvance = useMemo(() => {
    // Quick check: any visible required flat fields on current step empty?
    const step = sortedSteps[state.currentStepIndex];
    if (!step) return true;

    for (const sec of step.sections) {
      if (!isSectionVisible(sec, state.flatFields)) continue;
      if (sec.section_type !== "fields") continue;
      for (const f of sec.fields) {
        if (f.mode !== "required") continue;
        const v = state.flatFields[f.field_name];
        if (v === undefined || v === null || v === "") return false;
      }
    }
    return true;
  }, [state.flatFields, state.currentStepIndex, sortedSteps]);

  // ── Payload assembly ──────────────────────────────────────────────────────

  const compositePayload = useCallback((): SupplierIntakePayload => {
    const flat = state.flatFields;
    const rows = state.childRows;

    // Collect all visible sections across all steps to build payload
    const allSections = sortedSteps.flatMap(step => step.sections);

    const getRows = (payloadKey: string) => (rows[payloadKey] ?? []).map(stripSystemManagedRowFields);

    // Only include sections that are visible (driver-field conditionals)
    const bankVisible = allSections.some(
      s => s.payload_key === "bank_accounts" && isSectionVisible(s, flat),
    );
    const govVisible = allSections.some(
      s => s.payload_key === "governance" && isSectionVisible(s, flat),
    );

    const asStr = (v: unknown): string | undefined =>
      typeof v === "string" ? v : undefined;
    const asBool = (v: unknown): boolean | undefined =>
      typeof v === "boolean" ? v : undefined;

    return {
      idempotency_key: stableFlowRunId,
      supplier: {
        name:                       asStr(flat["name"]),
        display_name:               asStr(flat["display_name"]),
        legal_name:                 asStr(flat["legal_name"]),
        supplier_type:              asStr(flat["supplier_type"]),
        legal_form:                 asStr(flat["legal_form"]),
        registration_no:            asStr(flat["registration_no"]),
        registration_country_code:  asStr(flat["registration_country_code"]),
        website_url:                asStr(flat["website_url"]),
        description:                asStr(flat["description"]),
        external_ref:               asStr(flat["external_ref"]),
        is_payment_ready:           asBool(flat["is_payment_ready"]),
        anticipated_risk_tier:      asStr(flat["anticipated_risk_tier"]),
      },
      identifiers:       getRows("identifiers"),
      certifications:    getRows("certifications"),
      tax_profiles:      getRows("tax_profiles"),
      qualification:     {} as Record<string, never>,
      contacts:          getRows("contacts"),
      contact_channels:  getRows("contact_channels"),
      addresses:         getRows("addresses"),
      bank_accounts:     bankVisible ? getRows("bank_accounts") : [],
      governance:        govVisible  ? getRows("governance")    : [],
    };
  }, [state, sortedSteps, stableFlowRunId]);

  // ── Completion report ─────────────────────────────────────────────────────

  const completionReport = useCallback((): SectionCompletionReport[] => {
    const report: SectionCompletionReport[] = [];

    for (const step of sortedSteps) {
      for (const sec of step.sections) {
        if (sec.section_type === "summary") continue;
        if (!isSectionVisible(sec, state.flatFields)) continue;

        const payloadKey = sec.payload_key ?? "";
        const rows = sec.section_type === "fields"
          ? []
          : (state.childRows[payloadKey] ?? []);

        const minRows = sec.min_rows ?? 0;
        const requiredFieldCount = countRequiredFields(sec);
        const filledFieldCount = countFilledRequiredFields(
          sec,
          state.flatFields,
          rows,
        );

        const isRequired = sec.section_type === "fields"
          ? requiredFieldCount > 0
          : minRows > 0;

        let status: SectionCompletionReport["status"];
        if (sec.section_type === "fields") {
          if (filledFieldCount === requiredFieldCount && requiredFieldCount > 0) status = "complete";
          else if (filledFieldCount > 0) status = "partial";
          else if (!isRequired) status = "optional_empty";
          else status = "empty";
        } else {
          if (rows.length === 0 && !isRequired) status = "optional_empty";
          else if (rows.length < minRows) status = "empty";
          else if (filledFieldCount < requiredFieldCount * rows.length) status = "partial";
          else status = "complete";
        }

        report.push({
          step_key:            step.step_key,
          section_key:         sec.section_key,
          label:               sec.label,
          status,
          required_field_count: requiredFieldCount,
          filled_field_count:   filledFieldCount,
          row_count:            rows.length,
          min_rows:             minRows,
          is_required:          isRequired,
          is_restricted:        sec.restricted_view_only ?? false,
        });
      }
    }

    return report;
  }, [state, sortedSteps]);

  return {
    state,
    currentStep,
    isLastStep,
    canAdvance,
    flowRunId: stableFlowRunId,
    setFlatField,
    setChildRows,
    goNext,
    goBack,
    goToStep,
    validateStep,
    compositePayload,
    completionReport,
  };
}
