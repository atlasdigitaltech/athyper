"use client";

/**
 * LineEditorSheet — right-side drawer for editing a single invoice line.
 *
 * Tabs:    Item · Classify · Accounting · Tax · Discount · Charges · Retention
 * Actions: Edit (active) · Delete
 */

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus, Trash2, ChevronsUpDown, XCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine, AccountingDistribution } from "@athyper/api-contracts/documents";
import { fmtAmount } from "@athyper/runtime-shared/core";
import { relayMutate } from "@athyper/runtime-shared/client";
import { ClassificationDecisionPanel } from "./ClassificationDecisionPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "details" | "accounting" | "classify" | "discount" | "charges" | "tax" | "retention";
type DistBasis = "PERCENT" | "AMOUNT" | "QUANTITY";
type AccountingMode = "single" | "split";

interface SplitRow {
  id: string | null;
  distribution_no: number;
  distribution_basis: DistBasis;
  split_pct: number;
  split_amount: number;
  split_quantity: number;
  account_source: string;
  account_code: string;
  cost_center_id: string;
  project_id: string;
  site_id: string;
  is_capex: boolean;
  tax_treatment_override: string;
  description: string;
  distributed_amount: number;
  currency_code: string;
  _dirty: boolean;
  _isNew: boolean;
  _expanded: boolean;
}

interface ChargeRow {
  id: string;
  charge_type: string;
  charge_code: string;
  description: string;
  amount: string;
  _dirty: boolean;
  _isNew: boolean;
}

export interface LineEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: DocumentLine;
  distributions: AccountingDistribution[];
  currencyCode?: string;
  companyCodeId?: string;
  /** Full document header record — used to auto-derive cost centre / project. */
  record?: Record<string, unknown>;
  entityCode: string;
  recordId: string;
  /** Driven by CompiledEntity.feature_flags.has_ai_classification — no entity code checks. */
  hasAiClassification?: boolean;
  initialTab?: TabId;
  onLineSaved?: (patch: Partial<DocumentLine>) => void;
  onMutated?: () => void;
  onLineCopied?: () => void;
  onLineDeleted?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Alias so call-sites don't need to change. */
const fmtAmt = fmtAmount;

function distToRow(d: AccountingDistribution): SplitRow {
  return {
    id: d.id, distribution_no: d.distribution_no, distribution_basis: d.distribution_basis,
    split_pct: Number(d.split_pct ?? 0), split_amount: Number(d.split_amount ?? 0), split_quantity: 0,
    account_source: d.account_source, account_code: d.account_code ?? "", cost_center_id: d.cost_center_id ?? "",
    project_id: d.project_id ?? "", site_id: d.site_id ?? "", is_capex: d.is_capex,
    tax_treatment_override: "", description: d.description ?? "",
    distributed_amount: Number(d.distributed_amount), currency_code: d.currency_code,
    _dirty: false, _isNew: false, _expanded: false,
  };
}

function blankRow(cc: string, nextNo: number): SplitRow {
  return {
    id: null, distribution_no: nextNo, distribution_basis: "PERCENT",
    split_pct: 0, split_amount: 0, split_quantity: 0,
    account_source: "FIXED", account_code: "", cost_center_id: "",
    project_id: "", site_id: "", is_capex: false, tax_treatment_override: "",
    description: "", distributed_amount: 0, currency_code: cc,
    _dirty: true, _isNew: true, _expanded: false,
  };
}

function uid(): string { return Math.random().toString(36).slice(2, 10); }
function lineUrl(e: string, r: string, l: string) { return `/api/records/${encodeURIComponent(e)}/${encodeURIComponent(r)}/lines/${encodeURIComponent(l)}`; }
function apLineUrl(e: string, r: string, l: string) {
  return e.replace(/-/g, "_") === "purchase_invoice"
    ? `/api/finance/ap/invoices/${encodeURIComponent(r)}/lines/${encodeURIComponent(l)}`
    : lineUrl(e, r, l);
}
function distUrl(e: string, r: string, l: string, d?: string) { const base = `${lineUrl(e, r, l)}/distributions`; return d ? `${base}/${encodeURIComponent(d)}` : base; }

// ── Shared primitives ─────────────────────────────────────────────────────────

function InlineError({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 min-w-0">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 hover:opacity-70 transition-opacity" aria-label="Dismiss error">
          <XCircle className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", className }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: "text" | "number"; className?: string;
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={cn(
        "w-full h-9 px-3 text-sm border border-border/60 rounded-lg bg-transparent",
        "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors",
        "placeholder:text-muted-foreground/40",
        className,
      )}
    />
  );
}

function SaveBtn({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end pt-1">
      <button onClick={onClick} disabled={saving}
        className="h-9 px-4 text-sm font-semibold rounded-lg bg-foreground text-background hover:opacity-85 disabled:opacity-40 transition-opacity"
      >{saving ? "Saving…" : "Save"}</button>
    </div>
  );
}

// ── Entity search input ───────────────────────────────────────────────────────

const COMPANY_CODE_SCOPED = new Set(["cost_center", "profit_center", "project", "site"]);

