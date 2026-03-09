"use client";

// components/finance/ManualJournalForm.tsx
//
// Create/edit form for manual journal entries with:
// - Inline dimension capture per line (DimensionPicker)
// - Real-time balance validation
// - Per-line error surfacing
// - Resolved dimension snapshot preview

import { Badge, Button, Input } from "@neon/ui";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";

import { cn } from "@/lib/utils";
import { DimensionPicker } from "@/components/finance/DimensionPicker";
import { useCreateJournalEntry } from "@/lib/finance/use-create-journal-entry";
import type {
  ManualJELineInput,
  CreateManualJEInput,
} from "@/lib/finance/use-create-journal-entry";
import type { DimensionSelectionDTO } from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ManualJournalFormProps {
  entityCode: string;
  defaultCurrencyCode: string;
  onSuccess?: (jeId: string, jeNumber: string) => void;
}

// ---------------------------------------------------------------------------
// Line type (local state)
// ---------------------------------------------------------------------------

interface FormLine {
  key: string; // React key (stable)
  accountId: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  dimensions: DimensionSelectionDTO[];
  error: string | null;
}

function emptyLine(): FormLine {
  return {
    key: crypto.randomUUID(),
    accountId: "",
    description: "",
    debitAmount: "",
    creditAmount: "",
    dimensions: [],
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAmount(s: string): number {
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return n.toFixed(4);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManualJournalForm({
  entityCode,
  defaultCurrencyCode,
  onSuccess,
}: ManualJournalFormProps) {
  // ── Header fields ────────────────────────────────────────────
  const [postingDate, setPostingDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [description, setDescription] = useState("");

  // ── Lines ────────────────────────────────────────────────────
  const [lines, setLines] = useState<FormLine[]>([emptyLine(), emptyLine()]);
  const [expandedLine, setExpandedLine] = useState<number | null>(null);

  // ── Submission ───────────────────────────────────────────────
  const { submit, submitting, error: submitError, createdEntry, reset } =
    useCreateJournalEntry();

  // ── Balance computation ──────────────────────────────────────
  const { totalDebit, totalCredit, difference, isBalanced } = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const line of lines) {
      d += parseAmount(line.debitAmount);
      c += parseAmount(line.creditAmount);
    }
    const diff = Math.abs(d - c);
    return {
      totalDebit: d,
      totalCredit: c,
      difference: diff,
      isBalanced: diff < 0.005, // tolerance for rounding
    };
  }, [lines]);

  // ── Line operations ──────────────────────────────────────────
  const updateLine = useCallback(
    (index: number, field: keyof FormLine, value: unknown) => {
      setLines((prev) =>
        prev.map((line, i) =>
          i === index ? { ...line, [field]: value, error: null } : line,
        ),
      );
    },
    [],
  );

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateDimensions = useCallback(
    (index: number, dims: DimensionSelectionDTO[]) => {
      updateLine(index, "dimensions", dims);
    },
    [updateLine],
  );

  // ── Validation ───────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    let valid = true;
    const updated = lines.map((line) => {
      const errors: string[] = [];

      if (!line.accountId.trim()) {
        errors.push("Account is required");
      }

      const d = parseAmount(line.debitAmount);
      const c = parseAmount(line.creditAmount);
      if (d === 0 && c === 0) {
        errors.push("Either debit or credit must be non-zero");
      }
      if (d > 0 && c > 0) {
        errors.push("Line cannot have both debit and credit");
      }

      if (errors.length > 0) {
        valid = false;
        return { ...line, error: errors.join("; ") };
      }
      return { ...line, error: null };
    });

    if (!isBalanced) valid = false;
    if (lines.length < 2) valid = false;
    if (!description.trim()) valid = false;

    setLines(updated);
    return valid;
  }, [lines, isBalanced, description]);

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    const input: CreateManualJEInput = {
      entityCode,
      postingDate,
      description,
      currencyCode: defaultCurrencyCode,
      lines: lines.map(
        (line): ManualJELineInput => ({
          accountId: line.accountId,
          debitAmount: line.debitAmount || "0",
          creditAmount: line.creditAmount || "0",
          currencyCode: defaultCurrencyCode,
          description: line.description || undefined,
          dimensions: line.dimensions.length > 0 ? line.dimensions : undefined,
        }),
      ),
    };

    const result = await submit(input);
    if (result) {
      onSuccess?.(result.id, result.jeNumber);
    }
  }, [
    validate,
    entityCode,
    postingDate,
    description,
    defaultCurrencyCode,
    lines,
    submit,
    onSuccess,
  ]);

  // ── Success state ────────────────────────────────────────────
  if (createdEntry) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/30">
          <Check className="size-6 text-green-600" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium">Journal Entry Created</p>
          <p className="text-sm text-muted-foreground">
            {createdEntry.jeNumber} &mdash; {createdEntry.status}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Debit: {createdEntry.totalDebit} / Credit: {createdEntry.totalCredit}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            reset();
            setLines([emptyLine(), emptyLine()]);
            setDescription("");
          }}
        >
          Create Another
        </Button>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Posting Date
          </label>
          <Input
            type="date"
            value={postingDate}
            onChange={(e) => setPostingDate(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Manual journal entry description"
            className="h-9"
          />
          {!description.trim() && (
            <p className="mt-1 text-xs text-amber-600">
              Description is required
            </p>
          )}
        </div>
      </div>

      {/* Lines grid */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-8 px-2 py-2" />
              <th className="w-10 px-2 py-2 text-left font-medium">#</th>
              <th className="min-w-[160px] px-3 py-2 text-left font-medium">
                Account
              </th>
              <th className="min-w-[140px] px-3 py-2 text-left font-medium">
                Description
              </th>
              <th className="w-36 px-3 py-2 text-right font-medium">Debit</th>
              <th className="w-36 px-3 py-2 text-right font-medium">
                Credit
              </th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <LineRow
                key={line.key}
                line={line}
                index={idx}
                entityCode={entityCode}
                expanded={expandedLine === idx}
                onToggleExpand={() =>
                  setExpandedLine(expandedLine === idx ? null : idx)
                }
                onFieldChange={updateLine}
                onDimensionsChange={updateDimensions}
                onRemove={removeLine}
                canRemove={lines.length > 2}
              />
            ))}
          </tbody>

          {/* Footer totals */}
          <tfoot>
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-2 py-2" />
              <td className="px-2 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                Totals
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {formatMoney(totalDebit)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {formatMoney(totalCredit)}
              </td>
              <td className="px-2 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between">
        {/* Balance indicator */}
        {isBalanced ? (
          <Badge
            variant="outline"
            className="border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
          >
            <Check className="mr-1 size-3" />
            Balanced
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          >
            <AlertCircle className="mr-1 size-3" />
            Out of Balance: {formatMoney(difference)}
          </Badge>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="mr-1 size-3.5" />
            Add Line
          </Button>
          <Button
            size="sm"
            disabled={submitting || !isBalanced || lines.length < 2}
            onClick={handleSubmit}
          >
            {submitting ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 size-3.5" />
            )}
            Post Journal Entry
          </Button>
        </div>
      </div>

      {/* Submission error */}
      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/30 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mr-1 inline size-4" />
          {submitError}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line row sub-component
// ---------------------------------------------------------------------------

interface LineRowProps {
  line: FormLine;
  index: number;
  entityCode: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onFieldChange: (index: number, field: keyof FormLine, value: unknown) => void;
  onDimensionsChange: (index: number, dims: DimensionSelectionDTO[]) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

function LineRow({
  line,
  index,
  entityCode,
  expanded,
  onToggleExpand,
  onFieldChange,
  onDimensionsChange,
  onRemove,
  canRemove,
}: LineRowProps) {
  const hasDimensions = line.dimensions.length > 0;

  return (
    <>
      <tr
        className={cn(
          "border-b last:border-b-0 hover:bg-muted/30",
          line.error && "bg-red-50/50 dark:bg-red-950/10",
        )}
      >
        {/* Expand toggle */}
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            title="Toggle dimension picker"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        </td>

        {/* Line number */}
        <td className="px-2 py-2 text-muted-foreground">{index + 1}</td>

        {/* Account */}
        <td className="px-3 py-2">
          <Input
            value={line.accountId}
            onChange={(e) => onFieldChange(index, "accountId", e.target.value)}
            placeholder="Account ID"
            className="h-8 text-sm"
          />
        </td>

        {/* Description */}
        <td className="px-3 py-2">
          <Input
            value={line.description}
            onChange={(e) =>
              onFieldChange(index, "description", e.target.value)
            }
            placeholder="Line description"
            className="h-8 text-sm"
          />
        </td>

        {/* Debit */}
        <td className="px-3 py-2">
          <Input
            value={line.debitAmount}
            onChange={(e) =>
              onFieldChange(index, "debitAmount", e.target.value)
            }
            placeholder="0.0000"
            className="h-8 text-right font-mono text-sm tabular-nums"
          />
        </td>

        {/* Credit */}
        <td className="px-3 py-2">
          <Input
            value={line.creditAmount}
            onChange={(e) =>
              onFieldChange(index, "creditAmount", e.target.value)
            }
            placeholder="0.0000"
            className="h-8 text-right font-mono text-sm tabular-nums"
          />
        </td>

        {/* Remove */}
        <td className="px-2 py-2 text-center">
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Remove line ${index + 1}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </td>
      </tr>

      {/* Line error */}
      {line.error && (
        <tr className="border-b bg-red-50/50 dark:bg-red-950/10">
          <td />
          <td />
          <td colSpan={5} className="px-3 py-1">
            <span className="text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="mr-1 inline size-3" />
              {line.error}
            </span>
          </td>
        </tr>
      )}

      {/* Dimension picker (expanded) */}
      {expanded && (
        <tr className="border-b bg-muted/20">
          <td />
          <td />
          <td colSpan={5} className="px-3 py-3">
            <div className="flex items-start gap-3">
              <Layers className="mt-0.5 size-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Dimensions
                  {hasDimensions && (
                    <span className="ml-1 text-foreground">
                      ({line.dimensions.length} selected)
                    </span>
                  )}
                </p>
                <DimensionPicker
                  entityCode={entityCode}
                  value={line.dimensions}
                  onChange={(dims) => onDimensionsChange(index, dims)}
                />
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Dimension badges (collapsed, if any selected) */}
      {!expanded && hasDimensions && (
        <tr className="border-b">
          <td />
          <td />
          <td colSpan={5} className="px-3 py-1">
            <div className="flex flex-wrap gap-1">
              {line.dimensions.map((dim) => (
                <Badge
                  key={dim.typeCode}
                  variant="secondary"
                  className="text-xs"
                >
                  {dim.typeName}: {dim.valueName}
                </Badge>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
