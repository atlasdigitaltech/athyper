# Finance Production Readiness Field Plan

Scope: Journal Entry, Payment Entry, Payment Run, and Bank Reconciliation.

This note records the field-level contract decisions that must drive metadata,
intake rendering, backend validation, and workbench UX. Runtime screens should
bind from `control.entity_field` and `control.entity_flow_field`; workbench
shortcuts must not bypass required document fields.

## Payment Entry

| Field | Contract | Intake behavior | Production rule |
| --- | --- | --- | --- |
| `payment_type` | `document.payment_entry_type` enum | Radio cards or select from lookup domain | Stores settlement classification only: `standard`, `advance`, `retention_release`, `partial`, `final`, `down_payment`, `urgent`, `netting`. It must not store bank instrument values. |
| `payment_direction` | `OUTBOUND` or `INBOUND` | Hidden for AP create, explicit for future unified payment intake | Drives posting logic, payment method filtering, bank sign, and reconciliation sign. |
| `payment_method_id` | Reference to `payment_method` | Required inline picker, derived from supplier profile when available | Stores the payment/receipt instrument. This is where bank transfer, cheque, cash, card, direct debit, etc. are selected. |
| `bank_account_id` | Reference to house `bank_account` | Required inline picker scoped by company code | Required for AP payment posting and bank reconciliation. |
| `supplier_id` | Reference to `supplier` for AP | Required for outbound AP | Inbound AR currently reuses `supplier_name` as counterparty label; a future schema pass should add first-class `customer_id`. |
| `supplier_name` | Denormalized display text | Backend derived | Must be populated server-side from supplier/customer context. |
| `payment_amount` | Positive decimal | Required money input | Must equal allocation net total for allocated payments unless explicitly on-account. |
| `currency_code` | ISO currency | Derived chip, overrideable | Must match allocation currency unless payment currency fields are used. |
| `value_date` | Date | Required in workbench shortcuts | Used for bank/reconciliation timing. |
| `payment_reference` | Text | Optional | External bank/check/reference number. |

## Journal Entry

| Field | Contract | Intake behavior | Production rule |
| --- | --- | --- | --- |
| `company_code_id` | Reference to `company_code` | Required inline picker | Drives base currency, book derivation, fiscal period, and dimension filtering. |
| `book_id` | Reference to `ledger_book` | Derived/overrideable | Must resolve before posting. |
| `fiscal_period_id` | Reference to fiscal period | Derived from posting date/company | Must reject closed periods unless override is valid. |
| `document_date` | Date | Required | Must be on or before posting date. |
| `posting_date` | Date | Required | Drives period gate and reporting period. |
| `transaction_currency` | Currency | Required | Drives line currency and FX rules. |
| `exchange_rate` | Positive decimal | Required only when transaction and base currencies differ | Must be either fetched default or user supplied. |
| `lines` | Journal line collection | At least two lines | Debit and credit totals must balance before create/post. |

## Bank Reconciliation

| Field | Contract | Intake/workbench behavior | Production rule |
| --- | --- | --- | --- |
| `bank_account_id` | House bank account | Required workbench selector | Scopes statement, candidates, auto-match, and sign-off. |
| `bank_statement_line_id` | Statement line reference | Set by match/import flows | Reconciliation must link payments to statement lines instead of changing payment lifecycle status. |
| `cleared_date` | Date | Set by match/legacy clear | Indicates clearing state while `payment_entry.status` remains posted/transmitted/printed. |
| `recon_case_id` | Reconciliation case | Created by auto/manual/split match | Groups exceptions, match confidence, adjustments, and sign-off. |

## Payment Run

Payment Run is still a product gap. Required contracts:

| Field | Contract |
| --- | --- |
| `payment_run_id` | Header UUID linked from payment entries. |
| `run_number` | Numbering-config driven natural key. |
| `company_code_id` | Company scope. |
| `bank_account_id` | Funding bank account. |
| `currency_code` | Run currency. |
| `selection_criteria` | JSON criteria for due date, supplier, holds, currency, amount. |
| `status` | Draft, review, approved, transmitted, settled, cancelled. |
| `lines` | Supplier/invoice allocation lines with hold/exception state. |

## Implementation Rules

- Contract values must come from lookup domains or references, not hard-coded UI-only values.
- Required backend fields must appear in intake flows or be derived server-side with an auditable rule.
- Workbench shortcuts must submit the same required fields as runtime intake.
- Mobile layouts must either switch to cards or use bounded horizontal scroll with stable minimum widths.
- Reconciliation must not use document lifecycle status as the cleared flag.
