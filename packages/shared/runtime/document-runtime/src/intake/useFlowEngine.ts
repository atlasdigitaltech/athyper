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
 *   - Resolves synchronous derive_expressions reactively (match_type, fiscal dates)
 *   - Resolves async derive_expressions via fetch (vendor currency, payment terms)
 *
 * Supported derive_expression patterns:
 *   ctx.user.<key>                            — seeded from userCtx
 *   vendor.default_currency(supplier_id)      — async: fetch /records/vendor/:id
 *   vendor.default_payment_term(...)          — async: same vendor fetch
 *   vendor.default_payment_method(...)        — async: same vendor fetch
 *   company_code.base_currency(company_code_id) — async: fetch /records/company_code/:id → functional_currency
 *   matching.match_type_from_source(...)      — sync: map invoice_source → match type
 *   fiscal.year_from(posting_date, ...)       — sync: extract year from date
 *   fiscal.period_from(posting_date, ...)     — sync: extract month from date
 *
 * Supported default_source patterns:
 *   const:<value>                             — static constant
 *   today()                                   — today's ISO date string
 *   lookup.<domain_path>.<code>               — seed as the code string
 *   field.<field_name>                        — copy from another draft field
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import type { FlowBundle, FlowStep, FlowFieldBinding } from "@athyper/api-contracts/documents";
import { isTruthy, evaluateRule, type RuleContext } from "./evaluateRule";

export interface FlowEngineState {
  currentStepIndex: number;
  draft: Record<string, unknown>;
  errors: Record<string, string>;
  overrides: Set<string>;
  /** Human-readable display labels for UUID reference fields (field_name → label). */
  displayLabels: Record<string, string>;
}

