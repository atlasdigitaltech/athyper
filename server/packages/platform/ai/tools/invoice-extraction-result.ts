import type { AtlasJsonValue } from "./atlas-tool.types.js";

/** Versioned, read-only result returned by a future certified invoice tool. */
export interface AtlasInvoiceExtractionResultV1 {
  readonly kind: "invoice_extraction";
  readonly version: 1;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string | null;
  readonly supplierName: string | null;
  readonly currency: string | null;
  readonly totalAmount: number | null;
  readonly lineCount: number;
  readonly evidence: readonly {
    readonly sourceId: string;
    readonly revisionId: string;
    readonly checksum: string;
  }[];
}

/**
 * Normalize model/document extraction into a bounded card-safe structure.
 * Unknown fields are discarded; this function never authorizes or persists a
 * mutation and is intentionally not registered as an executable tool yet.
 */
export function normalizeInvoiceExtractionResult(
  value: AtlasJsonValue,
  evidence: AtlasInvoiceExtractionResultV1["evidence"],
): AtlasInvoiceExtractionResultV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invoice extraction must be a JSON object.");
  }
  if (!evidence[0]?.sourceId || !evidence[0]?.revisionId || !evidence[0]?.checksum) {
    throw new Error("Invoice extraction evidence is required.");
  }
  const input = value as Record<string, AtlasJsonValue>;
  const stringOrNull = (key: string, max: number): string | null => {
    const candidate = input[key];
    return typeof candidate === "string" ? candidate.trim().slice(0, max) || null : null;
  };
  const amount = input.total_amount;
  const totalAmount = typeof amount === "number" && Number.isFinite(amount) ? amount : null;
  const lines = input.line_items;
  const lineCount = Array.isArray(lines) ? Math.min(lines.length, 500) : 0;
  return Object.freeze({
    kind: "invoice_extraction",
    version: 1,
    invoiceNumber: stringOrNull("invoice_number", 128),
    invoiceDate: stringOrNull("invoice_date", 32),
    supplierName: stringOrNull("supplier_name", 200),
    currency: stringOrNull("currency", 8),
    totalAmount,
    lineCount,
    evidence: Object.freeze([{ ...evidence[0] }]),
  });
}
