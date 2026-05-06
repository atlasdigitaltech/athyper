"use client";

/**
 * JournalLinesGrid — read-only GL line view for posted journal entries.
 *
 * Columns: #, GL Account, Description, Subledger, Debit, Credit
 * Financial footer: Total Debit | Total Credit
 *
 * Data arrives via the GET /records/journal_entry/:id/lines endpoint which
 * normalises document.journal_line rows into DocumentLine format:
 *   item_code        = gl_account.code
 *   description      = journal_line.description
 *   data.gl_account_name  = gl_account.name
 *   data.transaction_debit / data.transaction_credit
 *   data.subledger_type
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Link2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import {
  Button, Input, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/ui/primitives";
import { relayMutate } from "@athyper/runtime-shared/client";
import { EntityPicker, type EntityPickerOption } from "@athyper/runtime-shared/entity-search";
import { cn } from "@athyper/theme/utils";

type JournalLineDraft = {
  key: string;
  gl_account_code: string;
  gl_account_label: string;
  description: string;
  debit: string;
  credit: string;
  reference: JournalLineReferenceDraft;
};

type JournalLineReferenceDraft = {
  target_key: string;
  ref_type: string;
  ref_doc_type: string;
  ref_doc_id: string;
  ref_doc_label: string;
  ref_doc_line_id: string;
  ref_doc_line_label: string;
  ref_doc_number: string;
};

type JournalReferenceTarget = {
  key: string;
  label: string;
  entity: string;
  ref_doc_type: string;
  default_ref_type: string;
  line_selection?: boolean;
  display_fields?: string[];
  search_fields?: string[];
};

const NO_REFERENCE = "__none";

const DEFAULT_REFERENCE_TARGETS: JournalReferenceTarget[] = [
  {
    key: "purchase_invoice",
    label: "Invoice",
    entity: "purchase_invoice",
    ref_doc_type: "purchase_invoice",
    default_ref_type: "invoice_adjustment",
    line_selection: true,
    display_fields: ["invoice_number", "document_no", "code", "name"],
    search_fields: ["invoice_number", "document_no", "supplier_invoice_number", "description"],
  },
  {
    key: "payment_entry",
    label: "Receipt / Payment",
    entity: "payment_entry",
    ref_doc_type: "payment_entry",
    default_ref_type: "receipt_adjustment",
    line_selection: true,
    display_fields: ["payment_number", "document_no", "code", "name"],
    search_fields: ["payment_number", "document_no", "description"],
  },
  {
    key: "journal_entry",
    label: "Journal Entry",
    entity: "journal_entry",
    ref_doc_type: "journal_entry",
    default_ref_type: "manual_adjustment",
    line_selection: true,
    display_fields: ["je_number", "document_no", "description"],
    search_fields: ["je_number", "document_no", "description"],
  },
];

function emptyReference(): JournalLineReferenceDraft {
  return {
    target_key:         "",
    ref_type:           "",
    ref_doc_type:       "",
    ref_doc_id:         "",
    ref_doc_label:      "",
    ref_doc_line_id:    "",
    ref_doc_line_label: "",
    ref_doc_number:     "",
  };
}

function fmtAmt(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInputAmount(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

function newDraftLine(): JournalLineDraft {
  return {
    key:             `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    gl_account_code: "",
    gl_account_label:"",
    description:     "",
    debit:           "",
    credit:          "",
    reference:        emptyReference(),
  };
}

function readReferenceTargets(entity?: CompiledEntity): JournalReferenceTarget[] {
  const raw = (entity?.display_config as Record<string, unknown> | undefined)?.["journal_editor"];
  const journalEditor = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const configured = journalEditor["reference_targets"];
  if (!Array.isArray(configured)) return DEFAULT_REFERENCE_TARGETS;

  const parsed = configured
    .map((entry): JournalReferenceTarget | null => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const key = String(row["key"] ?? row["ref_doc_type"] ?? "").trim();
      const entityCode = String(row["entity"] ?? "").trim();
      const refDocType = String(row["ref_doc_type"] ?? key).trim();
      const label = String(row["label"] ?? key).trim();
      const defaultRefType = String(row["default_ref_type"] ?? "manual_adjustment").trim();
      if (!key || !entityCode || !refDocType || !label || !defaultRefType) return null;
      return {
        key,
        label,
        entity: entityCode,
        ref_doc_type: refDocType,
        default_ref_type: defaultRefType,
        line_selection: row["line_selection"] !== false,
        display_fields: Array.isArray(row["display_fields"]) ? row["display_fields"].map(String) : undefined,
        search_fields:  Array.isArray(row["search_fields"])  ? row["search_fields"].map(String)  : undefined,
      };
    })
    .filter((target): target is JournalReferenceTarget => Boolean(target));

  return parsed.length > 0 ? parsed : DEFAULT_REFERENCE_TARGETS;
}

function labelFromRow(row: Record<string, unknown>, target: JournalReferenceTarget): string {
  const fields = target.display_fields?.length
    ? target.display_fields
    : ["document_no", "invoice_number", "payment_number", "je_number", "code", "name", "description", "id"];
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const id = row["id"];
  return typeof id === "string" ? id.slice(0, 8) : target.label;
}

function referenceFromLine(line: DocumentLine, targets: JournalReferenceTarget[]): JournalLineReferenceDraft {
  const data = line.data as Record<string, unknown> | null | undefined ?? {};
  const refs = Array.isArray(data["references"]) ? data["references"] as Record<string, unknown>[] : [];
  const first = refs[0];
  if (!first) return emptyReference();

  const refDocType = String(first["ref_doc_type"] ?? "").trim();
  const target = targets.find((t) => t.ref_doc_type === refDocType);
  return {
    target_key:         target?.key ?? refDocType,
    ref_type:           String(first["ref_type"] ?? target?.default_ref_type ?? "").trim(),
    ref_doc_type:       refDocType,
    ref_doc_id:         String(first["ref_doc_id"] ?? "").trim(),
    ref_doc_label:      String(first["ref_doc_number"] ?? first["ref_doc_label"] ?? "").trim(),
    ref_doc_line_id:    String(first["ref_doc_line_id"] ?? "").trim(),
    ref_doc_line_label: String(first["ref_doc_line_label"] ?? "").trim(),
    ref_doc_number:     String(first["ref_doc_number"] ?? "").trim(),
  };
}

function lineToDraft(line: DocumentLine, targets: JournalReferenceTarget[]): JournalLineDraft {
  const d = line.data as Record<string, unknown> | null | undefined ?? {};
  return {
    key:             line.id,
    gl_account_code: String(line.item_code ?? d["gl_account_code"] ?? "").trim(),
    gl_account_label: [line.item_code, d["gl_account_name"]].filter(Boolean).map(String).join(" · "),
    description:     String(line.description ?? "").trim(),
    debit:           fmtInputAmount(d["transaction_debit"]),
    credit:          fmtInputAmount(d["transaction_credit"]),
    reference:        referenceFromLine(line, targets),
  };
}

function isBlankDraft(line: JournalLineDraft): boolean {
  return !line.gl_account_code.trim() && !line.description.trim() && !line.debit.trim() && !line.credit.trim();
}

function parseDraftAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function validateDraftLines(lines: JournalLineDraft[]) {
  const active = lines.filter((line) => !isBlankDraft(line));
  const payload: Array<{
    gl_account_code: string;
    debit?: number;
    credit?: number;
    item_text?: string;
    reference?: Record<string, unknown>;
  }> = [];
  let totalDebit = 0;
  let totalCredit = 0;

  if (active.length < 2) {
    return { ok: false, totalDebit, totalCredit, payload, message: "At least 2 journal lines are required." };
  }

  for (const line of active) {
    const glAccountCode = line.gl_account_code.trim();
    if (!glAccountCode) {
      return { ok: false, totalDebit, totalCredit, payload, message: "GL Account is required on every line." };
    }

    const debit = parseDraftAmount(line.debit);
    const credit = parseDraftAmount(line.credit);
    if (debit == null || credit == null || debit < 0 || credit < 0) {
      return { ok: false, totalDebit, totalCredit, payload, message: "Debit and Credit must be valid positive amounts." };
    }
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      return { ok: false, totalDebit, totalCredit, payload, message: "Each line needs either Debit or Credit, not both." };
    }

    totalDebit += debit;
    totalCredit += credit;
    const reference = line.reference.ref_doc_id && line.reference.ref_doc_type
      ? {
          ref_type:           line.reference.ref_type,
          ref_doc_type:       line.reference.ref_doc_type,
          ref_doc_id:         line.reference.ref_doc_id,
          ref_doc_line_id:    line.reference.ref_doc_line_id || null,
          ref_doc_number:     line.reference.ref_doc_number || line.reference.ref_doc_label || null,
          ref_doc_label:      line.reference.ref_doc_label || null,
          ref_doc_line_label: line.reference.ref_doc_line_label || null,
        }
      : undefined;
    payload.push({
      gl_account_code: glAccountCode,
      debit:           debit > 0 ? debit : undefined,
      credit:          credit > 0 ? credit : undefined,
      item_text:       line.description.trim() || undefined,
      ...(reference ? { reference } : {}),
    });
  }

  if (Math.abs(totalDebit - totalCredit) > 0.001 || totalDebit <= 0) {
    return {
      ok: false,
      totalDebit,
      totalCredit,
      payload,
      message: `Entry is unbalanced by ${fmtAmt(Math.abs(totalDebit - totalCredit))}.`,
    };
  }

  return { ok: true, totalDebit, totalCredit, payload, message: null };
}

function glAccountLabel(row: Record<string, unknown>): string {
  const code = String(row["code"] ?? row["account_code"] ?? "").trim();
  const name = String(row["name"] ?? row["display_name"] ?? "").trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || String(row["id"] ?? "").slice(0, 8);
}

function glAccountOption(row: Record<string, unknown>): EntityPickerOption | null {
  const code = String(row["code"] ?? row["account_code"] ?? "").trim();
  if (!code) return null;
  const detail = [row["account_nature"], row["normal_balance"], row["posting_level"]]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  return {
    value:       code,
    label:       glAccountLabel(row),
    description: detail || undefined,
  };
}

function GlAccountPicker({
  line,
  disabled,
  onChange,
}: {
  line: JournalLineDraft;
  disabled?: boolean;
  onChange: (patch: Partial<JournalLineDraft>) => void;
}) {
  const labelCache = useRef<Map<string, string>>(new Map());

  const search = useCallback(async (query: string): Promise<EntityPickerOption[]> => {
    try {
      const params = new URLSearchParams({
        q:         query,
        limit:     "20",
        page_size: "20",
      });
      const res = await fetch(`/api/relay/api/records/gl_account?${params.toString()}`);
      if (!res.ok) return [];
      const body = await res.json() as { data?: Record<string, unknown>[] };
      const options = (body.data ?? [])
        .map(glAccountOption)
        .filter((option): option is EntityPickerOption => Boolean(option));
      options.forEach((option) => labelCache.current.set(option.value, option.label));
      return options;
    } catch {
      return [];
    }
  }, []);

  return (
    <EntityPicker
      value={line.gl_account_code || null}
      displayLabel={line.gl_account_label || line.gl_account_code || null}
      onChange={(value) => {
        const code = value ?? "";
        onChange({
          gl_account_code:  code,
          gl_account_label: code ? (labelCache.current.get(code) ?? code) : "",
        });
      }}
      search={search}
      loadOnOpen
      placeholder="Search GL account..."
      disabled={disabled}
      clearable
      className="w-full"
    />
  );
}

function ReferencePicker({
  reference,
  targets,
  disabled,
  onChange,
}: {
  reference: JournalLineReferenceDraft;
  targets: JournalReferenceTarget[];
  disabled?: boolean;
  onChange: (reference: JournalLineReferenceDraft) => void;
}) {
  const selectedTarget = targets.find((target) => target.key === reference.target_key) ?? null;
  const labelCache = useRef<Map<string, string>>(new Map());
  const [lineOptions, setLineOptions] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    setLineOptions([]);

    if (!selectedTarget?.line_selection || !reference.ref_doc_id) return;

    void fetch(`/api/relay/api/records/${encodeURIComponent(selectedTarget.entity)}/${encodeURIComponent(reference.ref_doc_id)}/lines`)
      .then((res) => res.ok ? res.json() : { data: [] })
      .then((body: { data?: DocumentLine[] }) => {
        if (cancelled) return;
        setLineOptions((body.data ?? []).map((line) => ({
          id: line.id,
          label: [`Line ${line.line_number}`, line.item_code, line.description]
            .filter(Boolean)
            .map(String)
            .join(" - "),
        })));
      })
      .catch(() => {
        if (!cancelled) setLineOptions([]);
      });

    return () => { cancelled = true; };
  }, [selectedTarget?.entity, selectedTarget?.line_selection, reference.ref_doc_id]);

  const search = useCallback(async (query: string): Promise<EntityPickerOption[]> => {
    if (!selectedTarget) return [];
    try {
      const params = new URLSearchParams({
        q:         query,
        limit:     "20",
        page_size: "20",
      });
      const res = await fetch(`/api/relay/api/records/${encodeURIComponent(selectedTarget.entity)}?${params.toString()}`);
      if (!res.ok) return [];
      const body = await res.json() as { data?: Record<string, unknown>[] };
      return (body.data ?? [])
        .map((row) => {
          const id = String(row["id"] ?? "").trim();
          const label = labelFromRow(row, selectedTarget);
          if (id) labelCache.current.set(id, label);
          return {
            value:       id,
            label,
            description: typeof row["description"] === "string" ? row["description"] : undefined,
          };
        })
        .filter((option) => option.value);
    } catch {
      return [];
    }
  }, [selectedTarget]);

  return (
    <div className="space-y-1.5">
      <Select
        value={selectedTarget?.key ?? NO_REFERENCE}
        disabled={disabled}
        onValueChange={(value) => {
          if (value === NO_REFERENCE) {
            onChange(emptyReference());
            return;
          }
          const target = targets.find((item) => item.key === value);
          if (!target) return;
          onChange({
            ...emptyReference(),
            target_key:   target.key,
            ref_type:     target.default_ref_type,
            ref_doc_type: target.ref_doc_type,
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="No reference" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_REFERENCE}>No reference</SelectItem>
          {targets.map((target) => (
            <SelectItem key={target.key} value={target.key}>{target.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedTarget && (
        <EntityPicker
          value={reference.ref_doc_id || null}
          displayLabel={reference.ref_doc_label || null}
          onChange={(value) => {
            const id = value ?? "";
            const label = id ? (labelCache.current.get(id) ?? id.slice(0, 8)) : "";
            onChange({
              ...reference,
              ref_doc_id:         id,
              ref_doc_label:      label,
              ref_doc_number:     label,
              ref_doc_line_id:    "",
              ref_doc_line_label: "",
            });
          }}
          search={search}
          loadOnOpen
          placeholder={`Search ${selectedTarget.label.toLowerCase()}...`}
          disabled={disabled}
          clearable
          className="w-full"
        />
      )}

      {selectedTarget?.line_selection && reference.ref_doc_id && lineOptions.length > 0 && (
        <Select
          value={reference.ref_doc_line_id || NO_REFERENCE}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === NO_REFERENCE) {
              onChange({ ...reference, ref_doc_line_id: "", ref_doc_line_label: "" });
              return;
            }
            const option = lineOptions.find((item) => item.id === value);
            onChange({
              ...reference,
              ref_doc_line_id:    value,
              ref_doc_line_label: option?.label ?? value.slice(0, 8),
            });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Whole document" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_REFERENCE}>Whole document</SelectItem>
            {lineOptions.map((line) => (
              <SelectItem key={line.id} value={line.id}>{line.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function ReferenceBadge({ references }: { references: unknown }) {
  const refs = Array.isArray(references) ? references as Record<string, unknown>[] : [];
  const first = refs[0];
  if (!first) return <span className="text-muted-foreground/30 text-xs">--</span>;

  const doc = String(first["ref_doc_number"] ?? first["ref_doc_label"] ?? first["ref_doc_id"] ?? "").trim();
  const line = String(first["ref_doc_line_label"] ?? first["ref_doc_line_id"] ?? "").trim();
  const type = String(first["ref_doc_type"] ?? "").replace(/_/g, " ");

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
      <Link2 className="h-3 w-3 shrink-0" />
      <span className="truncate">{[type, doc, line].filter(Boolean).join(" - ")}</span>
      {refs.length > 1 && <span className="font-medium">+{refs.length - 1}</span>}
    </span>
  );
}

function AmtCell({ value, side }: { value: unknown; side: "debit" | "credit" }) {
  const n = Number(value);
  if (!n) return <span className="text-muted-foreground/30">—</span>;
  return (
    <span className={cn("tabular-nums font-medium", side === "debit" ? "text-foreground" : "text-foreground")}>
      {fmtAmt(n)}
    </span>
  );
}

function SubledgerBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <span className="text-muted-foreground/30 text-xs">—</span>;
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
      {type}
    </span>
  );
}

export interface JournalLinesGridProps {
  entity?: CompiledEntity;
  lines:     DocumentLine[];
  isLoading?: boolean;
  currencyCode?: string;
  recordId?: string;
  recordUuid?: string;
  record?: Record<string, unknown>;
  editMode?: boolean;
  onRefresh?: () => void;
}

export function JournalLinesGrid({
  entity,
  lines,
  isLoading,
  currencyCode = "USD",
  recordId,
  recordUuid,
  record,
  editMode,
  onRefresh,
}: JournalLinesGridProps) {
  const referenceTargets = useMemo(() => readReferenceTargets(entity), [entity]);
  const [draftLines, setDraftLines] = useState<JournalLineDraft[]>(() =>
    lines.length > 0 ? lines.map((line) => lineToDraft(line, referenceTargets)) : [newDraftLine(), newDraftLine()],
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraftLines(lines.length > 0 ? lines.map((line) => lineToDraft(line, referenceTargets)) : [newDraftLine(), newDraftLine()]);
    setSaveError(null);
  }, [lines, referenceTargets]);

  const draftValidation = useMemo(() => validateDraftLines(draftLines), [draftLines]);

  function updateDraftLine(key: string, patch: Partial<JournalLineDraft>) {
    setDraftLines((prev) => prev.map((line) => line.key === key ? { ...line, ...patch } : line));
    setSaveError(null);
  }

  function addDraftLine() {
    setDraftLines((prev) => [...prev, newDraftLine()]);
    setSaveError(null);
  }

  function removeDraftLine(key: string) {
    setDraftLines((prev) => prev.length <= 2 ? prev : prev.filter((line) => line.key !== key));
    setSaveError(null);
  }

  function resetDraftLines() {
    setDraftLines(lines.length > 0 ? lines.map((line) => lineToDraft(line, referenceTargets)) : [newDraftLine(), newDraftLine()]);
    setSaveError(null);
  }

  async function saveDraftLines() {
    if (!draftValidation.ok) {
      setSaveError(draftValidation.message ?? "Journal lines are invalid.");
      return;
    }

    const journalId = recordUuid ?? recordId;
    if (!journalId) {
      setSaveError("Journal record id is missing.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = { lines: draftValidation.payload };
      const exchangeRate = record?.["exchange_rate"];
      if (exchangeRate != null && exchangeRate !== "") body["exchange_rate"] = exchangeRate;

      const res = await relayMutate(`/api/finance/journals/${encodeURIComponent(journalId)}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
        setSaveError(String(payload["message"] ?? payload["error"] ?? `Save failed (${res.status})`));
        return;
      }
      onRefresh?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  if (editMode) {
    const totalDebit = draftValidation.totalDebit;
    const totalCredit = draftValidation.totalCredit;
    const activeDraftLineCount = draftLines.filter((line) => !isBlankDraft(line)).length;

    return (
      <div>
        <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-muted/40 border-b border-border/40">
          <span className="text-xs font-semibold text-foreground">
            {activeDraftLineCount} line{activeDraftLineCount !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addDraftLine}>
              <Plus className="h-3.5 w-3.5" />
              Add line
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={resetDraftLines} disabled={saving}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => { void saveDraftLines(); }} disabled={saving || !draftValidation.ok}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save lines"}
            </Button>
          </div>
        </div>

        {(saveError || draftValidation.message) && (
          <div className={cn(
            "flex items-center gap-2 border-b px-3.5 py-2 text-xs",
            saveError ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-warning/30 bg-warning/10 text-warning",
          )}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{saveError ?? draftValidation.message}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 42  }} />
              <col style={{ width: 170 }} />
              <col />
              <col style={{ width: 310 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 46  }} />
            </colgroup>
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center">#</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">GL Account</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Description</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Reference</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Debit</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Credit</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {draftLines.map((line, index) => (
                <tr key={line.key} className="bg-background">
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</td>
                  <td className="px-2 py-1.5">
                    <GlAccountPicker
                      line={line}
                      disabled={saving}
                      onChange={(patch) => updateDraftLine(line.key, patch)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-xs"
                      value={line.description}
                      onChange={(e) => updateDraftLine(line.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <ReferencePicker
                      reference={line.reference}
                      targets={referenceTargets}
                      disabled={saving}
                      onChange={(reference) => updateDraftLine(line.key, { reference })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-right text-xs tabular-nums"
                      inputMode="decimal"
                      value={line.debit}
                      onChange={(e) => updateDraftLine(line.key, { debit: e.target.value, credit: e.target.value.trim() ? "" : line.credit })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-right text-xs tabular-nums"
                      inputMode="decimal"
                      value={line.credit}
                      onChange={(e) => updateDraftLine(line.key, { credit: e.target.value, debit: e.target.value.trim() ? "" : line.debit })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeDraftLine(line.key)}
                      disabled={draftLines.length <= 2 || saving}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center px-4 py-3 border-t border-border/40 bg-muted/20 text-xs flex-wrap gap-3">
          <div className="flex gap-6">
            <span>
              <span className="text-muted-foreground mr-1.5">Total Debit</span>
              <span className="font-semibold tabular-nums">{currencyCode} {fmtAmt(totalDebit)}</span>
            </span>
            <span>
              <span className="text-muted-foreground mr-1.5">Total Credit</span>
              <span className="font-semibold tabular-nums">{currencyCode} {fmtAmt(totalCredit)}</span>
            </span>
          </div>
          <span className={cn(
            "text-xs font-medium",
            draftValidation.ok ? "text-success" : "text-destructive",
          )}>
            {activeDraftLineCount === 0 ? "No lines" : draftValidation.ok ? "Balanced" : `Imbalance: ${fmtAmt(Math.abs(totalDebit - totalCredit))}`}
          </span>
        </div>
      </div>
    );
  }

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.data?.transaction_debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.data?.transaction_credit) || 0), 0);
  const hasReadOnlyLines = lines.length > 0;
  const readOnlyBalanced = hasReadOnlyLines && totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-muted/40 border-b border-border/40">
        <span className="text-xs font-semibold text-foreground">
          {lines.length} line{lines.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36  }} />
            <col style={{ width: 130 }} />
            <col />
            <col style={{ width: 210 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center">#</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">GL Account</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Description</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Reference</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center">Subledger</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Debit</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-sm text-muted-foreground">No journal lines</p>
                  </div>
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                const d = line.data as Record<string, unknown> | null | undefined ?? {};
                const isDebit = Boolean(d["is_debit"]);
                return (
                  <tr key={line.id} className={cn("hover:bg-muted/20 transition-colors", isDebit ? "" : "bg-muted/5")}>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground tabular-nums">
                      {line.line_number}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="font-mono text-xs text-foreground truncate" title={String(d["gl_account_name"] ?? "")}>
                        {line.item_code ?? <span className="text-muted-foreground/30 italic">—</span>}
                      </div>
                      {!!d["gl_account_name"] && (
                        <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                          {String(d["gl_account_name"])}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="text-sm text-foreground truncate">{line.description || "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <ReferenceBadge references={d["references"]} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <SubledgerBadge type={d["subledger_type"] as string | null | undefined} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <AmtCell value={d["transaction_debit"]} side="debit" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <AmtCell value={d["transaction_credit"]} side="credit" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Financial footer */}
      <div className="flex justify-between items-center px-4 py-3 border-t border-border/40 bg-muted/20 text-xs flex-wrap gap-3">
        <div className="flex gap-6">
          <span>
            <span className="text-muted-foreground mr-1.5">Total Debit</span>
            <span className="font-semibold tabular-nums">{currencyCode} {fmtAmt(totalDebit)}</span>
          </span>
          <span>
            <span className="text-muted-foreground mr-1.5">Total Credit</span>
            <span className="font-semibold tabular-nums">{currencyCode} {fmtAmt(totalCredit)}</span>
          </span>
        </div>
        <span className={cn(
          "text-xs font-medium",
          readOnlyBalanced ? "text-success" : hasReadOnlyLines ? "text-destructive" : "text-muted-foreground",
        )}>
          {!hasReadOnlyLines ? "No lines" : readOnlyBalanced ? "Balanced" : `Imbalance: ${fmtAmt(Math.abs(totalDebit - totalCredit))}`}
        </span>
      </div>
    </div>
  );
}
