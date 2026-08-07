/**
 * Canonical temporal kind definitions.
 *
 * Three kinds cover all date/time needs in Athyper:
 *
 *   businessDate  — calendar date, no timezone. Wire: "YYYY-MM-DD".
 *   instant       — UTC moment. Wire: ISO 8601 with literal "Z".
 *   zonedDateTime — wall-clock in a fixed IANA zone. Wire: { localDateTime, timeZone }.
 *
 * @athyper/platform-temporal is the authoritative source for these types.
 * Downstream packages (contracts, schemas) re-export from here.
 */

import { z } from "zod";

export const TemporalKindSchema = z.enum(["businessDate", "instant", "zonedDateTime"]);
export type TemporalKind = z.infer<typeof TemporalKindSchema>;

export const TemporalDisplayModeSchema = z.enum(["date", "dateTime"]);
export type TemporalDisplayMode = z.infer<typeof TemporalDisplayModeSchema>;

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

/**
 * Zod schema for the ZonedDateTimeValue wire shape. Use at API boundaries
 * in combination with parseZonedDateTime for full structural + semantic
 * validation.
 */
export const ZonedDateTimeValueSchema = z.object({
  localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/, {
    message: "localDateTime must be ISO local form without offset (YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS)",
  }),
  timeZone: z.string().min(1, { message: "timeZone must be a non-empty IANA zone identifier" }),
});

/** Week-start day numeric (matches JS Date.getDay()). 0=Sun, 1=Mon, 6=Sat. */
export type WeekStart = 0 | 1 | 6;
