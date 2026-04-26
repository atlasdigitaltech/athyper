"use client";

/**
 * LineComposerSheet
 *
 * 4-section add/edit side-sheet for procurement line items.
 * Sections:
 *   WHAT           — description, item, spend category, procurement type
 *   HOW MUCH       — entry mode (qty+price | amount only), currency
 *   WHERE IT COSTS — cost centre, project, site (sticky)
 *   CLASSIFICATION — live classification decision panel
 *
 * Live classification behaviour:
 *   • GET /lines/suggest debounced on description change → suggestion chips
 *   • POST /lines/:lid/classify?mode=preview debounced on category/amount change
 *   • On save, the PATCH hook auto-classifies in save mode on the server
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X, ChevronDown, ChevronRight, Sparkles, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@athyper/ui/primitives";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import { relayMutate } from "@athyper/runtime-shared/client";
import { ClassificationDecisionPanel, ClassificationStatusBadge } from "./ClassificationDecisionPanel";

// ── Prop types ────────────────────────────────────────────────────────────────

export interface LineComposerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing line to edit, or null / undefined for new line flow. */
  line?: DocumentLine | null;
  entityCode: string;
  recordId: string;
  currencyCode?: string;
  companyCodeId?: string;
  /** Called after any successful save or create so parent can refresh. */
  onMutated?: () => void;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EntryMode = "quantity_price" | "amount_only";
type ProcurementType = "goods" | "services" | "mixed" | "freight" | "misc";
type Section = "what" | "how_much" | "where" | "classification";

interface Suggestion {
  id: string; code: string; name: string; confidence: number; source: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultEntryMode(pt: ProcurementType): EntryMode {
  return pt === "goods" ? "quantity_price" : "amount_only";
}

function fmtAmt(v: number, cc = "USD") {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v) + " " + cc;
}

function lineUrl(e: string, r: string, l?: string) {
  const base = `/api/records/${encodeURIComponent(e)}/${encodeURIComponent(r)}/lines`;
  return l ? `${base}/${encodeURIComponent(l)}` : base;
}

function suggestUrl(entityCode: string, recordId: string, q: string) {
  if (entityCode === "purchase_invoice") {
    return `/api/finance/ap/invoices/${encodeURIComponent(recordId)}/lines/suggest?q=${encodeURIComponent(q)}`;
  }
  return null;
}

function classifyUrl(entityCode: string, recordId: string, lineId: string, mode: "preview" | "save") {
  if (entityCode === "purchase_invoice") {
    return `/api/finance/ap/invoices/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(lineId)}/classify?mode=${mode}`;
  }
  return null;
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  label, open, onToggle, badge,
}: { label: string; open: boolean; onToggle: () => void; badge?: string }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full px-5 py-2.5 bg-muted/30 border-b border-border/40 hover:bg-muted/50 transition-colors"
    >
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground">
        {label}
        {badge && (
          <span className="inline-flex items-center h-4 px-1.5 rounded-sm bg-foreground/10 border border-foreground/20 text-2xs font-semibold leading-none">
            {badge}
          </span>
        )}
      </span>
      {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

// ── Field wrappers ────────────────────────────────────────────────────────────

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, className, disabled }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; className?: string; disabled?: boolean;
}) {
  return (
    <input value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder} disabled={disabled}
      className={cn(
        "w-full h-9 px-3 text-sm border border-border/60 rounded-lg bg-transparent",
        "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors",
        "placeholder:text-muted-foreground/40 disabled:opacity-50",
        className,
      )}
    />
  );
}

function NumInput({ value, onChange, placeholder, className }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input type="number" value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      className={cn(
        "w-full h-9 px-3 text-sm text-right border border-border/60 rounded-lg bg-transparent",
        "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors",
        "placeholder:text-muted-foreground/40",
        className,
      )}
    />
  );
}

// ── Inline entity search ──────────────────────────────────────────────────────