export interface SummaryLine {
  field_name: string;
  label: string;
  value: unknown;
  /** Resolved display label for UUID reference fields. Falls back to value. */
  displayValue: string;
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
  setDisplayLabel: (name: string, label: string | null) => void;
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

// ── Synchronous derivation engine ─────────────────────────────────────────────

const SOURCE_TO_MATCH_TYPE: Record<string, string> = {
  po_based:       "three_way",
  contract_based: "two_way",
  non_po:         "no_match",
  one_time_vendor:"no_match",
};

/**
 * Evaluate synchronous derive_expression patterns against the current draft.
 * Returns `undefined` if the pattern is not recognised (async or ctx-based).
 */
function evalSyncDerivation(
  expr: string | null | undefined,
  draft: Record<string, unknown>,
): unknown {
  if (!expr) return undefined;

  // matching.match_type_from_source(invoice_source)
  if (expr === "matching.match_type_from_source(invoice_source)") {
    const src = String(draft["invoice_source"] ?? "");
    return src ? (SOURCE_TO_MATCH_TYPE[src] ?? null) : null;
  }

  // fiscal.year_from(posting_date, ...)
  if (/^fiscal\.year_from\(posting_date/.test(expr)) {
    const d = draft["posting_date"] as string | null | undefined;
    if (!d) return null;
    return new Date(d).getFullYear();
  }

  // fiscal.period_from(posting_date, ...)
  if (/^fiscal\.period_from\(posting_date/.test(expr)) {
    const d = draft["posting_date"] as string | null | undefined;
    if (!d) return null;
    return new Date(d).getMonth() + 1;
  }

  return undefined; // not a sync pattern
}

// ── Initialise draft from default_source ──────────────────────────────────────

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function companyCurrency(row: Record<string, unknown> | null | undefined): string | null {
  return (
    stringValue(row?.["functional_currency"]) ??
    stringValue(row?.["base_currency"]) ??
    stringValue(row?.["base_currency_code"]) ??
    stringValue(row?.["currency_code"])
  )?.toUpperCase() ?? null;
}

function rowLabel(row: Record<string, unknown>): string {
  const keys = Object.keys(row);
  const nameKey = keys.find((k) => k !== "id" && k.endsWith("_name"));
  if (nameKey && row[nameKey]) return String(row[nameKey]);
  if (row.name) return String(row.name);
  const codeKey = keys.find((k) => k !== "id" && k.endsWith("_code") && k !== "currency_code");
  if (codeKey && row[codeKey]) return String(row[codeKey]);
  if (row.code) return String(row.code);
  return String(row.id ?? "").slice(0, 8);
}

async function fetchRecord(entityCode: string, id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const body = await res.json() as { data?: Record<string, unknown> };
  return body.data ?? null;
}

async function resolveAssignedLedgerBook(
  companyCodeId: string,
): Promise<{ id: string; label: string } | null> {
  const filters = encodeURIComponent(JSON.stringify({ company_code_id: companyCodeId, status: "active" }));
  const assignmentRes = await fetch(
    `/api/relay/api/records/company_code_book_assignment?filters=${filters}&page_size=50`,
  );
  if (!assignmentRes.ok) return null;

  const assignmentBody = await assignmentRes.json() as { data?: Record<string, unknown>[] };
  const assignments = (assignmentBody.data ?? [])
    .filter((row) => typeof row["book_id"] === "string")
    .sort((a, b) => Number(a["priority"] ?? 0) - Number(b["priority"] ?? 0));

  for (const assignment of assignments) {
    const bookId = assignment["book_id"] as string;
    const book = await fetchRecord("ledger_book", bookId);
    if (!book) continue;
    if (book["status"] != null && book["status"] !== "active") continue;
    if (book["is_manual_je_allowed"] === false) continue;
    if (book["category"] != null && book["category"] !== "statutory") continue;
    return { id: bookId, label: rowLabel(book) };
  }

  return null;
}

async function resolveCompanyLedgerBook(
  company: Record<string, unknown>,
  companyCodeId: string,
): Promise<{ id: string; label: string } | null> {
  const assignedBook = await resolveAssignedLedgerBook(companyCodeId);
  if (assignedBook) return assignedBook;

  const defaultBookId = stringValue(company["default_ledger_book_id"]);
  if (defaultBookId) {
    const book = await fetchRecord("ledger_book", defaultBookId);
    if (
      book
      && (book["status"] == null || book["status"] === "active")
      && book["is_manual_je_allowed"] !== false
      && (book["category"] == null || book["category"] === "statutory")
    ) {
      return { id: defaultBookId, label: rowLabel(book) };
    }
  }
  return null;
}

function usesCompanyCurrencyDerivation(field: FlowFieldBinding): boolean {
  const expr = field.derive_expression ?? "";
  return (
    expr === "company.functional_currency(company_code_id)" ||
    expr === "company.functional_currency" ||
    expr === "company_code.base_currency(company_code_id)" ||
    expr === "company_code.base_currency" ||
    expr === "company_code.functional_currency" ||
    expr === "company_code.functional_currency(company_code_id)"
  );
}

function usesCompanyBookDerivation(field: FlowFieldBinding): boolean {
  const expr = field.derive_expression ?? "";
  return (
    expr === "company.default_manual_ledger_book(company_code_id)" ||
    expr === "company.default_ledger_book(company_code_id)" ||
    expr === "company.default_ledger_book" ||
    expr === "company_code.default_manual_ledger_book(company_code_id)" ||
    expr === "company_code.default_manual_ledger_book" ||
    expr === "company_code.default_ledger_book(company_code_id)" ||
    expr === "company_code.default_ledger_book"
  );
}

function companyDerivedFields(steps: FlowStep[]): { currency: string[]; book: string[]; all: string[] } {
  const currency = new Set<string>();
  const book = new Set<string>();
  for (const step of steps) {
    for (const field of step.fields) {
      if (usesCompanyCurrencyDerivation(field)) currency.add(field.field_name);
      if (usesCompanyBookDerivation(field)) book.add(field.field_name);
    }
  }
  return {
    currency: [...currency],
    book: [...book],
    all: [...currency, ...book],
  };
}

function buildInitialDraft(
  steps: FlowStep[],
  userCtx?: Record<string, unknown>,
  initialValues?: Record<string, unknown>,
): Record<string, unknown> {
  // Start with caller-supplied initial values (e.g. pre-filled from a source document)
  const draft: Record<string, unknown> = { ...(initialValues ?? {}) };

  // First pass: handle patterns that don't depend on other fields
  // Skip fields already seeded by initialValues so they aren't overwritten
  for (const step of steps) {
    for (const f of step.fields) {
      if (draft[f.field_name] !== undefined) continue; // already set by initialValues

      if (f.default_source?.startsWith("const:")) {
        const raw = f.default_source.slice(6);
        draft[f.field_name] =
          raw === "false" ? false : raw === "true" ? true
          : isNaN(Number(raw)) ? raw : Number(raw);
      } else if (f.default_source === "today()") {
        draft[f.field_name] = new Date().toISOString().slice(0, 10);
      } else if (f.default_source?.startsWith("lookup.")) {
        const lastDot = f.default_source.lastIndexOf(".");
        if (lastDot > 7) {
          draft[f.field_name] = f.default_source.slice(lastDot + 1);
        }
      }

      // ctx.user.* derive_expression — seed synchronously if userCtx available
      const resolved = resolveCtxUserExpr(f.derive_expression, userCtx);
      if (resolved.matched && resolved.value !== undefined && resolved.value !== null) {
        draft[f.field_name] = resolved.value;
      }
    }
  }

  // Second pass: field.* defaults — depends on other fields being seeded first
  for (const step of steps) {
    for (const f of step.fields) {
      if (f.default_source?.startsWith("field.") && draft[f.field_name] === undefined) {
        const sourceField = f.default_source.slice(6);
        if (draft[sourceField] !== undefined) {
          draft[f.field_name] = draft[sourceField];
        }
      }
    }
  }

  return draft;
}

export function useFlowEngine(
  bundle: FlowBundle,
  userPermissions: string[],
  userCtx?: Record<string, unknown>,
  initialValues?: Record<string, unknown>,
): UseFlowEngineReturn {
  const sortedSteps = useMemo(
    () => [...bundle.steps].sort((a, b) => a.sort_order - b.sort_order),
    [bundle.steps],
  );

  const [state, setState] = useState<FlowEngineState>(() => ({
    currentStepIndex: 0,
    draft: buildInitialDraft(sortedSteps, userCtx, initialValues),
    errors: {},
    overrides: new Set(),
    displayLabels: {},
  }));

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(userCtx), sortedSteps]);

  // ── Sync reactive derivations ─────────────────────────────────────────────
  // Re-runs only when the specific trigger fields change to avoid loops.
  const invoiceSource = state.draft["invoice_source"] as string | undefined;
  const postingDate   = state.draft["posting_date"]   as string | undefined;

  useEffect(() => {
    setState((prev) => {
      const newDraft = { ...prev.draft };
      let changed = false;
      for (const step of sortedSteps) {
        for (const f of step.fields) {
          if (prev.overrides.has(f.field_name)) continue;
          const val = evalSyncDerivation(f.derive_expression, prev.draft);
          if (val !== undefined && val !== prev.draft[f.field_name]) {
            newDraft[f.field_name] = val;
            changed = true;
          }
        }
      }
      return changed ? { ...prev, draft: newDraft } : prev;
    });
  // Only re-run when the trigger fields actually change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceSource, postingDate, sortedSteps]);

  // ── Async derivation: vendor lookup ──────────────────────────────────────
  // Watches supplier_id; fetches company_code_supplier_profile to derive
  // currency_code, payment_term_id (UUID FK), and payment_method_id.
  //
  // master.supplier is a pure party master — currency/terms/method live on
  // master.company_code_supplier_profile (one row per supplier × company_code).
  // payment_term_id is the UUID FK added in 003_master/002_supplier_profile_payment_term_fk.sql.
  const supplierId = String(state.draft["supplier_id"] ?? "");

  useEffect(() => {
    if (!supplierId) {
      // Clear vendor-derived values when supplier is deselected
      setState((prev) => {
        const newDraft = { ...prev.draft };
        let changed = false;
        for (const key of ["currency_code", "payment_term_id", "payment_method_id"] as const) {
          if (!prev.overrides.has(key) && newDraft[key] != null) {
            newDraft[key] = null;
            changed = true;
          }
        }
        return changed ? { ...prev, draft: newDraft } : prev;
      });
      return;
    }

    let cancelled = false;

    // Fetch company_code_supplier_profile (supplier × company_code).
    // The list endpoint returns flat rows: { data: [{ currency_code, payment_term_id, payment_method_id, ... }] }
    // payment_term_id is the UUID FK column added in 01d_tables_payment_terms.sql PART E.
    const profileFilters = encodeURIComponent(JSON.stringify({ supplier_id: supplierId }));
    void fetch(`/api/relay/api/records/company_code_supplier_profile?filters=${profileFilters}&page_size=1`)
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: Record<string, unknown>[] }>) : Promise.reject()))
      .then(async (resp) => {
        if (cancelled) return;
        const profile = resp.data?.[0];
        if (!profile) return;

        // Resolve display names for UUID FK fields (avoid showing raw UUIDs in pickers/chips).
        let paymentTermName: string | null = null;
        let paymentMethodName: string | null = null;

        const ptId = profile["payment_term_id"] as string | null | undefined;
        const pmId = profile["payment_method_id"] as string | null | undefined;

        const [ptResp, pmResp] = await Promise.all([
          ptId && !cancelled
            ? fetch(`/api/relay/api/records/payment_term/${encodeURIComponent(ptId)}`)
                .then((r) => (r.ok ? (r.json() as Promise<{ data?: Record<string, unknown> }>) : null))
                .catch(() => null)
            : Promise.resolve(null),
          pmId && !cancelled
            ? fetch(`/api/relay/api/records/payment_method/${encodeURIComponent(pmId)}`)
                .then((r) => (r.ok ? (r.json() as Promise<{ data?: Record<string, unknown> }>) : null))
                .catch(() => null)
            : Promise.resolve(null),
        ]);

        if (!cancelled) {
          paymentTermName   = (ptResp?.data?.["name"] as string | null | undefined) ?? null;
          paymentMethodName = (pmResp?.data?.["name"] as string | null | undefined) ?? null;
        }

        if (cancelled) return;

        setState((prev) => {
          const newDraft = { ...prev.draft };
          let changed = false;

          const profileFields: Array<[string, string]> = [
            ["currency_code",    "currency_code"],
            ["payment_term_id",  "payment_term_id"],
            ["payment_method_id","payment_method_id"],
          ];

          for (const [profileKey, draftKey] of profileFields) {
            if (
              !prev.overrides.has(draftKey) &&
              profile[profileKey] != null &&
              newDraft[draftKey] !== profile[profileKey]
            ) {
              newDraft[draftKey] = profile[profileKey];
              changed = true;
            }
          }

          const newLabels = {
            ...prev.displayLabels,
            ...(paymentTermName   ? { payment_term_id:   paymentTermName   } : {}),
            ...(paymentMethodName ? { payment_method_id: paymentMethodName } : {}),
          };
          const labelsChanged = (
            newLabels.payment_term_id   !== prev.displayLabels.payment_term_id ||
            newLabels.payment_method_id !== prev.displayLabels.payment_method_id
          );

          return changed || labelsChanged
            ? { ...prev, draft: newDraft, displayLabels: newLabels }
            : prev;
        });
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  // ── Async derivation: company_code base currency ──────────────────────────
  // Watches company_code_id; fetches master.company_code to derive base_currency_code.
  // The DB column is `functional_currency` (char(3)) — the posting currency for the
  // accounting unit. All documents transacted in a company_code use this as their
  // base/functional currency.
  const companyCodeId = String(state.draft["company_code_id"] ?? "");

  useEffect(() => {
    const derived = companyDerivedFields(sortedSteps);
    if (derived.all.length === 0) return;

    if (!companyCodeId) {
      setState((prev) => {
        const newDraft = { ...prev.draft };
        const newLabels = { ...prev.displayLabels };
        let changed = false;
        let labelsChanged = false;

        for (const name of derived.all) {
          if (newDraft[name] != null) {
            newDraft[name] = null;
            changed = true;
          }
          if (name in newLabels) {
            delete newLabels[name];
            labelsChanged = true;
          }
        }

        return changed || labelsChanged
          ? { ...prev, draft: newDraft, displayLabels: newLabels }
          : prev;
      });
      return;
    }

    let cancelled = false;

    void fetchRecord("company_code", companyCodeId)
      .then(async (company) => {
        if (cancelled) return;
        if (!company) return;
        // Company currency fields can vary by seed/version, so normalize whichever one exists.
        const currency = companyCurrency(company);
        const ledgerBook = derived.book.length > 0
          ? await resolveCompanyLedgerBook(company, companyCodeId)
          : null;
        if (cancelled) return;

        setState((prev) => {
          const newDraft = { ...prev.draft };
          const newLabels = { ...prev.displayLabels };
          let changed = false;
          let labelsChanged = false;

          if (currency) {
            for (const name of derived.currency) {
              if (!prev.overrides.has(name) && newDraft[name] !== currency) {
                newDraft[name] = currency;
                changed = true;
              }
            }
          } else {
            for (const name of derived.currency) {
              if (!prev.overrides.has(name) && newDraft[name] != null) {
                newDraft[name] = null;
                changed = true;
              }
            }
          }

          if (ledgerBook) {
            for (const name of derived.book) {
              if (!prev.overrides.has(name) && newDraft[name] !== ledgerBook.id) {
                newDraft[name] = ledgerBook.id;
                changed = true;
              }
              if (newDraft[name] === ledgerBook.id && newLabels[name] !== ledgerBook.label) {
                newLabels[name] = ledgerBook.label;
                labelsChanged = true;
              }
            }
          } else {
            for (const name of derived.book) {
              if (!prev.overrides.has(name) && newDraft[name] != null) {
                newDraft[name] = null;
                changed = true;
              }
              if (name in newLabels) {
                delete newLabels[name];
                labelsChanged = true;
              }
            }
          }

          return changed || labelsChanged
            ? { ...prev, draft: newDraft, displayLabels: newLabels }
            : prev;
        });
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyCodeId, sortedSteps]);

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

  // Advance-rule readiness — only gate on fields that have a binding in this step.
  // If a binding is missing due to a seed/config issue, the user cannot fill the
  // field and must not be permanently blocked.
  const canAdvance = useMemo(() => {
    const boundFieldNames = new Set(currentStep.fields.map((f) => f.field_name));
    const required = (currentStep.advance_rule.required_fields ?? []).filter((fn) =>
      boundFieldNames.has(fn),
    );
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
            // Prefer a resolved display label (e.g. "Net 30 Days") over raw UUID
            displayValue: state.displayLabels[f.field_name] ?? String(value),
            summary_role: f.summary_role,
            is_override: state.overrides.has(f.field_name),
          });
        }
      }
    }
    return lines;
  }, [sortedSteps, state.draft, state.overrides, state.displayLabels]);

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

  const setDisplayLabel = useCallback((name: string, label: string | null) => {
    setState((prev) => {
      if (label === null) {
        if (!(name in prev.displayLabels)) return prev;
        const next = { ...prev.displayLabels };
        delete next[name];
        return { ...prev, displayLabels: next };
      }
      if (prev.displayLabels[name] === label) return prev;
      return { ...prev, displayLabels: { ...prev.displayLabels, [name]: label } };
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
    setDisplayLabel,
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
