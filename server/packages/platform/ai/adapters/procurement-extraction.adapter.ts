/**
 * ProcurementExtractionAdapter — Layer 3 domain adapter.
 *
 * Bridges the AI runtime (Layer 2) and the procurement intake pipeline (Layer 1).
 * Responsibilities:
 *   1. Wrap extract_document action calls for purchase_invoice and purchase_requisition
 *   2. Enforce consumer_ceiling = "assist" — financial doc extraction is never auto
 *   3. Normalise raw model output → ProcurementLineInput[]
 *   4. Hand off to IntentResolutionService for the 5-step resolver pipeline
 *   5. Return enriched lines with classification_decision populated
 *
 * ESLint boundary: this file MAY import from procurement-intake.
 * Layer 2 (ai-runtime.ts) must NEVER import from this file.
 */

import { sql } from "kysely";
import type { AnyDb, AiLogger, ActionResponse, AutonomyLevel } from "../ai-runtime.types.js";
import type { ICapabilityHandler, CapabilityDeps, CapabilityRunArgs } from "../capability-registry.js";
import type { CapabilityResult } from "../ai-runtime.types.js";

// ── Normalised extraction output shapes ───────────────────────────────────────

export interface ExtractedLineItem {
  line_no:           number;
  item_description:  string;
  quantity:          number | null;
  unit_price:        number | null;
  amount:            number | null;
  currency_code:     string | null;
  uom_code:          string | null;
  tax_rate_pct:      number | null;
  commodity_category_suggestion: string | null;
  hs_code:           string | null;
  confidence:        number;
}

export interface ExtractedDocumentOutput {
  supplier_name:         string | null;
  supplier_tax_id:       string | null;
  invoice_number:        string | null;
  invoice_date:          string | null;
  currency_code:         string | null;
  subtotal:              number | null;
  tax_total:             number | null;
  total:                 number | null;
  lines:                 ExtractedLineItem[];
  arithmetic_drift_pct:  number;
}

// ── Capability handler — extract_document / purchase_invoice ──────────────────

export class InvoiceExtractionCapability implements ICapabilityHandler {
  readonly action_code      = "extract_document";
  // Financial document extraction: NEVER auto regardless of tenant policy.
  readonly consumer_ceiling: AutonomyLevel = "assist";

  async run(deps: CapabilityDeps, args: CapabilityRunArgs): Promise<CapabilityResult> {
    const { modelRouter, promptStore, evidenceBinder, logger } = deps;
    const { request, pipelineId } = args;

    // Only attachment subjects carry the raw document
    if (request.subject.kind !== "attachment") {
      return this._emptyResult(deps, "NON_ATTACHMENT_SUBJECT");
    }

    const attachmentId = request.subject.attachment_id;

    // Load the attachment blob reference (we pass the attachment_id in the
    // prompt; the model receives the base64-encoded file via multimodal input
    // once Phase 7b fetches it from object storage)
    const prompt = await promptStore.get("extract-invoice") ?? {
      text: this._defaultSystemPrompt(),
      version: "inline-v1",
      hash:    "inline",
    };

    // Requires a vision-capable provider (PDF/image)
    const provider = modelRouter.pick({ supports_vision: true, supports_json_schema: true });
    const startMs  = Date.now();

    const systemBlock = [{ type: "text" as const, text: prompt.text, cache_control: { type: "ephemeral" as const } }];

    // Phase 7a: we submit the attachment_id reference; actual multipart upload
    // happens in the full Phase 7b implementation.  For now the model receives
    // a structured extraction request.
    const userText = JSON.stringify({
      task:         "extract_invoice",
      attachment_id: attachmentId,
      doc_class:    request.doc_class ?? "purchase_invoice",
      locale:       request.context.locale,
    });

    const response = await provider.invoke({
      system:     systemBlock,
      messages:   [{ role: "user", content: userText }],
      max_tokens: 4096,
    });

    let parsed: Partial<ExtractedDocumentOutput> = {};
    try {
      parsed = JSON.parse(response.text) as Partial<ExtractedDocumentOutput>;
    } catch (e) {
      logger.warn("ai_invoice_extraction_parse_failed", { pipelineId, err: String(e) });
    }

    const lines: ExtractedLineItem[] = Array.isArray(parsed.lines)
      ? parsed.lines.map((line) => ({
          ...line,
          commodity_category_suggestion: line.commodity_category_suggestion ?? null,
        }))
      : [];
    const overallConfidence = lines.length > 0
      ? lines.reduce((sum, l) => sum + (l.confidence ?? 0), 0) / lines.length
      : 0;

    const lineConfidences: Record<string, number> = {};
    lines.forEach((l, i) => { lineConfidences[`line_${i + 1}`] = l.confidence ?? 0; });

    return {
      output: {
        ...parsed,
        lines,
        arithmetic_drift_pct: parsed.arithmetic_drift_pct ?? 0,
      } as ExtractedDocumentOutput,
      confidence:    { overall: overallConfidence, fields: lineConfidences },
      evidence:      evidenceBinder.bind(null),
      costUnits:     { ...response.usage, vision_pages: 0, duration_ms: Date.now() - startMs },
      modelId:       provider.modelId,
      modelVersion:  provider.modelVersion,
      promptVersion: prompt.version,
      warnings:      overallConfidence < 0.50 ? [{ code: "LOW_CONFIDENCE_EXTRACTION", message: "Extraction confidence below 0.50 — manual review required" }] : [],
    };
  }

