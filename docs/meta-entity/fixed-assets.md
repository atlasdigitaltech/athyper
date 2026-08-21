# Fixed Asset Engine — Book Policies

The asset engine controls depreciation parameters and GL posting roles for fixed assets. Configuration is split across two tables: `asset_class_book_policy_template` (onboarding templates) and `asset_class_book_policy` (effective-dated concrete policies per company × asset class × book).

---

## Architecture

```
control.provision_asset_policies(<tenant>, <company>)
        │ reads templates, creates concrete policy rows
        ▼
control.asset_class_book_policy_template  ─── Platform/tenant templates
        │
        │ → provisioned into →
        ▼
control.asset_class_book_policy  ─── Concrete effective-dated policy
        │
        ├── depreciation_method + useful_life_months + residual_value_*
        ├── posting_role codes (resolved by resolve_posting_role_account at JE time)
        └── event codes (CAPITALIZE, DISPOSE, DEPRECIATE, IMPAIR, REVALUE)
```

Posting roles (not GL accounts) are stored. The existing `resolve_posting_role_account()` function resolves role → GL account per `(company_code, book_code)` at JE creation time.

---

## `control.asset_class_book_policy_template`

Platform or tenant template for provisioning concrete `asset_class_book_policy` rows. `tenant_id = NULL` = platform global default; tenant rows may override. `ARCHETYPE=B;SCOPE=G`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global |
| `template_code` | `text NOT NULL` | Non-empty |
| `framework` | `text NOT NULL DEFAULT 'IFRS'` | e.g. `IFRS`, `US_GAAP`, `IN_GAAP` |
| `asset_class_code` | `text NOT NULL` | e.g. `BUILDING`, `MACHINERY`, `VEHICLE` |
| `book_category` | `text NOT NULL` | Abstract book category (e.g. `statutory`, `tax`, `management`); resolved to actual ledger_book.code during provisioning |
| `capitalization_threshold_multiplier` | `numeric(9,4) NOT NULL DEFAULT 1` | Multiplied by company currency base threshold at provisioning time (`>= 0`) |
| `priority` | `smallint NOT NULL DEFAULT 50` | Template selection priority |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_to` | `date` | |
| **Depreciation Parameters** | | |
| `is_depreciable` | `bool NOT NULL DEFAULT true` | `false` for land and non-depreciable assets |
| `depreciation_method` | `text` | Required when `is_depreciable = true` (e.g. `straight_line`, `declining_balance`, `units_of_production`, `no_depreciation`) |
| `useful_life_months` | `int` | Required when `is_depreciable` and method ≠ `no_depreciation` (`> 0`) |
| `useful_life_min_months` | `int` | Lower bound for range-based useful life |
| `useful_life_max_months` | `int` | Upper bound; `useful_life_months` must be within range |
| `residual_value_mode` | `text NOT NULL DEFAULT 'zero'` | `amount` / `percent` / `zero` |
| `residual_value_amount` | `numeric(18,4)` | Required when `residual_value_mode = 'amount'` (`>= 0`) |
| `residual_value_pct` | `numeric(9,4)` | Required when `residual_value_mode = 'percent'` (0–100) |
| `convention` | `text` | Depreciation convention (e.g. `half_year`, `full_month`) |
| `prorate_basis` | `text NOT NULL DEFAULT 'monthly'` | `monthly` / `daily` / `yearly` |
| `depreciation_start_rule` | `text NOT NULL DEFAULT 'in_service_date'` | `in_service_date` / `capitalization_date` / `next_period` |
| `method_params` | `jsonb NOT NULL DEFAULT '{}'` | Method-specific parameters |
| `source_note` | `text` | Best-practice guidance narrative |
| **Override Permissions** | | |
| `allow_manual_life_override` | `bool NOT NULL DEFAULT false` | |
| `allow_manual_residual_override` | `bool NOT NULL DEFAULT false` | |
| `allow_manual_method_override` | `bool NOT NULL DEFAULT false` | |
| **Posting Role Codes** | | |
| `acquisition_posting_role_code` | `text` | Required (unless `cwip_posting_role_code` is set) |
| `accum_depr_posting_role_code` | `text` | Required when depreciable |
| `depr_expense_posting_role_code` | `text` | Required when depreciable |
| `gain_loss_posting_role_code` | `text` | |
| `impairment_expense_posting_role_code` | `text` | |
| `impairment_reserve_posting_role_code` | `text` | |
| `revaluation_surplus_posting_role_code` | `text` | |
| `revaluation_loss_posting_role_code` | `text` | |
| `cwip_posting_role_code` | `text` | Capital work-in-progress role |
| **Event Codes** | | |
| `capitalization_event_code` | `text NOT NULL DEFAULT 'CAPITALIZE'` | |
| `disposal_event_code` | `text NOT NULL DEFAULT 'DISPOSE'` | |
| `depreciation_event_code` | `text NOT NULL DEFAULT 'DEPRECIATE'` | |
| `impairment_event_code` | `text NOT NULL DEFAULT 'IMPAIR'` | |
| `revaluation_event_code` | `text NOT NULL DEFAULT 'REVALUE'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` / `superseded` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, template_code, asset_class_code, book_category, effective_from) NULLS NOT DISTINCT`

---

## `control.asset_class_book_policy`

Effective-dated concrete depreciation + posting-role policy per `(asset_class, book)`. Created by `control.provision_asset_policies()` from templates. `ARCHETYPE=B;SCOPE=T`.

Same columns as the template except:
- `tenant_id` is `NOT NULL` (always tenant-scoped)
- `company_code_id` `NOT NULL` — company-specific policy
- `asset_class_id` `uuid NOT NULL` — FK to `master.asset_class`
- `book_code` `text NOT NULL` — actual `master.ledger_book.code` (e.g. `ATHQ-BOOK-STAT`); validated by trigger
- `capitalization_threshold` `numeric(18,4) NOT NULL DEFAULT 0` — actual threshold in company currency
- `capitalization_currency` `character(3)` — required when threshold > 0
- No `template_code`, `framework`, `book_category`, `capitalization_threshold_multiplier` columns
- No `useful_life_min/max_months` range columns
- No `source_note`

**Unique:** `(tenant_id, company_code_id, asset_class_id, book_code, effective_from)` — true versioning; same scope may have multiple rows at different effective dates

**Resolution:** `control.resolve_asset_class_book_policy()` is called at `asset_book` creation; selects the best-matching active policy for `effective_from <= :today AND (effective_to IS NULL OR effective_to >= :today)`.

---

## Depreciation Methods Reference

| Method | Description |
|---|---|
| `straight_line` | Equal charge over useful life |
| `declining_balance` | Fixed percentage on book value |
| `double_declining_balance` | 2× straight-line rate on book value |
| `sum_of_years_digits` | Accelerated method |
| `units_of_production` | Per-unit depreciation |
| `ifrs16_interest_method` | Lease liability amortization (IFRS 16) |
| `no_depreciation` | Non-depreciable asset (land, artwork) |

---

## Posting Role Resolution

Asset book policies store **role codes**, not GL accounts. At JE creation:

```
posting_role_code → resolve_posting_role_account(company_code_id, book_code, role_code)
                  → master.book_gl_account.gl_account_id
```

This means:
- The same policy template works across companies with different COAs
- GL account assignments are managed centrally via `master.book_gl_account`
- No policy update needed when GL accounts change

---

## Related Docs

- [Overview](./overview.md)
- [Accounting Profiles](./accounting-profiles.md)
- [Dimension, Tax & Rounding](./dimension-tax-rounding.md)
