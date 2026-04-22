"use client";

/**
 * useFlowEngine — draft state management for the FlowWizard.
 *
 * Responsibilities:
 *   - Owns the single draft object shared across all steps
 *   - Evaluates visible_when / required_when predicates against the draft
 *   - Computes advance-rule readiness for the current step
 *   - Tracks which derived fields have been manually overridden
 *   - Builds the summary panel lines from fields with summary_role set
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import type { FlowBundle, FlowStep, FlowFieldBinding } from "@athyper/api-contracts/documents";
import { isTruthy, evaluateRule, type RuleContext } from "./evaluateRule";

export interface FlowEngineState {
  currentStepIndex: number;
  draft: Record<string, unknown>;
  errors: Record<string, string>;
  overrides: Set<string>;
}

export interface SummaryLine {
  field_name: string;
  label: string;
  value: unknown;
  summary_role: string;
  is_override: boolean;
}

export interface UseFlowEngineReturn {
  state: FlowEngineState;
  currentStep: FlowStep;
  visibleFields: FlowFieldBinding[];
  canAdvance: boolean;
  isLastStep: boolean;
  summaryLines: SummaryLine[];
  setField: (name: string, value: unknown) => void;
  setOverride: (name: string, value: unknown) => void;
  setDerivedValue: (name: string, value: unknown) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (index: number) => void;
  validateStep: () => boolean;
}

function makeCtx(draft: Record<string, unknown>, userCtx?: Record<string, unknown>): RuleContext {
  return {
    draft,
    ctx: {
      today: new Date().toISOString().slice(0, 10),
      now: new Date().toISOString(),
      user: userCtx ?? {},
    },
    meta: {},
  };
}

/** Extract value for expressions matching `ctx.user.<key>` */
function resolveCtxUserExpr(
  deriveExpression: string | null | undefined,
  userCtx: Record<string, unknown> | undefined,
): { matched: true; value: unknown } | { matched: false } {
  if (!deriveExpression || !userCtx) return { matched: false };
  const m = /^ctx\.user\.(.+)$/.exec(deriveExpression);
  if (!m) return { matched: false };
  return { matched: true, value: userCtx[m[1]!] };
}

