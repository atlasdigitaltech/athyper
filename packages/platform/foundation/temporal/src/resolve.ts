/**
 * resolveTemporalKind — metadata-first resolver with strict inference fallback.
 *
 * Order of precedence:
 *   1. field.temporalKind (explicit) → wins, no inference attempted.
 *   2. Inference by data_type:
 *        date         → businessDate
 *        timestamptz  → instant
 *        datetime     → instant (post-normalisation form)
 *        timestamp    → instant (pre-normalisation literal; seed VALUES blocks)
 *        anything else → not temporal
 *
 * Returns a discriminated result so callers can distinguish "resolved" from
 * "this field must be tagged explicitly." The audit script ships in
 * server/scripts/audit-temporal-fields.ts and fails CI on any UNRESOLVED row.
 */

import type { TemporalKind, TemporalDisplayMode } from "./kinds";

export type TemporalResolution =
  | {
      status: "resolved";
      kind: TemporalKind;
      displayMode: TemporalDisplayMode | undefined;
      source: "explicit" | "inferred";
      affectsPostingPeriod: boolean;
    }
  | {
      status: "not_temporal";
    }
  | {
      status: "unresolved";
      reason: "unknown_kind_string";
      dataType: string;
    };

/**
 * Minimal shape required by the resolver. Lets callers feed raw seed rows
 * (server scripts) or compiled MetaEntityField (runtime) interchangeably.
 */
export interface MetaEntityFieldLike {
  /** DB column data type (e.g. "date", "timestamptz", "text"). */
  dataType: string;
  temporalKind?: string | null;
  displayMode?: string | null;
  affectsPostingPeriod?: boolean | null;
}

/**
 * Picker contract: pass a MetaEntityFieldLike and get back either a resolved
 * kind + display mode, or "unresolved" — caller must not silently fall back
 * to a default (that's how time gets dropped from datetime fields). Surface
 * unresolved as a hard error in dev, audit in CI.
 */
export function resolveTemporalKind(field: MetaEntityFieldLike): TemporalResolution {
  const explicit = field.temporalKind;
  if (explicit === "businessDate" || explicit === "instant" || explicit === "zonedDateTime") {
    return {
      status: "resolved",
      kind: explicit,
      displayMode: normalizeDisplayMode(field.displayMode),
      source: "explicit",
      affectsPostingPeriod: field.affectsPostingPeriod === true,
    };
  }
  if (typeof explicit === "string" && explicit.length > 0) {
    return { status: "unresolved", reason: "unknown_kind_string", dataType: field.dataType };
  }

  const dt = (field.dataType ?? "").toLowerCase();

  if (dt === "date") {
    return {
      status: "resolved",
      kind: "businessDate",
      displayMode: normalizeDisplayMode(field.displayMode),
      source: "inferred",
      affectsPostingPeriod: field.affectsPostingPeriod === true,
    };
  }
  if (dt === "timestamptz" || dt === "datetime" || dt === "timestamp") {
    // All three Postgres timestamp flavors land on `instant` because the
    // athyper convention is "stored UTC, displayed in user TZ":
    //   'timestamptz' — Postgres TIMESTAMPTZ (canonical UTC storage)
    //   'timestamp'   — pre-normalisation literal used in seed VALUES blocks;
    //                   045_control_entity_field_data_type_normalization_contract.sql maps it
    //                   to 'datetime' at the end of the seed phase
    //   'datetime'    — post-normalisation form
    // If a future contract needs wall-clock-in-fixed-zone semantics, the
    // descriptor must set temporal_kind='zonedDateTime' explicitly.
    return {
      status: "resolved",
      kind: "instant",
      displayMode: normalizeDisplayMode(field.displayMode),
      source: "inferred",
      affectsPostingPeriod: false,
    };
  }
  return { status: "not_temporal" };
}

function normalizeDisplayMode(raw: string | null | undefined): TemporalDisplayMode | undefined {
  if (raw === "date" || raw === "dateTime") return raw;
  return undefined;
}
