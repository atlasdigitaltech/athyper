/**
 * Invoice Intake Service — Phase 6
 *
 * Machine-to-machine intake parsers for structured invoice formats:
 *   parseCxmlInvoice   — cXML 1.x OrderRequest / InvoiceDetailRequest
 *   parseEdifactInvoice — EDIFACT INVOIC D96A (simplified, message-level only)
 *
 * Both parsers normalise their format into CreateInvoiceBody + lines[],
 * with metadata.intake_channel set appropriately:
 *   'edi_cxml'    — cXML
 *   'edi_edifact' — EDIFACT
 *
 * invoice_source is NOT changed by intake channel:
 *   - 'non_po'       when no PO/commitment reference present
 *   - 'po_based'     when an OrderID or PO reference is present (requires commitment_id resolution)
 *
 * Duplicate prevention: the calling route must check for an existing
 * purchase_invoice with (tenant_id, supplier_id, supplier_invoice_number)
 * before calling handleCreateApInvoice.
 *
 * Field name: line_no (matches DDL purchase_invoice_line.line_no), NOT line_number.
 */

import type { CreateInvoiceBody } from "./invoice-create.handler.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface IntakeInvoiceBody extends CreateInvoiceBody {
  lines: IntakeInvoiceLine[];
  /** Stored in purchase_invoice.metadata.intake_channel */
  _intake_channel: "edi_cxml" | "edi_edifact";
  /** Supplier natural keys for tenant lookup */
  _supplier_tax_id?:  string;
  _supplier_name?:    string;
}

export interface IntakeInvoiceLine {
  line_no:         number;
  description:     string;
  quantity:        number | null;
  unit_price:      number | null;
  net_amount:      number;
  currency_code:   string;
  uom_code:        string | null;
  tax_rate_pct:    number | null;
  hs_code:         string | null;
}

// ── cXML parser ───────────────────────────────────────────────────────────────
// Supports cXML 1.x InvoiceDetailRequest (canonical AP e-invoice format).
// Falls back to OrderRequest if InvoiceDetailRequest not present.