export function useFlowEngine(
  bundle: FlowBundle,
  userPermissions: string[],
  userCtx?: Record<string, unknown>,
): UseFlowEngineReturn {
  const sortedSteps = useMemo(
    () => [...bundle.steps].sort((a, b) => a.sort_order - b.sort_order),
    [bundle.steps],
  );

  const [state, setState] = useState<FlowEngineState>(() => {
    const draft: Record<string, unknown> = {};
    for (const step of sortedSteps) {
      for (const f of step.fields) {
        // const: defaults
        if (f.default_source?.startsWith("const:")) {
          const raw = f.default_source.slice(6);
          draft[f.field_name] = raw === "false" ? false : raw === "true" ? true : isNaN(Number(raw)) ? raw : Number(raw);
        } else if (f.default_source === "today()") {
          draft[f.field_name] = new Date().toISOString().slice(0, 10);
        }
        // ctx.user.* derived — seed synchronously when userCtx is already available
        const resolved = resolveCtxUserExpr(f.derive_expression, userCtx);
        if (resolved.matched && resolved.value !== undefined && resolved.value !== null) {
          draft[f.field_name] = resolved.value;
        }
      }
    }
    return { currentStepIndex: 0, draft, errors: {}, overrides: new Set() };
  });

  // When userCtx arrives asynchronously, patch ctx.user.* fields that haven't been overridden
  useEffect(() => {
    if (!userCtx) return;
    setState((prev) => {
      const newDraft = { ...prev.draft };
      let changed = false;
      for (const step of sortedSteps) {
        for (const f of step.fields) {
          if (prev.overrides.has(f.field_name)) continue;
          const resolved = resolveCtxUserExpr(f.derive_expression, userCtx);
          if (resolved.matched && resolved.value !== undefined && resolved.value !== null) {
            if (newDraft[f.field_name] !== resolved.value) {
              newDraft[f.field_name] = resolved.value;
              changed = true;
            }
          }
        }
      }
      return changed ? { ...prev, draft: newDraft } : prev;
    });
  // userCtx is a new object reference on each render if inlined — only re-run when content changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(userCtx), sortedSteps]);

  const currentStep = sortedSteps[state.currentStepIndex]!;
  const ruleCtx = useMemo(() => makeCtx(state.draft, userCtx), [state.draft, userCtx]);

  // Fields visible in the current step
  const visibleFields = useMemo(() => {
    return currentStep.fields
      .filter((f) => {
        if (f.mode === "hidden" || f.mode === "summary_only") return false;
        return isTruthy(f.visible_when ?? null, ruleCtx);
      })
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [currentStep.fields, ruleCtx]);

  // Advance-rule readiness
  const canAdvance = useMemo(() => {
    const required = currentStep.advance_rule.required_fields ?? [];
    const allFilled = required.every((fieldName) => {
      const v = state.draft[fieldName];
      return v !== null && v !== undefined && v !== "";
    });
    if (!allFilled) return false;
    if (currentStep.advance_rule.predicate) {
      return Boolean(evaluateRule(currentStep.advance_rule.predicate, ruleCtx));
    }
    return true;
  }, [currentStep, state.draft, ruleCtx]);

  // Summary panel lines: collect all fields with summary_role across ALL steps
  const summaryLines = useMemo<SummaryLine[]>(() => {
    const seen = new Set<string>();
    const lines: SummaryLine[] = [];
    for (const step of sortedSteps) {
      for (const f of step.fields) {
        if (!f.summary_role || seen.has(f.field_name)) continue;
        seen.add(f.field_name);
        const value = state.draft[f.field_name];
        if (value !== undefined && value !== null) {
          lines.push({
            field_name: f.field_name,
            label: f.field_label,
            value,
            summary_role: f.summary_role,
            is_override: state.overrides.has(f.field_name),
          });
        }
      }
    }
    return lines;
  }, [sortedSteps, state.draft, state.overrides]);

  const setField = useCallback((name: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      draft: { ...prev.draft, [name]: value },
      errors: (() => {
        const next = { ...prev.errors };
        delete next[name];
        return next;
      })(),
    }));
  }, []);

  const setOverride = useCallback((name: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      draft: { ...prev.draft, [name]: value },
      overrides: new Set([...prev.overrides, name]),
      errors: (() => {
        const next = { ...prev.errors };
        delete next[name];
        return next;
      })(),
    }));
  }, []);

  const setDerivedValue = useCallback((name: string, value: unknown) => {
    setState((prev) => {
      if (prev.overrides.has(name)) return prev;
      return { ...prev, draft: { ...prev.draft, [name]: value } };
    });
  }, []);

  const validateStep = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    for (const f of visibleFields) {
      const isReq =
        f.mode === "required" ||
        (f.required_when && isTruthy(f.required_when, ruleCtx));
      if (!isReq) continue;
      const v = state.draft[f.field_name];
      if (v === null || v === undefined || v === "") {
        errors[f.field_name] = `${f.field_label} is required`;
      }
    }
    setState((prev) => ({ ...prev, errors }));
    return Object.keys(errors).length === 0;
  }, [visibleFields, state.draft, ruleCtx]);

  const goNext = useCallback(() => {
    if (!validateStep()) return;
    setState((prev) => ({
      ...prev,
      currentStepIndex: Math.min(prev.currentStepIndex + 1, sortedSteps.length - 1),
      errors: {},
    }));
  }, [validateStep, sortedSteps.length]);

  const goBack = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStepIndex: Math.max(prev.currentStepIndex - 1, 0),
      errors: {},
    }));
  }, []);

  const goToStep = useCallback((index: number) => {
    if (index < 0 || index >= sortedSteps.length) return;
    // Only allow jumping to already-visited or adjacent steps
    setState((prev) => {
      if (index > prev.currentStepIndex + 1) return prev;
      return { ...prev, currentStepIndex: index, errors: {} };
    });
  }, [sortedSteps.length]);

  return {
    state,
    currentStep,
    visibleFields,
    canAdvance,
    isLastStep: state.currentStepIndex === sortedSteps.length - 1,
    summaryLines,
    setField,
    setOverride,
    setDerivedValue,
    goNext,
    goBack,
    goToStep,
    validateStep,
  };
}

/** Returns whether the user has the permission to override a derived field. */
export function canOverride(
  overridePermission: string | null | undefined,
  userPermissions: string[],
): boolean {
  if (!overridePermission) return true;
  return userPermissions.includes(overridePermission);
}
