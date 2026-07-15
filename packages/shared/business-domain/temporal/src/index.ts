/**
 * @athyper/temporal — single source of truth for date/time handling.
 *
 * Everything in this package follows the three-kind model documented in
 * `runtime-contracts/src/schemas.ts` (TemporalKind):
 *
 *   businessDate  — calendar date, no TZ. Wire: "YYYY-MM-DD".
 *   instant       — UTC moment. Wire: ISO with "Z".
 *   zonedDateTime — wall-clock in a fixed IANA zone. Wire: { localDateTime, timeZone }.
 *
 * No `new Date(string)` outside this package. The ESLint rule
 * `no-direct-date-parse` enforces it. If you need to parse, use the helpers here.
 */

export * from "./kinds";
export * from "./parse";
export * from "./format";
export * from "./today";
export * from "./week";
export * from "./resolve";
export * from "./arithmetic";
// `localeUsesAlternativeCalendar` and `formatDayNumber` flow through the
// re-export of `./format`; named here so the Phase 5 surface is discoverable.
