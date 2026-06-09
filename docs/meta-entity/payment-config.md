# Payment Configuration

Payment configuration tables govern bank account format validation, payment method policies, bank integration profiles, method-to-interface routing, and posting-role-based settlement accounting.

---

## Table Map

| Table | Purpose |
|---|---|
| `control.bank_format_rule` | Country + payment rail validation policy |
| `control.payment_method_company_policy` | Runtime eligibility + defaulting per company + method |
| `control.bank_interface_profile` | HOW payments are produced (file format, API, check) |
| `control.payment_method_interface_binding` | Routes payment method to interface by scope |
| `control.payment_settlement_rule` | Posting-role-based settlement accounting |

---

## `control.bank_format_rule`

Country + payment rail validation policy for bank account identifiers. Platform default (`tenant_id IS NULL`) + tenant override. `ARCHETYPE=B;SCOPE=G`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global default |
| `code` | `text NOT NULL` | Non-empty |
| `name` | `text NOT NULL` | Non-empty |
| `description` | `text` | |
| `country_code` | `character(2) NOT NULL` | UPPERCASE |
| `payment_network` | `text NOT NULL` | Payment rail code (e.g. `SEPA_CT`, `NACHA`, `NEFT`, `SWIFT`) |
| `direction` | `text NOT NULL DEFAULT 'BOTH'` | `INBOUND` / `OUTBOUND` / `BOTH` |
| `currency_code` | `character(3)` | NULL = any currency; UPPERCASE |
| `account_id_type` | `text NOT NULL` | Type of account identifier (e.g. `IBAN`, `BBAN`, `ACCOUNT_NUMBER`) |
| `bank_id_type` | `text NOT NULL` | Type of bank identifier (e.g. `BIC`, `SORT_CODE`, `IFSC`) |
| `is_account_id_required` | `bool NOT NULL DEFAULT true` | |
| `is_bank_id_required` | `bool NOT NULL DEFAULT true` | |
| `is_bic_allowed` | `bool NOT NULL DEFAULT true` | |
| `is_bic_required` | `bool NOT NULL DEFAULT false` | Requires `is_bic_allowed = true` |
| `is_branch_code_required` | `bool NOT NULL DEFAULT false` | |
| `is_national_bank_code_required` | `bool NOT NULL DEFAULT false` | |
| `account_pattern` | `text` | Regex for account number validation |
| `bank_id_pattern` | `text` | Regex for bank ID validation |
| `branch_code_pattern` | `text` | Regex for branch code validation |
| `iban_country_prefix` | `character(2)` | UPPERCASE; expected IBAN country prefix |
| `is_checksum_validated` | `bool NOT NULL DEFAULT false` | |
| `validation_schema` | `jsonb` | Extended validation schema object |
| `priority` | `smallint NOT NULL DEFAULT 0` | `>= 0` |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## `control.payment_method_company_policy`

Runtime eligibility and defaulting per `(company, payment_method, direction)`. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `company_code_id` | `uuid NOT NULL` | |
| `payment_method_id` | `uuid NOT NULL` | FK → `master.payment_method` |
| `direction` | `text NOT NULL DEFAULT 'OUTBOUND'` | `INBOUND` / `OUTBOUND` |
| `currency_code` | `character(3)` | NULL = any currency |
| `bank_account_link_id` | `uuid` | Preferred/forced house-bank link; FK → `master.bank_account_link` |
| `min_amount` | `numeric(18,4)` | `>= 0` |
| `max_amount` | `numeric(18,4)` | `>= 0`; `>= min_amount` if both set |
| `is_default` | `bool NOT NULL DEFAULT false` | Default method for this company/direction |
| `is_manual_allowed` | `bool NOT NULL DEFAULT true` | Manual payment runs allowed |
| `is_file_allowed` | `bool NOT NULL DEFAULT true` | File-based payment runs allowed |
| `is_api_allowed` | `bool NOT NULL DEFAULT false` | API-driven payment runs allowed |
| `requires_dual_approval` | `bool NOT NULL DEFAULT false` | |
| `cutoff_time_local` | `time` | Local cutoff time for same-day processing |
| `timezone_code` | `text` | Required when `cutoff_time_local` is set |
| `priority` | `smallint NOT NULL DEFAULT 0` | `>= 0` |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_until` | `date` | `> effective_from` if set |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**CHECK:** `cutoff_time_local` and `timezone_code` must both be NULL or both be non-NULL.

---

## `control.bank_interface_profile`

HOW a payment message is produced: file format, API provider, message version, capabilities. Credentials in `config` must be encrypted at the application layer. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `code` | `text NOT NULL` | Unique per tenant |
| `name` | `text NOT NULL` | |
| `description` | `text` | |
| `interface_type` | `text NOT NULL` | `FILE` / `API` / `CHECK_PRINT` / `MANUAL` |
| `payment_network` | `text` | Payment rail (reuses `bank_format_rule` vocabulary) |
| `file_format_code` | `text` | `PAIN_001` / `NACHA_CCD` / `NACHA_PPD` / `MT101` / etc. |
| `provider_code` | `text` | Execution provider (e.g. `WISE_API`, `STRIPE_API`, `HDFC_H2H`) |
| `message_version` | `text` | Message schema version |
| `config` | `jsonb NOT NULL DEFAULT '{}'` | **SENSITIVE** — API keys, endpoints; MUST be encrypted at rest |
| `supports_remittance_advice` | `bool NOT NULL DEFAULT false` | |
| `supports_acknowledgement` | `bool NOT NULL DEFAULT false` | |
| `supports_status_pull` | `bool NOT NULL DEFAULT false` | |
| `supports_return_file` | `bool NOT NULL DEFAULT false` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, code)`

