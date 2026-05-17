"use client";

/**
 * FlowWizard — metadata-driven multi-step intake wizard.
 *
 * Layout (spec §1 two-region shell after Phase 3 migration):
 *
 *   Region 1 · EntityHeader  — type-chip + "New" + "Draft" + stepper + cancel
 *   Region 2 · Content       — [fields card | summary panel] 2-col grid + nav buttons
 *
 * Usage:
 *   <FlowWizard
 *     bundle={flowBundle}
 *     userPermissions={["ap.override_currency", ...]}
 *     onSubmit={async (draft) => { await createDocument(draft); }}
 *     onCancel={() => router.back()}
 *   />
 */

import React from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent, Skeleton } from "@athyper/ui/primitives";
import type { DocumentLine, FlowBundle } from "@athyper/api-contracts/documents";
import { EntityHeader } from "@athyper/entity-runtime/header";
import { FlowSummaryPanel } from "./FlowSummaryPanel";
import { FlowFieldBinding } from "./FlowFieldBinding";
import { useFlowEngine } from "./useFlowEngine";
import { mapFlowHeaderModel } from "./mapFlowHeaderModel";
import { isTruthy } from "./evaluateRule";
import { JournalIntakeLinesGrid, type JournalExchangeRateStatus } from "../items/JournalLinesGrid";
import { LinesGrid } from "../items/LinesGrid";

export interface FlowWizardProps {
  bundle: FlowBundle;
  userPermissions: string[];
  onSubmit: (draft: Record<string, unknown>) => void | Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
  entityLabel?: string;
  /** Entity code (e.g. "purchase_invoice") — makes the type chip a link to the list page. */
  entityCode?: string;
  /** User-context values seeded into derived fields (e.g. default_company_code). */
  userCtx?: Record<string, unknown>;
  /** Pre-populated field values (e.g. from a source document like an AP invoice). */
  initialValues?: Record<string, unknown>;
  /** Compact context rendered in the identity row beside status. */
  headerAction?: React.ReactNode;
  /** Compact action rendered immediately before the standard header actions. */
  headerLeadingAction?: React.ReactNode;
  /** Field names accepted before the wizard and shown elsewhere as locked context. */
  lockedFieldNames?: string[];
}

type IntakeFlowSection = {
  section_key: string;
  label?: string;
  section_type?: string;
  entity_code?: string | null;
  display_role?: string | null;
  payload_key?: string | null;
  min_rows?: number | null;
  visible_when?: unknown;
  default_row?: unknown;
  intake_fields?: unknown;
  display_config?: Record<string, unknown> | null;
};

const TEMP_PURCHASE_INVOICE_COMMERCIAL_HIDDEN_FIELDS = new Set([
  "payment_term_id",
  "baseline_date",
  "due_date",
  "discount_amount",
  "freight_amount",
  "misc_charges_amount",
  "withholding_tax_amount",
  "retention_amount",
]);

const TEMP_PURCHASE_INVOICE_COMMERCIAL_FX_FIELDS = new Set([
  "currency_code",
  "transaction_currency",
  "base_currency_code",
  "base_currency",
  "exchange_rate",
]);

function flowSections(step: unknown): IntakeFlowSection[] {
  const sections = (step as { sections?: unknown }).sections;
  return Array.isArray(sections) ? sections as IntakeFlowSection[] : [];
}

function sectionPayloadKey(section: IntakeFlowSection): string {
  return section.payload_key?.trim() || section.section_key;
}

function isJournalLineSection(section: IntakeFlowSection): boolean {
  return (
    section.section_type === "repeater" &&
    (section.entity_code === "journal_line" || (!section.entity_code && sectionPayloadKey(section) === "lines"))
  );
}

function isInvoiceLineSection(section: IntakeFlowSection): boolean {
  if (section.section_type !== "repeater") return false;
  // Explicit role takes precedence; fallback: any repeater whose entity_code is
  // set and is not a journal entity (journal lines use JournalIntakeLinesGrid).
  return (
    section.display_role === "procurement_line_intake" ||
    (!!section.entity_code && section.entity_code !== "journal_line")
  );
}

function normalizeDraftLines(value: unknown): DocumentLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter((line): line is DocumentLine =>
    typeof line === "object" && line !== null,
  );
}

