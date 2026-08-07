"use client";

/**
 * JournalGrid — paginated, filterable list of Journal Entries.
 *
 * Clicking a row expands an inline PostingTrace panel.
 * Accepts a FinanceScope so it can be embedded in any scoped context.
 *
 * Usage:
 *   <JournalGrid scope={scope} />
 */

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton,
} from "@athyper/platform-ui/primitives";
import { DatePicker } from "@athyper/platform-ui/composites";
import { useJournalList, type JournalEntry } from "../hooks/useJournalList";
import { useCreateJournal, type CreateJournalLine } from "../hooks/useCreateJournal";
import { useReverseJournal } from "../hooks/useReverseJournal";
import { useCompanyList } from "../hooks/useCharts";
import { PostingTrace } from "./PostingTrace";
import type { FinanceScope } from "../lib/scope";
import { openAppRecordFromContextMenu } from "../lib/recordLinks";
import { fmtCurrency, fmtDate } from "../components/format";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusVariant(status: string): "success" | "destructive" | "muted" | "secondary" {
  const s = status.toLowerCase();
  if (s === "posted")   return "success";
  if (s === "reversed" || s === "voided") return "destructive";
  if (s === "created")  return "muted";
  return "secondary";
}

function fmtListDate(d: string | null | undefined): string {
  if (!d) return "-";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US");
}

