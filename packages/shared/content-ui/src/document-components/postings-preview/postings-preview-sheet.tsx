/**
 * @athyper/content-ui — PostingsPreviewSheet
 *
 * Spec v1.1 §4.5 — read-only GL-grouped aggregation across all lines
 * + header-level CR rows (AP payable, retention, withholding).
 *
 * Per §B6, every row annotates its state:
 *   • live      — computed from current AD + header
 *   • simulated — AD missing; resolution path will run at posting
 *   • frozen    — read from posted JE
 *
 * Per §A5 phase: pre-post hold = live read-only (this component just
 * reflects whatever `buildPostingsPreview` returns — caller decides
 * which model to pass).
 */
"use client";

import { ChevronRight, Lock, AlertTriangle, CheckCircle2, FileSearch } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { DrawerFormShell } from "@athyper/ui/surfaces/shells";
import { CurrencyTriad } from "../money/currency-triad";
import {
  buildPostingsPreview,
  type BuildPostingsPreviewInput,
  type PostingsPreviewModel,
  type PostingsPreviewRow,
  type PostingsPreviewStatus,
  type PostingsPreviewSource,
} from "./postings-preview-builder";

// ── Public types ──────────────────────────────────────────────────

export interface PostingsPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Either pass a pre-built model …
  model?: PostingsPreviewModel;
  // … or pass builder input and let the sheet build it.
  builderInput?: BuildPostingsPreviewInput;

  // Currency for display.
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;

  // Identity header.
  piCode: string;
  piSupplierLabel: string;

  /** Drill into the JE detail (post-post). */
  onOpenJournalEntry?: () => void;
  /** Drill from a row's source into the contributing PILs / PCs. */
  onDrillSource?: (source: PostingsPreviewSource, accountLabel: string) => void;
}

// ── Row annotation ────────────────────────────────────────────────

const STATUS_INTENT: Record<PostingsPreviewStatus, SemanticIntent> = {
  live:      "success",
  simulated: "warning",
  frozen:    "info",
};

const STATUS_LABEL: Record<PostingsPreviewStatus, string> = {
  live:      "live",
  simulated: "simulated",
  frozen:    "frozen",
};

function StatusChip({ status }: { status: PostingsPreviewStatus }) {
  const colors = resolveSemanticColors(STATUS_INTENT[status]);
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
      colors.subtleBadge,
    )}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function describeSource(source: PostingsPreviewSource): string {
  switch (source.kind) {
    case "ad_aggregation":
      return `from ${source.pil_count} ${source.pil_count === 1 ? "line" : "lines"}`;
    case "ad_unresolved":
      return `${source.pil_count} ${source.pil_count === 1 ? "line" : "lines"} pending resolution`;
    case "pc_tax_recoverable":
      return "from PC tax · recoverable";
    case "pc_tax_cost":
      return "from PC tax · non-recoverable";
    case "ap_payable_header":
      return "payable_amount (header)";
    case "ap_retention_payable_header":
      return "retention_amount (header)";
    case "withholding_payable_header":
      return "withholding_tax_amount (header)";
  }
}

// ── Row ────────────────────────────────────────────────────────────

function PreviewRow({
  row,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  onDrill,
}: {
  row: PostingsPreviewRow;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  onDrill?: () => void;
}) {
  return (
    <div className="grid grid-cols-[2.5rem_1fr_auto_auto_auto] gap-3 items-center px-3 py-2 text-sm border-b border-border/40 last:border-b-0">
      <div className="text-xs font-medium tabular-nums text-muted-foreground">{row.side}</div>
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="font-medium truncate">{row.account_label}</div>
        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
          <StatusChip status={row.status} />
          <span>{describeSource(row.source)}</span>
        </div>
      </div>
      <div className="tabular-nums text-right font-medium">
        <CurrencyTriad
          amount={row.amount}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
      </div>
      <div />
      <div>
        {onDrill && (
          <button
            type="button"
            onClick={onDrill}
            aria-label={`Drill into ${row.account_label}`}
            className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex items-center gap-1"
          >
            <FileSearch className="h-3 w-3" aria-hidden /> View
          </button>
        )}
      </div>
    </div>
  );
}

// ── Balance footer ─────────────────────────────────────────────────

function BalanceFooter({
  model,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  model: PostingsPreviewModel;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  if (model.balanced) {
    const colors = resolveSemanticColors("success");
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-muted/40">
        <div className="text-xs text-muted-foreground">
          DR{" "}
          <CurrencyTriad amount={model.total_dr} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
          {"  ·  "}CR{" "}
          <CurrencyTriad amount={model.total_cr} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
        </div>
        <div className={cn("inline-flex items-center gap-1 text-xs font-medium", colors.text)}>
          <CheckCircle2 className="h-3 w-3" aria-hidden /> Balanced
        </div>
      </div>
    );
  }
  const delta = Math.abs(model.total_dr - model.total_cr);
  const colors = resolveSemanticColors("error");
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-muted/40">
      <div className="text-xs text-muted-foreground">
        DR{" "}
        <CurrencyTriad amount={model.total_dr} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
        {"  ·  "}CR{" "}
        <CurrencyTriad amount={model.total_cr} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
      </div>
      <div className={cn("inline-flex items-center gap-1 text-xs font-medium", colors.text)}>
        <AlertTriangle className="h-3 w-3" aria-hidden /> Unbalanced by{" "}
        <CurrencyTriad amount={delta} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
      </div>
    </div>
  );
}

