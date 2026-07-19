# Finance Fiscal Calendar

Stage 1 introduces a reusable, versioned fiscal-calendar definition while retaining the existing finance posting and governance model.

## Ownership

- `control.fiscal_calendar_config` owns the tenant-scoped calendar header and version.
- `control.fiscal_calendar_period_rule` owns ordered construction rules. It supports monthly, 4-4-5, 4-5-4, 5-4-4, 13-period, and irregular patterns.
- `control.company_fiscal_calendar_assignment` assigns one non-overlapping active calendar version to a company for an effective fiscal-year range.
- `master.fiscal_period` remains the operational company posting gate. Generated rows retain calendar/version provenance.
- `governance.book_period_status` remains the book-specific posting gate and is seeded during period generation.

No separate finance period-governance table is introduced.

## Period semantics

Adjustment status is derived from `period_type = 'adjustment'`, never from `period_number > 12`. This permits period 13 to be a normal period in a 13-period calendar. Opening and adjustment periods can share a date with a normal period; ordinary posting-date resolution therefore selects normal periods only. Special posting flows must select opening or adjustment periods explicitly.

## Generation contract

`control.preview_fiscal_calendar` and `control.generate_fiscal_periods` use the same calendar math. Generation is idempotent for future periods and refuses to alter an opened or closed period when its dates or semantics differ from the assigned calendar version.

Generation requires:

1. An active tenant session matching the requested tenant.
2. An active company assignment covering the fiscal year.
3. An active calendar version whose normal rule count matches `periods_per_year`.

The generator creates or updates `master.fiscal_period` and inserts missing `governance.book_period_status` rows for active company book assignments. Existing governance gate statuses are never overwritten.

## Workbench workflow

The Fiscal Calendar tab in the company Configure workspace follows this sequence:

1. Create or edit a draft calendar version.
2. Preview exact dates for a fiscal year.
3. Activate and assign the version to the current company from an effective fiscal year.
4. Generate fiscal periods and book-period gates.

Active versions are immutable. Changes create a new version so generated and historical periods retain their original definition.
