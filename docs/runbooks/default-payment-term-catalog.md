# Default payment-term catalog

Locked decision: seed the 17 generic payment terms below by default. The user approved these exact code/name pairs. Changes require an explicit catalog revision. Industry, advance/retention, grace-period and recurring-billing arrangements belong in optional agreement templates. This supersedes the earlier proposal to seed all 28 historical terms. The catalog was loaded into the local development Athyper, Technostat and CirrusAtlantic tenants on 2026-09-05; see the load receipt below.

The source reviewed is `server/db/seed-backup/blueprints/universal/030_payments/341_payment_terms.sql`, with calendars in `340_holiday_calendars.sql`. Historical files remain unchanged.

## Locked default catalog: 17 terms

| Code | Display name | Meaning before any explicit calendar adjustment |
|---|---|---|
| `PT-IMMEDIATE` | Due on Invoice Date | Invoice date + 0 days |
| `PT-COD` | Payment on Delivery | Payment due on delivery; does not prescribe payment method |
| `PT-PREPAID` | Payment in Advance | Full prepayment; requires a configured event and prepayment process |
| `PT-NET7` | Net 7 Days | Invoice date + 7 days |
| `PT-NET14` | Net 14 Days | Invoice date + 14 days |
| `PT-NET30` | Net 30 Days | Invoice date + 30 days |
| `PT-NET45` | Net 45 Days | Invoice date + 45 days |
| `PT-NET60` | Net 60 Days | Invoice date + 60 days |
| `PT-NET90` | Net 90 Days | Invoice date + 90 days |
| `PT-NET120` | Net 120 Days | Invoice date + 120 days |
| `PT-EOM` | End of Invoice Month | Last calendar day of invoice month |
| `PT-EOM30` | End of Invoice Month + 30 Days | Month end + 30 calendar days, not next month end |
| `PT-EOM60` | End of Invoice Month + 60 Days | Month end + 60 calendar days, not two month ends |
| `PT-FIXED1` | 1st of Following Month | Day 1 of invoice month + 1 |
| `PT-FIXED15` | 15th of Following Month | Day 15 of invoice month + 1 |
| `PT-EOMNEXT` | End of Following Month | Last calendar day of invoice month + 1 |
| `PT-2-10-N30` | 2% Within 10 Days, Net 30 | Invoice due in 30 days, with one optional 2% early-payment tier |

The two additions use native rules: `PT-FIXED1` = `INVOICE_DATE` / `FIXED_DAY` / day `1` / month offset `1`; `PT-EOMNEXT` = `INVOICE_DATE` / `EOM` / month offset `1` / zero additional days. End of following month is distinct from end of invoice month plus 30 days. All calendar adjustments are applied separately. For an invoice dated 2026-02-10, before adjustment, these yield 2026-03-01 and 2026-03-31; `PT-EOM30` yields 2026-03-30.

Codes are stable identifiers; descriptive labels may improve without changing their meaning. Default does not mean automatically assigned to a supplier. `PT-NET30` remains the proposed Northwind selection through a governed request.

## Separate configuration responsibilities

- Payment term: base event, due-date calculation, applicability and explicit calendar adjustment.
- Discount tier: rate, eligibility window, amount basis and selection rule. Use the existing `payment_term_discount_tier` child model; a shared reusable discount catalog is a possible later change, not an existing capability claim.
- Agreement clauses: advance, advance recovery, retention and retention release. Use the existing `payment_term_clause` model in an optional pack; do not copy industry assumptions into universal defaults.
- Payment schedule: installments, milestones, allocation and release events.
- Billing schedule: generation of recurring monthly/annual invoices. A payment term alone does not establish recurrence.
- Assignment: the supplier/customer and company-specific agreed choice. Calendar, grace days and withholding/release conditions require explicit configuration.

