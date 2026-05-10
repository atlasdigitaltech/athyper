"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button, Input } from "@athyper/ui/primitives";
import { fmtMoney } from "@athyper/runtime-shared/core";

type ProcurementType = "goods" | "services" | "mixed" | "freight" | "misc";

type InvoiceLineDraft = {
  key: string;
  description: string;
  procurement_type: ProcurementType;
  uom_code: string;
  quantity: string;
  unit_price: string;
};

export type InvoiceLineGridPayload = {
  item_description: string;
  description: string;
  procurement_type: ProcurementType;
  uom_code: string;
  quantity: number;
  unit_price: number;
  price_unit: number;
  line_amount: number;
  gross_amount: number;
};

export type InvoiceLineValidationStatus = {
  blocking: boolean;
  message: string | null;
};

export interface InvoiceIntakeLinesGridProps {
  value?: unknown;
  onChange: (lines: InvoiceLineGridPayload[]) => void;
  onValidationStatusChange?: (status: InvoiceLineValidationStatus) => void;
  currencyCode?: string;
  minRows?: number;
  defaultRow?: unknown;
  error?: string | null;
}

const PROCUREMENT_TYPES: Array<{ value: ProcurementType; label: string }> = [
  { value: "goods", label: "Goods" },
  { value: "services", label: "Services" },
  { value: "mixed", label: "Mixed" },
  { value: "freight", label: "Freight" },
  { value: "misc", label: "Misc" },
];

const LINE_EDITOR_COLUMNS =
  "2rem minmax(0,1.7fr) minmax(7.5rem,.7fr) minmax(5rem,.45fr) minmax(7rem,.55fr) minmax(8rem,.65fr) minmax(9rem,.8fr) 2.25rem";

const LINE_HEADER_CELL = "px-2 py-2 text-xs font-medium text-muted-foreground";
const LINE_BODY_CELL = "min-w-0 px-2 py-1.5";
const LINE_ROWS_SCROLL_AREA = "max-h-[28rem] overflow-y-auto";

function defaultRowValue(defaultRow: unknown, keys: string[], fallback: string): string {
  if (!defaultRow || typeof defaultRow !== "object") return fallback;
  const row = defaultRow as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return fallback;
}

function defaultProcurementType(defaultRow: unknown): ProcurementType {
  const value = defaultRowValue(defaultRow, ["procurement_type"], "services") as ProcurementType;
  return PROCUREMENT_TYPES.some((type) => type.value === value) ? value : "services";
}

function newDraftLine(defaultRow?: unknown): InvoiceLineDraft {
  return {
    key:              `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    description:      defaultRowValue(defaultRow, ["item_description", "description"], ""),
    procurement_type: defaultProcurementType(defaultRow),
    uom_code:         defaultRowValue(defaultRow, ["uom_code", "unit_code"], "EA"),
    quantity:         defaultRowValue(defaultRow, ["quantity"], "1"),
    unit_price:       defaultRowValue(defaultRow, ["unit_price", "gross_amount", "line_amount"], ""),
  };
}

function fmtInputAmount(value: unknown): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function payloadLineToDraft(line: unknown): InvoiceLineDraft | null {
  if (!line || typeof line !== "object") return null;
  const row = line as Record<string, unknown>;
  const description = String(row["item_description"] ?? row["description"] ?? "").trim();
  const procurementType = String(row["procurement_type"] ?? "services") as ProcurementType;
  const uomCode = String(row["uom_code"] ?? row["unit_code"] ?? "EA").trim();
  const quantity = fmtInputAmount(row["quantity"] ?? 1);
  const unitPrice = fmtInputAmount(row["unit_price"]);
  if (!description && !unitPrice) return null;

  return {
    key:              `payload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    description,
    procurement_type: PROCUREMENT_TYPES.some((type) => type.value === procurementType) ? procurementType : "services",
    uom_code:         uomCode || "EA",
    quantity:         quantity || "1",
    unit_price:       unitPrice,
  };
}

