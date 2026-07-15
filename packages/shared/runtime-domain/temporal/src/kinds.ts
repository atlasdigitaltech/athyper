/**
 * Re-exports the canonical TemporalKind type from runtime-contracts so callers
 * have a single import surface (`@athyper/temporal`) for both types and runtime
 * functions. The Zod schema (TemporalKindSchema) is the source of truth — see
 * runtime-contracts/src/schemas.ts.
 */
export {
  TemporalKindSchema,
  TemporalDisplayModeSchema,
  type TemporalKind,
  type TemporalDisplayMode,
} from "@athyper/runtime-contracts";

/**
 * Wire shape for `zonedDateTime` fields. The picker may carry a bracketed
 * convenience string internally (e.g. "2026-06-30T18:00:00[Asia/Riyadh]") but
 * never on the network boundary — that form is custom and breaks JSON.parse-based
 * consumers. APIs always carry this two-field object instead.
 */
export interface ZonedDateTimeValue {
  /** Wall-clock ISO without offset (e.g. "2026-06-30T18:00:00"). */
  localDateTime: string;
  /** IANA zone identifier (e.g. "Asia/Riyadh"). Never an offset. */
  timeZone: string;
}

/** Week-start day numeric (matches JS Date.getDay()). 0=Sun, 1=Mon, 6=Sat. */
export type WeekStart = 0 | 1 | 6;