export function FlowWizard({
  bundle,
  userPermissions,
  onSubmit,
  onCancel,
  submitting = false,
  entityLabel,
  entityCode,
  userCtx,
  initialValues,
  headerAction,
  headerLeadingAction,
  lockedFieldNames = [],
}: FlowWizardProps) {
  const engine = useFlowEngine(bundle, userPermissions, userCtx, initialValues);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [lineFxStatuses, setLineFxStatuses] = React.useState<Record<string, JournalExchangeRateStatus>>({});
  const {
    state,
    currentStep,
    visibleFields,
    canAdvance,
    isLastStep,
    summaryLines,
    summaryBalance,
    setField,
    setOverride,
    setDerivedValue,
    setDisplayLabel,
    goNext,
    goBack,
    validateStep,
  } = engine;

  const lockedFieldSet = React.useMemo(() => new Set(lockedFieldNames), [lockedFieldNames]);
  const normalizedEntityCode = entityCode?.replace(/-/g, "_");
  const currentStepKey = (currentStep as { step_key?: string }).step_key ?? "";
  const isTemporaryPurchaseInvoiceCommercialView =
    normalizedEntityCode === "purchase_invoice" &&
    currentStepKey.startsWith("commercial");
  const transactionCurrencyCode = String(state.draft.transaction_currency ?? state.draft.currency_code ?? "");
  const baseCurrencyCode = String(state.draft.base_currency_code ?? state.draft.base_currency ?? "");
  const hasForeignCurrency =
    transactionCurrencyCode.trim() !== "" &&
    baseCurrencyCode.trim() !== "" &&
    transactionCurrencyCode.toUpperCase() !== baseCurrencyCode.toUpperCase();
  const renderFields = visibleFields.filter((f) =>
    !lockedFieldSet.has(f.field_name) &&
    (!isTemporaryPurchaseInvoiceCommercialView || !TEMP_PURCHASE_INVOICE_COMMERCIAL_HIDDEN_FIELDS.has(f.field_name)) &&
    (!isTemporaryPurchaseInvoiceCommercialView || hasForeignCurrency || !TEMP_PURCHASE_INVOICE_COMMERCIAL_FX_FIELDS.has(f.field_name)),
  );
  const chipFields  = renderFields.filter((f) => f.mode === "chip");
  const gridFields  = renderFields.filter((f) => f.mode !== "chip");
  const sectionRuleCtx = React.useMemo(() => ({
    draft: state.draft,
    ctx:   { today: new Date().toISOString().slice(0, 10) },
    meta:  {},
  }), [state.draft]);
  const visibleSections = flowSections(currentStep).filter((section) =>
    isTruthy(section.visible_when ?? null, sectionRuleCtx),
  );
  const lineSections = visibleSections.filter(isJournalLineSection);
  const invoiceLineSections = visibleSections.filter(isInvoiceLineSection);
  const currentLineFxBlocking = lineSections.some((section) =>
    Boolean(lineFxStatuses[sectionPayloadKey(section)]?.blocking),
  );
  const currentInvoiceLineBlocking = invoiceLineSections.some((section) => {
    const payloadKey = sectionPayloadKey(section);
    const minRows = section.min_rows ?? 1;
    return Boolean(state.errors[payloadKey]) || normalizeDraftLines(state.draft[payloadKey]).length < minRows;
  });
  const currentLineBlocking = currentLineFxBlocking || currentInvoiceLineBlocking;
  const currencyCode = transactionCurrencyCode || baseCurrencyCode;
  // Defer summary panel until step 2+ so step 1 doesn't show a column of zeros.
  const showSummary =
    !isTemporaryPurchaseInvoiceCommercialView &&
    (summaryLines.length > 0 || summaryBalance) &&
    state.currentStepIndex > 0;

  const entityHeaderModel = mapFlowHeaderModel(bundle, state.currentStepIndex, {
    onCancel,
    submitting,
    entityTypeLabel: entityLabel,
    entityCode,
  });

  async function handleSubmit() {
    if (!validateStep()) return;
    if (currentLineBlocking) return;
    setSubmitError(null);
    try {
      await onSubmit(state.draft);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Region 1: EntityHeader (identity + stepper + cancel) */}
      <EntityHeader
        model={entityHeaderModel}
        onBack={onCancel}
        identitySlot={headerAction}
        actionLeadingSlot={headerLeadingAction}
      />

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Region 2: content card */}
      <div className="rounded-xl border border-border bg-card p-4">
        {/* 2-col: fields + summary panel */}
        <div
          className={cn(
            "grid gap-4",
            showSummary ? "grid-cols-1 lg:grid-cols-[1fr_280px]" : "grid-cols-1",
          )}
        >
          {/* Fields area */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardContent className="pt-5 space-y-4">
                {gridFields.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    {gridFields.map((f) => (
                      <FlowFieldBinding
                        key={f.id}
                        binding={f}
                        value={state.draft[f.field_name]}
                        displayLabel={state.displayLabels[f.field_name]}
                        error={state.errors[f.field_name]}
                        userPermissions={userPermissions}
                        isOverridden={state.overrides.has(f.field_name)}
                        draftCtx={state.draft}
                        onChange={(v) => setField(f.field_name, v)}
                        onOverride={(v) => setOverride(f.field_name, v)}
                        onReset={() => setDerivedValue(f.field_name, null)}
                        onDisplayLabel={(label) => setDisplayLabel(f.field_name, label)}
                      />
                    ))}
                  </div>
                )}

                {chipFields.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {chipFields.map((f) => (
                      <FlowFieldBinding
                        key={f.id}
                        binding={f}
                        value={state.draft[f.field_name]}
                        displayLabel={state.displayLabels[f.field_name]}
                        error={state.errors[f.field_name]}
                        userPermissions={userPermissions}
                        isOverridden={state.overrides.has(f.field_name)}
                        onChange={(v) => setField(f.field_name, v)}
                        onOverride={(v) => setOverride(f.field_name, v)}
                        onReset={() => setDerivedValue(f.field_name, null)}
                        onDisplayLabel={(label) => setDisplayLabel(f.field_name, label)}
                      />
                    ))}
                  </div>
                )}

                {lineSections.map((section) => {
                  const payloadKey = sectionPayloadKey(section);
                  return (
                    <JournalIntakeLinesGrid
                      key={section.section_key}
                      value={state.draft[payloadKey]}
                      error={state.errors[payloadKey]}
                      currencyCode={currencyCode}
                      transactionCurrencyCode={transactionCurrencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={state.draft.exchange_rate}
                      onExchangeRateChange={(value) => setField("exchange_rate", value)}
                      onExchangeRateStatusChange={(status) => {
                        setLineFxStatuses((prev) => ({ ...prev, [payloadKey]: status }));
                      }}
                      onTransactionCurrencyCodeChange={(value) => {
                        setOverride("transaction_currency", value);
                        if ("currency_code" in state.draft) setOverride("currency_code", value);
                        setField("exchange_rate", "");
                      }}
                      currencySelectorEditable
                      headerContext={state.draft}
                      lineEntityCode={section.entity_code?.trim()}
                      minRows={section.min_rows ?? 2}
                      onChange={(lines) => setField(payloadKey, lines)}
                    />
                  );
                })}

                {invoiceLineSections.map((section) => {
                  const payloadKey = sectionPayloadKey(section);
                  return (
                    <LinesGrid
                      key={section.section_key}
                      entityCode={normalizedEntityCode ?? entityCode ?? ""}
                      recordId="__draft__"
                      lineEntityCode={section.entity_code ?? undefined}
                      companyCodeId={String(state.draft.company_code_id ?? "")}
                      record={state.draft}
                      lines={normalizeDraftLines(state.draft[payloadKey])}
                      distributions={[]}
                      currencyCode={currencyCode}
                      editMode
                      draftMode
                      onDraftLinesChange={(lines) => setField(payloadKey, lines)}
                    />
                  );
                })}

                {gridFields.length === 0 && chipFields.length === 0 && lineSections.length === 0 && invoiceLineSections.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No fields in this step.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                disabled={state.currentStepIndex === 0 || submitting}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium",
                  "border border-border bg-background text-foreground",
                  "hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              <div className="flex items-center gap-2">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    Exit
                  </button>
                )}

                {isLastStep ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || currentLineBlocking}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold",
                      "bg-primary text-primary-foreground",
                      "hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    {submitting ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {submitting ? "Creating…" : "Create"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentLineBlocking) goNext();
                    }}
                    disabled={!canAdvance || submitting || currentLineBlocking}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-semibold",
                      "bg-primary text-primary-foreground",
                      "hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Summary panel — sticky right rail */}
          {showSummary && (
            <FlowSummaryPanel lines={summaryLines} balance={summaryBalance} currencyCode={currencyCode} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function FlowWizardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Header region */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-[26px] w-20 rounded-md" />
              <Skeleton className="h-7 w-12 rounded" />
              <Skeleton className="h-[22px] w-14 rounded" />
            </div>
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
      {/* Content region */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-card p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-9 w-20 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