This separation is consistent with the distinction between terms of payment, payment schedules and cash discounts in [Microsoft's payment setup documentation](https://learn.microsoft.com/en-us/dynamics365/finance/general-ledger/tasks/establish-customer-payment-terms). The exact 17-term selection is an Athyper design decision, not a prescribed external standard.

## Disposition of the other 13 historical codes

| Historical code | Future seed treatment |
|---|---|
| `PT-CIA` | Omit from defaults. Full advance payment is represented by `PT-PREPAID`; do not automatically migrate existing CIA assignments because the source uses different base-event semantics. |
| `PT-SOM` | Optional explicit current-month day-1 rule. It can predate the invoice and is unsuitable as an implicit default. |
| `PT-3TIER-N60` | Optional Net 60 plus 3%/10-day, 2%/20-day, 1%/30-day discount template. |
| `PT-CONST-60` | Optional certified-date Net 60 plus retention and release clauses. |
| `PT-CONST-ADV` | Optional certified-date Net 45 plus advance, recovery, retention and release clauses. |
| `PT-CONST-GOV` | Optional certified-date Net 60, explicit grace and two-tranche retention release. |
| `PT-CONST-2TR` | Optional certified-date Net 45 plus two-tranche retention release. |
| `PT-MFG-ADV` | Optional Net 30 plus fixed advance and recovery clauses. |
| `PT-MFG-ADV-FLEX` | Optional Net 30 plus bounded variable advance and milestone recovery. |
| `PT-GOV-60` | Optional certified-date Net 60 plus 7-day grace. No implicit government-wide policy. |
| `PT-GOV-90` | Optional certified-date Net 90 plus 14-day grace. No implicit government-wide policy. |
| `PT-LEASE-MTH` | Optional day-1-of-following-month payment rule plus a separately configured monthly billing schedule. |
| `PT-SUB-ANNUAL` | Use an explicitly selected invoice payment rule plus a separate annual billing schedule. Historical NONE calendar adjustment must be preserved when migrating. |

Describe new optional templates by their behavior (for example, “Net 45 + advance + retention”), and keep industry labels as tags. Percentages, grace periods and release delays must remain explicit parameters. Merely renaming an industry-specific composite does not make it a universal default.

## Tenant provisioning and compatibility

- Implement defaults through canonical NEON layer-12 reference definitions and tenant provisioning. Never make runtime loaders read `seed-backup` or reinstate retired blueprint pack paths.
- Create tenant-owned UUIDs with valid tenant/principal context and provenance. Preserve existing versioned records and references; exclusion from future defaults does not authorize deletion, renaming of codes or reassignment of existing records.
- Keep the backup applicability values on existing versions. A broader PURCHASE/SALE policy must be explicitly versioned; generic names do not imply every term is automatically valid for both directions.
- Default terms have no implicit industry grace period or retention. Calendar adjustment must be explicit and validated, not inferred from country or a label.
- Validate every complete configuration before activation. Prepayment due dates do not by themselves enforce a payment-before-shipment control.
- Preserve customized active terms on replay; check each natural key and version independently. Stage optional packs only when selected and qualified.

## Corrections required before promoting the backup

1. Remove corrupted text encoding from comments and descriptions; preserve the semantic codes.
2. Replace the all-or-nothing child-record guard. The old script skips all clause/tier inserts if any seeded child exists, so it cannot repair a partially populated catalog. Converge and verify every parent/version and child natural key independently without mutating protected active versions.
3. Every term lookup for clauses and tiers must include the intended version. The old lookups use only tenant and code even though the parent conflict key includes version.
4. Validate explicit tenant, plane and principal context; activation must follow complete native validation and retain the required status/provenance evidence.
5. Establish the calendar policy explicitly. The old script attaches all adjusted terms to `HC-DEFAULT`, not the tenant's country calendar. The calendar file contains only selected 2025–2026 holidays; it is not a maintained authoritative holiday feed.
6. Check cash-in-advance semantics: `PT-CIA` currently means invoice date plus zero days, which alone does not enforce payment before shipment. `PT-PREPAID` likewise needs the corresponding business-process control.
7. Check `PT-SOM`: its first day of the current invoice month can precede the invoice date. Preserve that intent only for agreements that explicitly require it.
8. Qualify construction release timing. `PT-CONST-60` adds 180 days after DLP expiry; `PT-CONST-ADV` adds 365 days after warranty expiry. Confirm these are intentional additional delays. Two-tranche terms store a first-of-following-month rule under `_seed.due_day_rule`; no consumer of that key was found in current server packages or NEON DDL, so it must not be presented as enforced behavior without implementation and tests.
9. Monthly lease and annual subscription terms specify payment timing, not a recurring billing schedule. Keep that distinction in descriptions.
10. Verify the default pack has exactly 17 headers, zero advance/retention clauses and one discount tier; verify optional packs separately. Check cross-tenant isolation, replay/partial-recovery behavior, and due-date/discount/release results before declaring the seed ready to load.

Accounting-profile setup and Northwind's approved risk assessment remain separate work. This catalog decision does not change current remittance, currency, or any business-partner assignment.

## Local development load receipt

Loaded 2026-09-05 into Athyper, Technostat and CirrusAtlantic: 17 active payment terms, one discount tier and two active accounting-profile identities per tenant. A second execution left IDs and timestamps unchanged. Business-partner assignments were not changed. Posting policies and automatic integration into future tenant provisioning remain separate work.

[Native load receipt](../../governance/evidence/business-partner/local/2026-09-05/three-tenant-locked-finance-defaults.json). Loader: `server/db/scripts/seed/load-locked-finance-defaults.sql`.