---

## `control.payment_method_interface_binding`

Bridges payment method to bank interface profile. Routes the same method to different interfaces by company, bank, currency, direction, counterparty country, and payment network. Priority-based resolution. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `company_code_id` | `uuid` | NULL = all companies |
| `payment_method_id` | `uuid NOT NULL` | FK → `master.payment_method` |
| `bank_account_link_id` | `uuid` | NULL = any bank account |
| `currency_code` | `character(3)` | NULL = any currency; UPPERCASE |
| `direction` | `text NOT NULL DEFAULT 'OUTBOUND'` | `INBOUND` / `OUTBOUND` |
| `counterparty_country_code` | `character(2)` | NULL = any country; UPPERCASE |
| `payment_network` | `text` | NULL = any network |
| `bank_interface_profile_id` | `uuid NOT NULL` | FK → `control.bank_interface_profile` (tenant-composite) |
| `priority` | `smallint NOT NULL DEFAULT 0` | `>= 0`; highest priority wins when multiple bindings match |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_until` | `date` | `> effective_from` if set |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## `control.payment_settlement_rule`

Posting-role-based settlement accounting for payment execution. Outputs **posting role codes**, not GL accounts — `resolve_posting_role_account()` handles role → GL resolution per company/book. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `company_code_id` | `uuid NOT NULL` | |
| `payment_method_id` | `uuid NOT NULL` | FK → `master.payment_method` |
| `direction` | `text NOT NULL DEFAULT 'OUTBOUND'` | `INBOUND` / `OUTBOUND` |
| `book_code` | `text NOT NULL DEFAULT 'statutory'` | Non-empty |
| `clearing_posting_role_code` | `text NOT NULL` | Required; non-empty |
| `settlement_posting_role_code` | `text NOT NULL` | Required; non-empty |
| `bank_fee_posting_role_code` | `text` | Bank charges/fees |
| `discount_posting_role_code` | `text` | Early payment discount |
| `fx_gain_posting_role_code` | `text` | FX realized gain |
| `fx_loss_posting_role_code` | `text` | FX realized loss |
| `chargeback_posting_role_code` | `text` | Chargeback recovery |
| `suspense_posting_role_code` | `text` | Unallocated suspense account |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_until` | `date` | `> effective_from` if set |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## Payment Execution Flow

```
Payment run triggered for payment_method + company
        │
        ▼
payment_method_company_policy
  → eligibility check (direction, currency, min/max amount)
  → preferred bank_account_link_id
  → cutoff_time_local enforcement
        │
        ▼
payment_method_interface_binding
  → resolve bank_interface_profile_id
    (highest priority match on company + method + currency + network + direction)
        │
        ▼
bank_interface_profile
  → dispatch via interface_type (FILE/API/CHECK_PRINT/MANUAL)
  → apply file_format_code / provider_code
        │
        ▼
payment_settlement_rule
  → at clearing: post to clearing_posting_role_code
  → at settlement: post to settlement_posting_role_code
  → optional: bank_fee, discount, fx_gain/loss, chargeback
```

---

## Related Docs

- [Overview](./overview.md)
- [Accounting Profiles](./accounting-profiles.md)
- [Dimension, Tax & Rounding](./dimension-tax-rounding.md)
