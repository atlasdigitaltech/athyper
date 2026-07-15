# Calendar year vs fiscal year in filters

The DateRangePicker (used in list filters, saved views, and the finance workbench) ships two families of preset chips. Which one you pick determines whether the resolved range obeys the **calendar year** (Jan-Dec) or the **fiscal year** (whatever your company code says it is).

This distinction only matters when your company's `fiscal_year_start_month` is anything other than January (1). If it is January, the two families produce identical ranges and the sidebar's split is purely cosmetic.

## The two families

### Calendar family â€” always Gregorian

| Chip | Range |
|---|---|
| Today, Yesterday | The literal day |
| Last 7 / 30 / 90 days | Rolling window ending today |
| This week, Last week | Locale weekstart (Mon-Sun default; Sat-Fri under KSA locale) |
| This month, Last month | Calendar month, 1st through last day |
| **This year, Last year** | **Jan 1 â†’ Dec 31** â€” always calendar-year |
| Month to date (MTD) | Calendar month start â†’ today |

Pick a chip from this group when you want the range to be independent of your fiscal calendar. Auditors comparing across companies with different fiscal years often reach for these.

### Fiscal family â€” respects `fiscal_year_start_month`

| Chip | Range |
|---|---|
| This quarter, Last quarter | Fiscal quarter (3 fiscal periods) |
| **This fiscal year, Last fiscal year** | **Your company's fiscal year** â€” e.g. India Apr-Mar |
| Year to date (YTD) | Fiscal year start â†’ today |
| Quarter to date (QTD) | Fiscal quarter start â†’ today |

Pick a chip from this group when the filter should align with your accounting close cadence.

### Period family â€” reads `master.fiscal_period`

| Chip | Range |
|---|---|
| This period | The `fiscal_period` row that contains today |
| Last period | The `fiscal_period` row immediately before it |

These are computed by looking up the caller's active company code in `master.fiscal_period`, so they respect any non-standard period structure (weekly-13, quarterly-4, or custom packs). Adjustment periods (`period_type != 'normal'`) are excluded.

## Worked examples

### Example 1 â€” Calendar-year company (US, `fiscal_year_start_month = 1`)

Today is **2026-06-30**. Both families collapse to the same thing:

| Chip | Range |
|---|---|
| This year | 2026-01-01 â†’ 2026-12-31 |
| This fiscal year | 2026-01-01 â†’ 2026-12-31 (identical) |
| This quarter | 2026-04-01 â†’ 2026-06-30 |
| YTD | 2026-01-01 â†’ 2026-06-30 |

The two families are interchangeable â€” pick either.

### Example 2 â€” India-FY company (`fiscal_year_start_month = 4`)

Today is **2026-06-30** (which is FY 2026 period 3 in India).

| Chip | Range | Meaning |
|---|---|---|
| This year | 2026-01-01 â†’ 2026-12-31 | Calendar year |
| **This fiscal year** | **2026-04-01 â†’ 2027-03-31** | FY 2026 |
| This quarter | 2026-04-01 â†’ 2026-06-30 | Fiscal Q1 (Apr-Jun) |
| YTD | 2026-04-01 â†’ 2026-06-30 | Fiscal YTD |
| Last fiscal year | 2025-04-01 â†’ 2026-03-31 | FY 2025 |

Here the distinction is real. A user who picks "This year" gets 12 calendar months; a user who picks "This fiscal year" gets 12 fiscal months. Both are correct â€” the sidebar's divider makes it obvious which one you're choosing.

### Example 3 â€” KSA-locale calendar year (`fiscal_year_start_month = 1`, KSA locale)

Today is **2026-06-30** (Tuesday). Locale weekstart is **Saturday** for KSA.

| Chip | Range |
|---|---|
| This week | 2026-06-27 (Sat) â†’ 2026-07-03 (Fri) |
| Last week | 2026-06-20 â†’ 2026-06-26 |

Weekend/weekstart honours locale independently of the calendar-vs-fiscal split.

## Saved views

Saved views persist the raw sigil (`@this_year` or `@this_fiscal_year`) rather than the resolved dates. That means:

- A saved view of "Last 30 days" from a month ago is *always* last 30 days from now â€” the server re-resolves against its own today at every query.
- A saved view of `@this_year` will always resolve to Jan-Dec, regardless of the caller's company (calendar semantics).
- A saved view of `@this_fiscal_year` resolves against the caller's active company code â€” a user viewing an India-scoped saved view gets India's fiscal calendar; the same view under a US-scoped session gets Jan-Dec.

This mirrors how the DateRangePicker's sidebar chip is rendered as "active" â€” it re-reads the persisted preset key and highlights the matching chip on reload.

## Where the resolution runs

- **Client**: `@athyper/finance-rules::resolveDateRangePreset` (pure predicate; runs when the user picks a chip)
- **Server**: `server/packages/services/records/routes/lib/relative-range.ts` (same pure predicate, called from the filter sigil expander)
- **Period lookups**: `server/packages/services/records/routes/lib/period-range.ts` (async DB lookup against `master.fiscal_period`)

Client and server share the same predicate module, so a saved view resolves to byte-identical ranges wherever it's queried. Zero drift risk by construction.

## When to seed which

- A tenant that operates entirely on the calendar year (US-based, Jan-Dec) can leave the sidebar as-is; the two families collapse and the distinction is invisible.
- A tenant with a non-January fiscal-year-start (India, UK, Japan, etc.) benefits from the divider â€” power users learn to pick the fiscal chips for accounting-close work and the calendar chips for external reporting.
- Set your company's fiscal calendar via `master.company_code.fiscal_year_start_month` (1-12). The resolvers pick it up automatically via `X-Company-Code-ID` on the request â€” no per-filter configuration needed.

## Related

- `packages/shared/business-domain/finance-rules/src/presets.ts` â€” `DateRangePresetKey` JSDoc
- `server/packages/services/records/routes/lib/relative-range.ts` â€” server-side sigil resolver
- `server/packages/services/records/routes/lib/period-range.ts` â€” period-lookup dispatcher
- `server/packages/services/shared/fiscal-context.ts` â€” `resolveActiveFiscalContext` (loads the company profile per-request)