function EntitySearch({
  entityCode, companyCodeId, valueId, display, onSelect, placeholder,
}: {
  entityCode: string; companyCodeId?: string;
  valueId: string; display: string;
  onSelect: (id: string, label: string) => void;
  placeholder?: string;
}) {
  const [q,       setQ]       = useState(display);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [open,    setOpen]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SCOPED = new Set(["cost_center", "profit_center", "project", "site"]);

  useEffect(() => { setQ(display); }, [display]);
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
        const params = new URLSearchParams({ q: v, page_size: "8" });
        if (companyCodeId && SCOPED.has(entityCode)) params.set("filters", JSON.stringify({ company_code_id: companyCodeId }));
        const r = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}?${params.toString()}`);
        if (r.ok) { const d = await r.json() as { data?: Record<string, unknown>[] }; setResults(d.data ?? []); }
      } finally { setBusy(false); }
    }, 280);
  }

  function pick(row: Record<string, unknown>) {
    const id = String(row.id ?? "");
    const code = String(row.code ?? "");
    const name = String(row.name ?? "");
    const label = code ? `${code} · ${name}` : name;
    setQ(label); setResults([]); setOpen(false);
    onSelect(id, label);
  }

  return (
    <div className="relative" ref={ref}>
      <input value={q} onChange={(e) => search(e.target.value)} placeholder={placeholder}
        className="w-full h-9 px-3 text-sm border border-border/60 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors placeholder:text-muted-foreground/40"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border/60 bg-background shadow-lg overflow-hidden">
          {busy ? <p className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</p>
                : results.length === 0 ? <p className="px-3 py-2.5 text-xs text-muted-foreground/60">No results</p>
                : <div className="py-1 max-h-44 overflow-y-auto">
                    {results.map((row, i) => (
                      <button key={String(row.id ?? i)} onClick={() => pick(row)}
                        className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
                      >
                        <span className="font-mono font-medium text-foreground shrink-0">{String(row.code ?? "")}</span>
                        <span className="text-muted-foreground truncate">{String(row.name ?? "")}</span>
                      </button>
                    ))}
                  </div>
          }
        </div>
      )}
    </div>
  );
}

// ── Suggestion chips ──────────────────────────────────────────────────────────

function SuggestionChips({
  suggestions, onSelect,
}: { suggestions: Suggestion[]; onSelect: (s: Suggestion) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-2xs font-medium text-muted-foreground/60">Suggestions</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button key={s.id} onClick={() => onSelect(s)}
            className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-border/60 bg-muted/30 text-xs font-medium text-foreground hover:bg-muted/60 hover:border-border transition-colors"
            title={`${Math.round(s.confidence * 100)}% confidence`}
          >
            <span className="font-mono text-2xs text-muted-foreground">{s.code}</span>
            <span>{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Entry mode toggle ─────────────────────────────────────────────────────────

function EntryModeToggle({
  mode, procType, onChange,
}: { mode: EntryMode; procType: ProcurementType; onChange: (m: EntryMode) => void }) {
  const isMixed    = procType === "mixed";
  const isModeForced = isMixed || procType === "freight" || procType === "misc";
  return (
    <div className="space-y-1">
      <div className="inline-flex border border-border rounded-lg overflow-hidden bg-muted/20 text-xs">
        {(["quantity_price", "amount_only"] as EntryMode[]).map((m) => {
          const disabled = isModeForced && m !== "amount_only";
          return (
            <button key={m} onClick={() => !disabled && onChange(m)}
              disabled={disabled}
              className={cn(
                "px-3 py-1.5 font-semibold transition-colors",
                mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                disabled && "opacity-30 cursor-not-allowed",
              )}
            >
              {m === "quantity_price" ? "Qty × Price" : "Amount only"}
            </button>
          );
        })}
      </div>
      {isMixed && (
        <p className="text-2xs text-muted-foreground/60">
          <strong>Mixed lines are captured as one amount in v1.</strong> To apply different tax treatment, split into separate lines.
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LineComposerSheet({
  open, onOpenChange, line, entityCode, recordId, currencyCode = "USD", companyCodeId, onMutated,
}: LineComposerSheetProps) {
  const isNew = !line;
  const lineAny = (line ?? {}) as Record<string, unknown>;

  // ── WHAT section ──────────────────────────────────────────────────────────

  const [desc,        setDesc]        = useState(String(lineAny.description   ?? ""));
  const [itemCode,    setItemCode]    = useState(String(lineAny.item_code     ?? ""));
  const [procType,    setProcType]    = useState<ProcurementType>(
    (lineAny.procurement_type as ProcurementType) ?? "services"
  );
  const [spendCatId,    setSpendCatId]    = useState(String(lineAny.spend_category_id    ?? ""));
  const [spendCatLabel, setSpendCatLabel] = useState("");
  const [intentId,      setIntentId]      = useState(String(lineAny.business_intent_id   ?? ""));
  const [intentLabel,   setIntentLabel]   = useState("");

  // ── HOW MUCH section ──────────────────────────────────────────────────────

  const [entryMode,  setEntryMode]  = useState<EntryMode>(() => defaultEntryMode(procType));
  const [qty,        setQty]        = useState(lineAny.quantity   != null ? String(lineAny.quantity)   : "");
  const [unitCode,   setUnitCode]   = useState(String(lineAny.unit_code  ?? ""));
  const [unitPrice,  setUnitPrice]  = useState(lineAny.unit_price != null ? String(lineAny.unit_price) : "");
  const [amount,     setAmount]     = useState(
    lineAny.line_amount != null ? String(lineAny.line_amount) : ""
  );

  const computedAmount = useMemo(() => {
    if (entryMode === "quantity_price") {
      const q = Number(qty) || 0; const p = Number(unitPrice) || 0;
      return q * p;
    }
    return Number(amount) || 0;
  }, [entryMode, qty, unitPrice, amount]);

  // ── WHERE IT COSTS section ────────────────────────────────────────────────

  const [ccId,    setCcId]    = useState(String(lineAny.cost_center_id   ?? ""));
  const [ccLabel, setCcLabel] = useState("");
  const [projId,  setProjId]  = useState(String(lineAny.project_id       ?? ""));
  const [projLabel, setProjLabel] = useState("");
  const [siteId,  setSiteId]  = useState(String(lineAny.site_id          ?? ""));
  const [siteLabel, setSiteLabel] = useState("");

  // ── Sections open/closed ──────────────────────────────────────────────────

  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    what: true, how_much: true, where: false, classification: true,
  });
  function toggleSection(s: Section) {
    setOpenSections((p) => ({ ...p, [s]: !p[s] }));
  }

  // ── Live suggestion + preview state ──────────────────────────────────────

  const [suggestions,     setSuggestions]     = useState<Suggestion[]>([]);
  const [previewDecision, setPreviewDecision] = useState<Record<string, unknown> | null>(null);
  const [isPreviewing,    setIsPreviewing]    = useState(false);
  const suggestTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAbort   = useRef<AbortController | null>(null);

  // The lineId for the current line (if we created one)
  const [lineId, setLineId] = useState(String(lineAny.id ?? ""));

  // ── Saving state ──────────────────────────────────────────────────────────

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [creating,  setCreating]  = useState(false);

  // Resolve labels for existing UUIDs on open
  useEffect(() => {
    if (!line) return;
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
    void resolveLabel(spendCatId,  "spend_category",  setSpendCatLabel);
    void resolveLabel(intentId,    "business_intent", setIntentLabel);
    void resolveLabel(ccId,        "cost_center",     setCcLabel);
    void resolveLabel(projId,      "project",         setProjLabel);
    void resolveLabel(siteId,      "site",            setSiteLabel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);

  // ── Debounced suggest ─────────────────────────────────────────────────────

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!desc.trim() || spendCatId) { setSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      const url = suggestUrl(entityCode, recordId, desc);
      if (!url) return;
      try {
        const r = await fetch(url);
        if (r.ok) {
          const d = await r.json() as { suggestions?: Suggestion[] };
          setSuggestions(d.suggestions ?? []);
        }
      } catch { /* ignore */ }
    }, 320);
  }, [desc, spendCatId, entityCode, recordId]);

  // ── Debounced preview ─────────────────────────────────────────────────────

  const runPreview = useCallback(async (lid: string) => {
    const url = classifyUrl(entityCode, recordId, lid, "preview");
    if (!url) return;
    previewAbort.current?.abort();
    const ctrl = new AbortController();
    previewAbort.current = ctrl;
    setIsPreviewing(true);
    try {
      const r = await relayMutate(url, { method: "POST" });
      if (r.ok && !ctrl.signal.aborted) {
        const d = await r.json() as { classification?: Record<string, unknown> };
        setPreviewDecision(d.classification ?? null);
      }
    } catch { /* ignore */ }
    finally { if (!ctrl.signal.aborted) setIsPreviewing(false); }
  }, [entityCode, recordId]);

  useEffect(() => {
    if (!lineId || !spendCatId) { setPreviewDecision(null); return; }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => void runPreview(lineId), 400);
  }, [spendCatId, computedAmount, lineId, runPreview]);

  // ── When spend cat selected, auto-suggest intent ──────────────────────────

  async function handleSpendCatSelect(id: string, label: string) {
    setSpendCatId(id); setSpendCatLabel(label);
    setSuggestions([]);
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

  // ── When proc type changes, adjust entry mode ─────────────────────────────

  useEffect(() => {
    setEntryMode(defaultEntryMode(procType));
  }, [procType]);

  // ── Build patch body ──────────────────────────────────────────────────────

  function buildPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = {
      description:  desc  || null,
      item_code:    itemCode || null,
      spend_category_id:  spendCatId  || null,
      business_intent_id: intentId    || null,
      cost_center_id:     ccId        || null,
      project_id:         projId      || null,
      site_id:            siteId      || null,
      data: {
        ...((lineAny.data as Record<string, unknown>) ?? {}),
        procurement_type: procType,
      },
    };
    if (entryMode === "quantity_price") {
      patch.quantity  = Number(qty) || null;
      patch.unit_code = unitCode || null;
      patch.unit_price = Number(unitPrice) || null;
      patch.line_amount = computedAmount || null;
    } else {
      patch.line_amount = Number(amount) || null;
      patch.quantity    = null;
      patch.unit_price  = null;
    }
    return patch;
  }

  // ── Save (create or update) ───────────────────────────────────────────────

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      if (isNew) {
        // Create blank line first to get an ID, then PATCH with full data
        setCreating(true);
        const lines = await (async () => {
          const r = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines`, { method: "GET" });
          if (!r.ok) return [];
          const d = await r.json() as { data?: Array<{ line_number?: number }> };
          return d.data ?? [];
        })();
        const nextNo = lines.reduce((m, l) => Math.max(m, Number(l.line_number) || 0), 0) + 1;
        const createRes = await relayMutate(lineUrl(entityCode, recordId), {
          method: "POST",
          body: JSON.stringify({ line_number: nextNo, description: desc || null, data: {} }),
        });
        setCreating(false);
        if (!createRes.ok) {
          const body = await createRes.json().catch(() => ({})) as { error?: string };
          setSaveError(body.error ?? `Create failed (${createRes.status})`);
          return;
        }
        const newLine = await createRes.json() as Record<string, unknown>;
        const newId   = String(newLine.id ?? "");
        setLineId(newId);

        // Now PATCH with full data
        const patchRes = await relayMutate(lineUrl(entityCode, recordId, newId), {
          method: "PATCH",
          body: JSON.stringify(buildPatch()),
        });
        if (!patchRes.ok) {
          const body = await patchRes.json().catch(() => ({})) as { error?: string };
          setSaveError(body.error ?? `Save failed (${patchRes.status})`);
          return;
        }
      } else {
        const patchRes = await relayMutate(lineUrl(entityCode, recordId, lineId), {
          method: "PATCH",
          body: JSON.stringify(buildPatch()),
        });
        if (!patchRes.ok) {
          const body = await patchRes.json().catch(() => ({})) as { error?: string };
          setSaveError(body.error ?? `Save failed (${patchRes.status})`);
          return;
        }
      }
      onMutated?.();
      if (isNew) onOpenChange(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Network error");
    } finally { setSaving(false); }
  }

  // ── Build virtual line for classification panel ───────────────────────────

  const virtualLine: Record<string, unknown> = {
    ...lineAny,
    id: lineId,
    spend_category_id:  spendCatId || lineAny.spend_category_id,
    business_intent_id: intentId   || lineAny.business_intent_id,
    classification_decision: previewDecision ?? lineAny.classification_decision,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // Count classification blockers for badge
  const classDec = previewDecision ?? (lineAny.classification_decision as Record<string, unknown> | null);
  const blockerCount = Array.isArray((classDec as Record<string, unknown>)?.["blockers"])
    ? ((classDec as Record<string, unknown>)["blockers"] as unknown[]).length
    : 0;
  const classStatus = (classDec as Record<string, unknown>)?.["status"] as string | undefined;
  const classBadge = classStatus === "blocked"
    ? `${blockerCount} blocker${blockerCount !== 1 ? "s" : ""}`
    : classStatus === "needs_review"
      ? "Review"
      : classStatus === "resolved"
        ? "✓"
        : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="max-w-[95vw] w-[520px] p-0 flex flex-col gap-0 overflow-hidden"
        aria-describedby={undefined}
      >
        {/* Header */}
        <SheetHeader className="shrink-0 px-5 pt-5 pb-4 border-b border-border/50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="shrink-0 inline-flex items-center h-5 px-2 rounded text-2xs font-semibold bg-muted border border-border/50 leading-none">
                  {isNew ? "NEW LINE" : `LINE ${String(lineAny.line_number ?? "")}`}
                </span>
                {classStatus && (
                  <ClassificationStatusBadge line={virtualLine} />
                )}
              </div>
              <SheetTitle className="text-sm font-semibold text-foreground leading-snug">
                {isNew ? "Add line" : (desc || String(lineAny.description ?? "")  || "Edit line")}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{currencyCode}</p>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── WHAT section ─────────────────────────────────────────────── */}
          <SectionHeader
            label="What"
            open={openSections.what}
            onToggle={() => toggleSection("what")}
            badge={desc ? "✓" : undefined}
          />
          {openSections.what && (
            <div className="px-5 py-4 space-y-4">
              <Field label="Description" required>
                <TextInput
                  value={desc}
                  onChange={setDesc}
                  placeholder="e.g. Dell Laptop XPS 15 · Q2 consulting · Office supplies"
                />
              </Field>
              {suggestions.length > 0 && (
                <SuggestionChips
                  suggestions={suggestions}
                  onSelect={(s) => void handleSpendCatSelect(s.id, `${s.code} · ${s.name}`)}
                />
              )}
              <Field label="Item code">
                <TextInput value={itemCode} onChange={setItemCode} placeholder="ITM-XXX (optional)" className="font-mono text-xs" />
              </Field>
              <Field label="Type">
                <div className="inline-flex border border-border rounded-lg overflow-hidden bg-muted/20 text-xs flex-wrap">
                  {(["goods", "services", "mixed", "freight", "misc"] as ProcurementType[]).map((pt) => (
                    <button key={pt} onClick={() => setProcType(pt)}
                      className={cn("px-3 py-1.5 font-semibold capitalize transition-colors",
                        procType === pt ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >{pt}</button>
                  ))}
                </div>
              </Field>
              <Field label="Spend category">
                <EntitySearch
                  entityCode="spend_category"
                  companyCodeId={companyCodeId}
                  valueId={spendCatId}
                  display={spendCatLabel}
                  onSelect={(id, label) => void handleSpendCatSelect(id, label)}
                  placeholder="Search spend category…"
                />
              </Field>
              <Field label="Business intent">
                <EntitySearch
                  entityCode="business_intent"
                  valueId={intentId}
                  display={intentLabel}
                  onSelect={(id, label) => { setIntentId(id); setIntentLabel(label); }}
                  placeholder="Search intent (auto-suggested)…"
                />
              </Field>
            </div>
          )}

          {/* ── HOW MUCH section ─────────────────────────────────────────── */}
          <SectionHeader
            label="How much"
            open={openSections.how_much}
            onToggle={() => toggleSection("how_much")}
            badge={computedAmount > 0 ? fmtAmt(computedAmount, currencyCode) : undefined}
          />
          {openSections.how_much && (
            <div className="px-5 py-4 space-y-4">
              <EntryModeToggle mode={entryMode} procType={procType} onChange={setEntryMode} />
              {entryMode === "quantity_price" ? (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Quantity"><NumInput value={qty} onChange={setQty} placeholder="0" /></Field>
                  <Field label="Unit"><TextInput value={unitCode} onChange={setUnitCode} placeholder="EA" className="text-center" /></Field>
                  <Field label="Unit price"><NumInput value={unitPrice} onChange={setUnitPrice} placeholder="0.00" /></Field>
                </div>
              ) : (
                <Field label="Amount">
                  <div className="relative">
                    <NumInput value={amount} onChange={setAmount} placeholder="0.00" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{currencyCode}</span>
                  </div>
                </Field>
              )}
              {computedAmount > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/40">
                  <span className="text-xs text-muted-foreground">Line total</span>
                  <span className="text-sm font-semibold tabular-nums">{fmtAmt(computedAmount, currencyCode)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── WHERE IT COSTS section ────────────────────────────────────── */}
          <SectionHeader
            label="Where it costs"
            open={openSections.where}
            onToggle={() => toggleSection("where")}
            badge={ccId ? "set" : undefined}
          />
          {openSections.where && (
            <div className="px-5 py-4 space-y-4">
              <Field label="Cost centre">
                <EntitySearch
                  entityCode="cost_center"
                  companyCodeId={companyCodeId}
                  valueId={ccId}
                  display={ccLabel}
                  onSelect={(id, label) => { setCcId(id); setCcLabel(label); }}
                  placeholder="Search cost centre…"
                />
              </Field>
              <Field label="Project">
                <EntitySearch
                  entityCode="project"
                  companyCodeId={companyCodeId}
                  valueId={projId}
                  display={projLabel}
                  onSelect={(id, label) => { setProjId(id); setProjLabel(label); }}
                  placeholder="Search project…"
                />
              </Field>
              <Field label="Site">
                <EntitySearch
                  entityCode="site"
                  companyCodeId={companyCodeId}
                  valueId={siteId}
                  display={siteLabel}
                  onSelect={(id, label) => { setSiteId(id); setSiteLabel(label); }}
                  placeholder="Search site…"
                />
              </Field>
            </div>
          )}

          {/* ── CLASSIFICATION section ────────────────────────────────────── */}
          <SectionHeader
            label="Classification"
            open={openSections.classification}
            onToggle={() => toggleSection("classification")}
            badge={classBadge}
          />
          {openSections.classification && (
            <div className="px-5 py-4">
              <ClassificationDecisionPanel
                line={virtualLine}
                entityCode={entityCode}
                recordId={recordId}
                onRefresh={onMutated}
                previewDecision={previewDecision as never}
                isPreviewing={isPreviewing}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-border/50 bg-muted/10 space-y-2">
          {saveError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {saveError}
            </div>
          )}
          {blockerCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {blockerCount} blocker{blockerCount !== 1 ? "s" : ""} — resolve before submitting the document
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <SheetClose asChild>
              <button className="h-9 px-4 text-xs font-semibold border border-border/60 rounded-lg text-muted-foreground hover:text-foreground hover:border-border transition-colors">
                {isNew ? "Cancel" : "Done"}
              </button>
            </SheetClose>
            <button
              onClick={() => void save()}
              disabled={saving || creating || !desc.trim()}
              className="h-9 px-5 text-xs font-semibold rounded-lg bg-foreground text-background hover:opacity-85 disabled:opacity-40 transition-opacity"
            >
              {creating ? "Creating…" : saving ? "Saving…" : isNew ? "Add line" : "Save"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
