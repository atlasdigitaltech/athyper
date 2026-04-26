"use client";

/**
 * LinesGrid — invoice line grid with full spec v2.1 interaction model.
 *
 * Three interaction layers (per spec §2):
 *   Row layer   — ⋯ overflow menu, body-click to drawer, Allocated-To cell states
 *   Bulk layer  — multi-select checkboxes → inverted bulk bar (Edit/Allocation/Rows)
 *   Page layer  — state-summary toolbar with filter pills + page-level action buttons
 *
 * Financial footer always shows Net · Tax · WHT · Gross (spec §7 decision #22).
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { cn } from "@athyper/theme/utils";
import { Skeleton } from "@athyper/ui/primitives";
import {
  MoreHorizontal, SplitSquareHorizontal, Check, AlertTriangle, XCircle,
  Trash2, Copy, ChevronDown, ExternalLink, Plus, Minus, FileText,
  Pencil, Upload, Download,
} from "lucide-react";
import type { DocumentLine, AccountingDistribution } from "@athyper/api-contracts/documents";
import { relayMutate } from "@athyper/runtime-shared/client";
import { LineEditorSheet } from "./LineEditorSheet";
import { ClassificationStatusBadge } from "./ClassificationDecisionPanel";
import { LineComposerSheet } from "./LineComposerSheet";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveFilter = "split" | "unmatched" | "exception" | null;
type TabId = "details" | "accounting" | "classify" | "discount" | "charges" | "tax" | "retention";
type MatchState = "matched" | "exception" | "unmatched" | "na";

export interface LinesGridProps {
  entityCode:     string;
  recordId:       string;
  currencyCode?:  string;
  companyCodeId?: string;
  /** Full document header record — forwarded to LineEditorSheet for cost-centre auto-derive. */
  record?:        Record<string, unknown>;
  lines:          DocumentLine[];
  distributions:  AccountingDistribution[];
  isLoading?:     boolean;
  /** Called after any mutation; parent should invalidate/refetch lines + distributions. */
  onRefresh?:     () => void;
  /** Driven by CompiledEntity.feature_flags.has_ai_classification. Enables ClassificationDecisionPanel in LineEditorSheet. */
  hasAiClassification?: boolean;
  /** Driven by CompiledEntity.feature_flags.has_ai_classification. Uses LineComposerSheet for full-intake line adding. */
  hasLineComposer?: boolean;
  /** AI suggest endpoint base, e.g. from display_config. Passed through to LineComposerSheet. */
  suggestEndpointBase?: string;
  /** AI classify endpoint base, e.g. from display_config. Passed through to LineComposerSheet and LineEditorSheet. */
  classifyEndpointBase?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(v: unknown, dec = 2): string {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtAmtFull(v: number, cc: string): string {
  return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} ${cc}`;
}

function getMatchState(line: DocumentLine): MatchState {
  const ms = String(line.data?.match_status ?? line.data?.matching_status ?? "").toUpperCase();
  if (ms === "MATCHED" || ms === "FULLY_MATCHED") return "matched";
  if (ms.includes("EXCEPTION") || ms.includes("VARIANCE")) return "exception";
  if (ms === "UNMATCHED") return "unmatched";
  return "na";
}

function isNonPO(line: DocumentLine): boolean {
  const pt = String(line.data?.procurement_type ?? "").toUpperCase();
  return !pt || pt === "NON_PO";
}

// ── Checkboxes ────────────────────────────────────────────────────────────────

function MasterCheckbox({
  state,
  onClick,
  ariaLabel,
}: {
  state: "all" | "partial" | "none";
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-checked={state === "all" ? true : state === "partial" ? "mixed" : false}
      className={cn(
        "w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors flex-shrink-0",
        state === "none" ? "border-border/70 bg-background" : "bg-foreground border-foreground",
      )}
    >
      {state === "all"     && <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />}
      {state === "partial" && <Minus className="h-2.5 w-2.5 text-background" strokeWidth={3} />}
    </button>
  );
}

function RowCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border flex-shrink-0 transition-colors",
        checked ? "bg-foreground border-foreground" : "border-border/70 bg-background",
      )}
    >
      {checked && <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />}
    </span>
  );
}

// ── Match state cell ──────────────────────────────────────────────────────────

function MatchCell({ line }: { line: DocumentLine }) {
  const state = getMatchState(line);
  if (state === "matched") return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success/10 text-success"
      title="Fully matched"
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  );
  if (state === "exception") return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/10 text-destructive font-bold text-2xs leading-none"
      title="Match exception"
    >
      !
    </span>
  );
  if (state === "unmatched") return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-warning/10 text-warning"
      title="Unmatched"
    >
      <AlertTriangle className="h-2.5 w-2.5" />
    </span>
  );
  return <span className="text-muted-foreground/30 text-sm leading-none" title="Not applicable">—</span>;
}

// ── Classification status cell ────────────────────────────────────────────────

function ClassificationCell({
  line,
  onClick,
}: {
  line: DocumentLine;
  onClick: () => void;
}) {
  const raw = (line as Record<string, unknown>)["classification_decision"];
  const hasDecision = raw != null && typeof raw === "object" && "status" in (raw as object);
  const hasCategory = !!(line as Record<string, unknown>)["spend_category_id"];
  if (!hasDecision && !hasCategory) {
    return <span className="text-muted-foreground/30 text-sm leading-none" title="Not classified">—</span>;
  }
  return (
    <button
      onClick={onClick}
      title="Open Classify tab"
      className="hover:opacity-70 transition-opacity"
    >
      <ClassificationStatusBadge line={line as Record<string, unknown>} compact />
    </button>
  );
}

// ── Allocated-To cell — three states ─────────────────────────────────────────

function AllocatedToCell({
  line,
  dists,
  onOpenEditor,
}: {
  line: DocumentLine;
  dists: AccountingDistribution[];
  onOpenEditor: (line: DocumentLine, tab: TabId) => void;
}) {
  // State 2 — multiple distributions
  if (dists.length > 1) {
    return (
      <button
        onClick={() => onOpenEditor(line, "accounting")}
        aria-label={`View ${dists.length} allocations for this line`}
        className="inline-flex items-center gap-1 h-5 px-2 rounded text-xs font-semibold bg-muted border border-border/50 text-foreground leading-none hover:bg-muted/70 transition-colors"
      >
        <SplitSquareHorizontal className="h-2.5 w-2.5" />
        {dists.length} splits
      </button>
    );
  }

  // State 1 — single distribution
  if (dists.length === 1) {
    const d = dists[0]!;
    const label = d.account_code ?? (d.cost_center_id ? d.cost_center_id.slice(0, 10) : "DIST");
    return (
      <button
        onClick={() => onOpenEditor(line, "accounting")}
        title={d.cost_center_id ?? d.account_code ?? undefined}
        className="font-mono text-xs text-foreground hover:text-foreground/70 hover:underline transition-colors truncate max-w-24 text-left"
      >
        {label}
      </button>
    );
  }

  // State 3 — not allocated: open accounting drawer directly
  return (
    <button
      onClick={() => onOpenEditor(line, "accounting")}
      aria-label="Not allocated — click to assign cost centre"
      className="text-xs italic text-muted-foreground/50 px-1.5 py-0.5 rounded transition-all hover:not-italic hover:font-medium hover:text-foreground hover:bg-muted/60"
    >
      Not allocated
    </button>
  );
}

// ── Per-row overflow menu ─────────────────────────────────────────────────────

function RowMenu({
  line,
  dists,
  onEdit,
  onManageSplits,
  onDuplicate,
  onDelete,
}: {
  line: DocumentLine;
  dists: AccountingDistribution[];
  onEdit: () => void;
  onManageSplits: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function MenuItem({
    label, shortcut, onClick, danger, disabled, icon,
  }: {
    label: string;
    shortcut?: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    icon: React.ReactNode;
  }) {
    return (
      <button
        role="menuitem"
        onClick={() => { if (!disabled) { onClick(); setOpen(false); } }}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2.5 w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors",
          danger
            ? "text-destructive hover:bg-destructive/10 disabled:opacity-40"
            : "text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-default",
        )}
      >
        <span className="w-3.5 flex-shrink-0 text-muted-foreground flex items-center">{icon}</span>
        <span className="flex-1">{label}</span>
        {shortcut && <span className="text-2xs font-mono text-muted-foreground/50">{shortcut}</span>}
      </button>
    );
  }

  const splitLabel = dists.length <= 1 ? "Add split" : "Manage splits";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label={`Line ${line.line_number} actions`}
        aria-expanded={open}
        className={cn(
          "h-6 w-6 flex items-center justify-center rounded transition-colors",
          open
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-dropdown min-w-48 rounded-lg border border-border/60 bg-background shadow-lg p-1"
        >
          <MenuItem label="Edit line"       shortcut="Enter" onClick={onEdit}         icon={<span className="text-xs">✎</span>} />
          <MenuItem label={splitLabel}      shortcut="S"     onClick={onManageSplits} icon={<SplitSquareHorizontal className="h-3 w-3" />} />
          <MenuItem label="Duplicate below" shortcut="⌘D"   onClick={onDuplicate}    icon={<Copy className="h-3 w-3" />} />
          {!isNonPO(line) && (
            <MenuItem label="Open source PO" onClick={() => undefined} icon={<ExternalLink className="h-3 w-3" />} />
          )}
          <div className="my-1 h-px bg-border/40" />
          <MenuItem label="Delete line" shortcut="Del" onClick={onDelete} danger icon={<Trash2 className="h-3 w-3" />} />
        </div>
      )}
    </div>
  );
}

// ── Add Line dropdown button ──────────────────────────────────────────────────

function AddLineButton({
  onAddBlankLine,
  adding,
}: {
  onAddBlankLine: () => void;
  adding: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={adding}
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-semibold rounded-md border border-border/60 bg-background text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
      >
        <Plus className="h-3 w-3" />
        {adding ? "Adding…" : "Add"}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-dropdown min-w-44 rounded-lg border border-border/60 bg-background shadow-lg p-1"
        >
          <button
            role="menuitem"
            onClick={() => { onAddBlankLine(); setMenuOpen(false); }}
            className="flex items-center gap-2.5 w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors text-foreground hover:bg-muted/60"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            Item
          </button>
        </div>
      )}
    </div>
  );
}

// ── State-summary toolbar ─────────────────────────────────────────────────────

function StateToolbar({
  lineCount,
  selCount,
  splitCount,
  unmatchedCount,
  exceptionCount,
  blockedCount,
  needsReviewCount,
  activeFilter,
  onFilterToggle,
  onAddLine,
  adding,
}: {
  lineCount: number;
  selCount: number;
  splitCount: number;
  unmatchedCount: number;
  exceptionCount: number;
  blockedCount: number;
  needsReviewCount: number;
  activeFilter: ActiveFilter;
  onFilterToggle: (f: ActiveFilter) => void;
  onAddLine: () => void;
  adding: boolean;
}) {
  return (
    <div className="flex flex-col gap-0">
      {blockedCount > 0 && (
        <div className="flex items-center gap-2 px-3.5 py-1.5 bg-destructive/5 border-b border-destructive/20 text-xs text-destructive">
          <XCircle className="h-3 w-3 flex-shrink-0" />
          <span className="font-semibold">{blockedCount} line{blockedCount !== 1 ? "s" : ""} blocked</span>
          <span className="text-destructive/70 font-normal">— resolve classification issues before submitting.</span>
        </div>
      )}
      {!blockedCount && needsReviewCount > 0 && (
        <div className="flex items-center gap-2 px-3.5 py-1.5 bg-warning/5 border-b border-warning/20 text-xs text-warning">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          <span className="font-semibold">{needsReviewCount} line{needsReviewCount !== 1 ? "s" : ""} need review</span>
          <span className="text-warning/70 font-normal">— open the Classify tab to confirm intent.</span>
        </div>
      )}
      <div className="flex justify-between items-center px-3.5 py-2 bg-muted/40 border-b border-border/40 gap-2 flex-wrap">
        {/* Left: summary pills */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-semibold text-foreground">
            {lineCount} line{lineCount !== 1 ? "s" : ""}
          </span>
          {selCount > 0 && (
            <span className="font-semibold text-foreground/60">· {selCount} selected</span>
          )}
          {splitCount > 0 && (
            <FilterPill
              label={`${splitCount} split`}
              active={activeFilter === "split"}
              color="info"
              ariaLabel={`Filter: ${splitCount} split lines — click to toggle`}
              onClick={() => onFilterToggle(activeFilter === "split" ? null : "split")}
            />
          )}
          {unmatchedCount > 0 && (
            <FilterPill
              label={`${unmatchedCount} unmatched`}
              active={activeFilter === "unmatched"}
              color="warning"
              ariaLabel={`Filter: ${unmatchedCount} unmatched lines — click to toggle`}
              onClick={() => onFilterToggle(activeFilter === "unmatched" ? null : "unmatched")}
            />
          )}
          {exceptionCount > 0 && (
            <FilterPill
              label={`${exceptionCount} exception`}
              active={activeFilter === "exception"}
              color="danger"
              ariaLabel={`Filter: ${exceptionCount} exception lines — click to toggle`}
              onClick={() => onFilterToggle(activeFilter === "exception" ? null : "exception")}
            />
          )}
          {activeFilter && (
            <button
              onClick={() => onFilterToggle(null)}
              className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full bg-muted border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              Filtered: {activeFilter} only ×
            </button>
          )}
        </div>

        {/* Right: page actions */}
        <div className="flex items-center gap-1.5">
          <AddLineButton onAddBlankLine={onAddLine} adding={adding} />
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  label, active, color, onClick, ariaLabel,
}: {
  label: string;
  active: boolean;
  color: "info" | "warning" | "danger";
  onClick: () => void;
  ariaLabel: string;
}) {
  const cls = {
    info:    { base: "bg-info/10 text-info hover:bg-info/20",           active: "bg-info text-background" },
    warning: { base: "bg-warning/10 text-warning hover:bg-warning/20",  active: "bg-warning text-background" },
    danger:  { base: "bg-destructive/10 text-destructive hover:bg-destructive/20", active: "bg-destructive text-background" },
  }[color];

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-medium transition-colors",
        active ? cls.active : cls.base,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label}
    </button>
  );
}

// ── Financial footer ──────────────────────────────────────────────────────────

function FinancialFooter({
  lines,
  currencyCode,
}: {
  lines: DocumentLine[];
  currencyCode: string;
}) {
  const net   = lines.reduce((s, l) => s + (Number(l.gross_amount ?? l.line_amount) || 0), 0);
  const tax   = lines.reduce((s, l) => s + (Number(l.tax_amount) || 0), 0);
  const wht   = lines.reduce((s, l) => s + (Number(l.withholding_tax_amount) || 0), 0);
  const gross = net + tax - wht;

  return (
    <div className="flex justify-between items-center px-4 py-3 border-t border-border/40 bg-muted/20 text-xs flex-wrap gap-3">
      <div className="flex gap-5 flex-wrap">
        <FooterAmt label="Net" value={net} dimmed={false} />
        <FooterAmt label="Tax" value={tax} dimmed={tax === 0} />
        <FooterAmt label="WHT" value={wht} dimmed={wht === 0} prefix={wht !== 0 ? "−" : undefined} />
      </div>
      <div>
        <span className="text-muted-foreground mr-2">Gross</span>
        <span className="text-sm font-semibold tabular-nums">
          {currencyCode}&#8201;{fmtNum(gross)}
        </span>
      </div>
    </div>
  );
}

function FooterAmt({
  label, value, dimmed, prefix,
}: {
  label: string;
  value: number;
  dimmed: boolean;
  prefix?: string;
}) {
  return (
    <span>
      <span className={cn("mr-1.5", dimmed ? "text-muted-foreground/40" : "text-muted-foreground")}>{label}</span>
      <span className={cn("font-semibold tabular-nums", dimmed && "text-muted-foreground/40")}>
        {prefix}{fmtNum(value)}
      </span>
    </span>
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────────

function BulkBar({
  selCount,
  selNet,
  currencyCode,
  onEdit,
  onCopy,
  onDelete,
  onImport,
  onExport,
  onClear,
}: {
  selCount: number;
  selNet: number;
  currencyCode: string;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onImport: () => void;
  onExport: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="region"
      aria-label={`Bulk actions for ${selCount} selected lines`}
      className="flex items-center justify-between px-4 py-2.5 bg-foreground text-background gap-3 flex-wrap border-t border-border/20"
    >
      {/* Left */}
      <div className="text-xs font-semibold flex items-center gap-2 flex-shrink-0">
        <span>{selCount} line{selCount !== 1 ? "s" : ""} selected</span>
        <span className="opacity-40 font-normal">
          · {fmtAmtFull(selNet, currencyCode)} net
        </span>
      </div>

      {/* Center — flat action buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <BulkBtn icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>Edit</BulkBtn>
        <BulkBtn icon={<Copy className="h-3.5 w-3.5" />} onClick={onCopy}>Copy</BulkBtn>
        <BulkSep />
        <BulkBtn icon={<Trash2 className="h-3.5 w-3.5" />} danger onClick={onDelete}>Delete</BulkBtn>
        <BulkSep />
        <BulkBtn icon={<Upload className="h-3.5 w-3.5" />} onClick={onImport}>Import</BulkBtn>
        <BulkBtn icon={<Download className="h-3.5 w-3.5" />} onClick={onExport}>Export</BulkBtn>
      </div>

      {/* Right */}
      <button
        onClick={onClear}
        aria-label="Clear selection"
        className="text-xs opacity-40 hover:opacity-100 underline underline-offset-2 transition-opacity flex-shrink-0"
      >
        Clear
      </button>
    </div>
  );
}

function BulkBtn({
  children, onClick, primary, danger, icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-3 text-xs rounded-md border transition-colors",
        primary && "bg-info/20 border-info/50 text-info font-semibold hover:bg-info/30",
        danger  && "border-destructive/40 text-destructive hover:bg-destructive/20 hover:border-destructive/60",
        !primary && !danger && "border-background/20 text-background hover:bg-background/10",
      )}
    >
      {icon && <span className="flex items-center">{icon}</span>}
      {children}
    </button>
  );
}

// ── Mass edit panel ───────────────────────────────────────────────────────────

function MassEditPanel({
  selCount, desc, onDesc, taxCode, onTaxCode, unitCode, onUnitCode,
  unitPrice, onUnitPrice, applying, onApply, onCancel,
}: {
  selCount: number;
  desc: string;       onDesc: (v: string) => void;
  taxCode: string;    onTaxCode: (v: string) => void;
  unitCode: string;   onUnitCode: (v: string) => void;
  unitPrice: string;  onUnitPrice: (v: string) => void;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const hasAny = [desc, taxCode, unitCode, unitPrice].some((v) => v.trim());
  return (
    <div className="px-4 py-3 bg-muted/30 border-t border-border/40">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-semibold text-foreground">
          Mass edit — {selCount} lines
        </p>
        <p className="text-2xs text-muted-foreground">Fill only the fields you want to update</p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <MassField label="Description"   value={desc}       onChange={onDesc}       placeholder="New description" wide />
        <MassField label="Tax code"      value={taxCode}    onChange={onTaxCode}    placeholder="T1" mono />
        <MassField label="UOM"           value={unitCode}   onChange={onUnitCode}   placeholder="EA" mono />
        <MassField label="Unit price"    value={unitPrice}  onChange={onUnitPrice}  placeholder="0.00" mono />
        <div className="flex items-center gap-2 self-end pb-px">
          <button
            onClick={onApply}
            disabled={!hasAny || applying}
            className="h-7 px-3 text-xs font-semibold rounded-md bg-foreground text-background hover:opacity-85 disabled:opacity-40 transition-opacity"
          >
            {applying ? "Applying…" : `Apply to ${selCount}`}
          </button>
          <button
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MassField({
  label, value, onChange, placeholder, mono, wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1", wide ? "w-48" : "w-24")}>
      <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-7 px-2 text-xs border border-border/60 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/40 placeholder:text-muted-foreground/40",
          mono && "font-mono",
        )}
      />
    </label>
  );
}

function BulkSep() {
  return <span className="w-px h-4 bg-background/20 mx-1 flex-shrink-0" />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function LinesGrid({
  entityCode,
  recordId,
  currencyCode = "USD",
  companyCodeId,
  record,
  lines,
  distributions,
  isLoading,
  onRefresh,
  hasAiClassification,
  hasLineComposer,
  suggestEndpointBase,
  classifyEndpointBase,
}: LinesGridProps) {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [sheetLine,    setSheetLine]    = useState<DocumentLine | null>(null);
  const [sheetTab,     setSheetTab]     = useState<TabId>("accounting");
  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [adding,       setAdding]       = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [massDesc,      setMassDesc]      = useState("");
  const [massTaxCode,   setMassTaxCode]   = useState("");
  const [massUnitCode,  setMassUnitCode]  = useState("");
  const [massUnitPrice, setMassUnitPrice] = useState("");
  const [massApplying,  setMassApplying]  = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // LineComposerSheet — used for new-line intake on purchase_invoice
  const [composerOpen, setComposerOpen] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const distByLine = useMemo(() => {
    const m = new Map<string, AccountingDistribution[]>();
    for (const d of distributions) {
      const arr = m.get(d.source_line_id) ?? [];
      arr.push(d);
      m.set(d.source_line_id, arr);
    }
    return m;
  }, [distributions]);

  const splitCount     = useMemo(() => lines.filter((l) => (distByLine.get(l.id)?.length ?? 0) > 1).length, [lines, distByLine]);
  const unmatchedCount = useMemo(() => lines.filter((l) => getMatchState(l) === "unmatched").length,         [lines]);
  const exceptionCount = useMemo(() => lines.filter((l) => getMatchState(l) === "exception").length,         [lines]);

  // Classification gate counts
  const blockedCount     = useMemo(() => lines.filter((l) => {
    const d = (l as Record<string, unknown>)["classification_decision"];
    return d != null && typeof d === "object" && (d as Record<string, unknown>)["status"] === "blocked";
  }).length, [lines]);
  const needsReviewCount = useMemo(() => lines.filter((l) => {
    const d = (l as Record<string, unknown>)["classification_decision"];
    return d != null && typeof d === "object" && (d as Record<string, unknown>)["status"] === "needs_review";
  }).length, [lines]);

  const visibleLines = useMemo(() => {
    if (!activeFilter) return lines;
    return lines.filter((l) => {
      if (activeFilter === "split")     return (distByLine.get(l.id)?.length ?? 0) > 1;
      if (activeFilter === "unmatched") return getMatchState(l) === "unmatched";
      if (activeFilter === "exception") return getMatchState(l) === "exception";
      return true;
    });
  }, [lines, activeFilter, distByLine]);

  const selCount    = selectedIds.size;
  const allVisible  = visibleLines.length > 0 && visibleLines.every((l) => selectedIds.has(l.id));
  const someVisible = selCount > 0 && !allVisible;

  const selNet = useMemo(
    () => lines
      .filter((l) => selectedIds.has(l.id))
      .reduce((s, l) => s + (Number(l.gross_amount ?? l.line_amount) || 0), 0),
    [lines, selectedIds],
  );

  const sheetLineDists = sheetLine ? (distByLine.get(sheetLine.id) ?? []) : [];

  // ── Handlers ──────────────────────────────────────────────────────────────
  function toggleAll() {
    setSelectedIds(allVisible ? new Set() : new Set(visibleLines.map((l) => l.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const openSheet = useCallback((line: DocumentLine, tab: TabId = "accounting") => {
    setSheetLine(line);
    setSheetTab(tab);
    setSheetOpen(true);
  }, []);

  async function handleAddLine() {
    // Use full-intake LineComposerSheet when entity has the line composer feature
    if (hasLineComposer) {
      setComposerOpen(true);
      return;
    }
    // Generic blank-line flow for all other document types
    setAdding(true);
    try {
      const nextNo = lines.length + 1;
      const res = await relayMutate(
        `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines`,
        {
          method: "POST",
          body: JSON.stringify({
            line_number:  nextNo,
            description:  null,
            quantity:     null,
            unit_code:    null,
            unit_price:   null,
            line_amount:  null,
            tax_code:     null,
            data:         {},
          }),
        },
      );
      if (res.ok) {
        const newLine: DocumentLine = await res.json() as DocumentLine;
        onRefresh?.();
        openSheet(newLine, "details");
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDuplicateLine(line: DocumentLine) {
    const nextNo = lines.reduce((m, l) => Math.max(m, Number(l.line_number) || 0), 0) + 1;
    await relayMutate(
      `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines`,
      {
        method: "POST",
        body: JSON.stringify({
          line_number:  nextNo,
          description:  line.description,
          item_code:    line.item_code,
          quantity:     line.quantity,
          unit_code:    line.unit_code,
          unit_price:   line.unit_price,
          line_amount:  line.line_amount,
          tax_code:     line.tax_code,
          data:         line.data,
        }),
      },
    );
    onRefresh?.();
  }

  async function handleDeleteLine(line: DocumentLine) {
    await relayMutate(
      `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(line.id)}`,
      { method: "DELETE" },
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(line.id);
      return next;
    });
    onRefresh?.();
  }

  function handleBulkEdit() {
    if (selCount === 1) {
      const id = [...selectedIds][0]!;
      const line = lines.find((l) => l.id === id);
      if (line) { setBulkEditOpen(false); openSheet(line, "details"); }
    } else {
      setBulkEditOpen((v) => !v);
    }
  }

  async function handleBulkCopy() {
    const selected  = lines.filter((l) => selectedIds.has(l.id));
    // Compute starting line_no from current lines to avoid server-side MAX race on sequential inserts
    let nextLineNo  = lines.reduce((m, l) => Math.max(m, Number(l.line_number) || 0), 0);
    for (const l of selected) {
      nextLineNo += 1;
      await relayMutate(
        `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines`,
        {
          method: "POST",
          body: JSON.stringify({
            line_number:  nextLineNo,
            description:  l.description,
            item_code:    l.item_code,
            quantity:     l.quantity,
            unit_code:    l.unit_code,
            unit_price:   l.unit_price,
            line_amount:  l.line_amount,
            tax_code:     l.tax_code,
            data:         l.data,
          }),
        },
      );
    }
    onRefresh?.();
  }

  async function handleBulkDelete() {
    const selected = lines.filter((l) => selectedIds.has(l.id));
    await Promise.all(
      selected.map((l) =>
        relayMutate(
          `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(l.id)}`,
          { method: "DELETE" },
        ),
      ),
    );
    setSelectedIds(new Set());
    setBulkEditOpen(false);
    onRefresh?.();
  }

  function handleBulkImport() {
    importRef.current?.click();
  }

  function handleBulkExport() {
    const selected = lines.filter((l) => selectedIds.has(l.id));
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `lines-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function applyMassEdit() {
    if (![massDesc, massTaxCode, massUnitCode, massUnitPrice].some((v) => v.trim())) return;
    setMassApplying(true);
    try {
      const selected = lines.filter((l) => selectedIds.has(l.id));
      const patch: Record<string, unknown> = {};
      if (massDesc.trim())      patch.description = massDesc.trim();
      if (massTaxCode.trim())   patch.tax_code    = massTaxCode.trim();
      if (massUnitCode.trim())  patch.unit_code   = massUnitCode.trim();
      if (massUnitPrice.trim()) patch.unit_price  = Number(massUnitPrice);
      await Promise.all(
        selected.map((l) =>
          relayMutate(
            `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(l.id)}`,
            { method: "PATCH", body: JSON.stringify(patch) },
          ),
        ),
      );
      onRefresh?.();
      setBulkEditOpen(false);
      setMassDesc(""); setMassTaxCode(""); setMassUnitCode(""); setMassUnitPrice("");
      setSelectedIds(new Set());
    } finally {
      setMassApplying(false);
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* State-summary toolbar */}
      <StateToolbar
        lineCount={lines.length}
        selCount={selCount}
        splitCount={splitCount}
        unmatchedCount={unmatchedCount}
        exceptionCount={exceptionCount}
        blockedCount={blockedCount}
        needsReviewCount={needsReviewCount}
        activeFilter={activeFilter}
        onFilterToggle={setActiveFilter}
        onAddLine={() => void handleAddLine()}
        adding={adding}
      />

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 30  }} />
            <col style={{ width: 24  }} />
            <col style={{ width: 66  }} />
            <col />
            <col style={{ width: 52  }} />
            <col style={{ width: 42  }} />
            <col style={{ width: 74  }} />
            <col style={{ width: 84  }} />
            <col style={{ width: 106 }} />
            <col style={{ width: 28  }} />
            <col style={{ width: 28  }} />
            <col style={{ width: 28  }} />
          </colgroup>
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-2 py-2 text-center">
                <MasterCheckbox
                  state={allVisible ? "all" : someVisible ? "partial" : "none"}
                  onClick={toggleAll}
                  ariaLabel={`${selCount} of ${visibleLines.length} selected`}
                />
              </th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">#</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-left">Item</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-left">Description</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-right">Qty</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">UOM</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-right">Unit</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-right">Net</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-left">Allocated to</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">C</th>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">M</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {visibleLines.length === 0 ? (
              <tr>
                <td colSpan={12}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <FileText className="h-7 w-7 text-muted-foreground/25" />
                    <p className="text-sm text-muted-foreground">
                      {activeFilter ? `No ${activeFilter} lines` : "No line items"}
                    </p>
                    <button
                      onClick={() => void handleAddLine()}
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                    >
                      + Add first line
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              visibleLines.map((line) => {
                const lineDists = distByLine.get(line.id) ?? [];
                const isChecked = selectedIds.has(line.id);
                return (
                  <tr
                    key={line.id}
                    onClick={() => openSheet(line)}
                    className={cn(
                      "transition-colors cursor-pointer",
                      isChecked ? "bg-foreground/5 hover:bg-foreground/[0.07]" : "hover:bg-muted/20",
                    )}
                  >
                    {/* Checkbox — stops row-click propagation */}
                    <td
                      className="px-2 py-2.5 text-center"
                      onClick={(e) => { e.stopPropagation(); toggleOne(line.id); }}
                    >
                      <RowCheckbox checked={isChecked} />
                    </td>

                    <td className="px-2 py-2.5 text-center text-xs text-muted-foreground tabular-nums">
                      {line.line_number}
                    </td>

                    <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground truncate">
                      {line.item_code ?? <span className="text-muted-foreground/30 italic text-2xs">—</span>}
                    </td>

                    <td className="px-2 py-2.5 min-w-0">
                      <div className="text-sm text-foreground truncate">{line.description ?? "—"}</div>
                    </td>

                    <td className="px-2 py-2.5 text-right tabular-nums text-xs">
                      {line.quantity != null ? Number(line.quantity).toLocaleString() : "—"}
                    </td>

                    <td className="px-2 py-2.5 text-center text-xs text-muted-foreground">
                      {line.unit_code ?? "—"}
                    </td>

                    <td className="px-2 py-2.5 text-right tabular-nums text-xs font-medium">
                      {line.unit_price != null ? fmtNum(line.unit_price) : "—"}
                    </td>

                    <td className="px-2 py-2.5 text-right tabular-nums text-xs font-medium">
                      {fmtNum(line.gross_amount ?? line.line_amount)}
                    </td>

                    {/* Allocated to — stops row propagation so popover works */}
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <AllocatedToCell
                        line={line}
                        dists={lineDists}
                        onOpenEditor={openSheet}
                      />
                    </td>

                    {/* Classification — stops propagation */}
                    <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <ClassificationCell
                        line={line}
                        onClick={() => openSheet(line, "classify")}
                      />
                    </td>

                    {/* Match — stops propagation */}
                    <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <MatchCell line={line} />
                    </td>

                    {/* Overflow menu — stops propagation */}
                    <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        line={line}
                        dists={lineDists}
                        onEdit={() => openSheet(line, "details")}
                        onManageSplits={() => openSheet(line, "accounting")}
                        onDuplicate={() => void handleDuplicateLine(line)}
                        onDelete={() => void handleDeleteLine(line)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Financial footer */}
      <FinancialFooter lines={lines} currencyCode={currencyCode} />

      {/* Bulk action bar */}
      {selCount > 0 && (
        <BulkBar
          selCount={selCount}
          selNet={selNet}
          currencyCode={currencyCode}
          onEdit={handleBulkEdit}
          onCopy={() => void handleBulkCopy()}
          onDelete={() => void handleBulkDelete()}
          onImport={handleBulkImport}
          onExport={handleBulkExport}
          onClear={() => { setSelectedIds(new Set()); setBulkEditOpen(false); }}
        />
      )}

      {/* Mass edit panel — shown when 2+ lines selected and Edit clicked */}
      {selCount > 1 && bulkEditOpen && (
        <MassEditPanel
          selCount={selCount}
          desc={massDesc}           onDesc={setMassDesc}
          taxCode={massTaxCode}     onTaxCode={setMassTaxCode}
          unitCode={massUnitCode}   onUnitCode={setMassUnitCode}
          unitPrice={massUnitPrice} onUnitPrice={setMassUnitPrice}
          applying={massApplying}
          onApply={() => void applyMassEdit()}
          onCancel={() => {
            setBulkEditOpen(false);
            setMassDesc(""); setMassTaxCode(""); setMassUnitCode(""); setMassUnitPrice("");
          }}
        />
      )}

      {/* Hidden file input for bulk import */}
      <input
        ref={importRef}
        type="file"
        accept=".json,.csv"
        className="hidden"
        onChange={(e) => {
          // TODO: parse + import lines
          e.target.value = "";
        }}
      />

      {/* Line editor sheet */}
      {sheetLine && (
        <LineEditorSheet
          key={`${sheetLine.id}-${sheetTab}`}
          open={sheetOpen}
          onOpenChange={(o) => { setSheetOpen(o); if (!o) setSheetLine(null); }}
          line={sheetLine}
          distributions={sheetLineDists}
          currencyCode={currencyCode}
          entityCode={entityCode}
          recordId={recordId}
          initialTab={sheetTab}
          companyCodeId={companyCodeId}
          record={record}
          hasAiClassification={hasAiClassification}
          onLineSaved={onRefresh}
          onMutated={onRefresh}
        />
      )}

      {/* Procurement line composer — full-intake sheet for entities with hasLineComposer */}
      {hasLineComposer && (
        <LineComposerSheet
          open={composerOpen}
          onOpenChange={setComposerOpen}
          line={null}
          entityCode={entityCode}
          recordId={recordId}
          currencyCode={currencyCode}
          companyCodeId={companyCodeId}
          suggestBaseUrl={suggestEndpointBase}
          classifyBaseUrl={classifyEndpointBase}
          onMutated={onRefresh}
        />
      )}
    </div>
  );
}
