# Business Partner S4 completion record

Recorded: 2026-09-03 (Asia/Kuala_Lumpur)

## Decision

S4 core integrity hardening is certified complete at the DDL and migration-behavior levels. Compatibility retirement remains open and is not a blocker to S4 DDL closure.

## Evidence

- Live certification: `policy/reports/business-partner-s4-live-certification.json`
  - 10 of 10 negative probes rejected invalid writes.
  - 4 of 4 concurrent-write probes admitted exactly one writer and rejected the conflicting writer with SQLSTATE `23P01`.
  - Negative fixtures were rolled back; committed concurrency fixtures were deleted and cleanup was verified.
- Migration certification: `policy/reports/business-partner-s4-migration-evidence.json`
  - Authority-bearing legacy metadata failed preflight with an actionable `S4 preflight failed` exception.
  - Business Partner, supplier, customer, qualification, preference, designation, and credit-review row counts were preserved.
  - 3 legacy alias elements produced 3 normalized alias rows.
  - Qualification, supplier preference, customer designation, and credit review each produced the expected 2 normalized scope rows.
- Source contracts: `server/db/scripts/__tests__/business-partner-foundation/business-partner-integrity-hardening.test.ts` and `server/db/scripts/__tests__/business-partner-foundation/business-partner-s4-certification.test.ts`.

## Compatibility retirement

The retirement policy is `config/governance/business-partner-s4-compatibility-retirement.v1.json`.

| Surface | Repository consumers at first observation | Status |
| --- | ---: | --- |
| `master.business_partner.aliases` cache | 0 | Observation window open; runtime query telemetry still required. |
| Flattened decision-scope columns | 16 | Retain; supported readers/writers still use the compatibility surface. |

The first disposable capture did not have `pg_stat_statements`, so its zero observed-query count is not production telemetry. Removal remains ineligible until the 30-day observation window, 14 consecutive zero-usage days, source-consumer migration, and required approvals are all satisfied. The earliest policy date is 2026-10-03.

## Defect corrected during certification

Live qualification insertion exposed a shared trigger function dereferencing fields absent from some trigger row types. Canonical DDL now reads table-specific fields through `to_jsonb(NEW)`, and `20260903_neon_business_partner_control_scope_polymorphism.sql` forwards the correction before the S4 integrity migration.

## Reproduction

Run only against a confirmed loopback disposable `athyper_neon` database:

```sh
pnpm --dir server/db db:verify:neon:business-partner-s4 -- --neon-database-url=<loopback-url> --confirm=RUN-BP-S4-CERTIFICATION --output=policy/reports/business-partner-s4-live-certification.json
pnpm --dir server/db db:verify:neon:business-partner-s4-migration -- --neon-database-url=<loopback-pre-s4-url> --confirm=APPLY-BP-S4-DISPOSABLE-MIGRATION --output=policy/reports/business-partner-s4-migration-evidence.json
```
