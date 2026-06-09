/**
 * EvidenceBinder — attaches source evidence pointers to extracted output fields.
 *
 * The model is prompted to return a parallel evidence block alongside its
 * structured output.  EvidenceBinder validates and normalises these pointers
 * so the frontend can highlight the source region (PDF page/bbox, XLSX cell,
 * plain text span) when the user reviews an extraction.
 *
 * Design constraints:
 *   - Every output field in ActionResponse.evidence must have a corresponding key.
 *   - Null evidence is valid (model didn't produce a pointer for that field).
 *   - Partial evidence is normalised to null for missing fields.
 */

import type { EvidencePointer } from "./ai-runtime.types.js";

export class EvidenceBinder {
  // Normalises a raw evidence map from the model into the canonical shape.
  // Accepts: { page, bbox, sheet, cell, span } or null per field.
  // Unknown shapes are coerced to null rather than throwing.
  bind(rawEvidence: unknown): Record<string, EvidencePointer> {
    if (rawEvidence === null || typeof rawEvidence !== "object") {
      return {};
    }

    const result: Record<string, EvidencePointer> = {};
    for (const [field, raw] of Object.entries(rawEvidence as Record<string, unknown>)) {
      result[field] = this._coerce(raw);
    }
    return result;
  }

  // Merge evidence from multiple sources; later maps win on conflict.
  merge(...maps: Record<string, EvidencePointer>[]): Record<string, EvidencePointer> {
    return Object.assign({}, ...maps) as Record<string, EvidencePointer>;
  }

  private _coerce(raw: unknown): EvidencePointer {
    if (raw === null || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    return {
      page:  typeof r["page"] === "number" ? r["page"] : null,
      bbox:  this._parseBbox(r["bbox"]),
      sheet: typeof r["sheet"] === "string" ? r["sheet"] : null,
      cell:  typeof r["cell"]  === "string" ? r["cell"]  : null,
      span:  this._parseSpan(r["span"]),
    };
  }

  private _parseBbox(raw: unknown): [number, number, number, number] | null {
    if (!Array.isArray(raw) || raw.length !== 4) return null;
    if (!raw.every((v) => typeof v === "number")) return null;
    return raw as [number, number, number, number];
  }

  private _parseSpan(raw: unknown): [number, number] | null {
    if (!Array.isArray(raw) || raw.length !== 2) return null;
    if (!raw.every((v) => typeof v === "number")) return null;
    return raw as [number, number];
  }
}
