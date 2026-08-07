"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import {
  AssetPicker,
  DimensionPicker,
  GlAccountPicker,
  ReasonCodePicker,
} from "@athyper/runtime-shared/entity-search";
import { AccountingDistributionEditor, AccountingSplitRowEditor } from "@athyper/runtime-shared/accounting-ui";
import { DrawerFormShell } from "@athyper/platform-ui/surfaces/shells";
import { MoneySummaryStrip } from "../pricing-components/money-summary-strip";
import { BODY_SM_MEDIUM, LABEL_SM, META_SM } from "@athyper/platform-ui/typography";
import { ErrorList } from "../pricing-components/drawers/_shared";
import type { AccountingDistribution } from "../../purchase-invoice/types";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";

export type AccountingDistributionDrawerMode = "single" | "split";

export interface AccountingDistributionDraft {
  distribution_basis: "PERCENT";
  split_pct: 100;
  gl_account_id: string | null | undefined;
  cost_center_id: string | null;
  profit_center_id: string | null;
  project_id: string | null;
  asset_id: string | null;
  description: string | null;
  reason_code?: string;
}

export type AccountingDistributionSplitBasis = "PERCENT" | "AMOUNT" | "QUANTITY";

export interface AccountingDistributionSplitDraft {
  distribution_basis: AccountingDistributionSplitBasis;
  split_pct?: number | null;
  split_amount?: number | null;
  split_quantity?: number | null;
  gl_account_id: string | null;
  cost_center_id: string | null;
  profit_center_id: string | null;
  project_id: string | null;
  asset_id: string | null;
  description: string | null;
  reason_code?: string;
}

export interface AccountingDistributionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AccountingDistribution | null;
  distributions?: AccountingDistribution[];
  documentRecord: Record<string, unknown> | null;
  lineRecord: Record<string, unknown> | null;
  lineGrossAmount: number;
  /** Authoritative accounting cost basis. Prefer this over lineGrossAmount. */
  distributionTargetAmount?: number;
  distributionTargetLabel?: string;
  lineCurrencyCode: string;
  lineSiteLabel?: string | null;
  onSubmit: (draft: AccountingDistributionDraft) => Promise<void> | void;
  onReplaceDistributions?: (drafts: AccountingDistributionSplitDraft[]) => Promise<void> | void;
  /** Selected lines available as the source template in mass-edit mode. */
  templateOptions?: ReadonlyArray<{ id: string; label: string }>;
  templateLineId?: string;
  onTemplateLineChange?: (lineId: string) => void;
  /** Number of lines receiving the edited template. Values above one enable mass-edit copy. */
  applyCount?: number;
  /** Compiled accounting_distribution metadata drives every reference picker. */
  compiledEntity?: CompiledEntity | null;
  /** Inspect existing distributions without exposing mutation controls. */
  readOnly?: boolean;
}

interface SplitEditorRow {
  key: string;
  value: string;
  glAccountId: string | null;
  glAccountLabel: string | null;
  costCenterId: string | null;
  costCenterLabel: string | null;
  profitCenterId: string | null;
  profitCenterLabel: string | null;
  projectId: string | null;
  projectLabel: string | null;
  assetId: string | null;
  assetLabel: string | null;
  description: string;
  reasonCode: string;
}

