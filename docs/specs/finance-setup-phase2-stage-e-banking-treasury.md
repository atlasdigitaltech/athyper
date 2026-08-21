# Finance Setup Phase 2 — Stage E Banking and Treasury

## Contract

- Bank Party remains the reusable institution/branch definition. Bank Account remains the physical account and is always masked in list/readiness responses.
- A House Bank is one governed aggregate: physical Bank Account, effective Company link, House Bank configuration, cash GL, usage/defaults, payment channels, and reconciliation mode.
- Cash GL validation reads the live Company Chart and posting controls. It never skips because a materialized view is unavailable. Account-specific currency must match; sharing an unset-currency GL across currencies requires `metadata.multi_currency=true`.
- Company Bank Account links end only through `master.end_bank_account_link`. The command blocks future payments, payment policies extending past the end date, open statements, and unsigned reconciliation cases before atomically deactivating House Bank usage.
- Interface connection tests receive only an opaque credential-provider reference through an injected adapter. Finance persists a non-sensitive result code, latency, timestamp and credential health projection—never credentials or provider response bodies.

## Readiness and limited Treasury boundary

The Company page reports effective/verified accounts, cash-GL validity, payment-interface coverage, statement-import capability, latest statement, unmatched lines, open reconciliation cases, pending outbound payments, expected inbound collections, balances by currency, FX exposure currencies, and a link to an approved/published cash forecast scenario.

This release intentionally does not introduce liquidity structures, debt facilities, investments, cash pooling, Treasury deals, hedge accounting, or new Treasury setup masters.

## Verification

Run `pnpm --filter @athyper/svc-finance test --run __tests__/finance-banking-stage-e.contract.test.ts`.
Database catalog checks require deployed migrations plus `RUN_FINANCE_INTEGRATION=1` and `FINANCE_INTEGRATION_DATABASE_URL`.