function normalizeDraftLines(value: unknown, minRows = 1, defaultRow?: unknown): InvoiceLineDraft[] {
  const rows = Array.isArray(value)
    ? value.map(payloadLineToDraft).filter((line): line is InvoiceLineDraft => Boolean(line))
    : [];
  while (rows.length < minRows) rows.push(newDraftLine(defaultRow));
  return rows;
}

function isBlankDraft(line: InvoiceLineDraft): boolean {
  return !line.description.trim() && !line.unit_price.trim();
}

function parsePositive(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseNonNegative(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function roundAmount(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function validateInvoiceLines(lines: InvoiceLineDraft[], minRows = 1) {
  const active = lines.filter((line) => !isBlankDraft(line));
  const payload: InvoiceLineGridPayload[] = [];
  let totalAmount = 0;

  if (active.length < minRows) {
    return { ok: false, totalAmount, payload, message: `At least ${minRows} invoice line${minRows === 1 ? "" : "s"} required.` };
  }

  for (const line of active) {
    const description = line.description.trim();
    if (!description) {
      return { ok: false, totalAmount, payload, message: "Description is required on every invoice line." };
    }

    const quantity = parsePositive(line.quantity);
    if (quantity == null) {
      return { ok: false, totalAmount, payload, message: "Quantity must be greater than zero on every invoice line." };
    }

    const unitPrice = parseNonNegative(line.unit_price);
    if (unitPrice == null) {
      return { ok: false, totalAmount, payload, message: "Unit Price must be zero or greater on every invoice line." };
    }

    const uomCode = line.uom_code.trim().toUpperCase();
    if (!uomCode) {
      return { ok: false, totalAmount, payload, message: "UoM is required on every invoice line." };
    }

    const lineAmount = roundAmount(quantity * unitPrice);
    totalAmount += lineAmount;
    payload.push({
      item_description: description,
      description,
      procurement_type: line.procurement_type,
      uom_code: uomCode,
      quantity,
      unit_price: unitPrice,
      price_unit: 1,
      line_amount: lineAmount,
      gross_amount: lineAmount,
    });
  }

  if (totalAmount <= 0) {
    return { ok: false, totalAmount, payload, message: "Invoice lines must have a non-zero total." };
  }

  return { ok: true, totalAmount, payload, message: null };
}

function fmtDisplayMoney(value: number, currencyCode: string): string {
  return fmtMoney(value, { currencyCode, currencyCodePosition: "prefix" }) ?? value.toFixed(2);
}

export function InvoiceIntakeLinesGrid({
  value,
  onChange,
  onValidationStatusChange,
  currencyCode = "USD",
  minRows = 1,
  defaultRow,
  error,
}: InvoiceIntakeLinesGridProps) {
  const [draftLines, setDraftLines] = useState<InvoiceLineDraft[]>(() => normalizeDraftLines(value, minRows, defaultRow));
  const onChangeRef = useRef(onChange);
  const onValidationStatusChangeRef = useRef(onValidationStatusChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onValidationStatusChangeRef.current = onValidationStatusChange;
  }, [onValidationStatusChange]);

  const validation = useMemo(
    () => validateInvoiceLines(draftLines, minRows),
    [draftLines, minRows],
  );

  useEffect(() => {
    onChangeRef.current(validation.payload);
    onValidationStatusChangeRef.current?.({
      blocking: !validation.ok,
      message:  validation.message,
    });
  }, [validation]);

  function updateDraftLine(key: string, patch: Partial<InvoiceLineDraft>) {
    setDraftLines((prev) => prev.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function addDraftLine() {
    setDraftLines((prev) => [...prev, newDraftLine(defaultRow)]);
  }

  function removeDraftLine(key: string) {
    setDraftLines((prev) => prev.length <= minRows ? prev : prev.filter((line) => line.key !== key));
  }

  function resetDraftLines() {
    setDraftLines(normalizeDraftLines(value, minRows, defaultRow));
  }

  const activeDraftLineCount = draftLines.filter((line) => !isBlankDraft(line)).length;
  const validationMessage = error ?? validation.message;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/40 px-3.5 py-2">
        <span className="text-xs font-semibold text-foreground">
          {activeDraftLineCount} line{activeDraftLineCount !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addDraftLine}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={resetDraftLines}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      {validationMessage && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{validationMessage}</span>
        </div>
      )}

      <div className="overflow-hidden">
        <div
          className="grid items-center border-b bg-muted/40 text-sm"
          style={{ gridTemplateColumns: LINE_EDITOR_COLUMNS }}
        >
          <div className={cn(LINE_HEADER_CELL, "text-center")}>#</div>
          <div className={cn(LINE_HEADER_CELL, "text-left")}>Description</div>
          <div className={cn(LINE_HEADER_CELL, "text-left")}>Type</div>
          <div className={cn(LINE_HEADER_CELL, "text-center")}>UoM</div>
          <div className={cn(LINE_HEADER_CELL, "text-right")}>Qty</div>
          <div className={cn(LINE_HEADER_CELL, "text-right")}>Unit Price</div>
          <div className={cn(LINE_HEADER_CELL, "text-right")}>Amount</div>
          <div className="px-2 py-2" />
        </div>

        <div className={cn(LINE_ROWS_SCROLL_AREA, "divide-y divide-border/40")} style={{ scrollbarGutter: "stable" }}>
          {draftLines.map((line, index) => {
            const quantity = Number(line.quantity) || 0;
            const unitPrice = Number(line.unit_price) || 0;
            const lineAmount = quantity * unitPrice;

            return (
              <div
                key={line.key}
                className="grid items-center bg-background text-sm"
                style={{ gridTemplateColumns: LINE_EDITOR_COLUMNS }}
              >
                <div className="px-2 py-2 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</div>
                <div className={LINE_BODY_CELL}>
                  <Input
                    className="h-8 w-full min-w-0 text-xs"
                    value={line.description}
                    onChange={(e) => updateDraftLine(line.key, { description: e.target.value })}
                  />
                </div>
                <div className={LINE_BODY_CELL}>
                  <select
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none transition-colors focus:ring-1 focus:ring-ring/40"
                    value={line.procurement_type}
                    onChange={(e) => updateDraftLine(line.key, { procurement_type: e.target.value as ProcurementType })}
                  >
                    {PROCUREMENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className={LINE_BODY_CELL}>
                  <Input
                    className="h-8 w-full min-w-0 text-center font-mono text-xs uppercase"
                    value={line.uom_code}
                    onChange={(e) => updateDraftLine(line.key, { uom_code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className={LINE_BODY_CELL}>
                  <Input
                    className="h-8 w-full min-w-0 text-right text-xs tabular-nums"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => updateDraftLine(line.key, { quantity: e.target.value })}
                  />
                </div>
                <div className={LINE_BODY_CELL}>
                  <Input
                    className="h-8 w-full min-w-0 text-right text-xs tabular-nums"
                    inputMode="decimal"
                    value={line.unit_price}
                    placeholder="0.00"
                    onChange={(e) => updateDraftLine(line.key, { unit_price: e.target.value })}
                  />
                </div>
                <div className="min-w-0 px-2 py-1.5 text-right text-xs font-semibold tabular-nums">
                  {lineAmount > 0 ? fmtDisplayMoney(lineAmount, currencyCode) : <span className="text-muted-foreground/30">-</span>}
                </div>
                <div className="px-1 py-1.5 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeDraftLine(line.key)}
                    disabled={draftLines.length <= minRows}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-muted/20 px-4 py-3 text-xs">
        <span>
          <span className="mr-1.5 text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">{fmtDisplayMoney(validation.totalAmount, currencyCode)}</span>
        </span>
        <span className={cn(
          "text-xs font-medium",
          validation.ok ? "text-success" : "text-destructive",
        )}>
          {activeDraftLineCount === 0 ? "No lines" : validation.ok ? "Ready" : "Needs attention"}
        </span>
      </div>
    </div>
  );
}
