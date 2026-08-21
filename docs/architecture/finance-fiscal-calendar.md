# Finance Fiscal Calendar

The Neon fiscal-calendar aggregate provides reusable, versioned calendar definitions and generates company posting periods with immutable provenance.

## Ownership

- `control.fiscal_calendar_config` owns the tenant-scoped calendar header and version.
- `control.fiscal_calendar_period_rule` owns ordered construction rules. It supports monthly, 4-4-5, 4-5-4, 5-4-4, 13-period, and irregular patterns.
- `control.company_fiscal_calendar_assignment` is the sole applicability authority and assigns one non-overlapping active calendar version to a company for an effective fiscal-year range. It has no priority because overlaps are prohibited.
- `master.fiscal_period` remains the operational company posting gate. Generated rows retain calendar/version provenance.
- `ledger.book_period_status` remains the book-specific posting gate and is seeded during period generation.

The aggregate is Neon-only. Athyper and Mesh do not store calendar definitions or assignments; Admin manages them through the Neon administration boundary.

No separate finance period-governance table is introduced.

## Period semantics

Adjustment status is derived from `period_type = 'adjustment'`, never from `period_number > 12`. This permits period 13 to be normal in a 13-period calendar. Opening, adjustment, and closing periods can share a date with a normal period; ordinary posting-date resolution therefore selects normal periods only. Special posting flows must request special periods explicitly.

Calendar headers and their ordered rules are editable only in `draft`. Activation validates lineage, preset period counts, and leap-week structure. Active and retired definitions are immutable; changes create a new version. Rule rows have no independent lifecycle because they are composition children of the version.

## Generation contract

`control.preview_fiscal_calendar` and `control.generate_fiscal_periods` use the same calendar math. Generation is idempotent for future periods and refuses to alter an opened or closed period when its dates or semantics differ from the assigned calendar version.

Generation requires:

1. An active tenant session matching the requested tenant.
2. An active company assignment covering the fiscal year.
3. An active calendar version whose normal rule count matches `periods_per_year`.
4. A same-tenant actor and company with effective active ledger-book assignments.

The generator creates or updates future `master.fiscal_period` rows and inserts missing `ledger.book_period_status` rows for effective active company book assignments. Opened or closed periods and existing non-future book gates are never overwritten.

## Workbench workflow

The Fiscal Calendar tab in the company Configure workspace follows this sequence:

1. Create or edit a draft calendar version.
2. Preview exact dates for a fiscal year.
3. Activate and assign the version to the current company from an effective fiscal year.
4. Generate fiscal periods and book-period gates.

Active versions are immutable. Changes create a new version so generated and historical periods retain their original definition.