// ── Drift banner ──────────────────────────────────────────────────

function DriftBanner({
  model,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  model: PostingsPreviewModel;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  if (!model.drift) return null;
  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden />
      <div className="flex flex-col gap-1">
        <div className="font-medium">Drift detected (pre-P4 cache)</div>
        <div>
          Cached payable{" "}
          <CurrencyTriad amount={model.drift.cached_payable} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
          {" vs. computed "}
          <CurrencyTriad amount={model.drift.computed_payable} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
          {" · Δ "}
          <CurrencyTriad amount={model.drift.delta} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} signed />
        </div>
        <div className="text-muted-foreground italic">{model.drift.message}</div>
      </div>
    </div>
  );
}

// ── Posted-state header banner ────────────────────────────────────

function PostedBanner({
  model,
  onOpenJournalEntry,
}: {
  model: PostingsPreviewModel;
  onOpenJournalEntry?: () => void;
}) {
  if (!model.is_posted) return null;
  return (
    <div className="rounded-md border border-info/40 bg-info/5 p-3 text-xs flex items-start gap-2">
      <Lock className="h-4 w-4 text-info shrink-0 mt-0.5" aria-hidden />
      <div className="flex flex-col gap-1 flex-1">
        <div className="font-medium">Frozen at posting</div>
        <div className="text-muted-foreground">
          These postings are read from the posted journal entry.
        </div>
      </div>
      {model.journal_entry_code && onOpenJournalEntry && (
        <button
          type="button"
          onClick={onOpenJournalEntry}
          className="self-start inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-card"
        >
          {model.journal_entry_code}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export function PostingsPreviewSheet({
  open,
  onOpenChange,
  model: modelProp,
  builderInput,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  piCode,
  piSupplierLabel,
  onOpenJournalEntry,
  onDrillSource,
}: PostingsPreviewSheetProps) {
  const model: PostingsPreviewModel = modelProp ?? (builderInput ? buildPostingsPreview(builderInput) : {
    rows: [], total_dr: 0, total_cr: 0, balanced: true, drift: null,
    is_posted: false, journal_entry_code: null, journal_entry_date: null,
  });

  const title = "Postings Preview";
  const subtitle = `${piCode} · ${piSupplierLabel} · ${model.is_posted ? "frozen at posting" : "pending submit"}`;

  // Group DR rows together, then CR rows
  const drRows = model.rows.filter((r) => r.side === "DR");
  const crRows = model.rows.filter((r) => r.side === "CR");

  return (
    <DrawerFormShell
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      contextBadge="POSTINGS PREVIEW"
      title={title}
      subtitle={subtitle}
      secondaryAction={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
        >
          Close
        </button>
      }
      liveStatus={
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3" aria-hidden />
          Read-only · {model.is_posted ? "frozen at posting" : "preview only — recomputes at submit"}
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 overflow-y-auto">
        <PostedBanner model={model} onOpenJournalEntry={onOpenJournalEntry} />
        <DriftBanner
          model={model}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />

        {model.rows.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground italic text-center">
            No postings yet. Add lines or components to preview the journal entry.
          </div>
        ) : (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_auto_auto_auto] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border">
              <div>Side</div>
              <div>Account</div>
              <div className="text-right">Amount</div>
              <div />
              <div />
            </div>
            {drRows.map((row, idx) => (
              <PreviewRow
                key={`dr-${idx}`}
                row={row}
                currencyCode={currencyCode}
                baseCurrencyCode={baseCurrencyCode}
                exchangeRate={exchangeRate}
                onDrill={onDrillSource ? () => onDrillSource(row.source, row.account_label) : undefined}
              />
            ))}
            {drRows.length > 0 && crRows.length > 0 && (
              <div className="border-t-2 border-border" aria-hidden />
            )}
            {crRows.map((row, idx) => (
              <PreviewRow
                key={`cr-${idx}`}
                row={row}
                currencyCode={currencyCode}
                baseCurrencyCode={baseCurrencyCode}
                exchangeRate={exchangeRate}
                onDrill={onDrillSource ? () => onDrillSource(row.source, row.account_label) : undefined}
              />
            ))}
            <BalanceFooter
              model={model}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </div>
        )}
      </div>
    </DrawerFormShell>
  );
}