  private _emptyResult(deps: CapabilityDeps, warningCode: string): CapabilityResult {
    return {
      output:        null,
      confidence:    { overall: 0, fields: {} },
      evidence:      deps.evidenceBinder.bind(null),
      costUnits:     { input_tokens: 0, output_tokens: 0, vision_pages: 0, duration_ms: 0 },
      modelId:       "none",
      modelVersion:  "none",
      promptVersion: null,
      warnings:      [{ code: warningCode, message: `Cannot process subject kind "${warningCode}"` }],
    };
  }

  private _defaultSystemPrompt(): string {
    return `You are an expert AP invoice extraction assistant.
Extract all structured data from the provided purchase invoice document.

Return a JSON object with this exact schema:
{
  "supplier_name": string | null,
  "supplier_tax_id": string | null,
  "invoice_number": string | null,
  "invoice_date": "YYYY-MM-DD" | null,
  "currency_code": "ISO 4217 3-letter code" | null,
  "subtotal": number | null,
  "tax_total": number | null,
  "total": number | null,
  "lines": [
    {
      "line_no": integer,
      "item_description": string,
      "quantity": number | null,
      "unit_price": number | null,
      "amount": number,
      "currency_code": string | null,
      "uom_code": string | null,
      "tax_rate_pct": number | null,
      "commodity_category_suggestion": string | null,
      "hs_code": string | null,
      "confidence": 0.0-1.0
    }
  ],
  "arithmetic_drift_pct": number
}

Rules:
- arithmetic_drift_pct is abs((sum_of_lines - stated_total) / stated_total) * 100
- confidence per line reflects how clearly each field was read (0 = could not read, 1 = perfectly clear)
- Return null for fields that cannot be determined; do not guess
- All amounts in document's stated currency`;
  }
}

// ── Normalisation helper (used by the confirm endpoint to map extracted output
//    back to ProcurementLineInput before calling IntentResolutionService) ───────

export function normaliseExtractedLines(
  output: ExtractedDocumentOutput,
  headerContext: { invoiceId: string; tenantId: string },
): Array<{
  line_no:          number;
  item_description: string;
  quantity:         number;
  unit_price:       number | null;
  amount:           number | null;
  currency_code:    string | null;
  commodity_category_suggestion: string | null;
}> {
  return output.lines.map((l) => ({
    line_no:          l.line_no,
    item_description: l.item_description ?? "",
    quantity:         l.quantity ?? 1,
    unit_price:       l.unit_price,
    amount:           l.amount,
    currency_code:    l.currency_code,
    commodity_category_suggestion: l.commodity_category_suggestion,
  }));
}

// ── DB writer: persist confirmed extraction to purchase_invoice_line rows ──────

export async function persistExtractedLines(
  db:        AnyDb,
  tenantId:  string,
  invoiceId: string,
  lines:     ReturnType<typeof normaliseExtractedLines>,
  logger:    AiLogger,
): Promise<void> {
  for (const line of lines) {
    try {
      await sql`
        UPDATE document.purchase_invoice_line
           SET item_description = ${line.item_description},
               quantity         = ${line.quantity ?? 1}::numeric,
               unit_price       = COALESCE(${line.unit_price}::numeric, unit_price),
               updated_at       = now()
         WHERE purchase_invoice_id = ${invoiceId}::uuid
           AND tenant_id           = ${tenantId}::uuid
           AND line_number         = ${line.line_no}
      `.execute(db);
    } catch (e) {
      logger.error("persist_extracted_line_failed", {
        invoiceId, lineNo: line.line_no, err: String(e),
      });
    }
  }
}