function fmtLedgerAmount(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function currencyName(code: string): string {
  const names: Record<string, string> = {
    SAR: "Saudi Riyal",
    USD: "US Dollar",
    EUR: "Euro",
    GBP: "Pound Sterling",
  };
  return names[code] ?? code;
}

function relativeAge(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";

  const diffMs = Math.max(0, Date.now() - dt.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ── Row ───────────────────────────────────────────────────────────────────────

function JeRow({
  je,
  expanded,
  onToggle,
  onReverse,
  entityListStyle = false,
}: {
  je: JournalEntry;
  expanded: boolean;
  onToggle(): void;
  onReverse(je: JournalEntry): void;
  entityListStyle?: boolean;
}) {
  const canReverse = je.status === "posted";

  if (entityListStyle) {
    return (
      <>
        <tr
          className="cursor-pointer border-b transition-colors hover:bg-muted/50"
          onClick={onToggle}
        >
          <td className="px-3 py-1 align-middle">
            <span
              className="cursor-context-menu text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              title="Right-click to open this journal entry."
              onContextMenu={(event) => openAppRecordFromContextMenu(event, "journal_entry", je.jeNumber, {
                copyItems: [
                  { label: "JE Number", value: je.jeNumber },
                  { label: "Status", value: je.status },
                  { label: "Posting Date", value: fmtListDate(je.postingDate) },
                  { label: "Period", value: String(je.periodNumber) },
                  { label: "Transaction Currency", value: je.currencyCode },
                  { label: "Total Debit", value: fmtLedgerAmount(je.totalDebit) },
                  { label: "Total Credit", value: fmtLedgerAmount(je.totalCredit) },
                ],
              })}
            >
              {je.jeNumber}
            </span>
          </td>
          <td className="px-3 py-1 align-middle">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="size-2 rounded-full bg-muted-foreground" aria-hidden />
              <span className="capitalize">{je.status}</span>
            </span>
          </td>
          <td className="px-3 py-1 align-middle text-sm text-foreground">
            {fmtListDate(je.postingDate)}
          </td>
          <td className="px-3 py-1 align-middle text-sm text-foreground">
            {je.periodNumber}
          </td>
          <td className="px-3 py-1 align-middle text-sm text-foreground">
            {je.currencyCode ? `${je.currencyCode} - ${currencyName(je.currencyCode)}` : "-"}
          </td>
          <td className="px-3 py-1 text-right align-middle text-sm tabular-nums text-foreground">
            {fmtLedgerAmount(je.totalDebit)}
          </td>
          <td className="px-3 py-1 text-right align-middle text-sm tabular-nums text-foreground">
            {fmtLedgerAmount(je.totalCredit)}
          </td>
          <td className="w-24 px-3 py-1 text-right align-middle">
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              {relativeAge(je.postedAt ?? je.postingDate)}
              <Star className="h-3.5 w-3.5 text-muted-foreground/50" />
            </span>
          </td>
        </tr>

        {expanded && (
          <tr>
            <td colSpan={8} className="border-b bg-muted/20 px-4 pb-4 pt-2">
              <PostingTrace jeId={je.id} />
              {canReverse && (
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={(e) => { e.stopPropagation(); onReverse(je); }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reverse Entry
                  </Button>
                </div>
              )}
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <>
      <tr
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 w-8">
          {expanded
            ? <ChevronDown  className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </td>
        <td className="px-3 py-2.5">
          <span className="tabular-nums text-xs font-medium">{je.jeNumber}</span>
        </td>
        <td className="px-3 py-2.5">
          <Badge variant={statusVariant(je.status)} className="capitalize">{je.status}</Badge>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">
          {fmtDate(je.postingDate)}
        </td>
        <td className="px-3 py-2.5 text-xs">{je.sourceDocType ?? "—"}</td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
          {je.description ?? "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-success">
          {fmtCurrency(je.totalDebit)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-destructive">
          {fmtCurrency(je.totalCredit)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
          {je.lineCount}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={9} className="px-4 pb-4 pt-2 bg-muted/20">
            <PostingTrace jeId={je.id} />
            {canReverse && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={(e) => { e.stopPropagation(); onReverse(je); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reverse Entry
                </Button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── NewJournalDialog ──────────────────────────────────────────────────────────

interface LineRow {
  id:             number;
  gl_account_code: string;
  debit:          string;
  credit:         string;
  item_text:      string;
}

const EMPTY_LINE = (): LineRow => ({
  id:              Date.now() + Math.random(),
  gl_account_code: "",
  debit:           "",
  credit:          "",
  item_text:       "",
});

function NewJournalDialog({
  scope,
  open,
  onOpenChange,
}: {
  scope: FinanceScope;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: companies = [] } = useCompanyList();
  const createJournal = useCreateJournal();

  // Header state — pre-populate from scope where possible
  const defaultCompany = scope.scopeType === "company" ? scope.scopeId : (companies[0]?.code ?? "");
  const defaultPeriod  = scope.period ?? 1;
  const today          = new Date().toISOString().slice(0, 10);

  const [companyCode,  setCompanyCode]  = useState(defaultCompany);
  const [postingDate,  setPostingDate]  = useState(today);
  const [currencyCode, setCurrencyCode] = useState(scope.currency ?? "");
  const [description,  setDescription] = useState("");
  const [lines,        setLines]        = useState<LineRow[]>([EMPTY_LINE(), EMPTY_LINE()]);
  const [error,        setError]        = useState<string | null>(null);

  function reset() {
    setCompanyCode(defaultCompany);
    setPostingDate(today);
    setCurrencyCode(scope.currency ?? "");
    setDescription("");
    setLines([EMPTY_LINE(), EMPTY_LINE()]);
    setError(null);
  }

  function updateLine(id: number, field: keyof LineRow, value: string) {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
  }

  function addLine() {
    setLines((prev) => [...prev, EMPTY_LINE()]);
  }

  function removeLine(id: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  async function handleSubmit() {
    setError(null);

    if (!companyCode) { setError("Company is required"); return; }
    if (!postingDate) { setError("Posting date is required"); return; }
    if (!currencyCode) { setError("Currency is required"); return; }

    const typedLines: CreateJournalLine[] = lines.map((l) => ({
      gl_account_code: l.gl_account_code.trim(),
      debit:           parseFloat(l.debit)  || undefined,
      credit:          parseFloat(l.credit) || undefined,
      item_text:       l.item_text.trim() || undefined,
    }));

    if (typedLines.some((l) => !l.gl_account_code)) {
      setError("All lines must have a GL account code");
      return;
    }
    if (!balanced) {
      setError(`Entry is unbalanced: debit ${fmtCurrency(totalDebit)} ≠ credit ${fmtCurrency(totalCredit)}`);
      return;
    }

    try {
      await createJournal.mutateAsync({
        company_code:  companyCode,
        fiscal_year:   scope.fiscalYear,
        period_number: defaultPeriod,
        posting_date:  postingDate,
        currency_code: currencyCode,
        description:   description.trim() || undefined,
        lines:         typedLines,
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create journal entry");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
        </DialogHeader>

        {/* ── Header fields ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Company</Label>
            {companies.length > 0 ? (
              <Select value={companyCode} onValueChange={setCompanyCode}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.code} value={c.code} className="text-xs">
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-8 text-xs font-mono"
                placeholder="e.g. AUKA"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Posting Date</Label>
            <DatePicker
              kind="businessDate"
              value={postingDate || null}
              onChange={(next) => setPostingDate(next ?? "")}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Currency</Label>
            <Input
              className="h-8 text-xs font-mono"
              placeholder="USD"
              maxLength={3}
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Period</Label>
            <Input
              className="h-8 text-xs bg-muted/40"
              value={`FY${scope.fiscalYear} / P${defaultPeriod}`}
              readOnly
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input
            className="h-8 text-xs"
            placeholder="Optional header description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* ── Lines table ──────────────────────────────────────────────────── */}
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground w-36">Account Code</th>
                <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">Debit</th>
                <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">Credit</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Item Text</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-7 text-xs font-mono"
                      placeholder="e.g. 4001"
                      value={l.gl_account_code}
                      onChange={(e) => updateLine(l.id, "gl_account_code", e.target.value.trim())}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-7 text-xs text-right tabular-nums"
                      placeholder="0.00"
                      value={l.debit}
                      onChange={(e) => updateLine(l.id, "debit", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-7 text-xs text-right tabular-nums"
                      placeholder="0.00"
                      value={l.credit}
                      onChange={(e) => updateLine(l.id, "credit", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-7 text-xs"
                      placeholder="Optional"
                      value={l.item_text}
                      onChange={(e) => updateLine(l.id, "item_text", e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      disabled={lines.length <= 2}
                      onClick={() => removeLine(l.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30">
              <tr>
                <td className="px-2 py-2 text-xs text-muted-foreground">
                  <Button variant="ghost" size="sm" className="h-6 gap-1 px-1 text-xs" onClick={addLine}>
                    <Plus className="h-3 w-3" /> Add line
                  </Button>
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-medium text-success">
                  {fmtCurrency(totalDebit)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-medium text-destructive">
                  {fmtCurrency(totalCredit)}
                </td>
                <td colSpan={2} className="px-2 py-2 text-right text-xs text-muted-foreground">
                  {balanced ? (
                    <span className="text-success font-medium">Balanced</span>
                  ) : totalDebit > 0 || totalCredit > 0 ? (
                    <span className="text-destructive">
                      Diff: {fmtCurrency(Math.abs(totalDebit - totalCredit))}
                    </span>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!balanced || createJournal.isPending}
            onClick={handleSubmit}
          >
            {createJournal.isPending ? "Creating…" : "Create Journal Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface JournalGridProps {
  scope: FinanceScope;
  search?: string;
  statusFilter?: string;
  sourceDocTypeFilter?: string;
  hideSearch?: boolean;
  hideCreateAction?: boolean;
  entityListStyle?: boolean;
  activeFilterChips?: Array<{ key: string; label: string; value: string }>;
  onRemoveFilter?: (key: string) => void;
  onClearFilters?: () => void;
}

const STATUS_OPTIONS = [
  { value: "all",      label: "All statuses" },
  { value: "created",  label: "Draft" },
  { value: "posted",   label: "Posted" },
  { value: "reversed", label: "Reversed" },
  { value: "voided",   label: "Voided" },
];

const PAGE_SIZE = 50;

export function JournalGrid({
  scope,
  search: controlledSearch,
  statusFilter,
  sourceDocTypeFilter,
  hideSearch = false,
  hideCreateAction = false,
  entityListStyle = false,
  activeFilterChips = [],
  onRemoveFilter,
  onClearFilters,
}: JournalGridProps) {
  const [page,          setPage]          = useState(1);
  const [status,        setStatus]        = useState("all");
  const [search,        setSearch]        = useState("");
  const [searchInput,   setSearchInput]   = useState("");
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null);
  const [reverseError,  setReverseError]  = useState<string | null>(null);

  const reverseJournal = useReverseJournal();
  const effectiveSearch = controlledSearch ?? search;
  const effectiveStatus = statusFilter ?? status;

  useEffect(() => {
    if (controlledSearch === undefined) return;
    setSearch(controlledSearch);
    setSearchInput(controlledSearch);
    setPage(1);
  }, [controlledSearch]);

  useEffect(() => {
    setPage(1);
  }, [sourceDocTypeFilter, statusFilter]);

  const { data, isLoading } = useJournalList(scope, {
    status:        effectiveStatus === "all" ? undefined : effectiveStatus,
    sourceDocType: sourceDocTypeFilter || undefined,
    search:        effectiveSearch || undefined,
    page,
    limit:         PAGE_SIZE,
  });

  function handleSearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleConfirmReverse() {
    if (!reverseTarget) return;
    setReverseError(null);
    try {
      await reverseJournal.mutateAsync({ jeId: reverseTarget.id });
      setReverseTarget(null);
      setExpandedId(null);
    } catch (e) {
      setReverseError(e instanceof Error ? e.message : "Failed to reverse journal entry");
    }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const visibleCount = data?.items.length ?? 0;
  const totalCount = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-3">

      {/* Toolbar */}
      {entityListStyle && (
        <div className="flex min-h-8 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-muted-foreground">
            Showing <strong className="font-medium text-foreground">{visibleCount.toLocaleString()}</strong>
            {" of "}
            <strong className="font-medium text-foreground">{totalCount.toLocaleString()}</strong>
            {" "}journal entry
          </span>

          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onRemoveFilter?.(chip.key)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted/60"
              title={`Remove ${chip.label} filter`}
            >
              <span>
                <span className="text-muted-foreground">{chip.label}:</span>{" "}
                <span className="font-medium">{chip.value}</span>
              </span>
              <XCircle className="ml-0.5 h-3 w-3 text-muted-foreground" />
            </button>
          ))}

          {activeFilterChips.length > 0 && (
            <>
              <button
                type="button"
                onClick={onClearFilters}
                className="text-xs text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                Clear all
              </button>
              <span className="text-muted-foreground/30">.</span>
            </>
          )}

          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <ArrowDownUp className="h-3.5 w-3.5" />
            Posting Date
            <ArrowDown className="h-3.5 w-3.5" />
          </span>
        </div>
      )}

      <div className={entityListStyle ? "hidden" : "flex flex-wrap items-center gap-2"}>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!hideSearch && (
          <div className="flex flex-1 items-center gap-1.5 min-w-48 max-w-sm">
            <Input
              className="h-8 text-xs"
              placeholder="Search JE number or description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={handleSearch}>
              <Search className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {data && (
          <span className="text-xs text-muted-foreground">
            {data.total.toLocaleString()} journal entr{data.total === 1 ? "y" : "ies"}
          </span>
        )}

        {!hideCreateAction && (
          <Button size="sm" className="ml-auto h-8 gap-1.5 text-xs" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Journal Entry
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No journal entries found</p>
        </div>
      ) : entityListStyle ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[1040px] caption-bottom text-sm text-foreground">
            <thead className="sticky top-0 z-10 border-b bg-muted">
              <tr>
                <th className="h-7 px-3 text-left align-middle text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    JE Number <ArrowDownUp className="h-3.5 w-3.5 opacity-45" />
                  </span>
                </th>
                <th className="h-7 px-3 text-left align-middle text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    Status <ArrowDownUp className="h-3.5 w-3.5 opacity-45" />
                  </span>
                </th>
                <th className="h-7 px-3 text-left align-middle text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    Posting Date <ArrowDown className="h-3.5 w-3.5" />
                  </span>
                </th>
                <th className="h-7 px-3 text-left align-middle text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    Period <ArrowDownUp className="h-3.5 w-3.5 opacity-45" />
                  </span>
                </th>
                <th className="h-7 px-3 text-left align-middle text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    Transaction Currency <ArrowDownUp className="h-3.5 w-3.5 opacity-45" />
                  </span>
                </th>
                <th className="h-7 px-3 text-right align-middle text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center justify-end gap-2">
                    Total Debit <ArrowDownUp className="h-3.5 w-3.5 opacity-45" />
                  </span>
                </th>
                <th className="h-7 px-3 text-right align-middle text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center justify-end gap-2">
                    Total Credit <ArrowDownUp className="h-3.5 w-3.5 opacity-45" />
                  </span>
                </th>
                <th className="h-7 w-24 px-3 align-middle" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((je) => (
                <JeRow
                  key={je.id}
                  je={je}
                  expanded={expandedId === je.id}
                  onToggle={() => toggleExpand(je.id)}
                  onReverse={(target) => { setReverseError(null); setReverseTarget(target); }}
                  entityListStyle
                />
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted font-medium">
              <tr>
                <td colSpan={5} className="h-8" />
                <td className="px-3 py-1 text-right text-sm font-medium tabular-nums text-foreground">0</td>
                <td className="px-3 py-1 text-right text-sm font-medium tabular-nums text-foreground">0</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="w-8" />
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">JE Number</th>
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">Posting Date</th>
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">Source</th>
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Credit</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.items.map((je) => (
                <JeRow
                  key={je.id}
                  je={je}
                  expanded={expandedId === je.id}
                  onToggle={() => toggleExpand(je.id)}
                  onReverse={(target) => { setReverseError(null); setReverseTarget(target); }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* New Journal Dialog */}
      <NewJournalDialog scope={scope} open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* Reversal Confirmation Dialog */}
      <Dialog
        open={!!reverseTarget}
        onOpenChange={(v) => { if (!v) { setReverseTarget(null); setReverseError(null); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse Journal Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              This will create a mirror reversal of{" "}
              <span className="tabular-nums font-medium text-foreground">
                {reverseTarget?.jeNumber}
              </span>{" "}
              with all debit and credit lines swapped.
            </p>
            <p>
              The original entry will be marked as <strong>Reversed</strong>.
              This action cannot be undone.
            </p>
          </div>
          {reverseError && (
            <p className="text-xs text-destructive">{reverseError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setReverseTarget(null); setReverseError(null); }}
              disabled={reverseJournal.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmReverse}
              disabled={reverseJournal.isPending}
            >
              {reverseJournal.isPending ? "Reversing…" : "Confirm Reversal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