export function AccountingDistributionDrawer({
  open,
  onOpenChange,
  editing,
  distributions = [],
  documentRecord,
  lineRecord,
  lineGrossAmount,
  distributionTargetAmount,
  distributionTargetLabel = "Distributable cost",
  lineCurrencyCode,
  onSubmit,
  onReplaceDistributions,
  templateOptions = [],
  templateLineId,
  onTemplateLineChange,
  applyCount = 1,
  compiledEntity,
  readOnly = false,
}: AccountingDistributionDrawerProps) {
  const isMassEdit = applyCount > 1;
  const glAccountField = compiledEntity?.fields.find((field) => field.name === "gl_account_id") ?? null;
  const costCenterField = compiledEntity?.fields.find((field) => field.name === "cost_center_id") ?? null;
  const profitCenterField = compiledEntity?.fields.find((field) => field.name === "profit_center_id") ?? null;
  const projectField = compiledEntity?.fields.find((field) => field.name === "project_id") ?? null;
  const assetField = compiledEntity?.fields.find((field) => field.name === "asset_id") ?? null;
  const targetAmount = distributionTargetAmount ?? lineGrossAmount;
  const [mode, setMode] = useState<AccountingDistributionDrawerMode>("single");
  const lineHasAssetClass = useMemo(() => {
    const data = lineRecord?.["data"];
    const nested = data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)["asset_class_id"]
      : null;
    const value = lineRecord?.["asset_class_id"] ?? nested;
    return typeof value === "string" && value.trim().length > 0;
  }, [lineRecord]);
  const lineRecordData = lineRecord?.["data"];
  const lineRecordDataMap = lineRecordData && typeof lineRecordData === "object" && !Array.isArray(lineRecordData)
    ? lineRecordData as Record<string, unknown>
    : null;
  const assetClassLabel = typeof (lineRecord?.["asset_class_id_label"] ?? lineRecordDataMap?.["asset_class_id_label"]) === "string"
    ? String(lineRecord?.["asset_class_id_label"] ?? lineRecordDataMap?.["asset_class_id_label"])
    : null;

  const [glAccountId, setGlAccountId] = useState<string | null>(null);
  const [glAccountLabel, setGlAccountLabel] = useState<string | null>(null);
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [costCenterLabel, setCostCenterLabel] = useState<string | null>(null);
  const [profitCenterId, setProfitCenterId] = useState<string | null>(null);
  const [profitCenterLabel, setProfitCenterLabel] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [assetLabel, setAssetLabel] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [reasonCode, setReasonCode] = useState("manual_account_override");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [splitBasis, setSplitBasis] = useState<AccountingDistributionSplitBasis>("PERCENT");
  const [splitRows, setSplitRows] = useState<SplitEditorRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setGlAccountId(editing?.gl_account_id ?? null);
    setGlAccountLabel(editing?.gl_account_label ?? null);
    setCostCenterId(editing?.cost_center_id ?? null);
    setCostCenterLabel(editing?.cost_center_label ?? null);
    setProfitCenterId(editing?.profit_center_id ?? null);
    setProfitCenterLabel(editing?.profit_center_label ?? null);
    setProjectId(editing?.project_id ?? null);
    setProjectLabel(editing?.project_label ?? null);
    setAssetId(editing?.asset_id ?? null);
    setAssetLabel(null);
    setDescription("");
    setReasonCode("manual_account_override");
    setErrors([]);
    setMode("single");

    const existing = distributions.length > 0 ? distributions : (editing ? [editing] : []);
    setSplitRows(existing.length > 0
      ? existing.map((row) => splitEditorRowFromDistribution(row))
      : [createEmptySplitRow(100)]
    );
    setSplitBasis(existing[0]?.distribution_basis ?? "PERCENT");
  }, [open, editing, distributions]);

  const glAccountChanged = glAccountId !== (editing?.gl_account_id ?? null);

  async function handleSubmit() {
    if (readOnly) return;
    if (mode === "split") {
      const messages = validateSplitRows(splitRows, splitBasis, targetAmount, lineRecord, Boolean(onReplaceDistributions));
      if (messages.length) {
        setErrors(messages);
        return;
      }
      setSubmitting(true);
      try {
        await onReplaceDistributions?.(splitRows.map((row): AccountingDistributionSplitDraft => {
          const value = Number(row.value);
          return {
            distribution_basis: splitBasis,
            split_pct:      splitBasis === "PERCENT" ? value : null,
            split_amount:   splitBasis === "AMOUNT" ? value : null,
            split_quantity: splitBasis === "QUANTITY" ? value : null,
            gl_account_id:  row.glAccountId,
            cost_center_id: row.costCenterId,
            profit_center_id: row.profitCenterId,
            project_id:     row.projectId,
            asset_id:       lineHasAssetClass ? row.assetId : null,
            description:    row.description.trim() || null,
            reason_code:    row.reasonCode || "manual_account_override",
          };
        }));
        onOpenChange(false);
      } catch (err) {
        setErrors([err instanceof Error ? err.message : String(err)]);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!glAccountId) {
      setErrors(["Pick a GL account before applying - distribution rows are unresolved without one."]);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        distribution_basis: "PERCENT",
        split_pct: 100,
        gl_account_id: glAccountChanged ? glAccountId : undefined,
        cost_center_id: costCenterId,
        profit_center_id: profitCenterId,
        project_id: projectId,
        asset_id: lineHasAssetClass ? assetId : null,
        description: description.trim() || null,
        ...(glAccountChanged ? { reason_code: reasonCode } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSubmitting(false);
    }
  }

  function updateSplitRow(key: string, patch: Partial<SplitEditorRow>) {
    setSplitRows((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  function addSplitRow() {
    setSplitRows((rows) => [...rows, createEmptySplitRow("")]);
  }

  function removeSplitRow(key: string) {
    setSplitRows((rows) => rows.length <= 1 ? rows : rows.filter((row) => row.key !== key));
  }

  function rebalanceSplitRows() {
    if (!splitRows.length) return;
    const target = splitBasis === "PERCENT"
      ? 100
      : splitBasis === "AMOUNT"
        ? targetAmount
        : readNumber(lineRecord?.["quantity"]) ?? 0;
    const each = round4(target / splitRows.length);
    const last = round4(target - each * (splitRows.length - 1));
    setSplitRows((rows) => rows.map((row, index) => ({
      ...row,
      value: String(index === rows.length - 1 ? last : each),
    })));
  }

  return (
    <DrawerFormShell
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      defaultWidth="70vw"
      widthKey="document:accounting-distribution:drawer:70vw"
      contextBadge="Accounting distribution"
      title={readOnly ? "View accounting" : isMassEdit ? "Mass Edit Accounting" : editing ? `Edit distribution #${editing.distribution_no}` : "Add distribution"}
      subtitle={isMassEdit
        ? `Use one selected line as the template and apply its accounting setup to ${applyCount} lines.`
        : readOnly ? "Review the accounting distribution and dimensions for this line."
        : editing ? "Adjust the dimensions and GL account for this split." : "Pick the dimensions and GL account that will receive 100% of this line."}
      liveStatus={mode === "split" ? (
        <span className="text-sm font-normal tabular-nums text-muted-foreground">
          {formatSplitTotal(splitRows, splitBasis)} / {formatSplitTarget(splitBasis, targetAmount, lineRecord, lineCurrencyCode)}
        </span>
      ) : (
        <MoneySummaryStrip metrics={[{
          label: distributionTargetLabel,
          amount: targetAmount,
          currencyCode: lineCurrencyCode,
          emphasized: true,
        }]} />
      )}
      secondaryAction={(
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
          className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          {readOnly ? "Close" : "Cancel"}
        </button>
      )}
      primaryAction={readOnly ? undefined : (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || (mode === "split" && !onReplaceDistributions)}
          className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        >
          {submitting ? "Applying..." : isMassEdit ? `Apply to ${applyCount} lines` : "Apply now"}
        </button>
      )}
    >
      {isMassEdit && templateOptions.length > 0 ? (
        <div className="mb-4 rounded-lg border border-border bg-muted/20 p-4">
          <label className={cn("mb-1.5 block", LABEL_SM)} htmlFor="accounting-template-line">
            Template line
          </label>
          <select
            id="accounting-template-line"
            value={templateLineId ?? templateOptions[0]?.id ?? ""}
            onChange={(event) => onTemplateLineChange?.(event.target.value)}
            disabled={submitting}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {templateOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <p className={cn("mt-1.5", META_SM)}>
            Edit this template below. Saving replaces the accounting distribution on every selected line.
          </p>
        </div>
      ) : null}
      <div inert={readOnly ? true : undefined} className={cn(readOnly && "select-text") }>
      <AccountingDistributionEditor<AccountingDistributionSplitBasis>
        mode={mode}
        onModeChange={setMode}
        basis={splitBasis}
        basisOptions={[
          { value: "PERCENT", label: "Percent" },
          { value: "AMOUNT", label: "Amount" },
          { value: "QUANTITY", label: "Quantity" },
        ]}
        onBasisChange={(next) => {
          setSplitBasis(next);
          setSplitRows((rows) => rows.map((row) => ({ ...row, value: "" })));
        }}
        rebalanceAction={(
          <button
            type="button"
            onClick={rebalanceSplitRows}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            Rebalance
          </button>
        )}
        allocation={{
          percent: splitAllocationPct(splitRows, splitBasis, targetAmount, lineRecord),
          isComplete: splitAllocationPct(splitRows, splitBasis, targetAmount, lineRecord) >= 99.995,
          totalLabel: formatSplitTotal(splitRows, splitBasis),
          targetLabel: formatSplitTarget(splitBasis, targetAmount, lineRecord, lineCurrencyCode),
        }}
        addSplitAction={addSplitRow}
      >
        {mode === "single" ? (
        <>
          <FieldBlock label="GL Account" required hint="Picking a GL marks this split as a manual override; posting will keep your choice.">
            <GlAccountPicker
              field={glAccountField}
              valueKind="id"
              value={glAccountId}
              displayLabel={glAccountLabel}
              onChange={(id, label) => { setGlAccountId(id); setGlAccountLabel(label); }}
              formData={documentRecord ?? null}
              placeholder="Search GL account..."
            />
          </FieldBlock>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldBlock label="Cost Centre">
              <DimensionPicker
                field={costCenterField}
                entityCode="cost_center"
                value={costCenterId}
                displayLabel={costCenterLabel}
                onChange={(id, label) => { setCostCenterId(id); setCostCenterLabel(label); }}
                formData={lineRecord ?? documentRecord ?? null}
                placeholder="Search cost centre..."
              />
            </FieldBlock>
            <FieldBlock label="Project">
              <DimensionPicker
                field={projectField}
                entityCode="project"
                value={projectId}
                displayLabel={projectLabel}
                onChange={(id, label) => { setProjectId(id); setProjectLabel(label); }}
                formData={lineRecord ?? documentRecord ?? null}
                placeholder="Search project..."
              />
            </FieldBlock>
            <FieldBlock label="Profit Centre">
              <DimensionPicker
                field={profitCenterField}
                entityCode="profit_center"
                value={profitCenterId}
                displayLabel={profitCenterLabel}
                onChange={(id, label) => { setProfitCenterId(id); setProfitCenterLabel(label); }}
                formData={lineRecord ?? documentRecord ?? null}
                placeholder="Search profit centre..."
              />
            </FieldBlock>
            <FieldBlock label="Asset">
              <AssetField
                field={assetField}
                enabled={lineHasAssetClass}
                value={assetId}
                displayLabel={assetLabel}
                onChange={(id, label) => { setAssetId(id); setAssetLabel(label); }}
                formData={lineRecord ?? null}
                assetClassLabel={assetClassLabel}
              />
            </FieldBlock>
          </div>

          {glAccountChanged && (
            <ReasonCodePicker
              category="accounting"
              value={reasonCode}
              onChange={(code) => { if (code) setReasonCode(code); }}
              required
            />
          )}

          <FieldBlock label="Description">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional distribution note"
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </FieldBlock>

          <ErrorList messages={errors} />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {splitRows.map((row, index) => (
              <AccountingSplitRowEditor
                key={row.key}
                title={`Split ${index + 1}`}
                splitLabel={splitValueLabel(splitBasis)}
                deleteAction={(
                  <button
                    type="button"
                    onClick={() => removeSplitRow(row.key)}
                    disabled={splitRows.length <= 1}
                    title="Remove split"
                    aria-label="Remove split"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
                glAccount={(
                  <GlAccountPicker
                    field={glAccountField}
                    valueKind="id"
                    value={row.glAccountId}
                    displayLabel={row.glAccountLabel}
                    onChange={(id, label) => updateSplitRow(row.key, { glAccountId: id, glAccountLabel: label })}
                    formData={documentRecord ?? null}
                    placeholder="Search GL account..."
                  />
                )}
                splitValue={(
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={row.value}
                    onChange={(e) => updateSplitRow(row.key, { value: e.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
                distributed={(
                  <div className={cn("flex h-9 items-center justify-end rounded-md border border-border bg-muted/30 px-3 tabular-nums", BODY_SM_MEDIUM)}>
                    {formatMoney(distributedAmountForSplitRow(row, splitBasis, targetAmount, lineRecord), lineCurrencyCode)}
                  </div>
                )}
                costCenter={(
                  <DimensionPicker
                    field={costCenterField}
                    entityCode="cost_center"
                    value={row.costCenterId}
                    displayLabel={row.costCenterLabel}
                    onChange={(id, label) => updateSplitRow(row.key, { costCenterId: id, costCenterLabel: label })}
                    formData={lineRecord ?? documentRecord ?? null}
                    placeholder="Search cost centre..."
                  />
                )}
                project={(
                  <DimensionPicker
                    field={projectField}
                    entityCode="project"
                    value={row.projectId}
                    displayLabel={row.projectLabel}
                    onChange={(id, label) => updateSplitRow(row.key, { projectId: id, projectLabel: label })}
                    formData={lineRecord ?? documentRecord ?? null}
                    placeholder="Search project..."
                  />
                )}
                profitCenter={(
                  <DimensionPicker
                    field={profitCenterField}
                    entityCode="profit_center"
                    value={row.profitCenterId}
                    displayLabel={row.profitCenterLabel}
                    onChange={(id, label) => updateSplitRow(row.key, { profitCenterId: id, profitCenterLabel: label })}
                    formData={lineRecord ?? documentRecord ?? null}
                    placeholder="Search profit centre..."
                  />
                )}
                asset={(
                  <AssetField
                    field={assetField}
                    enabled={lineHasAssetClass}
                    value={row.assetId}
                    displayLabel={row.assetLabel}
                    onChange={(id, label) => updateSplitRow(row.key, { assetId: id, assetLabel: label })}
                    formData={lineRecord ?? null}
                    assetClassLabel={assetClassLabel}
                  />
                )}
                description={(
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) => updateSplitRow(row.key, { description: e.target.value })}
                    placeholder="Optional distribution note"
                    className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              />
            ))}
          </div>

          <ErrorList messages={errors} />
        </>
      )}
      </AccountingDistributionEditor>
      </div>
    </DrawerFormShell>
  );
}

function FieldBlock({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={LABEL_SM}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </div>
      {children}
      {hint && <span className={META_SM}>{hint}</span>}
    </div>
  );
}

function AssetField({
  field,
  enabled,
  value,
  displayLabel,
  onChange,
  formData,
  assetClassLabel,
}: {
  field: EntityField | null;
  enabled: boolean;
  value: string | null;
  displayLabel: string | null;
  onChange: (id: string | null, label: string | null) => void;
  formData: Record<string, unknown> | null;
  assetClassLabel: string | null;
}) {
  if (!enabled) {
    return (
      <div className={cn("flex h-9 items-center rounded-md border border-border bg-muted/30 px-3", META_SM)}>
        No asset on line
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {assetClassLabel && (
        <div className={META_SM}>Asset class: {assetClassLabel}</div>
      )}
      <AssetPicker
        field={field}
        value={value}
        displayLabel={displayLabel}
        onChange={onChange}
        formData={formData}
        placeholder="Search asset..."
      />
    </div>
  );
}

function createEmptySplitRow(value: number | string): SplitEditorRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    value: String(value),
    glAccountId: null,
    glAccountLabel: null,
    costCenterId: null,
    costCenterLabel: null,
    profitCenterId: null,
    profitCenterLabel: null,
    projectId: null,
    projectLabel: null,
    assetId: null,
    assetLabel: null,
    description: "",
    reasonCode: "manual_account_override",
  };
}

function splitEditorRowFromDistribution(row: AccountingDistribution): SplitEditorRow {
  const basisValue = row.distribution_basis === "AMOUNT"
    ? row.split_amount
    : row.distribution_basis === "QUANTITY"
      ? row.split_quantity
      : row.split_pct;
  return {
    ...createEmptySplitRow(basisValue ?? ""),
    glAccountId: row.gl_account_id,
    glAccountLabel: row.gl_account_label,
    costCenterId: row.cost_center_id,
    costCenterLabel: row.cost_center_label,
    profitCenterId: row.profit_center_id,
    profitCenterLabel: row.profit_center_label,
    projectId: row.project_id,
    projectLabel: row.project_label,
    assetId: row.asset_id,
  };
}

function validateSplitRows(
  rows: SplitEditorRow[],
  basis: AccountingDistributionSplitBasis,
  lineGrossAmount: number,
  lineRecord: Record<string, unknown> | null,
  canReplace: boolean,
): string[] {
  const messages: string[] = [];
  if (!canReplace) messages.push("Split save is not available in this context.");
  if (!rows.length) return [...messages, "Add at least one split row."];

  let total = 0;
  rows.forEach((row, index) => {
    const value = Number(row.value);
    if (!Number.isFinite(value) || value <= 0) {
      messages.push(`Split ${index + 1} needs a positive ${basisLabel(basis).toLowerCase()} value.`);
    } else {
      total += value;
    }
    if (!row.glAccountId) messages.push(`Split ${index + 1} needs a GL account.`);
  });

  const expected = basis === "PERCENT"
    ? 100
    : basis === "AMOUNT"
      ? lineGrossAmount
      : readNumber(lineRecord?.["quantity"]) ?? 0;
  if (Math.abs(round4(total) - round4(expected)) > 0.005) {
    messages.push(`${basisLabel(basis)} total must equal ${round4(expected)}; current total is ${round4(total)}.`);
  }
  return messages;
}

function basisLabel(basis: AccountingDistributionSplitBasis): string {
  if (basis === "AMOUNT") return "Amount";
  if (basis === "QUANTITY") return "Quantity";
  return "Percent";
}

function splitValueLabel(basis: AccountingDistributionSplitBasis): string {
  if (basis === "AMOUNT") return "Split Amount";
  if (basis === "QUANTITY") return "Split Quantity";
  return "Split %";
}

function distributedAmountForSplitRow(
  row: SplitEditorRow,
  basis: AccountingDistributionSplitBasis,
  lineGrossAmount: number,
  lineRecord: Record<string, unknown> | null,
): number {
  const value = Number(row.value);
  if (!Number.isFinite(value)) return 0;
  if (basis === "AMOUNT") return value;
  if (basis === "QUANTITY") {
    const quantity = readNumber(lineRecord?.["quantity"]) ?? 0;
    return quantity > 0 ? lineGrossAmount * (value / quantity) : 0;
  }
  return lineGrossAmount * (value / 100);
}

function formatSplitTotal(rows: SplitEditorRow[], basis: AccountingDistributionSplitBasis): string {
  const total = rows.reduce((sum, row) => {
    const value = Number(row.value);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  if (basis === "PERCENT") return `${round4(total).toFixed(2)}%`;
  return String(round4(total));
}

function formatSplitTarget(
  basis: AccountingDistributionSplitBasis,
  lineGrossAmount: number,
  lineRecord: Record<string, unknown> | null,
  currencyCode: string,
): string {
  if (basis === "PERCENT") return "100.00%";
  if (basis === "AMOUNT") return formatMoney(lineGrossAmount, currencyCode);
  return String(round4(readNumber(lineRecord?.["quantity"]) ?? 0));
}

function splitAllocationPct(
  rows: SplitEditorRow[],
  basis: AccountingDistributionSplitBasis,
  lineGrossAmount: number,
  lineRecord: Record<string, unknown> | null,
): number {
  const total = rows.reduce((sum, row) => {
    const value = Number(row.value);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const target = basis === "PERCENT"
    ? 100
    : basis === "AMOUNT"
      ? lineGrossAmount
      : readNumber(lineRecord?.["quantity"]) ?? 0;
  return target > 0 ? Math.max(0, (total / target) * 100) : 0;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000) / 10_000;
}

function formatMoney(value: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode}`;
  }
}