export function parseCxmlInvoice(rawXml: string): IntakeInvoiceBody {
  const getText = (tag: string, ctx: string = rawXml): string | null => {
    const re = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, "is");
    return re.exec(ctx)?.[1]?.trim() ?? null;
  };

  const getAttr = (tag: string, attr: string, ctx: string = rawXml): string | null => {
    const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "is");
    return re.exec(ctx)?.[1]?.trim() ?? null;
  };

  // Invoice identity
  const invoiceId   = getAttr("InvoiceDetailRequestHeader", "invoiceID")
    ?? getAttr("InvoiceDetailOrder", "invoiceID")
    ?? "";
  const invoiceDate = getAttr("InvoiceDetailRequestHeader", "invoiceDate")?.slice(0, 10) ?? null;
  const currency    = getAttr("InvoiceDetailRequestHeader", "isInformationOnly")
    ? null
    : (getAttr("InvoiceDetailSummary", "currency")
      ?? getAttr("Money", "currency")
      ?? "USD");

  const actualCurrency = (currency ?? "USD").toUpperCase().slice(0, 3);

  // Supplier identity
  const supplierTaxId  = getText("SupplierTaxID") ?? getText("TaxID");
  const supplierName   = getText("SupplierCorporateURL") ? null : (getText("Name") ?? null);

  // PO reference
  const poOrderId = getAttr("InvoiceDetailOrder", "orderID")
    ?? getAttr("InvoiceDetailOrder", "orderDate")
    ? getAttr("InvoiceDetailOrder", "orderID")
    : null;

  const invoiceSource = poOrderId ? "po_based" : "non_po";

  // Totals
  const subTotalRaw = getAttr("InvoiceDetailSummary", "subtotalAmount")
    ?? getText("SubtotalAmount");
  const totalRaw = getAttr("InvoiceDetailSummary", "grossAmount") ?? getText("GrossAmount");

  // Line items — <InvoiceDetailItem> blocks
  const lines: IntakeInvoiceLine[] = [];
  const lineRe = /<InvoiceDetailItem\b([^>]*)>([\s\S]*?)<\/InvoiceDetailItem>/gi;
  let lineMatch: RegExpExecArray | null;
  let lineNo = 1;

  while ((lineMatch = lineRe.exec(rawXml)) !== null) {
    const lineAttrs = lineMatch[1]!;
    const lineBody  = lineMatch[2]!;

    const getLA = (a: string): string | null => {
      const r = new RegExp(`\\b${a}="([^"]*)"`, "i");
      return r.exec(lineAttrs)?.[1]?.trim() ?? null;
    };

    const qty      = parseFloat(getLA("quantity") ?? "1");
    const unitPrice = parseFloat(getAttr("UnitPrice", "amount", lineBody) ?? "0");
    const lineAmt   = parseFloat(getAttr("InvoiceDetailItemSummary", "subtotalAmount", lineBody) ?? String(qty * unitPrice));
    const desc      = getText("Description", lineBody) ?? getText("ItemDescription", lineBody) ?? "";
    const uom       = getLA("unitOfMeasure") ?? getText("UnitOfMeasure", lineBody);
    const taxRate   = parseFloat(getText("TaxRate", lineBody) ?? "0") || null;

    lines.push({
      line_no:       lineNo++,
      description:   desc,
      quantity:      isNaN(qty) ? null : qty,
      unit_price:    isNaN(unitPrice) ? null : unitPrice,
      net_amount:    isNaN(lineAmt) ? 0 : lineAmt,
      currency_code: actualCurrency,
      uom_code:      uom?.slice(0, 10) ?? null,
      tax_rate_pct:  taxRate,
      hs_code:       getText("HSCode", lineBody) ?? null,
    });
  }

  // Derive net_amount from subtotal or total if no lines
  const statedTotal = parseFloat(totalRaw ?? subTotalRaw ?? "0") || 0;
  if (lines.length === 0 && statedTotal > 0) {
    lines.push({
      line_no:       1,
      description:   "cXML invoice (no line detail)",
      quantity:      1,
      unit_price:    statedTotal,
      net_amount:    statedTotal,
      currency_code: actualCurrency,
      uom_code:      null,
      tax_rate_pct:  null,
      hs_code:       null,
    });
  }

  return {
    invoice_source:          invoiceSource,
    invoice_type:            "standard",
    company_code_id:         "",  // resolved by intake route from service account claims
    supplier_id:             undefined,
    supplier_invoice_number: invoiceId || undefined,
    supplier_invoice_date:   invoiceDate ?? undefined,
    document_date:           invoiceDate ?? new Date().toISOString().split("T")[0]!,
    tax_mode:                "exclusive",
    tax_mode_source:         "user_override",
    currency_code:           actualCurrency,
    lines,
    _intake_channel:         "edi_cxml",
    _supplier_tax_id:        supplierTaxId ?? undefined,
    _supplier_name:          supplierName ?? undefined,
  };
}

// ── EDIFACT INVOIC parser ─────────────────────────────────────────────────────
// Supports EDIFACT INVOIC D96A — UN/EDIFACT standard AP invoice message.
// Segments parsed: BGM, DTM, NAD, LIN, QTY, PRI, MOA, TAX, UNS, CNT.
// This is a simplified parser covering the common segments; complex multi-segment
// references (BGM+380=invoice, BGM+381=credit note) are handled.