function EntitySearchInput({
  entityCode, companyCodeId, valueId, displayValue, onSelect, placeholder,
}: {
  entityCode: string; companyCodeId?: string;
  valueId: string; displayValue: string;
  onSelect: (id: string, label: string) => void;
  placeholder?: string;
}) {
  const [query,    setQuery]    = useState(displayValue);
  const [results,  setResults]  = useState<Record<string, unknown>[]>([]);
  const [open,     setOpen]     = useState(false);
  const [fetching, setFetching] = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(displayValue); }, [displayValue]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function search(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    setOpen(true);
    timer.current = setTimeout(async () => {
      setFetching(true);
      try {
        const params = new URLSearchParams({ q: v, page_size: "8" });
        if (companyCodeId && COMPANY_CODE_SCOPED.has(entityCode)) params.set("filters", JSON.stringify({ company_code_id: companyCodeId }));
        const r = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}?${params.toString()}`);
        if (r.ok) {
          const data = await r.json() as { data?: Record<string, unknown>[] };
          setResults(data.data ?? []);
        }
      } finally { setFetching(false); }
    }, 300);
  }

  function pick(row: Record<string, unknown>) {
    const id   = String(row.id   ?? "");
    const code = String(row.code ?? "");
    const name = String(row.name ?? "");
    const label = code ? `${code} · ${name}` : name;
    setQuery(label); setResults([]); setOpen(false);
    onSelect(id, label);
  }

  function clear() { setQuery(""); setResults([]); setOpen(false); onSelect("", ""); }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input value={query} onChange={(e) => search(e.target.value)} placeholder={placeholder}
          className={cn(
            "w-full h-9 px-3 text-sm border border-border/60 rounded-lg bg-transparent",
            "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors",
            "placeholder:text-muted-foreground/40",
            valueId && "pr-7",
          )}
        />
        {valueId && (
          <button type="button" onClick={clear} tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          ><XCircle className="h-3.5 w-3.5" /></button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border/60 bg-background shadow-lg overflow-hidden">
          {fetching ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground/60">No results</p>
          ) : (
            <div className="py-1 max-h-48 overflow-y-auto">
              {results.map((row, i) => (
                <button key={String(row.id ?? i)} onClick={() => pick(row)}
                  className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
                >
                  <span className="font-mono font-medium text-foreground shrink-0">{String(row.code ?? "")}</span>
                  <span className="text-muted-foreground truncate">{String(row.name ?? "")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BasisToggle({ value, onChange }: { value: DistBasis; onChange: (v: DistBasis) => void }) {
  return (
    <div className="inline-flex border border-border rounded-lg overflow-hidden bg-muted/20 text-xs">
      {(["PERCENT", "AMOUNT", "QUANTITY"] as DistBasis[]).map((k) => (
        <button key={k} onClick={() => onChange(k)}
          className={cn("px-3 py-1.5 font-semibold transition-colors capitalize",
            value === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >{k.charAt(0) + k.slice(1).toLowerCase()}</button>
      ))}
    </div>
  );
}

function RemainingBar({ allocated, target, basis, currency }: { allocated: number; target: number; basis: DistBasis; currency: string }) {
  const remaining  = target - allocated;
  const isBalanced = Math.abs(remaining) < 0.01;
  const isOver     = remaining < -0.01;
  const pct        = target > 0 ? Math.min(allocated / target, 1) : 0;
  const fmt = (v: number) => basis === "PERCENT" ? v.toFixed(2) + "%" : basis === "QUANTITY" ? v.toFixed(2) + " units" : fmtAmt(v, currency);
  return (
    <div className="space-y-2 mt-2">
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-300", isBalanced ? "bg-success" : isOver ? "bg-destructive" : "bg-warning")} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
      </div>
      <div className={cn("flex items-center justify-between text-xs font-medium px-0.5", isBalanced ? "text-success" : isOver ? "text-destructive" : "text-warning")}>
        <span>{isBalanced ? "Fully allocated" : isOver ? `Over by ${fmt(-remaining)}` : `${fmt(remaining)} remaining`}</span>
        <span className="tabular-nums">{fmt(allocated)} / {fmt(target)}</span>
      </div>
    </div>
  );
}

interface WaterfallRow { label: string; amount: number; sign?: "+" | "−"; isSub?: boolean; isTotal?: boolean; dimmed?: boolean; }

function AmountWaterfall({ rows, currency }: { rows: WaterfallRow[]; currency: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
      {rows.map((row, i) => (
        <div key={i} className={cn("flex items-baseline justify-between px-3 py-1.5 text-xs",
          row.isTotal ? "bg-muted/40 border-t border-border/50 font-semibold" : "border-b border-border/20 last:border-0",
          row.isSub && "pl-5", row.dimmed && "opacity-40",
        )}>
          <span className={cn("text-muted-foreground", row.isTotal && "text-foreground")}>
            {row.sign && <span className={cn("mr-1 font-semibold", row.sign === "−" ? "text-destructive/70" : "text-success/80")}>{row.sign}</span>}
            {row.label}
          </span>
          <span className={cn("tabular-nums", row.isTotal ? "text-foreground text-sm" : "text-foreground/80", row.sign === "−" && !row.isTotal && "text-destructive/80")}>
            {fmtAmt(row.amount, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}


// ── UOM search combobox ───────────────────────────────────────────────────────

function UomSearch({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [q,       setQ]       = useState(value);
  const [results, setResults] = useState<{ id: string; code: string; name: string }[]>([]);
  const [open,    setOpen]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQ(value); }, [value]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function search(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({ limit: "8" });
        if (v.trim()) params.set("search", v.trim());
        const r = await fetch(`/api/relay/api/platform/ref/uom?${params.toString()}`);
        if (r.ok) {
          const d = await r.json() as { data?: { id: string; code: string; name: string }[] };
          setResults(d.data ?? []);
        }
      } finally { setBusy(false); }
    }, 200);
  }

  function pick(row: { code: string }) {
    setQ(row.code); setResults([]); setOpen(false);
    onChange(row.code);
  }

  return (
    <div className="relative" ref={ref}>
      <input value={q}
        onChange={(e) => search(e.target.value)}
        onFocus={() => { if (!open) search(q); }}
        placeholder="EA"
        className="w-full h-9 px-3 text-sm text-center font-mono border border-border/60 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors placeholder:text-muted-foreground/40"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border/60 bg-background shadow-lg overflow-hidden">
          {busy ? <p className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</p>
                : results.length === 0 ? <p className="px-3 py-2.5 text-xs text-muted-foreground/60">No results</p>
                : <div className="py-1 max-h-44 overflow-y-auto">
                    {results.map((row) => (
                      <button key={row.id} onClick={() => pick(row)}
                        className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
                      >
                        <span className="font-mono font-medium text-foreground shrink-0">{row.code}</span>
                        <span className="text-muted-foreground truncate">{row.name}</span>
                      </button>
                    ))}
                  </div>}
        </div>
      )}
    </div>
  );
}

// ── GL Account search combobox ────────────────────────────────────────────────

function GlAccountSearch({ value, onChange, companyCodeId, className }: {
  value: string; onChange: (code: string) => void; companyCodeId?: string; className?: string;
}) {
  const [q,       setQ]       = useState(value);
  const [results, setResults] = useState<{ id: string; code: string; name: string }[]>([]);
  const [open,    setOpen]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQ(value); }, [value]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function search(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    setOpen(true);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({ q: v, node_type: "posting", limit: "10" });
        const r = await fetch(`/api/relay/api/finance/accounts/search?${params.toString()}`);
        if (r.ok) {
          const d = await r.json() as { data?: { id: string; code: string; name: string }[] };
          setResults(d.data ?? []);
        }
      } finally { setBusy(false); }
    }, 250);
  }

  function pick(row: { code: string }) {
    setQ(row.code); setResults([]); setOpen(false);
    onChange(row.code);
  }

  return (
    <div className="relative" ref={ref}>
      <input value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Search GL account…"
        className={cn(
          "w-full h-9 px-3 text-sm font-mono border border-border/60 rounded-lg bg-transparent",
          "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors",
          "placeholder:text-muted-foreground/40",
          className,
        )}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border/60 bg-background shadow-lg overflow-hidden">
          {busy ? <p className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</p>
                : results.length === 0 ? <p className="px-3 py-2.5 text-xs text-muted-foreground/60">No results</p>
                : <div className="py-1 max-h-52 overflow-y-auto">
                    {results.map((row) => (
                      <button key={row.id} onClick={() => pick(row)}
                        className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
                      >
                        <span className="font-mono font-medium text-foreground shrink-0">{row.code}</span>
                        <span className="text-muted-foreground truncate">{row.name}</span>
                      </button>
                    ))}
                  </div>}
        </div>
      )}
    </div>
  );
}

// ── Tax group search combobox ─────────────────────────────────────────────────
// categoryFilter: "INDIRECT" | "SURCHARGE" | "WITHHOLDING" | "CUSTOMS_DUTY"
// Pass undefined to search all categories.

interface TaxGroupOption {
  id: string;
  code: string;
  name: string;
  category: string;
  rate_value?: string | null;
  tax_type_code?: string | null;
}

function TaxGroupSearch({ valueId, displayValue, onChange, categoryFilter, placeholder }: {
  valueId: string; displayValue: string;
  onChange: (id: string, code: string, row?: TaxGroupOption | null) => void;
  categoryFilter?: string; placeholder?: string;
}) {
  const [q,       setQ]       = useState(displayValue);
  const [results, setResults] = useState<TaxGroupOption[]>([]);
  const [open,    setOpen]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQ(displayValue); }, [displayValue]);
  useEffect(() => {
    if (!valueId || displayValue) return;
    let cancelled = false;
    const params = new URLSearchParams({ id: valueId, limit: "1" });
    if (categoryFilter) params.set("category", categoryFilter);
    void fetch(`/api/relay/api/finance/tax-groups/search?${params.toString()}`)
      .then((r) => r.ok ? r.json() as Promise<{ data?: TaxGroupOption[] }> : null)
      .then((d) => {
        if (cancelled) return;
        const row = d?.data?.[0];
        if (row) setQ(row.code);
      })
      .catch(() => { /* ignore label resolution failures */ });
    return () => { cancelled = true; };
  }, [valueId, displayValue, categoryFilter]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function search(v: string, clearSelection = true) {
    setQ(v);
    if (clearSelection) onChange("", "", null);
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({ limit: "10" });
        if (v.trim()) params.set("q", v.trim());
        if (categoryFilter) params.set("category", categoryFilter);
        const r = await fetch(`/api/relay/api/finance/tax-groups/search?${params.toString()}`);
        if (r.ok) {
          const d = await r.json() as { data?: TaxGroupOption[] };
          setResults(d.data ?? []);
        }
      } finally { setBusy(false); }
    }, 250);
  }

  function pick(row: TaxGroupOption) {
    setQ(row.code); setResults([]); setOpen(false);
    onChange(row.id, row.code, row);
  }

  return (
    <div className="relative" ref={ref}>
      <input value={q}
        onChange={(e) => search(e.target.value)}
        onFocus={() => { if (!open) search(q, false); }}
        placeholder={placeholder}
        className="w-full h-9 px-3 text-sm font-mono border border-border/60 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors placeholder:text-muted-foreground/40"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border/60 bg-background shadow-lg overflow-hidden">
          {busy ? <p className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</p>
                : results.length === 0 ? <p className="px-3 py-2.5 text-xs text-muted-foreground/60">No results</p>
                : <div className="py-1 max-h-52 overflow-y-auto">
                    {results.map((row) => (
                      <button key={row.id} onClick={() => pick(row)}
                        className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
                      >
                        <span className="font-mono font-medium text-foreground shrink-0">{row.code}</span>
                        <span className="text-muted-foreground truncate">{row.name}</span>
                        {row.rate_value != null && (
                          <span className="ml-auto text-muted-foreground/70 shrink-0">{Number(row.rate_value).toFixed(2)}%</span>
                        )}
                      </button>
                    ))}
                  </div>}
        </div>
      )}
    </div>
  );
}

// ── ITEM DETAILS TAB ──────────────────────────────────────────────────────────

function ItemDetailsTab({ line, entityCode, recordId, currencyCode, onSaved }: {
  line: DocumentLine; entityCode: string; recordId: string; currencyCode: string; onSaved?: (patch: Partial<DocumentLine>) => void;
}) {
  const [desc,      setDesc]      = useState(line.description ?? "");
  const [itemCode,  setItemCode]  = useState(line.item_code   ?? "");
  const [qty,       setQty]       = useState(line.quantity    != null ? String(line.quantity)   : "");
  const [unitCode,  setUnitCode]  = useState(line.unit_code   ?? "");
  const [unitPrice, setUnitPrice] = useState(line.unit_price  != null ? String(line.unit_price) : "");
  const [saving,    setSaving]    = useState(false);
  const [dirty,     setDirty]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  function mark<T>(setter: (v: T) => void) { return (v: T) => { setter(v); setDirty(true); }; }
  const netAmt = (Number(qty) || 0) * (Number(unitPrice) || 0);
  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Partial<DocumentLine> = { description: desc || null, item_code: itemCode || null, quantity: Number(qty) || null, unit_code: unitCode || null, unit_price: Number(unitPrice) || null, line_amount: netAmt || null };
      const res = await relayMutate(lineUrl(entityCode, recordId, line.id), { method: "PATCH", body: JSON.stringify(patch) });
      if (res.ok) {
        setDirty(false);
        onSaved?.(patch);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { setSaving(false); }
  }
  return (
    <div className="px-5 py-4 space-y-4">
      <Field label="Description"><Input value={desc} onChange={mark(setDesc)} placeholder="Line description" /></Field>
      <Field label="Item code"><Input value={itemCode} onChange={mark(setItemCode)} placeholder="ITM-XXX (optional)" className="font-mono text-xs" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Quantity"><Input type="number" value={qty} onChange={mark(setQty)} placeholder="0" className="text-right" /></Field>
        <Field label="Unit"><UomSearch value={unitCode} onChange={mark(setUnitCode)} /></Field>
        <Field label="Unit price"><Input type="number" value={unitPrice} onChange={mark(setUnitPrice)} placeholder="0.00" className="text-right" /></Field>
      </div>
      {qty && unitPrice && (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40 border border-border/40">
          <span className="text-xs text-muted-foreground">Net line total</span>
          <span className="text-sm font-semibold tabular-nums">{fmtAmt(netAmt, currencyCode)}</span>
        </div>
      )}
      {saveError && <InlineError message={saveError} onDismiss={() => setSaveError(null)} />}
      {dirty && <SaveBtn saving={saving} onClick={() => void save()} />}
    </div>
  );
}

// ── ACCOUNTING TAB ────────────────────────────────────────────────────────────

function AccountingTab({ line, distributions, currencyCode, entityCode, recordId, companyCodeId, record, onMutated }: {
  line: DocumentLine; distributions: AccountingDistribution[]; currencyCode: string;
  entityCode: string; recordId: string; companyCodeId?: string;
  record?: Record<string, unknown>; onMutated?: () => void;
}) {
  const cc         = currencyCode;
  const lineAmount = Number(line.line_amount) || 0;
  const lineQty    = Number(line.quantity)    || 0;
  const [accMode, setAccMode] = useState<AccountingMode>(distributions.length > 1 ? "split" : "single");
  const single = distributions[0] ?? null;
  // UUID state (what we send to the API)
  const [sCostCenterId,    setSCostCenterId]    = useState(single?.cost_center_id ?? "");
  const [sCostCenterLabel, setSCostCenterLabel] = useState("");
  const [sProjectId,       setSProjectId]       = useState(single?.project_id     ?? "");
  const [sProjectLabel,    setSProjectLabel]    = useState("");
  const [sAccount,         setSAccount]         = useState(single?.account_code   ?? "");
  const [sIsCapex,    setSIsCapex]    = useState(single?.is_capex       ?? false);
  const [sSaving,     setSSaving]     = useState(false);
  const [sDirty,      setSDirty]      = useState(false);
  const [sError,      setSError]      = useState<string | null>(null);
  const [rowError,    setRowError]    = useState<string | null>(null);
  const [basis, setBasis] = useState<DistBasis>(distributions[0]?.distribution_basis ?? "PERCENT");
  const [rows,  setRows]  = useState<SplitRow[]>(() => distributions.map(distToRow));
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Whether state has been hydrated from real distribution data (vs. header defaults).
  const distributionHydrated = useRef(distributions.length > 0);

  async function resolveLabel(id: string, entity: string, setLabel: (v: string) => void) {
    if (!id) return;
    try {
      const r = await fetch(`/api/relay/api/records/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const d = await r.json() as { data?: Record<string, unknown> };
      if (d.data) {
        const code = String(d.data.code ?? "");
        const name = String(d.data.name ?? "");
        setLabel(code ? `${code} · ${name}` : name);
      }
    } catch { /* ignore */ }
  }

  // On mount: resolve existing UUIDs to labels, or auto-derive from document header.
  useEffect(() => {
    if (distributions.length === 0 && record) {
      // Auto-derive cost centre + project from the document header when no
      // distributions exist yet and the invoice is not sourced from a PO/contract
      // (PO/contract-based: derive from PO line instead — future work).
      const invoiceSource = String(record.invoice_source ?? "");
      const isPOBased = invoiceSource === "po_based" || invoiceSource === "contract_based";
      if (!isPOBased) {
        const headerCcId   = String(record.cost_center_id ?? "");
        const headerProjId = String(record.project_id     ?? "");
        if (headerCcId) {
          setSCostCenterId(headerCcId);
          void resolveLabel(headerCcId, "cost_center", setSCostCenterLabel);
        }
        if (headerProjId) {
          setSProjectId(headerProjId);
          void resolveLabel(headerProjId, "project", setSProjectLabel);
        }
        if (headerCcId || headerProjId) setSDirty(true);
      }
    } else {
      void resolveLabel(sCostCenterId, "cost_center", setSCostCenterLabel);
      void resolveLabel(sProjectId,    "project",     setSProjectLabel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When distributions arrive after mount (async query resolves after sheet opens),
  // hydrate all accounting state from the real distribution data exactly once.
  useEffect(() => {
    if (distributionHydrated.current || distributions.length === 0) return;
    distributionHydrated.current = true;
    const s = distributions[0]!;
    setAccMode(distributions.length > 1 ? "split" : "single");
    setSAccount(s.account_code   ?? "");
    setSIsCapex(s.is_capex       ?? false);
    setSCostCenterId(s.cost_center_id ?? "");
    setSProjectId(s.project_id   ?? "");
    setBasis(s.distribution_basis ?? "PERCENT");
    setRows(distributions.map(distToRow));
    if (s.cost_center_id) void resolveLabel(s.cost_center_id, "cost_center", setSCostCenterLabel);
    if (s.project_id)     void resolveLabel(s.project_id,     "project",     setSProjectLabel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributions]);

  function recompute(r: SplitRow, b: DistBasis): SplitRow {
    let amt = 0;
    if (b === "PERCENT")  amt = Math.round(lineAmount * r.split_pct * 100) / 10000;
    if (b === "AMOUNT")   amt = r.split_amount;
    if (b === "QUANTITY") amt = lineQty > 0 ? Math.round(r.split_quantity * (lineAmount / lineQty) * 100) / 100 : 0;
    return { ...r, distributed_amount: amt, distribution_basis: b };
  }

  function updateRow(idx: number, patch: Partial<SplitRow>) {
    setRows((p) => { const n = [...p]; n[idx] = recompute({ ...n[idx]!, ...patch, _dirty: true }, basis); return n; });
  }

  function evenSplit() {
    const n = rows.length; if (!n) return;
    const perPct  = Math.floor(10000 / n) / 100;
    const lastPct = Math.round((100 - perPct * (n - 1)) * 100) / 100;
    setRows((p) => p.map((r, i) => recompute({ ...r, split_pct: i === n - 1 ? lastPct : perPct, _dirty: true }, basis)));
  }

  async function saveSingle() {
    if (!sAccount.trim()) {
      setSError("GL account code is required — enter an account code (e.g. 6100-OPEX) before saving.");
      return;
    }
    setSSaving(true);
    setSError(null);
    try {
      const payload = { distribution_basis: "PERCENT", split_pct: 100, distributed_amount: lineAmount, currency_code: cc, account_source: "FIXED", account_code: sAccount.trim(), cost_center_id: sCostCenterId || null, project_id: sProjectId || null, is_capex: sIsCapex };
      const url = single?.id ? distUrl(entityCode, recordId, line.id, single.id) : distUrl(entityCode, recordId, line.id);
      const res = await relayMutate(url, { method: single?.id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      if (res.ok) {
        setSDirty(false);
        onMutated?.();
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSError(body.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setSError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { setSSaving(false); }
  }

  async function saveRow(idx: number) {
    const row = rows[idx]; if (!row?._dirty) return;
    if (row.account_source === "FIXED" && !row.account_code.trim()) {
      setRowError("GL account code is required for Fixed GL source. Enter a code in the expanded row details.");
      return;
    }
    const key = row.id ?? `new-${idx}`;
    setSaving((s) => ({ ...s, [key]: true }));
    setRowError(null);
    try {
      const payload = { distribution_basis: row.distribution_basis, split_pct: row.distribution_basis === "PERCENT" ? row.split_pct : null, split_amount: row.distribution_basis === "AMOUNT" ? row.split_amount : null, split_quantity: row.distribution_basis === "QUANTITY" ? row.split_quantity : null, distributed_amount: row.distributed_amount, currency_code: row.currency_code || cc, account_source: row.account_source, account_code: row.account_code.trim() || null, cost_center_id: row.cost_center_id || null, project_id: row.project_id || null, is_capex: row.is_capex, description: row.description || null };
      const url = row._isNew || !row.id ? distUrl(entityCode, recordId, line.id) : distUrl(entityCode, recordId, line.id, row.id);
      const res = await relayMutate(url, { method: row._isNew || !row.id ? "POST" : "PATCH", body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setRowError(body.error ?? `Save failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as { data: AccountingDistribution };
      setRows((p) => { const n = [...p]; n[idx] = { ...distToRow(body.data), _expanded: row._expanded }; return n; });
      onMutated?.();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { setSaving((s) => { const n = { ...s }; delete n[key]; return n; }); }
  }

  async function deleteRow(idx: number) {
    const row = rows[idx]; if (!row) return;
    if (row._isNew || !row.id) { setRows((p) => p.filter((_, i) => i !== idx)); return; }
    const key = row.id; setSaving((s) => ({ ...s, [key]: true }));
    try {
      await relayMutate(distUrl(entityCode, recordId, line.id, row.id), { method: "DELETE" });
      setRows((p) => p.filter((_, i) => i !== idx)); onMutated?.();
    } finally { setSaving((s) => { const n = { ...s }; delete n[key]; return n; }); }
  }

  const allocTarget = useMemo(() => {
    if (basis === "PERCENT")  return rows.reduce((s, r) => s + r.split_pct, 0);
    if (basis === "QUANTITY") return rows.reduce((s, r) => s + r.split_quantity, 0);
    return rows.reduce((s, r) => s + r.distributed_amount, 0);
  }, [rows, basis]);
  const maxTarget = basis === "PERCENT" ? 100 : basis === "QUANTITY" ? lineQty : lineAmount;

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="inline-flex border border-border rounded-lg overflow-hidden bg-muted/20 text-xs">
        {(["single", "split"] as AccountingMode[]).map((m) => (
          <button key={m} onClick={() => setAccMode(m)}
            className={cn("px-4 py-1.5 font-semibold capitalize transition-colors", accMode === m ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}
          >{m}</button>
        ))}
      </div>

      {accMode === "single" && (
        <div className="space-y-3">
          <Field label="Cost centre">
            <EntitySearchInput
              entityCode="cost_center"
              companyCodeId={companyCodeId}
              valueId={sCostCenterId}
              displayValue={sCostCenterLabel}
              onSelect={(id, label) => { setSCostCenterId(id); setSCostCenterLabel(label); setSDirty(true); }}
              placeholder="Search cost centre…"
            />
          </Field>
          <Field label="Project">
            <EntitySearchInput
              entityCode="project"
              companyCodeId={companyCodeId}
              valueId={sProjectId}
              displayValue={sProjectLabel}
              onSelect={(id, label) => { setSProjectId(id); setSProjectLabel(label); setSDirty(true); }}
              placeholder="Search project…"
            />
          </Field>
          <Field label="GL account">
            <GlAccountSearch value={sAccount} companyCodeId={companyCodeId} onChange={(code) => { setSAccount(code); setSDirty(true); }} />
          </Field>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/40 bg-muted/10">
            <div>
              <p className="text-xs font-medium text-foreground">Capital expenditure</p>
              <p className="text-2xs text-muted-foreground">Mark if this cost is CapEx rather than OpEx</p>
            </div>
            <button onClick={() => { setSIsCapex((v) => !v); setSDirty(true); }}
              className={cn("h-6 w-11 rounded-full transition-colors relative", sIsCapex ? "bg-foreground" : "bg-muted border border-border")}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform", sIsCapex ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </div>
          {sError && <InlineError message={sError} onDismiss={() => setSError(null)} />}
          {sDirty && <SaveBtn saving={sSaving} onClick={() => void saveSingle()} />}
        </div>
      )}

      {accMode === "split" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <BasisToggle value={basis} onChange={(b) => { setBasis(b); setRows((p) => p.map((r) => recompute({ ...r }, b))); }} />
            {rows.length >= 2 && (
              <button onClick={evenSplit} className="h-8 px-3 text-xs font-semibold border border-border/60 rounded-lg text-muted-foreground hover:text-foreground hover:border-border transition-colors">Even split</button>
            )}
          </div>

          {rows.length > 0 && (
            <div className="grid gap-2 px-0.5" style={{ gridTemplateColumns: "18px 1fr 1fr 88px 88px 22px 22px" }}>
              <span />
              <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Cost Centre</span>
              <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Project</span>
              <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground text-right">{basis === "PERCENT" ? "Split %" : basis === "AMOUNT" ? "Amount" : "Qty"}</span>
              <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground text-right">Distributed</span>
              <span /><span />
            </div>
          )}

          {rows.length === 0 && (
            <div className="py-8 text-center space-y-1">
              <p className="text-sm text-muted-foreground">No cost splits configured</p>
              <p className="text-xs text-muted-foreground/60">Add a split to assign cost centres or projects</p>
            </div>
          )}

          <div className="space-y-1">
            {rows.map((row, idx) => {
              const key = row.id ?? `new-${idx}`; const isSaving = !!saving[key];
              return (
                <div key={key} className="space-y-1">
                  <div className={cn("grid gap-2 items-center px-1 py-1.5 rounded-md", row._isNew && "border border-dashed border-border/60 bg-muted/10", row._dirty && !row._isNew && "bg-warning/5")}
                    style={{ gridTemplateColumns: "18px 1fr 1fr 88px 88px 22px 22px" }}
                  >
                    <span className="text-2xs text-muted-foreground tabular-nums text-center">{row.distribution_no}</span>
                    <input value={row.cost_center_id} placeholder="Cost Centre" onChange={(e) => updateRow(idx, { cost_center_id: e.target.value })} className="h-8 px-2 text-xs border border-border/50 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/40 placeholder:text-muted-foreground/40" />
                    <input value={row.project_id} placeholder="Project" onChange={(e) => updateRow(idx, { project_id: e.target.value })} className="h-8 px-2 text-xs border border-border/50 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/40 placeholder:text-muted-foreground/40" />
                    <input type="number" placeholder="0"
                      value={basis === "PERCENT" ? (row.split_pct || "") : basis === "AMOUNT" ? (row.split_amount || "") : (row.split_quantity || "")}
                      onChange={(e) => { const v = Number(e.target.value) || 0; updateRow(idx, basis === "PERCENT" ? { split_pct: v } : basis === "AMOUNT" ? { split_amount: v } : { split_quantity: v }); }}
                      className="h-8 px-2 text-xs text-right border border-border/50 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/40 placeholder:text-muted-foreground/40"
                    />
                    <span className="text-xs tabular-nums font-medium text-right pr-1">{fmtAmt(row.distributed_amount)}</span>
                    <button onClick={() => updateRow(idx, { _expanded: !row._expanded, _dirty: row._dirty })}
                      className={cn("h-5 w-5 flex items-center justify-center rounded transition-colors", row._expanded ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}
                    ><ChevronsUpDown className="h-3 w-3" /></button>
                    <button onClick={() => void deleteRow(idx)} disabled={isSaving} className="h-5 w-5 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"><Trash2 className="h-3 w-3" /></button>
                  </div>

                  {row._expanded && (
                    <div className="ml-5 mr-1 px-3 py-3 rounded-lg bg-muted/30 border border-border/40 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">GL source</label>
                          <select value={row.account_source} onChange={(e) => updateRow(idx, { account_source: e.target.value })} className="w-full h-8 px-2 text-xs border border-border/50 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/40">
                            <option value="FROM_CATEGORY">From category</option>
                            <option value="POSTING_ROLE">Posting role</option>
                            <option value="FIXED">Fixed GL</option>
                            <option value="FROM_INTENT">From intent</option>
                          </select>
                        </div>
                        {row.account_source === "FIXED" ? (
                          <div className="space-y-1.5">
                            <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">GL account</label>
                            <GlAccountSearch value={row.account_code} companyCodeId={companyCodeId} onChange={(code) => updateRow(idx, { account_code: code })} className="h-8 text-xs" />
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">CapEx</label>
                            <button onClick={() => updateRow(idx, { is_capex: !row.is_capex })} className={cn("w-full h-8 px-2 text-xs font-semibold rounded-md border transition-colors text-left", row.is_capex ? "bg-foreground text-background border-foreground" : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground")}>
                              {row.is_capex ? "Capital (CapEx)" : "Expense (OpEx)"}
                            </button>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Note</label>
                          <input value={row.description} onChange={(e) => updateRow(idx, { description: e.target.value })} placeholder="Allocation note" className="w-full h-8 px-2 text-xs border border-border/50 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/40" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Tax override</label>
                          <select value={row.tax_treatment_override || ""} onChange={(e) => updateRow(idx, { tax_treatment_override: e.target.value })} className="w-full h-8 px-2 text-xs border border-border/50 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/40">
                            <option value="">Standard</option>
                            <option value="ZERO_RATED">Zero rated</option>
                            <option value="EXEMPT">Exempt</option>
                            <option value="REVERSE_CHARGE">Reverse charge</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {row._dirty && (
                    <div className="flex justify-end pr-1">
                      <button onClick={() => void saveRow(idx)} disabled={isSaving} className="h-6 px-3 text-2xs font-semibold rounded-md bg-foreground text-background hover:opacity-85 disabled:opacity-40 transition-opacity">
                        {isSaving ? "Saving…" : "Save row"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {rowError && <InlineError message={rowError} onDismiss={() => setRowError(null)} />}
          {rows.length > 0 && <RemainingBar allocated={allocTarget} target={maxTarget} basis={basis} currency={cc} />}

          <button onClick={() => { const nextNo = (rows[rows.length - 1]?.distribution_no ?? 0) + 1; setRows((p) => [...p, blankRow(cc, nextNo)]); }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          ><Plus className="h-3.5 w-3.5" /> Add split</button>
        </>
      )}
    </div>
  );
}

// ── CLASSIFY TAB ──────────────────────────────────────────────────────────────

function ClassifyTab({ line, entityCode, recordId, companyCodeId, hasAiClassification, onSaved }: {
  line: DocumentLine; entityCode: string; recordId: string; companyCodeId?: string; hasAiClassification?: boolean; onSaved?: () => void;
}) {
  const lineData = (line.data as Record<string, unknown> | null) ?? {};
  const lineAny  = line as Record<string, unknown>;

  const [spendCatId,    setSpendCatId]    = useState(String(lineAny.spend_category_id    ?? ""));
  const [spendCatLabel, setSpendCatLabel] = useState("");
  const [intentId,      setIntentId]      = useState(String(lineAny.business_intent_id   ?? ""));
  const [intentLabel,   setIntentLabel]   = useState("");
  const [unspscCode, setUnspscCode] = useState(String(lineData.unspsc_code ?? ""));
  const [hsCode,     setHsCode]     = useState(String(lineData.hs_code     ?? ""));

  const [saving,        setSaving]        = useState(false);
  const [dirty,         setDirty]         = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);
  // Holds the classification decision returned inline by the PATCH/classify call
  const [localDecision, setLocalDecision] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    async function resolveLabel(id: string, entity: string, set: (v: string) => void) {
      if (!id) return;
      try {
        const r = await fetch(`/api/relay/api/records/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`);
        if (!r.ok) return;
        const d = await r.json() as { data?: Record<string, unknown> };
        if (d.data) {
          const code = String(d.data.code ?? "");
          const name = String(d.data.name ?? "");
          set(code ? `${code} · ${name}` : name);
        }
      } catch { /* ignore */ }
    }
    void resolveLabel(spendCatId, "spend_category",  setSpendCatLabel);
    void resolveLabel(intentId,   "business_intent", setIntentLabel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSpendCatSelect(id: string, label: string) {
    setSpendCatId(id); setSpendCatLabel(label); setDirty(true);
    if (!id || intentId) return;
    try {
      const r = await fetch(`/api/relay/api/records/spend_category/${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const d = await r.json() as { data?: Record<string, unknown> };
      const defIntentId = String(d.data?.default_intent_id ?? "");
      if (!defIntentId) return;
      setIntentId(defIntentId);
      const r2 = await fetch(`/api/relay/api/records/business_intent/${encodeURIComponent(defIntentId)}`);
      if (!r2.ok) return;
      const d2 = await r2.json() as { data?: Record<string, unknown> };
      if (d2.data) {
        const code = String(d2.data.code ?? "");
        const name = String(d2.data.name ?? "");
        setIntentLabel(code ? `${code} · ${name}` : name);
      }
    } catch { /* ignore */ }
  }

  async function save() {
    setSaving(true); setSaveError(null);
    try {
      const patch = {
        spend_category_id:  spendCatId || null,
        business_intent_id: intentId   || null,
        data: { ...lineData, unspsc_code: unspscCode || null, hs_code: hsCode || null },
      };
      const res = await relayMutate(lineUrl(entityCode, recordId, line.id), { method: "PATCH", body: JSON.stringify(patch) });
      if (res.ok) {
        const respBody = await res.json() as Record<string, unknown>;
        setDirty(false);
        // PATCH auto-classifies when spend_category_id changes and returns the decision inline
        if (respBody.classification) {
          setLocalDecision(respBody.classification as Record<string, unknown>);
        } else if (hasAiClassification && (spendCatId || intentId)) {
          // Explicit classify when auto-classify didn't fire (e.g. only intent changed)
          const cr = await relayMutate(
            `/api/finance/ap/invoices/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(line.id)}/classify`,
            { method: "POST" },
          );
          if (cr.ok) {
            const cd = await cr.json() as { classification?: Record<string, unknown> };
            if (cd.classification) setLocalDecision(cd.classification);
          }
        }
        onSaved?.();
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { setSaving(false); }
  }

  // Merge: localDecision (from save response) overlays the persisted decision
  const lineWithDecision: Record<string, unknown> = localDecision
    ? { ...lineAny, classification_decision: localDecision }
    : lineAny;

  return (
    <div className="px-5 py-4 space-y-4">
      <Field label="UNSPSC code">
        <Input value={unspscCode} onChange={(v) => { setUnspscCode(v); setDirty(true); }} placeholder="e.g. 80101504" className="font-mono" />
      </Field>
      <Field label="Spend category">
        <EntitySearchInput
          entityCode="spend_category"
          companyCodeId={companyCodeId}
          valueId={spendCatId}
          displayValue={spendCatLabel}
          onSelect={(id, label) => void handleSpendCatSelect(id, label)}
          placeholder="Search spend category…"
        />
      </Field>
      <Field label="Business intent">
        <EntitySearchInput
          entityCode="business_intent"
          valueId={intentId}
          displayValue={intentLabel}
          onSelect={(id, label) => { setIntentId(id); setIntentLabel(label); setDirty(true); }}
          placeholder="Search business intent…"
        />
        {!spendCatId && (
          <p className="text-2xs text-muted-foreground/50 mt-0.5">Selecting a spend category will auto-suggest the intent.</p>
        )}
      </Field>
      <Field label="HS / Trade code">
        <Input value={hsCode} onChange={(v) => { setHsCode(v); setDirty(true); }} placeholder="e.g. 8471.30 (goods only)" className="font-mono" />
      </Field>

      {saveError && <InlineError message={saveError} onDismiss={() => setSaveError(null)} />}
      {dirty && <SaveBtn saving={saving} onClick={() => void save()} />}

      {hasAiClassification && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Classification result</p>
          <ClassificationDecisionPanel
            line={lineWithDecision}
            entityCode={entityCode}
            recordId={recordId}
            onRefresh={() => { setLocalDecision(null); onSaved?.(); }}
            previewDecision={localDecision}
          />
        </div>
      )}
    </div>
  );
}

// ── DISCOUNT TAB ──────────────────────────────────────────────────────────────

function DiscountTab({ line, currencyCode, entityCode, recordId, onSaved }: {
  line: DocumentLine; currencyCode: string; entityCode: string; recordId: string; onSaved?: (patch: Partial<DocumentLine>) => void;
}) {
  const netAmt = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0) || Number(line.line_amount) || 0;
  const [discountPct, setDiscountPct] = useState(line.discount_pct != null ? String(line.discount_pct) : "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const discPct = Math.min(Math.max(Number(discountPct) || 0, 0), 100);
  const discountAmt = Math.round(netAmt * discPct * 100) / 10000;
  const afterDisc   = netAmt - discountAmt;
  const waterfallRows = useMemo((): WaterfallRow[] => {
    if (discPct <= 0 || netAmt <= 0) return [];
    return [{ label: "Net amount", amount: netAmt }, { label: `Discount (${discPct}%)`, amount: discountAmt, sign: "−", isSub: true }, { label: "After discount", amount: afterDisc, isTotal: true }];
  }, [discPct, netAmt, discountAmt, afterDisc]);
  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Partial<DocumentLine> = { discount_pct: discPct > 0 ? discPct : null, discount_amount: discPct > 0 ? discountAmt : null };
      const res = await relayMutate(lineUrl(entityCode, recordId, line.id), { method: "PATCH", body: JSON.stringify(patch) });
      if (res.ok) {
        setDirty(false);
        onSaved?.(patch);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { setSaving(false); }
  }
  return (
    <div className="px-5 py-4 space-y-4">
      <Field label="Trade discount %">
        <div className="relative">
          <Input type="number" value={discountPct} onChange={(v) => { setDiscountPct(v); setDirty(true); }} placeholder="0.00" className="text-right pr-7" />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
        </div>
      </Field>
      {netAmt > 0 && <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">Base net: <span className="font-semibold tabular-nums text-foreground">{fmtAmt(netAmt, currencyCode)}</span></div>}
      {waterfallRows.length > 0 ? <AmountWaterfall rows={waterfallRows} currency={currencyCode} /> : <p className="text-xs text-muted-foreground/60 text-center py-4">Enter a discount percentage to see the deduction preview.</p>}
      {saveError && <InlineError message={saveError} onDismiss={() => setSaveError(null)} />}
      {dirty && <SaveBtn saving={saving} onClick={() => void save()} />}
    </div>
  );
}

// ── CHARGES TAB ───────────────────────────────────────────────────────────────

const CHARGE_TYPES = [
  { value: "FREIGHT", label: "Freight / Shipping" }, { value: "HANDLING", label: "Handling fee" },
  { value: "INSURANCE", label: "Insurance" }, { value: "SURCHARGE", label: "Surcharge" },
  { value: "REBATE", label: "Rebate (credit)" }, { value: "OTHER", label: "Other" },
];

function ChargesTab({ line, currencyCode, entityCode, recordId, onMutated }: {
  line: DocumentLine; currencyCode: string; entityCode: string; recordId: string; onMutated?: () => void;
}) {
  const existing = Array.isArray((line.data as Record<string, unknown>)?.charges)
    ? ((line.data as Record<string, unknown>).charges as Omit<ChargeRow, "_dirty" | "_isNew">[]).map((c) => ({ ...c, _dirty: false, _isNew: false }))
    : [];
  const [charges, setCharges] = useState<ChargeRow[]>(existing);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  function updateCharge(id: string, patch: Partial<ChargeRow>) {
    setCharges((p) => p.map((c) => c.id === id ? { ...c, ...patch, _dirty: true } : c));
  }
  const isDirty = charges.some((c) => c._dirty);
  const totalCharge = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = charges.map(({ id, charge_type, charge_code, description, amount }) => ({ id, charge_type, charge_code: charge_code || null, description: description || null, amount: Number(amount) || 0, currency_code: currencyCode }));
      const patch = { data: { ...((line.data as Record<string, unknown>) ?? {}), charges: payload } };
      const res = await relayMutate(lineUrl(entityCode, recordId, line.id), { method: "PATCH", body: JSON.stringify(patch) });
      if (res.ok) {
        setCharges((p) => p.map((c) => ({ ...c, _dirty: false, _isNew: false })));
        onMutated?.();
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { setSaving(false); }
  }
  return (
    <div className="px-5 py-4 space-y-4">
      {charges.length === 0 ? (
        <div className="py-8 text-center space-y-1"><p className="text-sm text-muted-foreground">No additional charges</p><p className="text-xs text-muted-foreground/60">Freight, handling, surcharges and rebates</p></div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 px-0.5" style={{ gridTemplateColumns: "1fr 80px 80px 22px" }}>
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Type / Description</span>
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Code</span>
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground text-right">Amount</span>
            <span />
          </div>
          {charges.map((c) => (
            <div key={c.id} className="grid gap-2 items-start" style={{ gridTemplateColumns: "1fr 80px 80px 22px" }}>
              <div className="space-y-1">
                <select value={c.charge_type} onChange={(e) => updateCharge(c.id, { charge_type: e.target.value })} className="w-full h-8 px-2 text-xs border border-border/50 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/40">
                  {CHARGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input value={c.description} placeholder="Note (optional)" onChange={(e) => updateCharge(c.id, { description: e.target.value })} className="w-full h-7 px-2 text-xs border border-border/40 rounded-md bg-transparent placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring/30" />
              </div>
              <input value={c.charge_code} placeholder="CHG-001" onChange={(e) => updateCharge(c.id, { charge_code: e.target.value })} className="h-8 px-2 text-xs font-mono border border-border/50 rounded-md bg-transparent placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring/40" />
              <input type="number" value={c.amount} placeholder="0.00" onChange={(e) => updateCharge(c.id, { amount: e.target.value })} className="h-8 px-2 text-xs text-right border border-border/50 rounded-md bg-transparent placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring/40" />
              <button onClick={() => setCharges((p) => p.filter((x) => x.id !== c.id))} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors mt-1.5"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2 border-t border-border/40 text-xs">
            <span className="text-muted-foreground">Total charges</span>
            <span className="font-semibold tabular-nums">{fmtAmt(totalCharge, currencyCode)}</span>
          </div>
        </div>
      )}
      <button onClick={() => setCharges((p) => [...p, { id: uid(), charge_type: "FREIGHT", charge_code: "", description: "", amount: "", _dirty: true, _isNew: true }])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"><Plus className="h-3.5 w-3.5" /> Add charge</button>
      {saveError && <InlineError message={saveError} onDismiss={() => setSaveError(null)} />}
      {isDirty && <SaveBtn saving={saving} onClick={() => void save()} />}
    </div>
  );
}

// ── TAX TAB ───────────────────────────────────────────────────────────────────

function TaxTab({ line, currencyCode, entityCode, recordId, onSaved }: {
  line: DocumentLine; currencyCode: string; entityCode: string; recordId: string; onSaved?: (patch: Partial<DocumentLine>) => void;
}) {
  const netAmt   = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0) || Number(line.line_amount) || 0;
  const lineAny = line as unknown as Record<string, unknown>;
  const lineData = (line.data as Record<string, unknown> | null) ?? {};
  const [taxGroupId, setTaxGroupId] = useState(String(lineAny.tax_group_id ?? ""));
  const [taxCode, setTaxCode] = useState(String(lineAny.tax_group_code ?? lineData.tax_group_code ?? line.tax_code ?? ""));
  const [taxAmt,  setTaxAmt]  = useState(line.tax_amount             != null ? String(line.tax_amount)             : "");
  const [whtGroupId, setWhtGroupId] = useState(String(lineAny.withholding_tax_group_id ?? ""));
  const [whtCode, setWhtCode] = useState(String(lineAny.withholding_tax_group_code ?? lineData.wht_group_code ?? lineData.wht_code ?? ""));
  const [whtAmt,  setWhtAmt]  = useState(line.withholding_tax_amount != null ? String(line.withholding_tax_amount) : "");
  const [saving,  setSaving]  = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  function mark<T>(setter: (v: T) => void) { return (v: T) => { setter(v); setDirty(true); }; }
  function selectTaxGroup(id: string, code: string) {
    setTaxGroupId(id); setTaxCode(code); setDirty(true);
  }
  function selectWhtGroup(id: string, code: string) {
    setWhtGroupId(id); setWhtCode(code); setDirty(true);
  }
  const taxAmtNum = Number(taxAmt) || 0; const whtAmtNum = Number(whtAmt) || 0;
  const waterfallRows = useMemo((): WaterfallRow[] => {
    if (taxAmtNum === 0 && whtAmtNum === 0) return [];
    const rows: WaterfallRow[] = [{ label: "Pre-tax amount", amount: netAmt }];
    if (taxAmtNum !== 0) rows.push({ label: `Tax (${taxCode || "—"})`, amount: taxAmtNum, sign: "+", isSub: true });
    if (whtAmtNum !== 0) rows.push({ label: `WHT (${whtCode || "—"})`, amount: whtAmtNum, sign: "−", isSub: true, dimmed: true });
    rows.push({ label: "Net after tax", amount: netAmt + taxAmtNum - whtAmtNum, isTotal: true });
    return rows;
  }, [netAmt, taxAmtNum, whtAmtNum, taxCode, whtCode]);
  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Record<string, unknown> = {
        tax_group_id: taxGroupId || null,
        withholding_tax_group_id: whtGroupId || null,
        tax_code: taxCode || null,
        tax_amount: taxAmtNum > 0 ? taxAmtNum : null,
        withholding_tax_amount: whtAmtNum > 0 ? whtAmtNum : null,
      };
      const res = await relayMutate(apLineUrl(entityCode, recordId, line.id), { method: "PATCH", body: JSON.stringify(patch) });
      if (res.ok) {
        const body = await res.json().catch(() => null) as unknown;
        const bodyObj = body && typeof body === "object" ? body as Record<string, unknown> : null;
        const lineObj = bodyObj?.line && typeof bodyObj.line === "object" ? bodyObj.line as Record<string, unknown> : null;
        const updated = lineObj ?? bodyObj;
        const nextTax = updated && updated["tax_amount"] != null ? Number(updated["tax_amount"]) : taxAmtNum;
        const nextWht = updated && updated["withholding_tax_amount"] != null ? Number(updated["withholding_tax_amount"]) : whtAmtNum;
        setTaxAmt(nextTax ? String(nextTax) : "");
        setWhtAmt(nextWht ? String(nextWht) : "");
        setDirty(false);
        onSaved?.({
          tax_code: taxCode || null,
          tax_amount: nextTax || null,
          withholding_tax_amount: nextWht || null,
        });
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { setSaving(false); }
  }
  return (
    <div className="px-5 py-4 space-y-4">
      <div className="rounded-lg border border-border/50 bg-background overflow-hidden">
        <div className="px-3 py-2 bg-muted/30 border-b border-border/40"><span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Output tax</span></div>
        <div className="px-3 py-3 grid grid-cols-2 gap-3">
          <Field label="Tax code">
            <TaxGroupSearch valueId={taxGroupId} displayValue={taxCode} categoryFilter="INDIRECT" placeholder="Search tax code…" onChange={selectTaxGroup} />
          </Field>
          <Field label="Tax amount"><Input type="number" value={taxAmt} onChange={mark(setTaxAmt)} placeholder="0.00" className="text-right" /></Field>
        </div>
      </div>
      <div className="rounded-lg border border-border/50 bg-background overflow-hidden">
        <div className="px-3 py-2 bg-muted/30 border-b border-border/40"><span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Withholding tax</span></div>
        <div className="px-3 py-3 grid grid-cols-2 gap-3">
          <Field label="WHT code">
            <TaxGroupSearch valueId={whtGroupId} displayValue={whtCode} categoryFilter="WITHHOLDING" placeholder="Search WHT code…" onChange={selectWhtGroup} />
          </Field>
          <Field label="WHT amount"><Input type="number" value={whtAmt} onChange={mark(setWhtAmt)} placeholder="0.00" className="text-right" /></Field>
        </div>
      </div>
      {waterfallRows.length > 0 && <AmountWaterfall rows={waterfallRows} currency={currencyCode} />}
      {saveError && <InlineError message={saveError} onDismiss={() => setSaveError(null)} />}
      {dirty && <SaveBtn saving={saving} onClick={() => void save()} />}
    </div>
  );
}

// ── RETENTION TAB ─────────────────────────────────────────────────────────────

function RetentionTab({ line, currencyCode, entityCode, recordId, onSaved }: {
  line: DocumentLine; currencyCode: string; entityCode: string; recordId: string; onSaved?: (patch: Partial<DocumentLine>) => void;
}) {
  const baseAmt  = Number(line.line_amount) || 0;
  const lineData = (line.data as Record<string, unknown> | null) ?? {};
  const [retentionPct, setRetentionPct] = useState(line.retention_pct != null ? String(line.retention_pct) : "");
  const [releaseTerms, setReleaseTerms] = useState(String(lineData.retention_release_terms ?? ""));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  function mark<T>(setter: (v: T) => void) { return (v: T) => { setter(v); setDirty(true); }; }
  const retPct     = Math.min(Math.max(Number(retentionPct) || 0, 0), 100);
  const retAmt     = Math.round(baseAmt * retPct * 100) / 10000;
  const netPayable = baseAmt - retAmt;
  const waterfallRows = useMemo((): WaterfallRow[] => {
    if (retPct <= 0 || baseAmt <= 0) return [];
    return [{ label: "Gross payable", amount: baseAmt }, { label: `Retention (${retPct}%)`, amount: retAmt, sign: "−", isSub: true }, { label: "Due now", amount: netPayable, isTotal: true }];
  }, [retPct, baseAmt, retAmt, netPayable]);
  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Partial<DocumentLine> = { retention_pct: retPct > 0 ? retPct : null, retention_amount: retPct > 0 ? retAmt : null, data: { ...lineData, retention_release_terms: releaseTerms || null } };
      const res = await relayMutate(lineUrl(entityCode, recordId, line.id), { method: "PATCH", body: JSON.stringify(patch) });
      if (res.ok) {
        setDirty(false);
        onSaved?.(patch);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { setSaving(false); }
  }
  return (
    <div className="px-5 py-4 space-y-4">
      <Field label="Retention %">
        <div className="relative">
          <Input type="number" value={retentionPct} onChange={mark(setRetentionPct)} placeholder="0.00" className="text-right pr-7" />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
        </div>
      </Field>
      {baseAmt > 0 && <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">Base amount: <span className="font-semibold tabular-nums text-foreground">{fmtAmt(baseAmt, currencyCode)}</span></div>}
      {waterfallRows.length > 0 ? <AmountWaterfall rows={waterfallRows} currency={currencyCode} /> : <p className="text-xs text-muted-foreground/60 text-center py-2">Enter a retention percentage to see the hold-back amount.</p>}
      <Field label="Release conditions">
        <textarea value={releaseTerms} onChange={(e) => mark(setReleaseTerms)(e.target.value)} rows={3}
          placeholder="e.g. On practical completion certificate or 6 months after delivery"
          className={cn("w-full px-3 py-2 text-xs border border-border/60 rounded-lg bg-transparent resize-none", "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors placeholder:text-muted-foreground/40")}
        />
      </Field>
      {saveError && <InlineError message={saveError} onDismiss={() => setSaveError(null)} />}
      {dirty && <SaveBtn saving={saving} onClick={() => void save()} />}
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export function LineEditorSheet({
  open, onOpenChange, line, distributions, currencyCode, companyCodeId, record, entityCode, recordId,
  hasAiClassification, initialTab, onLineSaved, onMutated, onLineCopied, onLineDeleted,
}: LineEditorSheetProps) {
  const cc         = currencyCode ?? "USD";
  const lineAmount = Number(line.line_amount) || 0;
  const [tab, setTab] = useState<TabId>(initialTab ?? "details");

  const tabs: { id: TabId; label: string; badge?: string }[] = [
    { id: "details",    label: "Item"       },
    { id: "classify",   label: "Classify",  badge: (line as Record<string, unknown>).spend_category_id ? "✓" : undefined },
    { id: "accounting", label: "Accounting", badge: distributions.length > 0 ? String(distributions.length) : undefined },
    { id: "tax",        label: "Tax",       badge: line.tax_amount     ? "✓"                      : undefined },
    { id: "discount",   label: "Discount",  badge: line.discount_pct   ? `${line.discount_pct}%`  : undefined },
    { id: "charges",    label: "Charges"    },
    { id: "retention",  label: "Retention", badge: line.retention_pct  ? `${line.retention_pct}%` : undefined },
  ];

  const subtitle = line.quantity != null && line.unit_code
    ? `${fmtAmt(lineAmount, cc)} · ${Number(line.quantity).toLocaleString()} ${line.unit_code}${line.unit_price != null ? ` · ${fmtAmt(Number(line.unit_price))}/unit` : ""}`
    : fmtAmt(lineAmount, cc);

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="transactional"
      widthKey={`${entityCode}:line-editor`}
      defaultWidth={520}
      expandedWidth={860}
      minWidth={380}
      maxWidth="92vw"
      resizable
      expandable
      badge={`LINE ${line.line_number}`}
      title={line.description ?? line.item_code ?? `Line ${line.line_number}`}
      subtitle={subtitle}
      headerRight={
        distributions.length > 0
          ? <span className="shrink-0 inline-flex items-center h-5 px-1.5 rounded text-2xs font-semibold bg-muted border border-border/50 text-muted-foreground leading-none">
              {distributions.length} split{distributions.length !== 1 ? "s" : ""}
            </span>
          : undefined
      }
      headerBottom={
        <div className="flex overflow-x-auto scrollbar-none px-5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 shrink-0 px-2.5 py-2.5 text-xs font-semibold border-b-2 transition-colors",
                tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.badge && (
                <span className={cn(
                  "inline-flex items-center h-4 px-1.5 rounded-sm text-2xs font-semibold border leading-none",
                  tab === t.id ? "bg-foreground/10 text-foreground border-foreground/20" : "bg-muted text-muted-foreground border-border/50",
                )}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      }
      footerStart={
        distributions.length > 0
          ? `${distributions.length} split${distributions.length !== 1 ? "s" : ""} · ${fmtAmt(lineAmount, cc)} allocable`
          : `${fmtAmt(lineAmount, cc)} unallocated`
      }
      footerEnd={
        <button
          onClick={() => onOpenChange(false)}
          className="h-8 px-4 text-xs font-semibold border border-border/60 rounded-lg text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          Done
        </button>
      }
    >
      {tab === "details"    && <ItemDetailsTab  line={line} entityCode={entityCode} recordId={recordId} currencyCode={cc} onSaved={onLineSaved} />}
      {tab === "accounting" && <AccountingTab   line={line} distributions={distributions} currencyCode={cc} entityCode={entityCode} recordId={recordId} companyCodeId={companyCodeId} record={record} onMutated={onMutated} />}
      {tab === "classify"   && <ClassifyTab     line={line} entityCode={entityCode} recordId={recordId} companyCodeId={companyCodeId} hasAiClassification={hasAiClassification} onSaved={onMutated} />}
      {tab === "discount"   && <DiscountTab     line={line} currencyCode={cc} entityCode={entityCode} recordId={recordId} onSaved={onLineSaved} />}
      {tab === "charges"    && <ChargesTab      line={line} currencyCode={cc} entityCode={entityCode} recordId={recordId} onMutated={onMutated} />}
      {tab === "tax"        && <TaxTab          line={line} currencyCode={cc} entityCode={entityCode} recordId={recordId} onSaved={onLineSaved} />}
      {tab === "retention"  && <RetentionTab    line={line} currencyCode={cc} entityCode={entityCode} recordId={recordId} onSaved={onLineSaved} />}
    </DrawerShell>
  );
}
