"use client";

import React, { useState, useMemo } from "react";
import { Plus, Trash2, X, XCircle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { DocumentLine, AccountingDistribution } from "@athyper/api-contracts/documents";
import { fmtAmount } from "../_shared/format";

// ── Types ─────────────────────────────────────────────────────────────────────

type DistBasis = "PERCENT" | "AMOUNT" | "QUANTITY";

interface SplitRow {
  id: string | null;        // null = unsaved new row
  distribution_no: number;
  distribution_basis: DistBasis;
  split_pct: number | null;
  split_amount: number | null;
  account_source: string;
  account_code: string;
  cost_center_id: string;
  project_id: string;
  description: string;
  distributed_amount: number;
  currency_code: string;
  // dirty state
  _dirty: boolean;
  _isNew: boolean;
}

export interface SplitAccountingPanelProps {
  line: DocumentLine;
  distributions: AccountingDistribution[];
  currencyCode?: string;
  entityCode: string;
  recordId: string;
  /** Called when a distribution is created/updated/deleted so parent can invalidate */
  onMutated?: () => void;
  onClose?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtAmt = fmtAmount;

function distToRow(d: AccountingDistribution): SplitRow {
  return {
    id:                  d.id,
    distribution_no:     d.distribution_no,
    distribution_basis:  d.distribution_basis,
    split_pct:           d.split_pct,
    split_amount:        d.split_amount,
    account_source:      d.account_source,
    account_code:        d.account_code ?? "",
    cost_center_id:      d.cost_center_id ?? "",
    project_id:          d.project_id ?? "",
    description:         d.description ?? "",
    distributed_amount:  d.distributed_amount,
    currency_code:       d.currency_code,
    _dirty: false,
    _isNew: false,
  };
}

function newRow(lineAmount: number, currency: string, nextNo: number): SplitRow {
  return {
    id:                  null,
    distribution_no:     nextNo,
    distribution_basis:  "PERCENT",
    split_pct:           100,
    split_amount:        null,
    account_source:      "FROM_CATEGORY",
    account_code:        "",
    cost_center_id:      "",
    project_id:          "",
    description:         "",
    distributed_amount:  lineAmount,
    currency_code:       currency,
    _dirty: true,
    _isNew: true,
  };
}

// ── BASIS TOGGLE ──────────────────────────────────────────────────────────────

function BasisToggle({ value, onChange }: { value: DistBasis; onChange: (v: DistBasis) => void }) {
  const opts: DistBasis[] = ["PERCENT", "AMOUNT", "QUANTITY"];
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
      {opts.map((b) => (
        <button
          key={b}
          onClick={() => onChange(b)}
          className={cn(
            "px-3 py-1.5 transition-colors",
            value === b
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          {b === "PERCENT" ? "%" : b === "AMOUNT" ? "$" : "QTY"}
        </button>
      ))}
    </div>
  );
}

// ── INLINE INPUT ──────────────────────────────────────────────────────────────

function InlineInput({
  value,
  onChange,
  placeholder,
  type = "text",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full bg-transparent border-b border-border/60 focus:border-foreground outline-none text-sm py-0.5 transition-colors",
        "placeholder:text-muted-foreground/50",
        className,
      )}
    />
  );
}

// ── PANEL COMPONENT ───────────────────────────────────────────────────────────

export function SplitAccountingPanel({
  line,
  distributions,
  currencyCode,
  entityCode,
  recordId,
  onMutated,
  onClose,
}: SplitAccountingPanelProps) {
  const lineAmount = Number(line.line_amount) || 0;
  const cc = currencyCode ?? "USD";

  const [rows, setRows] = useState<SplitRow[]>(() => distributions.map(distToRow));
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [activeBasis, setActiveBasis] = useState<DistBasis>(
    distributions[0]?.distribution_basis ?? "PERCENT",
  );

  // Recalculate distributed_amount whenever basis or split value changes
  const computeDistributed = (row: SplitRow, basis: DistBasis): number => {
    if (basis === "PERCENT")  return lineAmount * ((row.split_pct ?? 0) / 100);
    if (basis === "AMOUNT")   return row.split_amount ?? 0;
    if (basis === "QUANTITY") return lineAmount; // qty allocation maps 1:1 to line amount by default
    return 0;
  };

  // Allocated total
  const allocatedTotal = useMemo(
    () => rows.reduce((s, r) => s + r.distributed_amount, 0),
    [rows],
  );
  const remaining = lineAmount - allocatedTotal;

  // ── Row mutation helpers ────────────────────────────────────────────────────

  function updateRow(idx: number, patch: Partial<SplitRow>) {
    setRows((prev) => {
      const next = [...prev];
      const updated = { ...next[idx]!, ...patch, _dirty: true };
      // Recompute distributed amount on basis/value change
      updated.distributed_amount = computeDistributed(updated, updated.distribution_basis);
      next[idx] = updated;
      return next;
    });
  }

  function addRow() {
    const nextNo = (rows[rows.length - 1]?.distribution_no ?? 0) + 1;
    setRows((prev) => [...prev, newRow(0, cc, nextNo)]);
  }

  async function saveRow(idx: number) {
    const row = rows[idx];
    if (!row || !row._dirty) return;
    const key = row.id ?? `new-${idx}`;
    setSaving((s) => ({ ...s, [key]: true }));
    setMutationError(null);

    try {
      const payload = {
        distribution_basis:  row.distribution_basis,
        split_pct:           row.distribution_basis === "PERCENT" ? row.split_pct : null,
        split_amount:        row.distribution_basis === "AMOUNT"  ? row.split_amount : null,
        distributed_amount:  row.distributed_amount,
        currency_code:       row.currency_code || cc,
        account_source:      row.account_source,
        account_code:        row.account_code || null,
        cost_center_id:      row.cost_center_id || null,
        project_id:          row.project_id || null,
        description:         row.description || null,
      };

      const isNew = row._isNew || !row.id;
      const url = isNew
        ? `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(line.id)}/distributions`
        : `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(line.id)}/distributions/${encodeURIComponent(row.id!)}`;

      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        setMutationError(errBody.error ?? `Save failed (${res.status})`);
        return;
      }

      const body = (await res.json()) as { data: AccountingDistribution };
      setRows((prev) => {
        const next = [...prev];
        next[idx] = distToRow(body.data);
        return next;
      });
      onMutated?.();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Network error — please retry");
    } finally {
      setSaving((s) => {
        const n = { ...s };
        delete n[key];
        return n;
      });
    }
  }

  async function deleteRow(idx: number) {
    const row = rows[idx];
    if (!row) return;

    if (row._isNew || !row.id) {
      setRows((prev) => prev.filter((_, i) => i !== idx));
      return;
    }

    const key = row.id;
    setSaving((s) => ({ ...s, [key]: true }));
    setMutationError(null);
    try {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(line.id)}/distributions/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        setMutationError(errBody.error ?? `Delete failed (${res.status})`);
        return;
      }
      setRows((prev) => prev.filter((_, i) => i !== idx));
      onMutated?.();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Network error — please retry");
    } finally {
      setSaving((s) => {
        const n = { ...s };
        delete n[key];
        return n;
      });
    }
  }

  const remainingColor = Math.abs(remaining) < 0.01
    ? "text-success"
    : remaining < 0
    ? "text-destructive"
    : "text-warning";

  return (
    <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Split Accounting
          </span>
          <span className="text-xs text-muted-foreground">
            Line {line.line_number}
            {line.description ? ` · ${line.description}` : ""}
          </span>
          <span className="text-xs font-mono text-foreground">
            {fmtAmt(lineAmount, cc)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <BasisToggle
            value={activeBasis}
            onChange={(b) => {
              setActiveBasis(b);
              setRows((prev) =>
                prev.map((r) => ({ ...r, distribution_basis: b, _dirty: true })),
              );
            }}
          />
          {onClose && (
            <button
              onClick={onClose}
              className="h-[26px] w-[26px] flex items-center justify-center rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Distribution rows */}
      <div className="space-y-1 mb-3">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 text-center">
            No splits yet — click Add Split to assign cost dimensions.
          </p>
        )}
        {rows.map((row, idx) => {
          const key = row.id ?? `new-${idx}`;
          const isSaving = !!saving[key];
          return (
            <div
              key={key}
              className={cn(
                "grid gap-2 items-center rounded-md px-2 py-1.5 transition-colors",
                "border border-transparent",
                row._dirty && !row._isNew && "border-warning/30 bg-warning/5",
                row._isNew && "border-dashed border-border/60",
              )}
              style={{ gridTemplateColumns: activeBasis === "PERCENT" ? "32px 64px 100px 100px 1fr 80px 28px" : "32px 100px 100px 100px 1fr 80px 28px" }}
            >
              {/* Dist # */}
              <span className="text-xs text-muted-foreground tabular-nums text-center">
                {row.distribution_no}
              </span>

              {/* Split value — pct or amount */}
              {activeBasis === "PERCENT" ? (
                <div className="flex items-center gap-0.5">
                  <InlineInput
                    type="number"
                    value={String(row.split_pct ?? "")}
                    onChange={(v) => updateRow(idx, { split_pct: Number(v) || 0 })}
                    placeholder="0"
                    className="text-right w-12"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              ) : (
                <InlineInput
                  type="number"
                  value={String(row.split_amount ?? "")}
                  onChange={(v) => updateRow(idx, { split_amount: Number(v) || 0 })}
                  placeholder="0.00"
                  className="text-right"
                />
              )}

              {/* Cost Center */}
              <InlineInput
                value={row.cost_center_id}
                onChange={(v) => updateRow(idx, { cost_center_id: v })}
                placeholder="Cost Centre"
              />

              {/* Project */}
              <InlineInput
                value={row.project_id}
                onChange={(v) => updateRow(idx, { project_id: v })}
                placeholder="Project"
              />

              {/* Description */}
              <InlineInput
                value={row.description}
                onChange={(v) => updateRow(idx, { description: v })}
                placeholder="Note"
              />

              {/* Computed amount */}
              <span className="text-xs tabular-nums font-medium text-right pr-1">
                {fmtAmt(row.distributed_amount)}
              </span>

              {/* Actions: save + delete */}
              <div className="flex items-center gap-0.5">
                {row._dirty && (
                  <button
                    onClick={() => void saveRow(idx)}
                    disabled={isSaving}
                    className="h-5 px-1.5 text-2xs font-semibold rounded bg-foreground text-background hover:opacity-85 disabled:opacity-40 transition-opacity"
                  >
                    {isSaving ? "…" : "Save"}
                  </button>
                )}
                <button
                  onClick={() => void deleteRow(idx)}
                  disabled={isSaving}
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mutation error banner */}
      {mutationError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 min-w-0">{mutationError}</span>
          <button onClick={() => setMutationError(null)} className="shrink-0 hover:opacity-70 transition-opacity" aria-label="Dismiss error">
            <XCircle className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Footer: add + remaining indicator */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <button
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Split
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Remaining:</span>
          <span className={cn("font-semibold tabular-nums", remainingColor)}>
            {fmtAmt(remaining, cc)}
          </span>
        </div>
      </div>
    </div>
  );
}