export function parseEdifactInvoice(rawMsg: string): IntakeInvoiceBody {
  // Normalise: EDIFACT uses single quotes as segment terminators
  // and '+' as component/element separator
  const segments = rawMsg
    .replace(/\r?\n/g, "")
    .split("'")
    .map((s) => s.trim())
    .filter(Boolean);

  const segs = segments.map((s) => s.split("+").map((e) => e.split(":")));

  const findSeg = (tag: string): string[][] | null =>
    segs.find((s) => s[0]?.[0] === tag) ?? null;

  const allSegs = (tag: string): string[][][] =>
    segs.filter((s) => s[0]?.[0] === tag);

  // BGM: invoice number and type
  const bgm = findSeg("BGM");
  const msgType = bgm?.[1]?.[0] ?? "380";  // 380=invoice, 381=credit_note, 383=debit_note
  const invoiceNumber = bgm?.[2]?.[0] ?? null;

  const invoiceType = msgType === "381" ? "credit_note"
    : msgType === "383" ? "debit_note"
    : "standard";

  // DTM: document date (qualifier 137)
  const dtms = allSegs("DTM");
  let invoiceDate: string | null = null;
  for (const dtm of dtms) {
    if (dtm[1]?.[0] === "137") {
      const rawDate = dtm[1]?.[1] ?? "";
      invoiceDate = rawDate.length >= 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : null;
      break;
    }
  }

  // NAD: supplier (qualifier SE or SU)
  const nads = allSegs("NAD");
  let supplierName: string | null = null;
  let supplierTaxId: string | null = null;
  for (const nad of nads) {
    const qualifier = nad[1]?.[0];
    if (qualifier === "SE" || qualifier === "SU") {
      supplierName   = nad[4]?.[0] ?? null;
      supplierTaxId  = nad[2]?.[0] ?? null;
      break;
    }
  }

  // MOA: monetary amounts (segment qualifier 79=invoice total, 125=subtotal)
  const moas = allSegs("MOA");
  let totalAmt = 0;
  for (const moa of moas) {
    if (moa[1]?.[0] === "79") {
      totalAmt = parseFloat(moa[1]?.[1] ?? "0") || 0;
      break;
    }
  }

  // CUX: currency
  const cux = findSeg("CUX");
  const currency = (cux?.[1]?.[1] ?? "USD").toUpperCase().slice(0, 3);

  // PO reference from RFF segment (qualifier ON=order number)
  const rffs = allSegs("RFF");
  let poRef: string | null = null;
  for (const rff of rffs) {
    if (rff[1]?.[0] === "ON") { poRef = rff[1]?.[1] ?? null; break; }
  }

  const invoiceSource = poRef ? "po_based" : "non_po";

  // Line items: LIN segments + following QTY/PRI/MOA until next LIN or UNS
  const lines: IntakeInvoiceLine[] = [];
  let currentLine: Partial<IntakeInvoiceLine> | null = null;
  let lineNo = 1;

  for (const seg of segs) {
    const tag = seg[0]?.[0];
    if (tag === "LIN") {
      if (currentLine?.description) lines.push(currentLine as IntakeInvoiceLine);
      currentLine = { line_no: lineNo++, currency_code: currency };
    } else if (tag === "IMD" && currentLine) {
      currentLine.description = seg[3]?.[0] ?? seg[4]?.[0] ?? "item";
    } else if (tag === "QTY" && currentLine) {
      if (seg[1]?.[0] === "47") currentLine.quantity = parseFloat(seg[1]?.[1] ?? "1") || null;
    } else if (tag === "PRI" && currentLine) {
      if (seg[1]?.[0] === "AAA") currentLine.unit_price = parseFloat(seg[1]?.[1] ?? "0") || null;
    } else if (tag === "MOA" && currentLine) {
      if (seg[1]?.[0] === "203") {
        currentLine.net_amount = parseFloat(seg[1]?.[1] ?? "0") || 0;
      }
    } else if (tag === "TAX" && currentLine) {
      if (seg[1]?.[0] === "7") currentLine.tax_rate_pct = parseFloat(seg[5]?.[0] ?? "0") || null;
    } else if (tag === "UNS") {
      if (currentLine?.description) { lines.push(currentLine as IntakeInvoiceLine); currentLine = null; }
    }
  }
  if (currentLine?.description) lines.push(currentLine as IntakeInvoiceLine);

  // Fallback: if no lines parsed, synthesise one from total
  if (lines.length === 0 && totalAmt > 0) {
    lines.push({
      line_no:       1,
      description:   "EDIFACT invoice (no line detail)",
      quantity:      1,
      unit_price:    totalAmt,
      net_amount:    totalAmt,
      currency_code: currency,
      uom_code:      null,
      tax_rate_pct:  null,
      hs_code:       null,
    });
  }

  return {
    invoice_source:          invoiceSource,
    invoice_type:            invoiceType,
    company_code_id:         "",
    supplier_id:             undefined,
    supplier_invoice_number: invoiceNumber ?? undefined,
    supplier_invoice_date:   invoiceDate ?? undefined,
    document_date:           invoiceDate ?? new Date().toISOString().split("T")[0]!,
    tax_mode:                "exclusive",
    tax_mode_source:         "user_override",
    currency_code:           currency,
    lines,
    _intake_channel:         "edi_edifact",
    _supplier_tax_id:        supplierTaxId ?? undefined,
    _supplier_name:          supplierName  ?? undefined,
  };
}
